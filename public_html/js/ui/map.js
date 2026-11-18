// Mapa de la ciudad con Leaflet + OpenStreetMap (sin costo de API).
// Leaflet se carga como script global "L" en el HTML.
import { APP_CONFIG } from '../supabaseConfig.js';
import { escapeHTML, formatShortDate, formatTime, eventURL } from '../utils/format.js';
import { icons } from '../utils/icons.js';

let map;
let markersLayer;
const markersById = new Map();

// Mosaicos de OpenStreetMap (gratis, sin API key). En styles.css se desaturan para un look más plano.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export const pinIcon = L.divIcon({
  className: 'kermes-pin',
  html: '<span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12],
});

export function addTiles(targetMap) {
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(targetMap);
}

export function initMap(elementId) {
  map = L.map(elementId, { scrollWheelZoom: false }).setView(APP_CONFIG.mapCenter, APP_CONFIG.mapZoom);
  addTiles(map);
  markersLayer = L.layerGroup().addTo(map);

  // Zoom con rueda solo después de hacer clic en el mapa (evita "atrapar" el scroll de la página)
  map.on('click', () => map.scrollWheelZoom.enable());
  map.on('mouseout', () => map.scrollWheelZoom.disable());

  return map;
}

function popupHTML(k) {
  return `
    <div class="min-w-[190px]">
      <p class="num text-xs text-muted">${escapeHTML(formatShortDate(k.event_date))}, ${escapeHTML(formatTime(k.start_time))}</p>
      <p class="mt-0.5 text-sm font-bold leading-snug text-ink">${escapeHTML(k.title)}</p>
      <p class="mt-0.5 text-xs text-muted">${escapeHTML(k.zone)}</p>
      <a href="${escapeHTML(eventURL(k.id))}"
         class="kermes-popup-link mt-2 inline-flex items-center gap-1 text-sm font-semibold">Ver detalle ${icons.arrowRight('h-3.5 w-3.5')}</a>
    </div>`;
}

export function renderMarkers(kermeses, { fit = true } = {}) {
  markersLayer.clearLayers();
  markersById.clear();

  kermeses.forEach((k) => {
    if (!Number.isFinite(k.latitude) || !Number.isFinite(k.longitude)) return;
    const marker = L.marker([k.latitude, k.longitude], { icon: pinIcon, title: k.title })
      .bindPopup(popupHTML(k));
    marker.addTo(markersLayer);
    markersById.set(k.id, marker);
  });

  if (fit && markersById.size) {
    const bounds = L.latLngBounds([...markersById.values()].map((m) => m.getLatLng()));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }
}

/** Resalta el pin de una tarjeta (al pasar el mouse) sin mover el mapa. */
export function highlightMarker(id, on) {
  const el = markersById.get(id)?.getElement();
  if (!el) return;
  el.classList.toggle('is-active', on);
  if (on) markersById.get(id).setZIndexOffset(1000);
  else markersById.get(id).setZIndexOffset(0);
}

export function refreshMapSize() {
  map?.invalidateSize();
}
