// =====================================================================
//  Backend de DEMOSTRACIÓN (solo cuando supabaseConfig.js no está configurado)
//  Imita Auth + base de datos guardando todo en localStorage de ESTE navegador,
//  para poder probar registro, panel y editor sin Supabase.
//  No es seguro ni compartido: en cuanto configures Supabase deja de usarse.
// =====================================================================

const KEYS = { users: 'tk_demo_users', session: 'tk_demo_session', kermeses: 'tk_demo_kermeses' };
const listeners = new Set();

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error('El navegador no tiene espacio para guardar la demo. Usa imágenes más livianas o configura Supabase.');
  }
}

const delay = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const publicUser = (u) => (u ? { id: u.id, email: u.email, user_metadata: { full_name: u.full_name } } : null);

function emit(event) {
  const user = getUserSync();
  listeners.forEach((cb) => cb(event, user));
}

// ---------------------------- Auth ----------------------------
function getUserSync() {
  const session = read(KEYS.session, null);
  if (!session) return null;
  return publicUser(read(KEYS.users, []).find((u) => u.id === session.userId));
}

export async function getUser() {
  return getUserSync();
}

export async function signUp({ email, password, fullName }) {
  await delay();
  const users = read(KEYS.users, []);
  if (users.some((u) => u.email === email.toLowerCase())) throw new Error('Ya existe una cuenta con ese correo.');
  const user = { id: crypto.randomUUID(), email: email.toLowerCase(), password, full_name: fullName, organization_name: '' };
  write(KEYS.users, [...users, user]);
  write(KEYS.session, { userId: user.id });
  emit('SIGNED_IN');
  return { user: publicUser(user), needsConfirmation: false };
}

export async function signIn(email, password) {
  await delay();
  const user = read(KEYS.users, []).find((u) => u.email === email.toLowerCase() && u.password === password);
  if (!user) throw new Error('Correo o contraseña incorrectos.');
  write(KEYS.session, { userId: user.id });
  emit('SIGNED_IN');
  return publicUser(user);
}

export async function signOut() {
  try { localStorage.removeItem(KEYS.session); } catch { /* nada */ }
  emit('SIGNED_OUT');
}

export async function sendPasswordReset() {
  await delay();
  throw new Error('En modo demo no se envían correos. Configura Supabase para recuperar contraseñas.');
}

export async function updatePassword(password) {
  const me = getUserSync();
  if (!me) throw new Error('Inicia sesión primero.');
  write(KEYS.users, read(KEYS.users, []).map((u) => (u.id === me.id ? { ...u, password } : u)));
}

export function onAuthChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// --------------------------- Perfil ---------------------------
export async function getProfile(uid) {
  const u = read(KEYS.users, []).find((x) => x.id === uid);
  return u ? { id: u.id, full_name: u.full_name, organization_name: u.organization_name, avatar_url: u.avatar_url ?? null } : null;
}

export async function updateProfile(uid, { full_name, organization_name }) {
  await delay();
  write(KEYS.users, read(KEYS.users, []).map((u) => (u.id === uid ? { ...u, full_name, organization_name } : u)));
}

export async function updateAvatar(uid, avatar_url) {
  await delay();
  write(KEYS.users, read(KEYS.users, []).map((u) => (u.id === uid ? { ...u, avatar_url } : u)));
}

// -------------------------- Kermeses --------------------------
function allKermeses() {
  return read(KEYS.kermeses, []);
}

export async function listMyKermeses(uid) {
  await delay(80);
  return allKermeses()
    .filter((k) => k.organizer_id === uid)
    .map((k) => ({ ...k, menu_count: k.menu_items.length }))
    .sort((a, b) => b.event_date.localeCompare(a.event_date));
}

export async function getMyKermes(id, uid) {
  return allKermeses().find((k) => k.id === id && k.organizer_id === uid) ?? null;
}

export async function saveKermes(kermes, items) {
  await delay();
  const list = allKermeses();
  const i = list.findIndex((k) => k.id === kermes.id);
  const row = { ...(list[i] ?? {}), ...kermes, menu_items: items, updated_at: new Date().toISOString() };
  if (i >= 0) list[i] = row; else list.push(row);
  write(KEYS.kermeses, list);
}

export async function setStatus(id, uid, status) {
  await delay(80);
  write(KEYS.kermeses, allKermeses().map((k) => (k.id === id && k.organizer_id === uid ? { ...k, status } : k)));
}

export async function deleteKermes(id, uid) {
  await delay(80);
  write(KEYS.kermeses, allKermeses().filter((k) => !(k.id === id && k.organizer_id === uid)));
}

/** Kermeses publicadas creadas en la demo, con el nombre del organizador (para el muro público). */
export function publishedKermeses() {
  const users = read(KEYS.users, []);
  return allKermeses()
    .filter((k) => k.status === 'publicada')
    .map((k) => {
      const u = users.find((x) => x.id === k.organizer_id);
      return { ...k, organizer: u ? { full_name: u.full_name, organization_name: u.organization_name, avatar_url: u.avatar_url ?? null } : null };
    });
}

