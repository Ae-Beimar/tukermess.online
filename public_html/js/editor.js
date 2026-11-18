// editar.html: crear o editar una kermés con estructura fija (plantilla común para todos).
//   editar.html          -> nueva kermés
//   editar.html?id=<id>  -> editar una existente
import { APP_CONFIG } from './supabaseConfig.js';
import { requireUser } from './services/authService.js';
import { getMyKermes, saveKermes } from './services/organizerService.js';
import { compressImage, uploadImage, imagePath } from './services/storageService.js';
import { escapeHTML, safeURL, toISODate, debounce } from './utils/format.js';
import { icons } from './utils/icons.js';
import { cardHTML } from './ui/cards.js';
import { pinIcon, addTiles } from './ui/map.js';
import { toast, withBusy } from './ui/feedback.js';

const ZONES = [
  'Casco Viejo', 'Equipetrol', 'Urbarí', 'Las Palmas', 'Sirari', 'Hamacas', 'Barrio Lindo',
  'Villa 1ro de Mayo', 'Plan 3000', 'Pampa de la Isla', 'Los Lotes', 'El Bajío', 'Palmasola',
  'Norte', 'Sur', 'Este', 'Oeste', 'Satélite Norte', 'Urubó',
];
const MAX_DISHES = 40;
const STATUS_LABEL = { borrador: 'Borrador', publicada: 'Publicada', finalizada: 'Finalizada' };

const form = document.getElementById('kermes-form');
const f = (name) => form.elements[name];
const $ = (id) => document.getElementById(id);

const state = {
  user: null,
  id: null,
  isNew: true,
  status: 'borrador',
  lat: null,
  lng: null,
  cover: { url: null, blob: null, preview: null },
  prizes: [],          // premios de la rifa: { id, name, image_url, blob, preview }
  dishes: [],
  photoTarget: null, // id del plato al que se le está eligiendo foto
  dirty: false,
};

let map;
let marker;

// =====================================================================
//  Utilidades
// =====================================================================
function markDirty() {
  state.dirty = true;
  refreshPreview();
}

function newDish() {
  return { id: crypto.randomUUID(), name: '', description: '', price: '', category: 'comida', stock: '', is_featured: false, image_url: null, blob: null, preview: null };
}

/** "70012345" | "591 700-12345" -> "59170012345" ; "" -> null ; inválido -> false */
function normalizeWhatsapp(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('591')) digits = digits.slice(3);
  return /^[67]\d{7}$/.test(digits) ? `591${digits}` : false;
}

const hasDishContent = (d) => d.name.trim() || String(d.price).trim() || d.description.trim() || d.image_url || d.blob;

// =====================================================================
//  Mapa para elegir la ubicación
// =====================================================================
function setLocation(lat, lng, { pan = true } = {}) {
  state.lat = Number(lat.toFixed(6));
  state.lng = Number(lng.toFixed(6));
  if (!marker) {
    marker = L.marker([state.lat, state.lng], { icon: pinIcon, draggable: true, autoPan: true }).addTo(map);
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      setLocation(p.lat, p.lng, { pan: false });
      markDirty();
    });
  } else {
    marker.setLatLng([state.lat, state.lng]);
  }
  if (pan) map.setView([state.lat, state.lng], Math.max(map.getZoom(), 16));
  $('coords').textContent = `${state.lat}, ${state.lng}`;
  clearError('location');
}

function initPickMap() {
  map = L.map('pick-map', { scrollWheelZoom: false }).setView(APP_CONFIG.mapCenter, APP_CONFIG.mapZoom);
  addTiles(map);
  map.on('click', (e) => {
    map.scrollWheelZoom.enable();
    setLocation(e.latlng.lat, e.latlng.lng, { pan: false });
    markDirty();
  });
  map.on('mouseout', () => map.scrollWheelZoom.disable());
  new ResizeObserver(() => map.invalidateSize()).observe($('pick-map'));
}

