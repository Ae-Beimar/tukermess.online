// Filtros del muro y del mapa (se aplican en el navegador sobre la lista cargada).
import { normalize, parseLocalDate } from './format.js';

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Devuelve [desde, hasta] (inclusive) para cada opción del filtro de fecha. */
export function dateRange(when, now = new Date()) {
  const today = startOfDay(now);
  const dow = today.getDay(); // 0 = domingo

  switch (when) {
    case 'today':
      return [today, today];
    case 'weekend': {
      // Si hoy es sábado o domingo, el fin de semana es el actual
      if (dow === 6) return [today, addDays(today, 1)];
      if (dow === 0) return [today, today];
      const sat = addDays(today, 6 - dow);
      return [sat, addDays(sat, 1)];
    }
    case 'week':
      return [today, addDays(today, 6)];
    case 'month':
      return [today, addDays(today, 30)];
    default:
      return [null, null];
  }
}

export function inRange(kermes, when) {
  const [from, to] = dateRange(when);
  if (!from) return true;
  const d = parseLocalDate(kermes.event_date);
  return d >= from && d <= to;
}

/**
 * @param {Array} kermeses
 * @param {{ q?: string, zone?: string, when?: string, dish?: string }} filters
 */
export function applyFilters(kermeses, { q = '', zone = '', when = 'all', dish = '' } = {}) {
  const query = normalize(q);
  const dishKey = normalize(dish);

  return kermeses.filter((k) => {
    if (zone && k.zone !== zone) return false;
    if (!inRange(k, when)) return false;

    if (dishKey && !(k.menu_items ?? []).some((m) => normalize(m.name) === dishKey)) return false;

    if (query) {
      const haystack = normalize(
        [k.title, k.zone, k.address, k.description, ...(k.menu_items ?? []).map((m) => m.name)].join(' ')
      );
      // Todas las palabras deben aparecer (ej. "majadito equipetrol")
      if (!query.split(/\s+/).every((word) => haystack.includes(word))) return false;
    }

    return true;
  });
}

export function uniqueZones(kermeses) {
  return [...new Set(kermeses.map((k) => k.zone).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Platos más repetidos entre las kermeses (prioriza los marcados como destacados). */
export function popularDishes(kermeses, max = 10) {
  const map = new Map();
  kermeses.forEach((k) => (k.menu_items ?? []).forEach((m) => {
    const key = normalize(m.name);
    const entry = map.get(key) ?? { name: m.name, image_url: null, score: 0 };
    entry.score += m.is_featured ? 2 : 1;
    entry.image_url ||= m.image_url;
    map.set(key, entry);
  }));
  return [...map.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'es')).slice(0, max);
}