// --------------------------- Ventas (caja) ---------------------------
const SALES_KEY = 'tk_demo_sales';

export async function fetchSales(kermesId) {
  await delay(60);
  return read(SALES_KEY, []).filter((s) => s.kermes_id === kermesId);
}

/** Guarda (o reemplaza) una venta. Simula la regla "un número de rifa una sola vez". */
export async function pushSale(sale) {
  await delay(60);
  const all = read(SALES_KEY, []);
  const others = all.filter((s) => s.id !== sale.id && s.kermes_id === sale.kermes_id && !s.voided);
  const taken = new Set(others.flatMap((s) => s.tickets.map((t) => t.number)));
  if (sale.tickets.some((t) => taken.has(t.number))) {
    const err = new Error('duplicate key value violates unique constraint');
    err.code = '23505';
    throw err;
  }
  write(SALES_KEY, [...all.filter((s) => s.id !== sale.id), sale]);
}

export async function voidSale(id) {
  await delay(60);
  write(SALES_KEY, read(SALES_KEY, []).map((s) => (s.id === id ? { ...s, voided: true, tickets: [] } : s)));
  // Igual que el trigger de 07_reservas.sql: la reserva de esa venta queda anulada
  write(RES_KEY, read(RES_KEY, []).map((r) => (r.sale_id === id && r.status === 'reservada' ? { ...r, status: 'anulada' } : r)));
}

// --------------------------- Reservas ---------------------------
const RES_KEY = 'tk_demo_reservations';

export async function insertReservation(row) {
  await delay(80);
  const all = read(RES_KEY, []);
  if (all.some((r) => r.code === row.code)) {
    const err = new Error('duplicate key value violates unique constraint');
    err.code = '23505';
    throw err;
  }
  write(RES_KEY, [...all, { status: 'reservada', created_at: new Date().toISOString(), delivered_at: null, ...row }]);
}

export async function listReservations(kermesId) {
  await delay(60);
  return read(RES_KEY, []).filter((r) => !kermesId || r.kermes_id === kermesId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function reservationByCode(code) {
  await delay(60);
  return read(RES_KEY, []).find((r) => r.code === code) ?? null;
}

/** Entrega atómica: solo cambia si sigue "reservada". Devuelve la fila cambiada o null. */
export async function deliverReservation(id, device) {
  await delay(80);
  const all = read(RES_KEY, []);
  const r = all.find((x) => x.id === id);
  if (!r || r.status !== 'reservada') return null;
  const next = { ...r, status: 'entregada', delivered_at: new Date().toISOString(), delivered_device: device || null };
  write(RES_KEY, all.map((x) => (x.id === id ? next : x)));
  return next;
}

export async function cancelReservation(id) {
  await delay(60);
  write(RES_KEY, read(RES_KEY, []).map((r) => (r.id === id && r.status === 'reservada' ? { ...r, status: 'anulada' } : r)));
}

/** Ticket público por código (como la función public_ticket de Supabase). */
export async function publicTicket(code) {
  await delay(60);
  const r = read(RES_KEY, []).find((x) => x.code === code);
  if (!r) return null;
  const k = allKermeses().find((x) => x.id === r.kermes_id);
  return {
    ...r,
    items: r.items.map((it) => ({ ...it, image_url: it.image_url ?? k?.menu_items?.find((m) => m.id === it.menu_item_id)?.image_url ?? null })),
    kermes: k ? { id: k.id, title: k.title, event_date: k.event_date, start_time: k.start_time, end_time: k.end_time, address: k.address, zone: k.zone, cover_image_url: k.cover_image_url ?? null } : null,
  };
}

/** Modo demo: porciones que quedan por plato, como public_menu_remaining en Supabase. */
export function remainingByItem(kermeses) {
  const sold = new Map();
  read(SALES_KEY, []).filter((s) => !s.voided).forEach((s) => s.items.forEach((it) => {
    if (it.kind === 'plato' && it.menu_item_id) sold.set(it.menu_item_id, (sold.get(it.menu_item_id) ?? 0) + it.quantity);
  }));
  const map = new Map();
  kermeses.forEach((k) => (k.menu_items ?? []).forEach((m) => {
    if (m.stock !== null && m.stock !== undefined && m.stock !== '') map.set(m.id, Math.max(0, Number(m.stock) - (sold.get(m.id) ?? 0)));
  }));
  return map;
}

export async function salesTotals() {
  const map = new Map();
  read(SALES_KEY, []).filter((s) => !s.voided).forEach((s) => map.set(s.kermes_id, (map.get(s.kermes_id) ?? 0) + Number(s.total)));
  return map;
}

export async function salesSummary(kermesId) {
  const valid = read(SALES_KEY, []).filter((s) => s.kermes_id === kermesId && !s.voided);
  const sum = (list) => list.reduce((n, s) => n + Number(s.total), 0);
  return {
    sales_count: valid.length, total: sum(valid),
    total_efectivo: sum(valid.filter((s) => s.payment_method === 'efectivo')),
    total_qr: sum(valid.filter((s) => s.payment_method === 'qr')),
  };
}
