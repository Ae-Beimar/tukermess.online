// Punto de entrada del inicio (index.html).
// Orden: hero con buscador → próxima kermés → mapa integrado + tarjetas → organizadores.
// El buscador filtra el mapa y las tarjetas mientras se escribe; cuando sale de la vista,
// aparece una versión compacta en la barra superior para que siempre esté a mano.
import { isSupabaseConfigured, APP_CONFIG } from './supabaseConfig.js';
import { fetchPublishedKermeses } from './services/kermesService.js';
import { applyFilters, popularDishes } from './utils/filters.js';
import { debounce, escapeHTML } from './utils/format.js';
import { renderCards, skeletonCards } from './ui/cards.js';
import { initMap, renderMarkers, highlightMarker, refreshMapSize } from './ui/map.js';
import { initSiteMenu } from './ui/siteMenu.js';
import { renderHero } from './ui/hero.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  grid: $('#kermes-grid'),
  count: $('#results-count'),
  error: $('#error-state'),
  empty: $('#empty-state'),
  demo: $('#demo-banner'),
  city: document.querySelectorAll('[data-city]'),
  inputs: document.querySelectorAll('[data-search]'),
  forms: document.querySelectorAll('[data-search-form]'),
  hint: $('#search-hint'),
  suggest: $('#search-suggest'),
  active: $('#search-active'),
  activeText: $('#search-active-text'),
  clear: $('#search-clear'),
  heroSearch: $('#hero-search'),
  headerSearch: $('.header-search'),
  mapBody: $('#map-body'),
  mapToggle: $('#map-toggle'),
};

const state = { all: [], q: '' };
const plural = (n) => (n === 1 ? '1 kermés' : `${n} kermeses`);

/* ---------- Resultados ---------- */
function update({ fit = true } = {}) {
  const q = state.q.trim();
  const list = q ? applyFilters(state.all, { q }) : state.all;

  renderCards(els.grid, list);
  renderMarkers(list, { fit });

  els.count.textContent = q ? `${list.length} de ${plural(state.all.length)}` : plural(state.all.length);
  els.empty.classList.toggle('hidden', list.length > 0);

  // Barra "búsqueda activa" sobre las tarjetas
  els.active.classList.toggle('hidden', !q);
  if (q) els.activeText.innerHTML = `${list.length ? plural(list.length) : 'Nada'} para <strong>“${escapeHTML(q)}”</strong>`;

  // Pista bajo el buscador grande: cuántas hay y un atajo para verlas
  els.hint.innerHTML = !q ? '' : list.length
    ? `${plural(list.length)} con “${escapeHTML(q)}” · <a href="#kermeses">Ver resultados</a>`
    : `Sin resultados para “${escapeHTML(q)}”`;
  els.suggest.classList.toggle('hidden', Boolean(q) || !els.suggest.childElementCount);
}

function setQuery(value, from) {
  state.q = value;
  els.inputs.forEach((input) => { if (input !== from) input.value = value; });
  // El botón × aparece solo cuando hay algo escrito
  els.forms.forEach((f) => f.classList.toggle('has-value', Boolean(value)));
  update();
}