// Búsqueda de dirección con Nominatim (OpenStreetMap, gratuito; uso moderado)
async function searchAddress(button) {
  const address = f('address').value.trim();
  if (!address) {
    showError('address', 'Escribe la dirección primero.');
    f('address').focus();
    return;
  }
  const q = [address, f('zone').value.trim(), 'Santa Cruz de la Sierra', 'Bolivia'].filter(Boolean).join(', ');
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=bo&accept-language=es&q=${encodeURIComponent(q)}`;

  await withBusy(button, 'Buscando…', async () => {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const [hit] = await res.json();
      if (!hit) {
        toast('No encontramos esa dirección. Marca el lugar tocando el mapa.', { type: 'error' });
        return;
      }
      setLocation(Number(hit.lat), Number(hit.lon));
      markDirty();
      toast('Ubicación encontrada. Ajusta el pin si hace falta.');
    } catch {
      toast('No se pudo buscar la dirección. Marca el lugar tocando el mapa.', { type: 'error' });
    }
  });
}

function useMyLocation(button) {
  if (!navigator.geolocation) {
    toast('Tu navegador no permite obtener la ubicación.', { type: 'error' });
    return;
  }
  const label = button.innerHTML;
  button.disabled = true;
  button.textContent = 'Ubicando…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      button.disabled = false;
      button.innerHTML = label;
      setLocation(pos.coords.latitude, pos.coords.longitude);
      markDirty();
    },
    () => {
      button.disabled = false;
      button.innerHTML = label;
      toast('No pudimos obtener tu ubicación. Revisa los permisos o marca el lugar en el mapa.', { type: 'error' });
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// =====================================================================
//  Portada
// =====================================================================
function renderCover() {
  const src = state.cover.preview || safeURL(state.cover.url);
  const img = $('cover-preview');
  img.classList.toggle('hidden', !src);
  img.src = src || 'assets/img/placeholder-kermes.svg';
  $('cover-actions').classList.toggle('hidden', !src);
  $('cover-actions').classList.toggle('flex', Boolean(src));
}

async function pickCover(file) {
  if (!file) return;
  try {
    const blob = await compressImage(file, { maxSize: 1600 });
    if (state.cover.preview) URL.revokeObjectURL(state.cover.preview);
    state.cover = { url: state.cover.url, blob, preview: URL.createObjectURL(blob) };
    renderCover();
    markDirty();
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
}

function bindCover() {
  const drop = $('cover-drop');
  $('cover-input').addEventListener('change', (e) => {
    pickCover(e.target.files[0]);
    e.target.value = '';
  });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add('is-over');
  }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    pickCover(e.dataTransfer.files[0]);
  });
  $('cover-remove').addEventListener('click', () => {
    if (state.cover.preview) URL.revokeObjectURL(state.cover.preview);
    state.cover = { url: null, blob: null, preview: null };
    renderCover();
    markDirty();
  });
}

// =====================================================================
//  Menú (lista de platos)
// =====================================================================
function dishRowHTML(d, i, total) {
  const src = d.preview || safeURL(d.image_url);
  return `
    <li class="dish-row" data-dish-id="${escapeHTML(d.id)}">
      <button type="button" class="dish-photo" data-act="photo" aria-label="Elegir foto del plato">
        ${src ? `<img src="${escapeHTML(src)}" alt="" class="h-full w-full object-cover">`
              : '<svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>Agregar foto</span>'}
      </button>
      <div class="dish-body min-w-0 space-y-2">
        <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
          <input class="input" data-f="name" value="${escapeHTML(d.name)}" maxlength="80" placeholder="Nombre (ej. Majadito)" aria-label="Nombre del plato">
          <div class="input-group">
            <span class="addon">Bs</span>
            <input class="input price" data-f="price" value="${escapeHTML(d.price)}" type="number" min="0" step="0.5" inputmode="decimal" placeholder="0" aria-label="Precio en bolivianos">
          </div>
        </div>
        <input class="input" data-f="description" value="${escapeHTML(d.description)}" maxlength="300" placeholder="Descripción corta (opcional)" aria-label="Descripción del plato">
        <div class="grid grid-cols-2 gap-2">
          <label class="block min-w-0">
            <span class="mb-1 block text-xs font-semibold text-muted">Categoría</span>
            <select class="pill-select !h-11 w-full !rounded-[14px]" data-f="category">
              ${[['comida', 'Comida'], ['bebida', 'Bebida'], ['otro', 'Otro']].map(([v, l]) => `<option value="${v}" ${d.category === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>
          <label class="block min-w-0">
            <span class="mb-1 block text-xs font-semibold text-ink">Porciones disponibles <span class="text-bad">*</span></span>
            <input class="input !h-11 num" data-f="stock" value="${escapeHTML(d.stock)}" type="number" min="1" step="1" inputmode="numeric" placeholder="Ej. 50" required>
          </label>
        </div>
        <p class="field-error hidden" data-dish-error></p>
        <div class="flex items-center gap-2">
          <button type="button" class="btn btn-outline star-toggle !h-9 !px-3 text-[13px]" data-act="star" aria-pressed="${d.is_featured}">${icons.star('h-4 w-4')} Destacado</button>
          <span class="flex-1"></span>
          <button type="button" class="icon-btn" data-act="up" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>${icons.arrowLeft('h-4 w-4 rotate-90')}</button>
          <button type="button" class="icon-btn" data-act="down" aria-label="Bajar" ${i === total - 1 ? 'disabled' : ''}>${icons.arrowLeft('h-4 w-4 -rotate-90')}</button>
          <button type="button" class="icon-btn !text-[#b42318]" data-act="remove" aria-label="Quitar plato">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
          </button>
        </div>
      </div>
    </li>`;
}

function renderDishes() {
  const list = $('dish-list');
  list.innerHTML = state.dishes.map((d, i) => dishRowHTML(d, i, state.dishes.length)).join('');
  $('dish-empty').classList.toggle('hidden', state.dishes.length > 0);
  $('dish-count').textContent = state.dishes.length ? `${state.dishes.length} ${state.dishes.length === 1 ? 'plato' : 'platos'}` : '';
  $('dish-add').disabled = state.dishes.length >= MAX_DISHES;
  list.querySelectorAll('.icon-btn:disabled').forEach((b) => b.classList.add('opacity-40'));
}

function dishOf(el) {
  const row = el.closest('[data-dish-id]');
  return row ? state.dishes.find((d) => d.id === row.dataset.dishId) : null;
}

function bindDishes() {
  const list = $('dish-list');

  $('dish-add').addEventListener('click', () => {
    state.dishes.push(newDish());
    renderDishes();
    markDirty();
    list.lastElementChild?.querySelector('[data-f="name"]').focus();
  });

  list.addEventListener('input', (e) => {
    const field = e.target.dataset.f;
    const dish = dishOf(e.target);
    if (!field || !dish) return;
    dish[field] = e.target.value;
    e.target.removeAttribute('aria-invalid');
    markDirty();
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    const dish = btn && dishOf(btn);
    if (!dish) return;
    const i = state.dishes.indexOf(dish);

    switch (btn.dataset.act) {
      case 'photo':
        state.photoTarget = dish.id;
        $('dish-photo-input').click();
        return;
      case 'star':
        dish.is_featured = !dish.is_featured;
        btn.setAttribute('aria-pressed', String(dish.is_featured));
        markDirty();
        return;
      case 'up':
      case 'down': {
        const j = btn.dataset.act === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= state.dishes.length) return;
        [state.dishes[i], state.dishes[j]] = [state.dishes[j], state.dishes[i]];
        break;
      }
      case 'remove':
        if (dish.preview) URL.revokeObjectURL(dish.preview);
        state.dishes.splice(i, 1);
        break;
      default:
        return;
    }
    renderDishes();
    markDirty();
  });

  $('dish-photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    const dish = state.dishes.find((d) => d.id === state.photoTarget);
    if (!file || !dish) return;
    try {
      const blob = await compressImage(file, { maxSize: 800 });
      if (dish.preview) URL.revokeObjectURL(dish.preview);
      Object.assign(dish, { blob, preview: URL.createObjectURL(blob) });
      renderDishes();
      markDirty();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  });
}

// =====================================================================
//  Premios de la rifa
// =====================================================================
const MAX_PRIZES = 10;
const ordinal = (n) => (n === 1 ? '1.er' : n === 3 ? '3.er' : `${n}.º`);
const newPrize = () => ({ id: crypto.randomUUID(), name: '', image_url: null, blob: null, preview: null });
const hasPrizeContent = (p) => p.name.trim() || p.image_url || p.blob;

function renderPrizes() {
  const list = $('prize-list');
  list.innerHTML = state.prizes.map((p, i) => {
    const src = p.preview || safeURL(p.image_url);
    return `
      <li class="prize-row" data-prize-id="${escapeHTML(p.id)}">
        <button type="button" class="prize-photo" data-pact="photo" aria-label="${src ? 'Cambiar' : 'Agregar'} foto del ${ordinal(i + 1)} premio">
          ${src ? `<img src="${escapeHTML(src)}" alt="">` : icons.image('h-6 w-6')}
        </button>
        <label class="min-w-0 flex-1">
          <span class="mb-1 block text-xs font-bold text-tang-text">${ordinal(i + 1)} premio</span>
          <input class="input !h-11" data-pf="name" value="${escapeHTML(p.name)}" maxlength="80" placeholder="Ej. Licuadora">
        </label>
        <button type="button" class="icon-btn flex-none self-end !h-11 !w-11 !text-[#b42318]" data-pact="remove" aria-label="Quitar ${ordinal(i + 1)} premio">${icons.trash('h-4 w-4')}</button>
      </li>`;
  }).join('');
  $('prize-count').textContent = state.prizes.length ? `${state.prizes.length} de ${MAX_PRIZES}` : '';
  $('prize-add').disabled = state.prizes.length >= MAX_PRIZES;
}

function bindPrizes() {
  $('prize-add').addEventListener('click', () => {
    if (state.prizes.length >= MAX_PRIZES) return;
    state.prizes.push(newPrize());
    renderPrizes();
    markDirty();
    $('prize-list').lastElementChild?.querySelector('[data-pf="name"]').focus();
  });

  $('prize-list').addEventListener('input', (e) => {
    const row = e.target.closest('[data-prize-id]');
    const prize = state.prizes.find((p) => p.id === row?.dataset.prizeId);
    if (prize && e.target.dataset.pf === 'name') {
      prize.name = e.target.value;
      e.target.removeAttribute('aria-invalid');
      clearError('prizes');
    }
  });

  $('prize-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pact]');
    if (!btn) return;
    const i = state.prizes.findIndex((p) => p.id === btn.closest('[data-prize-id]').dataset.prizeId);
    if (i < 0) return;
    if (btn.dataset.pact === 'photo') {
      state.prizeTarget = state.prizes[i].id;
      $('prize-photo-input').click();
      return;
    }
    if (state.prizes[i].preview) URL.revokeObjectURL(state.prizes[i].preview);
    state.prizes.splice(i, 1);
    renderPrizes();
    markDirty();
  });

  $('prize-photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    const prize = state.prizes.find((p) => p.id === state.prizeTarget);
    if (!file || !prize) return;
    try {
      const blob = await compressImage(file, { maxSize: 800 });
      if (prize.preview) URL.revokeObjectURL(prize.preview);
      Object.assign(prize, { blob, preview: URL.createObjectURL(blob) });
      renderPrizes();
      markDirty();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  });
}

