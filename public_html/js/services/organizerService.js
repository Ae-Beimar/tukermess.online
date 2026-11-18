// Datos privados del organizador: su perfil y sus kermeses (crear, editar, publicar, eliminar).
// La seguridad real la ponen las políticas RLS de supabase/01_schema.sql.
import { supabase, isSupabaseConfigured, APP_CONFIG } from '../supabaseConfig.js';
import * as demo from './demoBackend.js';

function check(error) {
  if (error) throw new Error(error.message || 'No se pudo guardar. Intenta de nuevo.');
}

// --------------------------- Perfil ---------------------------
export async function getProfile(uid) {
  if (!isSupabaseConfigured) return demo.getProfile(uid);
  const { data, error } = await supabase.from('profiles').select('id, full_name, organization_name, avatar_url').eq('id', uid).maybeSingle();
  check(error);
  return data;
}

export async function updateProfile(uid, profile) {
  if (!isSupabaseConfigured) return demo.updateProfile(uid, profile);
  const { error } = await supabase.from('profiles').update({
    full_name: profile.full_name || null,
    organization_name: profile.organization_name || null,
  }).eq('id', uid);
  check(error);
}

/** Guarda (o quita, con null) la URL de la foto de perfil. */
export async function updateAvatar(uid, avatarUrl) {
  if (!isSupabaseConfigured) return demo.updateAvatar(uid, avatarUrl);
  const { error } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', uid);
  check(error);
}

// -------------------------- Kermeses --------------------------
export async function listMyKermeses(uid) {
  if (!isSupabaseConfigured) return demo.listMyKermeses(uid);
  const { data, error } = await supabase
    .from('kermeses')
    .select('id, title, event_date, start_time, end_time, zone, status, cover_image_url, updated_at, menu_items(count)')
    .eq('organizer_id', uid) // importante: RLS también deja ver las publicadas de otros
    .order('event_date', { ascending: false });
  check(error);
  return data.map((k) => ({ ...k, menu_count: k.menu_items?.[0]?.count ?? 0 }));
}

export async function getMyKermes(id, uid) {
  if (!isSupabaseConfigured) return demo.getMyKermes(id, uid);
  const { data, error } = await supabase
    .from('kermeses')
    .select('*, menu_items(*)')
    .eq('id', id)
    .eq('organizer_id', uid)
    .maybeSingle();
  check(error);
  if (data) data.menu_items = [...(data.menu_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return data;
}

/**
 * Crea o actualiza una kermés y reemplaza su menú.
 * @param {object} kermes  fila de kermeses (con id generado en el navegador)
 * @param {Array} items    platos (cada uno con id); los que ya no estén se borran
 */
export async function saveKermes(kermes, items) {
  const rows = items.map((it, i) => ({ ...it, kermes_id: kermes.id, sort_order: i }));
  if (!isSupabaseConfigured) return demo.saveKermes(kermes, rows);

  const { error } = await supabase.from('kermeses').upsert(kermes);
  check(error);

  // 1) borrar los platos que el organizador quitó
  let del = supabase.from('menu_items').delete().eq('kermes_id', kermes.id);
  if (rows.length) del = del.not('id', 'in', `(${rows.map((r) => r.id).join(',')})`);
  check((await del).error);

  // 2) crear / actualizar los que quedan
  if (rows.length) check((await supabase.from('menu_items').upsert(rows)).error);
}

export async function setStatus(id, uid, status) {
  if (!isSupabaseConfigured) return demo.setStatus(id, uid, status);
  const { error } = await supabase.from('kermeses').update({ status }).eq('id', id).eq('organizer_id', uid);
  check(error);
}

export async function deleteKermes(id, uid) {
  if (!isSupabaseConfigured) return demo.deleteKermes(id, uid);
  const { error } = await supabase.from('kermeses').delete().eq('id', id).eq('organizer_id', uid);
  check(error); // los platos se borran solos (ON DELETE CASCADE)

  // Limpieza de imágenes (si falla no es grave: solo quedan archivos huérfanos)
  try {
    const bucket = supabase.storage.from(APP_CONFIG.storageBucket);
    const folder = `${uid}/${id}`;
    const { data: files } = await bucket.list(folder, { limit: 100 });
    const paths = (files ?? []).filter((f) => f.id).map((f) => `${folder}/${f.name}`);
    if (paths.length) await bucket.remove(paths);
  } catch { /* sin limpieza */ }
}

// --------------------- Totales recaudados por kermés ---------------------
/** Map kermes_id -> total recaudado (ventas no anuladas). Requiere 04_ventas.sql. */
export async function getSalesTotals() {
  if (!isSupabaseConfigured) return demo.salesTotals();
  const { data, error } = await supabase.from('sales_summary').select('kermes_id, total');
  check(error);
  return new Map(data.map((r) => [r.kermes_id, Number(r.total)]));
}

/** Resumen de una kermés: { sales_count, total, total_efectivo, total_qr } (ventas no anuladas). */
export async function getSalesSummary(kermesId) {
  const empty = { sales_count: 0, total: 0, total_efectivo: 0, total_qr: 0 };
  if (!isSupabaseConfigured) return demo.salesSummary(kermesId);
  const { data, error } = await supabase.from('sales_summary').select('*').eq('kermes_id', kermesId).maybeSingle();
  check(error);
  if (!data) return empty;
  return {
    sales_count: Number(data.sales_count), total: Number(data.total),
    total_efectivo: Number(data.total_efectivo), total_qr: Number(data.total_qr),
  };
}
