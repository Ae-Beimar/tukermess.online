// =====================================================================
//  Ventas de la caja, pensadas para el celular durante la kermés.
//  - Cada venta se guarda PRIMERO en el celular (cola) y luego se envía.
//  - Si no hay internet, queda en cola y se reenvía sola al volver la señal.
//  - El id de cada venta se genera aquí, así reenviar nunca la duplica.
//  - Varios celulares con la misma cuenta suman al mismo total (se refresca cada 15 s).
// =====================================================================
import { supabase, isSupabaseConfigured } from '../supabaseConfig.js';
import * as demo from './demoBackend.js';

const OUTBOX_KEY = 'tk_pos_outbox';
const CACHE_PREFIX = 'tk_pos_cache_';
const POLL_MS = 15000;

let kermesId = null;
let serverSales = [];      // ventas que ya están en el servidor
let listeners = new Set();
const conflictListeners = new Set();
let flushing = false;
let pollTimer = null;
let lastSyncAt = null;

// ------------------------------ almacenamiento local ------------------------------
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin espacio: seguimos en memoria */ }
}

const outbox = () => readJSON(OUTBOX_KEY, []);
const saveOutbox = (list) => writeJSON(OUTBOX_KEY, list);

function emit() {
  const snap = snapshot();
  listeners.forEach((cb) => cb(snap));
}

export function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Avisa cuando otro celular ya había vendido un número de rifa (cb recibe [{ saleId, numbers }]). */
export function onConflict(cb) {
  conflictListeners.add(cb);
  return () => conflictListeners.delete(cb);
}

// ------------------------------ servidor (Supabase o demo) ------------------------------
const remote = {
  async fetchSales(id) {
    if (!isSupabaseConfigured) return demo.fetchSales(id);
    const { data, error } = await supabase
      .from('sales')
      .select('*, sale_items(*), raffle_tickets(*)')
      .eq('kermes_id', id)
      .order('sold_at', { ascending: false });
    if (error) throw error;
    return data.map((s) => ({ ...s, items: s.sale_items ?? [], tickets: s.raffle_tickets ?? [] }));
  },

  async pushSale(sale) {
    if (!isSupabaseConfigured) return demo.pushSale(sale);
    const { items, tickets, ...row } = sale;
    let r = await supabase.from('sales').upsert(row);
    if (r.error) throw r.error;
    if (items.length) {
      r = await supabase.from('sale_items').upsert(items);
      if (r.error) throw r.error;
    }
    if (tickets.length) {
      r = await supabase.from('raffle_tickets').upsert(tickets);
      if (r.error) throw r.error; // 23505 = número ya vendido en otro celular
    }
  },

  async voidSale(id) {
    if (!isSupabaseConfigured) return demo.voidSale(id);
    let r = await supabase.from('sales').update({ voided: true }).eq('id', id);
    if (r.error) throw r.error;
    r = await supabase.from('raffle_tickets').delete().eq('sale_id', id); // libera los números
    if (r.error) throw r.error;
  },
};

// ------------------------------ estado combinado ------------------------------
function allSales() {
  const pending = outbox().filter((op) => op.type === 'sale' && op.sale.kermes_id === kermesId).map((op) => ({ ...op.sale, pending: true }));
  const voidsPending = new Set(outbox().filter((op) => op.type === 'void').map((op) => op.id));
  const byId = new Map(serverSales.map((s) => [s.id, s]));
  pending.forEach((s) => byId.set(s.id, s));
  return [...byId.values()]
    .map((s) => (voidsPending.has(s.id) ? { ...s, voided: true, pending: true } : s))
    .sort((a, b) => String(b.sold_at).localeCompare(String(a.sold_at)));
}

export function snapshot() {
  const sales = allSales();
  const valid = sales.filter((s) => !s.voided);
  const sum = (list) => list.reduce((n, s) => n + Number(s.total), 0);

  const soldByItem = new Map();
  valid.forEach((s) => s.items.forEach((it) => {
    const key = it.kind === 'rifa' ? 'rifa' : it.menu_item_id ?? it.name;
    const prev = soldByItem.get(key) ?? { name: it.name, kind: it.kind, quantity: 0, amount: 0 };
    prev.quantity += it.quantity;
    prev.amount += it.quantity * Number(it.unit_price);
    soldByItem.set(key, prev);
  }));

  const takenNumbers = new Map();
  valid.forEach((s) => s.tickets.forEach((t) => takenNumbers.set(t.number, t)));

  return {
    sales,
    total: sum(valid),
    totalEfectivo: sum(valid.filter((s) => s.payment_method === 'efectivo')),
    totalQr: sum(valid.filter((s) => s.payment_method === 'qr')),
    salesCount: valid.length,
    soldByItem,
    takenNumbers,
    pendingCount: outbox().filter((op) => op.type === 'void' || op.sale?.kermes_id === kermesId).length,
    online: navigator.onLine,
    lastSyncAt,
  };
}