// =====================================================================
//  Vista previa + requisitos
// =====================================================================
function draftKermes() {
  const dishes = state.dishes
    .filter((d) => d.name.trim())
    .map((d) => ({ ...d, price: Number(d.price) || 0, image_url: d.preview || d.image_url }));
  return {
    id: state.id,
    title: f('title').value.trim() || 'Nombre de tu kermés',
    event_date: f('event_date').value || toISODate(new Date()),
    start_time: f('start_time').value || '10:00',
    end_time: f('end_time').value || null,
    address: f('address').value.trim() || 'Dirección',
    zone: f('zone').value.trim() || 'Zona',
    cover_image_url: state.cover.preview || state.cover.url,
    menu_items: dishes,
  };
}

function checklist() {
  const validDishes = state.dishes.filter((d) => d.name.trim().length >= 2 && String(d.price).trim() !== '');
  return [
    { ok: f('title').value.trim().length >= 3, label: 'Nombre de la kermés' },
    { ok: Boolean(f('event_date').value && f('start_time').value), label: 'Fecha y hora' },
    { ok: Boolean(f('address').value.trim() && f('zone').value.trim() && state.lat !== null), label: 'Dirección y pin en el mapa' },
    { ok: validDishes.length > 0, label: 'Al menos un plato con precio' },
    { ok: Boolean(state.cover.url || state.cover.blob), label: 'Foto de portada', optional: true },
    { ok: normalizeWhatsapp(f('whatsapp').value) !== null && normalizeWhatsapp(f('whatsapp').value) !== false, label: 'WhatsApp de contacto', optional: true },
  ];
}

