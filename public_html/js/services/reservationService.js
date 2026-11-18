// =====================================================================
//  Reservas con ticket QR (requiere supabase/07_reservas.sql).
//  - Reservar: se cobra como una venta (descuenta porciones y suma al recaudado)
//    y se guarda la reserva con un código único que va en el QR del ticket.
//  - Entregar: marca la reserva "entregada" UNA sola vez. El cambio es atómico
//    (solo pasa de "reservada" a "entregada"), así dos celulares no entregan dos veces.
//  Reservar y entregar necesitan señal: sin servidor no se puede garantizar el "un solo uso".
// =====================================================================
import { supabase, isSupabaseConfigured } from '../supabaseConfig.js';
import * as demo from './demoBackend.js';
import * as sales from './salesService.js';

// Crockford base32 sin letras confusas (sin I, L, O, U)
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function check(error) {
  if (!error) return;
  if (/failed to fetch|network/i.test(String(error.message))) throw new Error('Sin conexión con el servidor. Revisa tu internet.');
  const msg = `${error.message} ${error.code ?? ''}`;
  if (/reservations|public_ticket/i.test(msg) && /schema cache|does not exist|PGRST20[25]|42P01|42883/i.test(msg)) {
    throw new Error('Falta activar las reservas: ejecuta supabase/07_reservas.sql en Supabase.');
  }
  throw new Error(error.message || 'No se pudo completar. Intenta de nuevo.');
}

/** Código de 10 caracteres (50 bits al azar). */
export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => ALPHABET[b % 32]).join('');
}

/** "ABCDE12345" -> "ABCDE-12345" */
export const formatCode = (code) => `${code.slice(0, 5)}-${code.slice(5)}`;

/** Saca el código de lo que leyó el escáner: la URL del ticket o el código escrito a mano. */
export function parseCode(text) {
  const raw = String(text ?? '').trim();
  let candidate = raw;
  try {
    const u = new URL(raw);
    candidate = u.searchParams.get('c') ?? '';
  } catch { /* no es URL */ }
  const clean = candidate.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-Z]{10}$/.test(clean) ? clean : null;
}

/** Enlace público del ticket (lo que va dentro del QR). */
export const ticketURL = (code) => new URL(`ticket.html?c=${code}`, window.location.href).href;

const requireOnline = (what) => {
  if (!navigator.onLine) throw new Error(`Necesitas señal para ${what}.`);
};

// ------------------------------ crear ------------------------------
/**
 * Cobra y guarda una reserva. Devuelve la reserva creada (con su código).
 * La caja (salesService) tiene que estar iniciada con la kermés.
 */
export async function createReservation({ kermes, customer_name, customer_phone, lines, payment_method, device }) {
  requireOnline('reservar');
  const id = crypto.randomUUID();
  const sale_id = crypto.randomUUID();
  const items = lines.map((l) => ({
    menu_item_id: l.menu_item_id, name: l.name, category: l.category ?? 'comida',
    unit_price: Number(l.unit_price), quantity: l.quantity, image_url: l.image_url ?? null,
  }));
  const total = Math.round(items.reduce((n, it) => n + it.unit_price * it.quantity, 0) * 100) / 100;

  // 1) la reserva (si falla, no se cobró nada). Reintenta si el código ya existiera.
  let row;
  for (let i = 0; i < 3; i += 1) {
    row = {
      id, kermes_id: kermes.id, sale_id, code: newCode(),
      customer_name: customer_name.trim(), customer_phone: customer_phone?.trim() || null,
      items, total, payment_method,
    };
    try {
      if (!isSupabaseConfigured) await demo.insertReservation(row);
      else {
        const { error } = await supabase.from('reservations').insert(row);
        if (error) throw error;
      }
      break;
    } catch (err) {
      if (err?.code === '23505' && i < 2) continue;
      check(err);
    }
  }

  // 2) la venta con el mismo id que guardó la reserva: así anular una anula la otra
  await sales.recordSale({
    id: sale_id,
    lines: lines.map(({ menu_item_id, name, unit_price, quantity }) => ({ menu_item_id, kind: 'plato', name, unit_price, quantity })),
    payment_method,
    device: (device ? `${device} · reserva` : 'Reserva').slice(0, 40),
  });

  return { ...row, status: 'reservada', created_at: new Date().toISOString(), delivered_at: null, kermes };
}

// ------------------------------ leer ------------------------------
export async function listReservations(kermesId) {
  if (!isSupabaseConfigured) return demo.listReservations(kermesId);
  const { data, error } = await supabase.from('reservations').select('*')
    .eq('kermes_id', kermesId).order('created_at', { ascending: false });
  check(error);
  return data;
}

/** Map kermes_id -> { pending, delivered } de todas mis kermeses (para el panel). */
export async function reservationCounts() {
  let rows;
  if (!isSupabaseConfigured) rows = await demo.listReservations(null);
  else {
    const { data, error } = await supabase.from('reservations').select('kermes_id, status');
    if (error) return new Map(); // aún sin 07_reservas.sql: el panel funciona igual
    rows = data;
  }
  const map = new Map();
  rows.forEach((r) => {
    const c = map.get(r.kermes_id) ?? { pending: 0, delivered: 0 };
    if (r.status === 'reservada') c.pending += 1;
    if (r.status === 'entregada') c.delivered += 1;
    map.set(r.kermes_id, c);
  });
  return map;
}

/** Busca una reserva de MIS kermeses por código (el escáner). */
export async function findByCode(code) {
  requireOnline('revisar el ticket');
  if (!isSupabaseConfigured) return demo.reservationByCode(code);
  const { data, error } = await supabase.from('reservations').select('*').eq('code', code).maybeSingle();
  check(error);
  return data;
}

/** Ticket público (cualquiera con el código). */
export async function publicTicket(code) {
  if (!isSupabaseConfigured) return demo.publicTicket(code);
  const { data, error } = await supabase.rpc('public_ticket', { p_code: code });
  check(error);
  return data;
}

// ------------------------------ entregar / anular ------------------------------
/**
 * Marca la reserva como entregada solo si seguía "reservada".
 * @returns {{ ok: true, reservation } | { ok: false, reservation }}  ok=false: ya estaba entregada o anulada
 */
export async function deliver(id, device) {
  requireOnline('entregar');
  let changed;
  if (!isSupabaseConfigured) changed = await demo.deliverReservation(id, device);
  else {
    const { data, error } = await supabase.from('reservations')
      .update({ status: 'entregada', delivered_at: new Date().toISOString(), delivered_device: device || null })
      .eq('id', id).eq('status', 'reservada')
      .select();
    if (error && error.code !== 'P0001') check(error);
    changed = data?.[0] ?? null;
  }
  if (changed) return { ok: true, reservation: changed };
  // Otro celular la entregó (o se anuló) un instante antes: se devuelve cómo quedó
  const now = isSupabaseConfigured
    ? (await supabase.from('reservations').select('*').eq('id', id).maybeSingle()).data
    : (await demo.listReservations(null)).find((r) => r.id === id);
  return { ok: false, reservation: now };
}

/** Anula la reserva y su venta (devuelve las porciones y descuenta del recaudado). */
export async function cancel(reservation) {
  requireOnline('anular');
  if (!isSupabaseConfigured) await demo.cancelReservation(reservation.id);
  else {
    const { error } = await supabase.from('reservations').update({ status: 'anulada' })
      .eq('id', reservation.id).eq('status', 'reservada');
    check(error);
  }
  if (reservation.sale_id) await sales.voidSale(reservation.sale_id);
}