/* ---------- Buscador ---------- */
function bindSearch() {
  const onInput = debounce((input) => setQuery(input.value, input), 140);
  els.inputs.forEach((input) => input.addEventListener('input', () => onInput(input)));

  els.forms.forEach((form) => form.addEventListener('submit', (e) => {
    e.preventDefault();
    form.querySelector('input')?.blur(); // cierra el teclado en el celular
    document.getElementById('kermeses').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  const clearSearch = () => { setQuery(''); els.inputs.forEach((i) => (i.value = '')); };
  els.clear.addEventListener('click', clearSearch);
  // × dentro del campo: borra y deja el foco ahí para escribir otra cosa
  document.querySelectorAll('[data-search-clear]').forEach((b) => b.addEventListener('click', () => {
    clearSearch();
    b.closest('label')?.querySelector('input')?.focus();
  }));
  // Esc borra la búsqueda (comportamiento conocido de los buscadores)
  els.inputs.forEach((input) => input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) { e.preventDefault(); clearSearch(); }
  }));

  // Sugerencias: los platos más repetidos, un toque y se busca
  els.suggest.addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    els.inputs.forEach((i) => (i.value = b.dataset.q));
    setQuery(b.dataset.q);
    // En celular los resultados quedan fuera de la pantalla: vamos directo a ellos
    if (matchMedia('(max-width: 639px)').matches) {
      document.getElementById('kermeses').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Cuando el buscador grande sale por arriba, se acopla a la barra superior
  // Solo en tablet y computadora: en celular el buscador se queda en el inicio (la barra queda limpia)
  if ('IntersectionObserver' in window && els.heroSearch) {
    const headerInput = els.headerSearch?.querySelector('input');
    const wide = matchMedia('(min-width: 768px)');
    let outOfView = false;
    const apply = () => {
      const docked = outOfView && wide.matches;
      document.body.classList.toggle('search-docked', docked);
      els.headerSearch?.setAttribute('aria-hidden', String(!docked));
      headerInput?.setAttribute('tabindex', docked ? '0' : '-1');
    };
    new IntersectionObserver(([entry]) => {
      outOfView = !entry.isIntersecting && entry.boundingClientRect.top < 80;
      apply();
    }, { rootMargin: '-60px 0px 0px 0px', threshold: 0 }).observe(els.heroSearch);
    wide.addEventListener('change', apply);
  }
}

function renderSuggestions() {
  const names = popularDishes(state.all, 4).map((d) => d.name);
  if (!names.length) return;
  els.suggest.innerHTML = `<span>Populares:</span>${names.map((n) =>
    `<button type="button" data-q="${escapeHTML(n)}">${escapeHTML(n)}</button>`).join('')}`;
  els.suggest.classList.remove('hidden');
}

/* ---------- Mapa ---------- */
function setMapVisible(visible) {
  els.mapBody.classList.toggle('is-collapsed', !visible);
  els.mapToggle.textContent = visible ? 'Ocultar' : 'Mostrar';
  els.mapToggle.setAttribute('aria-expanded', String(visible));
  try { localStorage.setItem('tukermes:map', visible ? '1' : '0'); } catch { /* sin almacenamiento */ }
  if (visible) setTimeout(() => { refreshMapSize(); update({ fit: true }); }, 560);
}

// Pasar el mouse por una tarjeta resalta su pin en el mapa
function bindHighlight(container, selector) {
  container.addEventListener('mouseover', (e) => {
    const el = e.target.closest(selector);
    if (el) highlightMarker(el.dataset.id, true);
  });
  container.addEventListener('mouseout', (e) => {
    const el = e.target.closest(selector);
    if (el && !el.contains(e.relatedTarget)) highlightMarker(el.dataset.id, false);
  });
}

async function init() {
  els.city.forEach((el) => (el.textContent = APP_CONFIG.cityName));
  els.demo?.classList.toggle('hidden', isSupabaseConfigured);

  initSiteMenu();
  initMap('map');
  try { if (localStorage.getItem('tukermes:map') === '0') setMapVisible(false); } catch { /* sin almacenamiento */ }
  els.mapToggle.addEventListener('click', () => setMapVisible(els.mapBody.classList.contains('is-collapsed')));
  skeletonCards(els.grid);
  bindHighlight(els.grid, '.kermes-card[data-id]');
  bindSearch();
  window.addEventListener('resize', debounce(refreshMapSize, 200));

  try {
    state.all = await fetchPublishedKermeses();
    renderHero(state.all);
    renderSuggestions();
    update();
  } catch (err) {
    console.error('[tukermes] Error cargando kermeses:', err);
    els.grid.innerHTML = '';
    els.count.textContent = '';
    els.error.classList.remove('hidden');
  }
}

init();