const refreshPreview = debounce(() => {
  $('preview').innerHTML = cardHTML(draftKermes());
  $('checklist').innerHTML = checklist().map((c) => `
    <li class="check-item ${c.ok ? 'ok' : ''}">
      <span class="dot"><svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg></span>
      ${escapeHTML(c.label)}${c.optional ? ' <span class="text-xs text-muted">(recomendado)</span>' : ''}
    </li>`).join('');
}, 120);

// =====================================================================
//  Validación
// =====================================================================
function showError(key, text) {
  const el = form.querySelector(`[data-error="${key}"]`);
  if (el) {
    el.textContent = text;
    el.classList.remove('hidden');
  }
  const input = form.elements[key];
  if (input instanceof HTMLElement) input.setAttribute('aria-invalid', 'true');
}

function clearError(key) {
  form.querySelector(`[data-error="${key}"]`)?.classList.add('hidden');
  const input = form.elements[key];
  if (input instanceof HTMLElement) input.removeAttribute('aria-invalid');
}

function clearAllErrors() {
  form.querySelectorAll('.field-error').forEach((el) => el.classList.add('hidden'));
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
}

/** Devuelve true si todo está bien. Publicar exige más que guardar un borrador. */
function validate(targetStatus) {
  clearAllErrors();
  const errors = [];
  const err = (key, text) => {
    errors.push(key);
    showError(key, text);
  };
  const publishing = targetStatus === 'publicada';

  if (f('title').value.trim().length < 3) err('title', 'Escribe un nombre de al menos 3 letras.');
  if (!f('event_date').value) err('event_date', 'Elige la fecha.');
  else if (publishing && f('event_date').value < toISODate(new Date())) err('event_date', 'La fecha ya pasó. Elige una fecha de hoy en adelante.');
  if (!f('start_time').value) err('start_time', 'Indica la hora de inicio.');
  if (f('end_time').value && f('start_time').value && f('end_time').value <= f('start_time').value) {
    err('end_time', 'Debe ser después de la hora de inicio.');
  }
  if (!f('address').value.trim()) err('address', 'Escribe la dirección.');
  if (!f('zone').value.trim()) err('zone', 'Indica la zona o barrio.');
  if (state.lat === null) err('location', 'Marca el lugar exacto en el mapa.');
  if (normalizeWhatsapp(f('whatsapp').value) === false) err('whatsapp', 'Escribe un celular de 8 dígitos (ej. 70012345).');

  // Platos: se ignoran las filas totalmente vacías; las demás deben tener nombre y precio
  let dishProblems = 0;
  document.querySelectorAll('[data-dish-id]').forEach((row) => {
    const d = state.dishes.find((x) => x.id === row.dataset.dishId);
    if (!d || !hasDishContent(d)) return;
    const msg = [];
    if (d.name.trim().length < 2) {
      msg.push('falta el nombre');
      row.querySelector('[data-f="name"]').setAttribute('aria-invalid', 'true');
    }
    const price = Number(d.price);
    if (String(d.price).trim() === '' || !Number.isFinite(price) || price < 0) {
      msg.push('falta un precio válido');
      row.querySelector('[data-f="price"]').setAttribute('aria-invalid', 'true');
    }
    if (String(d.stock).trim() === '') {
      msg.push('faltan las porciones disponibles');
      row.querySelector('[data-f="stock"]').setAttribute('aria-invalid', 'true');
    } else if (!(Number.isInteger(Number(d.stock)) && Number(d.stock) >= 1)) {
      msg.push('las porciones deben ser un número entero mayor a 0');
      row.querySelector('[data-f="stock"]').setAttribute('aria-invalid', 'true');
    }
    if (msg.length) {
      dishProblems += 1;
      const p = row.querySelector('[data-dish-error]');
      p.textContent = `Este plato: ${msg.join(' y ')}.`;
      p.classList.remove('hidden');
    }
  });
  if (dishProblems) errors.push('menu');
  if (f('raffle_enabled').checked) {
    const price = Number(f('raffle_price').value);
    const total = Number(f('raffle_total').value);
    if (f('raffle_price').value === '' || !(price >= 0)) err('raffle_price', 'Indica el precio del boleto.');
    if (!(Number.isInteger(total) && total >= 1 && total <= 5000)) err('raffle_total', 'Entre 1 y 5000 números.');
    let unnamed = 0;
    document.querySelectorAll('[data-prize-id]').forEach((row) => {
      const p = state.prizes.find((x) => x.id === row.dataset.prizeId);
      if (p && hasPrizeContent(p) && !p.name.trim()) {
        unnamed += 1;
        row.querySelector('[data-pf="name"]').setAttribute('aria-invalid', 'true');
      }
    });
    if (unnamed) err('prizes', unnamed === 1 ? 'Un premio tiene foto pero no nombre.' : `${unnamed} premios tienen foto pero no nombre.`);
  }
  if (publishing && !state.dishes.some(hasDishContent)) err('menu', 'Para publicar, agrega al menos un plato con su precio.');

  if (errors.length) {
    const first = form.querySelector('[aria-invalid="true"], .field-error:not(.hidden)');
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('Revisa los campos marcados en rojo.', { type: 'error' });
  }
  return errors.length === 0;
}

