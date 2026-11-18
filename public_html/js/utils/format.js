// Utilidades de formato y seguridad (sin dependencias).
import { APP_CONFIG } from '../supabaseConfig.js';

/** Escapa texto para insertarlo en HTML. Úsalo con TODO dato que venga de usuarios. */
export function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Solo permite URLs http(s); evita "javascript:" en src/href. */
export function safeURL(url) {
  if (!url) return '';
  // Imágenes incrustadas (modo demo): solo formatos raster, nunca SVG
  if (/^data:image\/(webp|jpeg|png);base64,[a-z0-9+/=]+$/i.test(url)) return url;
  try {
    const u = new URL(url, window.location.href);
    // blob: = vista previa local de una imagen elegida en el editor
    return ['https:', 'http:', 'blob:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

/** "2026-11-14" -> Date local (evita el desfase de zona horaria de new Date("2026-11-14")). */
export function parseLocalDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const dateFmt = new Intl.DateTimeFormat(APP_CONFIG.locale, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDateFmt = new Intl.DateTimeFormat(APP_CONFIG.locale, { weekday: 'short', day: 'numeric', month: 'short' });
// Número con 2 decimales y "Bs" fijo: algunos Android escriben "BOB 35,00" con el formato de moneda
const priceFmt = new Intl.NumberFormat(APP_CONFIG.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatDate = (iso) => capitalize(dateFmt.format(parseLocalDate(iso)));
export const formatShortDate = (iso) => capitalize(shortDateFmt.format(parseLocalDate(iso)));
export const formatPrice = (n) => `Bs\u00a0${priceFmt.format(Number(n))}`;

/** "17:30:00" -> "5:30 p. m." */
export function formatTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(APP_CONFIG.locale, { hour: 'numeric', minute: '2-digit' });
}

export function formatTimeRange(start, end) {
  return end ? `${formatTime(start)} – ${formatTime(end)}` : `Desde ${formatTime(start)}`;
}

export function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Minúsculas y sin tildes, para búsquedas tolerantes ("anticúcho" == "anticucho"). */
export function normalize(s) {
  return String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export function googleMapsURL(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function whatsappURL(phone, title) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const text = encodeURIComponent(`Hola, vi la kermés "${title}" en tukermes.online y quisiera más información.`);
  return `https://wa.me/${digits}?text=${text}`;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Página de detalle de una kermés. */
export function eventURL(id) {
  return `evento.html?id=${encodeURIComponent(id)}`;
}

export const PLACEHOLDER_IMG = 'assets/img/placeholder-kermes.svg';
