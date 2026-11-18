// Acceso a datos de kermeses. Toda la lectura pública pasa por aquí.
import { supabase, isSupabaseConfigured } from '../supabaseConfig.js';
import { toISODate } from '../utils/format.js';

const KERMES_COLUMNS = `
  id, title, description, event_date, start_time, end_time,
  address, zone, latitude, longitude, cover_image_url, whatsapp, status,
  organizer:profiles ( full_name, organization_name, avatar_url ),
  menu_items ( id, name, description, price, image_url, is_featured, sort_order, stock )
`;

// Modo demo: ejemplos fijos + kermeses publicadas desde el panel de este navegador
async function demoList() {
  const [{ demoKermeses }, demo] = await Promise.all([import('../data/demoData.js'), import('./demoBackend.js')]);
  const today = toISODate(new Date());
  return [...demoKermeses, ...demo.publishedKermeses().filter((k) => k.event_date >= today)]
    .sort((a, b) => (a.event_date + a.start_time).localeCompare(b.event_date + b.start_time));
}

/** Porciones que quedan por plato (Map id → número). Solo platos con límite. */
async function fetchRemaining(kermeses) {
  const ids = kermeses.map((k) => k.id);
  if (!ids.length) return new Map();
  if (!isSupabaseConfigured) {
    const demo = await import('./demoBackend.js');
    return demo.remainingByItem(kermeses);
  }
  const { data, error } = await supabase.rpc('public_menu_remaining', { kermes_ids: ids });
  if (error) return new Map(); // sin la función (05_stock_publico.sql) el muro sigue funcionando
  return new Map(data.map((r) => [r.menu_item_id, r.remaining]));
}

/** Marca cada plato con lo que queda: sold_out y remaining (null = sin límite). */
async function withStock(kermeses) {
  const left = await fetchRemaining(kermeses).catch(() => new Map());
  kermeses.forEach((k) => (k.menu_items ?? []).forEach((m) => {
    m.remaining = left.has(m.id) ? left.get(m.id) : null;
    m.sold_out = m.remaining === 0;
  }));
  return kermeses;
}

function sortMenu(kermes) {
  kermes.menu_items = [...(kermes.menu_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return kermes;
}

/** Kermeses publicadas desde hoy en adelante, ordenadas por fecha. */
export async function fetchPublishedKermeses() {
  if (!isSupabaseConfigured) return withStock((await demoList()).map(sortMenu));

  const { data, error } = await supabase
    .from('kermeses')
    .select(KERMES_COLUMNS)
    .eq('status', 'publicada')
    .gte('event_date', toISODate(new Date()))
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw error;
  return withStock(data.map(sortMenu));
}

/** Una kermés por id (página evento.html?id=<uuid>). RLS devuelve null si no está publicada. */
export async function fetchKermesById(id) {
  if (!isSupabaseConfigured) {
    const found = (await demoList()).find((k) => k.id === id);
    return found ? (await withStock([sortMenu(found)]))[0] : null;
  }

  // Un id con formato inválido haría fallar a Postgres; lo tratamos como "no encontrado"
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;

  const { data, error } = await supabase
    .from('kermeses')
    .select(KERMES_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? (await withStock([sortMenu(data)]))[0] : null;
}