// =====================================================================
//  Guardar
// =====================================================================
async function save(targetStatus, button) {
  if (!validate(targetStatus)) return;

  await withBusy(button, 'Guardando…', async () => {
    try {
      const uid = state.user.id;

      // 1) Subir imágenes nuevas (comprimidas en el navegador)
      if (state.cover.blob) {
        state.cover.url = await uploadImage(state.cover.blob, imagePath(uid, state.id, 'portada', state.cover.blob));
        URL.revokeObjectURL(state.cover.preview);
        state.cover = { url: state.cover.url, blob: null, preview: null };
      }
      const dishes = state.dishes.filter(hasDishContent);
      for (const d of dishes) {
        if (d.blob) {
          d.image_url = await uploadImage(d.blob, imagePath(uid, state.id, 'plato', d.blob));
          URL.revokeObjectURL(d.preview);
          d.blob = null;
          d.preview = null;
        }
      }

      const prizes = state.prizes.filter(hasPrizeContent);
      for (const p of prizes) {
        if (p.blob) {
          p.image_url = await uploadImage(p.blob, imagePath(uid, state.id, 'premio', p.blob));
          URL.revokeObjectURL(p.preview);
          p.blob = null;
          p.preview = null;
        }
      }

      // 2) Guardar la kermés y su menú
      const kermes = {
        id: state.id,
        organizer_id: uid,
        title: f('title').value.trim(),
        description: f('description').value.trim() || null,
        event_date: f('event_date').value,
        start_time: f('start_time').value,
        end_time: f('end_time').value || null,
        address: f('address').value.trim(),
        zone: f('zone').value.trim(),
        latitude: state.lat,
        longitude: state.lng,
        cover_image_url: state.cover.url,
        whatsapp: normalizeWhatsapp(f('whatsapp').value) || null,
        status: targetStatus,
        raffle_enabled: f('raffle_enabled').checked,
        raffle_price: f('raffle_enabled').checked ? Number(f('raffle_price').value) : null,
        raffle_total: f('raffle_enabled').checked ? Number(f('raffle_total').value) : null,
        raffle_prizes: prizes.map(({ id, name, image_url }) => ({ id, name: name.trim(), image_url })),
        raffle_prize: prizes.map((p) => p.name.trim()).join(', ') || null, // texto corto (compatibilidad)
      };
      const items = dishes.map((d) => ({
        id: d.id,
        name: d.name.trim(),
        description: d.description.trim() || null,
        price: Number(d.price),
        image_url: d.image_url,
        is_featured: d.is_featured,
        category: d.category || 'comida',
        stock: String(d.stock).trim() === '' ? null : Number(d.stock),
      }));
      await saveKermes(kermes, items);

      const wasStatus = state.status;
      state.dishes = dishes;
      state.prizes = prizes;
      state.status = targetStatus;
      state.isNew = false;
      state.dirty = false;
      history.replaceState(null, '', `editar.html?id=${encodeURIComponent(state.id)}`);
      renderDishes();
      renderPrizes();
      renderHeader();

      // Recién publicada: de vuelta al panel, donde está el botón "Vender"
      if (targetStatus === 'publicada' && wasStatus !== 'publicada') {
        try { sessionStorage.setItem('tk_flash', '¡Publicada! Ya aparece en el muro y en el mapa.'); } catch { /* nada */ }
        window.location.href = 'panel.html';
        return;
      }

      toast({
        publicada: 'Cambios guardados.',
        borrador: 'Borrador guardado.',
        finalizada: 'Cambios guardados.',
      }[targetStatus]);
    } catch (err) {
      toast(err.message, { type: 'error', ms: 6000 });
    }
  });
}