/** Porciones que quedan de un plato (null = sin límite). */
export function remaining(item, snap = snapshot()) {
  if (item.stock === null || item.stock === undefined || item.stock === '') return null;
  const sold = snap.soldByItem.get(item.id)?.quantity ?? 0;
  return Math.max(0, Number(item.stock) - sold);
}

// ------------------------------ sincronización ------------------------------
export async function refresh() {
  if (!kermesId || !navigator.onLine) return;
  try {
    serverSales = await remote.fetchSales(kermesId);
    lastSyncAt = new Date();
    writeJSON(CACHE_PREFIX + kermesId, { serverSales, lastSyncAt });
  } catch {
    /* sin conexión real: seguimos con lo que hay */
  }
  emit();
}

/** Envía la cola. Devuelve la lista de conflictos de rifa encontrados. */
export async function flush() {
  if (flushing || !navigator.onLine) return [];
  flushing = true;
  const conflicts = [];
  try {
    for (const op of outbox()) {
      try {
        if (op.type === 'sale') await remote.pushSale(op.sale);
        else await remote.voidSale(op.id);
        saveOutbox(outbox().filter((o) => o.opId !== op.opId));
      } catch (err) {
        if (err?.code === '23505' && op.type === 'sale') {
          // Otro celular vendió el mismo número de rifa: se quitan SOLO los números repetidos,
          // se descuentan del total y se avisa para devolver ese dinero
          let taken = new Set();
          try {
            const server = await remote.fetchSales(op.sale.kermes_id);
            taken = new Set(server.filter((s) => !s.voided && s.id !== op.sale.id).flatMap((s) => s.tickets.map((t) => t.number)));
          } catch { /* sin datos: se quitan todos los boletos de esta venta */ }
          const lost = op.sale.tickets.filter((t) => taken.size === 0 || taken.has(t.number));
          const keep = op.sale.tickets.filter((t) => !lost.includes(t));
          conflicts.push({ saleId: op.sale.id, numbers: lost.map((t) => t.number) });

          const items = op.sale.items
            .map((it) => (it.kind === 'rifa' ? { ...it, quantity: keep.length } : it))
            .filter((it) => it.quantity > 0);
          const total = Math.round(items.reduce((n, it) => n + it.quantity * Number(it.unit_price), 0) * 100) / 100;
          const fixed = { ...op.sale, tickets: keep, items, total };
          try {
            await remote.pushSale(fixed);
            saveOutbox(outbox().filter((o) => o.opId !== op.opId));
          } catch { /* se reintenta luego */ }
        } else if (!navigator.onLine || /fetch|network/i.test(String(err?.message))) {
          break; // se cortó la señal: se reintenta después
        } else {
          console.error('[tukermes] No se pudo sincronizar una venta:', err);
          break;
        }
      }
    }
  } finally {
    flushing = false;
  }
  if (conflicts.length) conflictListeners.forEach((cb) => cb(conflicts));
  await refresh();
  return conflicts;
}

// ------------------------------ acciones ------------------------------
/**
 * Registra una venta. Queda guardada en el celular aunque no haya internet.
 * @param {{ lines: Array<{menu_item_id?:string, kind:'plato'|'rifa', name:string, unit_price:number, quantity:number}>,
 *           tickets?: Array<{number:number, buyer_name?:string, buyer_phone?:string}>,
 *           payment_method: 'efectivo'|'qr', device?: string }} input
 */
export async function recordSale({ id: givenId, lines, tickets = [], payment_method, device }) {
  const id = givenId ?? crypto.randomUUID();
  const total = lines.reduce((n, l) => n + l.unit_price * l.quantity, 0);
  const sale = {
    id,
    kermes_id: kermesId,
    payment_method,
    total: Math.round(total * 100) / 100,
    device: device || null,
    voided: false,
    sold_at: new Date().toISOString(),
    items: lines.map((l) => ({
      id: crypto.randomUUID(), sale_id: id, kermes_id: kermesId,
      menu_item_id: l.menu_item_id ?? null, kind: l.kind, name: l.name,
      unit_price: l.unit_price, quantity: l.quantity,
    })),
    tickets: tickets.map((t) => ({
      id: crypto.randomUUID(), kermes_id: kermesId, sale_id: id,
      number: t.number, buyer_name: t.buyer_name || null, buyer_phone: t.buyer_phone || null,
    })),
  };
  saveOutbox([...outbox(), { opId: crypto.randomUUID(), type: 'sale', sale }]);
  emit();
  const conflicts = await flush();
  return { sale, conflicts };
}

export async function voidSale(id) {
  saveOutbox([...outbox(), { opId: crypto.randomUUID(), type: 'void', id }]);
  emit();
  return flush();
}

// ------------------------------ ciclo de vida ------------------------------
export async function start(id) {
  kermesId = id;
  const cached = readJSON(CACHE_PREFIX + id, null);
  if (cached) {
    serverSales = cached.serverSales ?? [];
    lastSyncAt = cached.lastSyncAt ? new Date(cached.lastSyncAt) : null;
  }
  emit();

  window.addEventListener('online', () => { flush(); });
  window.addEventListener('offline', emit);
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { flush(); }, POLL_MS);

  await flush();
}