// Botones según el estado actual
function renderActions() {
  const s = state.status;
  const buttons = {
    borrador: [['borrador', 'Guardar borrador', 'btn-outline'], ['publicada', 'Publicar', 'btn-primary']],
    publicada: [['borrador', 'Pasar a borrador', 'btn-outline'], ['publicada', 'Guardar cambios', 'btn-primary']],
    finalizada: [['borrador', 'Reabrir como borrador', 'btn-outline'], ['finalizada', 'Guardar cambios', 'btn-primary']],
  }[s];

  document.querySelectorAll('[data-actions]').forEach((box) => {
    box.innerHTML = buttons.map(([status, label, cls]) =>
      `<button type="button" class="btn ${cls}" data-save="${status}">${label}</button>`).join('');
  });
}

function renderHeader() {
  $('editor-title').textContent = state.isNew ? 'Nueva kermés' : 'Editar kermés';
  document.title = `${state.isNew ? 'Nueva kermés' : 'Editar kermés'} · tukermes`;
  const badge = $('status-badge');
  badge.className = `status status-${state.status}`;
  badge.textContent = STATUS_LABEL[state.status];
  renderActions();
}

// =====================================================================
//  Carga inicial
// =====================================================================
function fillForm(k) {
  f('title').value = k.title ?? '';
  f('description').value = k.description ?? '';
  f('event_date').value = k.event_date ?? '';
  f('start_time').value = (k.start_time ?? '').slice(0, 5);
  f('end_time').value = (k.end_time ?? '').slice(0, 5);
  f('address').value = k.address ?? '';
  f('zone').value = k.zone ?? '';
  f('whatsapp').value = (k.whatsapp ?? '').replace(/^591/, '');
  f('raffle_enabled').checked = Boolean(k.raffle_enabled);
  f('raffle_price').value = k.raffle_price ?? '';
  f('raffle_total').value = k.raffle_total ?? '';
  // Kermeses anteriores tenían un solo premio en texto
  const savedPrizes = Array.isArray(k.raffle_prizes) && k.raffle_prizes.length
    ? k.raffle_prizes
    : k.raffle_prize ? [{ id: crypto.randomUUID(), name: k.raffle_prize, image_url: null }] : [];
  state.prizes = savedPrizes.map((p) => ({ id: p.id || crypto.randomUUID(), name: p.name ?? '', image_url: p.image_url ?? null, blob: null, preview: null }));
  toggleRaffle();
  state.cover = { url: k.cover_image_url, blob: null, preview: null };
  state.dishes = (k.menu_items ?? []).map((m) => ({
    id: m.id, name: m.name ?? '', description: m.description ?? '', price: String(m.price ?? ''),
    category: m.category ?? 'comida', stock: m.stock ?? '',
    is_featured: Boolean(m.is_featured), image_url: m.image_url, blob: null, preview: null,
  }));
  if (Number.isFinite(k.latitude) && Number.isFinite(k.longitude)) setLocation(k.latitude, k.longitude);
}

function toggleRaffle() {
  const on = f('raffle_enabled').checked;
  if (on && !state.prizes.length) { state.prizes.push(newPrize()); }
  renderPrizes();
  $('raffle-fields').classList.toggle('hidden', !on);
  $('raffle-fields').classList.toggle('grid', on);
}

function bindForm() {
  f('raffle_enabled').addEventListener('change', toggleRaffle);
  bindPrizes();
  form.addEventListener('input', (e) => {
    if (e.target.name) clearError(e.target.name);
    const counter = document.querySelector(`[data-count="${e.target.id}"]`);
    if (counter) counter.textContent = `${e.target.value.length}/${e.target.maxLength}`;
    markDirty();
  });

  // Los botones viven en dos lugares (panel lateral y barra móvil)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-save]');
    if (btn) save(btn.dataset.save, btn);
  });

  $('geo-search').addEventListener('click', (e) => searchAddress(e.currentTarget));
  $('geo-me').addEventListener('click', (e) => useMyLocation(e.currentTarget));

  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) e.preventDefault();
  });
}

async function init() {
  state.user = await requireUser();
  $('zones').innerHTML = ZONES.map((z) => `<option value="${escapeHTML(z)}">`).join('');
  f('event_date').min = toISODate(new Date());

  initPickMap();
  bindForm();
  bindCover();
  bindDishes();

  const id = new URLSearchParams(window.location.search).get('id');
  if (id) {
    try {
      const k = await getMyKermes(id, state.user.id);
      if (!k) {
        $('editor').classList.add('hidden');
        $('not-found').classList.remove('hidden');
        return;
      }
      state.id = k.id;
      state.isNew = false;
      state.status = k.status;
      fillForm(k);
      f('event_date').removeAttribute('min'); // al editar puede tener fecha pasada (finalizada)
    } catch (err) {
      toast(`No pudimos cargar la kermés: ${err.message}`, { type: 'error', ms: 6000 });
      return;
    }
  } else {
    state.id = crypto.randomUUID();
    state.dishes = [newDish()];
  }

  ['f-title', 'f-description'].forEach((fid) => {
    const el = $(fid);
    document.querySelector(`[data-count="${fid}"]`).textContent = `${el.value.length}/${el.maxLength}`;
  });

  renderHeader();
  renderCover();
  renderDishes();
  refreshPreview();
  state.dirty = false;

  if (window.location.hash === '#menu') $('menu').scrollIntoView({ behavior: 'smooth' });
}

init();
