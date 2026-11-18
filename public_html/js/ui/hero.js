// Inicio (index.html): todo lo que se arma con los datos de las kermeses.
//  · Collage de platos: tres fotos que rotan con un fundido suave, escalonadas.
//  · Cifras (kermeses, platos, zonas) y el aviso "en vivo".
//  · Tarjetas flotantes: la próxima kermés y el plato más barato.
//  · Banda oscura de la próxima kermés, con su causa y su menú.
//  · Vista previa en "celular" para la sección de organizadores.
import {
  escapeHTML, safeURL, eventURL, formatPrice, formatTime, formatTimeRange, parseLocalDate, PLACEHOLDER_IMG,
} from '../utils/format.js';
import { icons } from '../utils/icons.js';
import { relativeDay } from './cards.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Platos con foto, alternando kermeses (uno por foto). */
function dishPhotos(kermeses) {
  const lists = kermeses.map((k) => (k.menu_items ?? []).filter((m) => safeURL(m.image_url)).map((m) => ({ ...m, kermes: k })));
  const out = [];
  const seen = new Set();
  for (let i = 0; lists.some((l) => l[i]); i++) {
    for (const l of lists) {
      const m = l[i];
      if (m && !seen.has(m.image_url)) { seen.add(m.image_url); out.push(m); }
    }
  }
  if (!out.length) {
    kermeses.forEach((k) => { const src = safeURL(k.cover_image_url); if (src) out.push({ name: k.title, image_url: src, kermes: k }); });
  }
  return out;
}

function daysUntil(iso) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((parseLocalDate(iso) - t) / 86400000);
}
function whenLabel(iso) {
  const d = daysUntil(iso);
  if (d <= 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  return `En ${d} días`;
}

/* ---------- Collage ---------- */
function renderCollage(photos) {
  const tiles = [...document.querySelectorAll('#hero-collage .tile')];
  if (!tiles.length) return;
  if (!photos.length) { tiles.forEach((t) => { t.innerHTML = `<img src="${PLACEHOLDER_IMG}" alt="">`; }); return; }

  const slot = (tile, m, first) => {
    tile.innerHTML = `
      <img src="${escapeHTML(m.image_url)}" alt="${escapeHTML(m.name)}" class="is-in" ${first ? 'fetchpriority="high"' : 'loading="lazy"'} draggable="false">
      <figcaption>${escapeHTML(m.name)}</figcaption>`;
  };
  tiles.forEach((t, i) => slot(t, photos[i % photos.length], i === 0));
  if (photos.length <= tiles.length || reduce.matches) return;

  // Rotación: cada 5 s cambia una sola foto (no las tres a la vez), con fundido.
  // Solo rota si se ve y nadie la está mirando de cerca (apple-design: no pelear con la atención)
  const collage = tiles[0].parentElement;
  let inView = true, hovering = false;
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; }).observe(collage);
  collage.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hovering = true; });
  collage.addEventListener('pointerleave', () => { hovering = false; });
  let next = tiles.length, turn = 0;
  setInterval(() => {
    if (document.hidden || !inView || hovering) return;
    const tile = tiles[turn % tiles.length];
    turn++;
    const m = photos[next % photos.length];
    next++;
    const old = tile.querySelector('img');
    const img = new Image();
    img.alt = m.name; img.draggable = false; img.src = m.image_url; img.className = 'is-out';
    img.decode().catch(() => {}).then(() => {
      tile.insertBefore(img, tile.querySelector('figcaption'));
      img.getBoundingClientRect(); // fija el estado inicial y cruza las fotos sin esperar un cuadro
      img.className = 'is-in'; old?.classList.add('is-out');
      const cap = tile.querySelector('figcaption');
      if (cap) { cap.style.opacity = '0'; setTimeout(() => { cap.textContent = m.name; cap.style.opacity = '1'; }, 400); }
      setTimeout(() => old?.remove(), 1000);
    });
  }, 5000);
}

/* ---------- Carrusel de platos (celular) ---------- */
function renderDeck(photos) {
  const deck = document.getElementById('hero-deck');
  const track = deck?.querySelector('.deck-track');
  const dots = deck?.querySelector('.deck-dots');
  if (!track || !photos.length) { deck?.classList.add('is-empty'); return; }
  const items = photos.slice(0, 8);
  track.innerHTML = items.map((m, i) => {
    const k = m.kermes;
    const price = Number(m.price) > 0 ? `<span class="deck-price num">${escapeHTML(formatPrice(m.price))}</span>` : '';
    return `
      <a class="deck-card" href="${escapeHTML(eventURL(k.id))}" aria-label="${escapeHTML(`${m.name} en ${k.title}`)} (${i + 1} de ${items.length})">
        <img src="${escapeHTML(m.image_url)}" alt="" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} draggable="false">
        ${price}
        <span class="deck-info">
          <span class="deck-dish">${escapeHTML(m.name)}</span>
          <span class="deck-meta">${escapeHTML(k.title)}</span>
          <span class="deck-when">${icons.calendar('h-3.5 w-3.5')}${escapeHTML(relativeDay(k.event_date))} · ${escapeHTML(k.zone ?? '')}</span>
        </span>
      </a>`;
  }).join('');
  dots.innerHTML = items.map(() => '<span></span>').join('');

  // Punto activo = tarjeta más cercana al borde izquierdo (se actualiza mientras se desliza)
  const cards = [...track.children];
  let current = -1;
  const mark = () => {
    const step = cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : 1;
    const i = Math.max(0, Math.min(cards.length - 1, Math.round(track.scrollLeft / step)));
    if (i === current) return;
    current = i;
    [...dots.children].forEach((d, j) => d.classList.toggle('is-on', j === i));
  };
  let ticking = false;
  track.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; mark(); }); } }, { passive: true });
  mark();
}

/* ---------- Tarjetas flotantes ---------- */
function renderFloats(kermeses, photos) {
  const next = kermeses[0];
  const nextEl = document.getElementById('hero-next');
  if (next && nextEl) {
    nextEl.href = eventURL(next.id);
    nextEl.setAttribute('aria-label', `Próxima kermés: ${next.title}`);
    nextEl.innerHTML = `
      <p class="k">Próxima · ${escapeHTML(whenLabel(next.event_date))}</p>
      <p class="t">${escapeHTML(next.title)}</p>
      <p class="m">${icons.calendar('h-3.5 w-3.5')}${escapeHTML(relativeDay(next.event_date))}, ${escapeHTML(formatTime(next.start_time))} · ${escapeHTML(next.zone)}</p>`;
    nextEl.classList.remove('hidden');
  }
  const priced = photos.filter((m) => Number(m.price) > 0).sort((a, b) => a.price - b.price)[0];
  const priceEl = document.getElementById('hero-price');
  if (priced && priceEl) {
    priceEl.innerHTML = `<p class="l">${escapeHTML(priced.name)} desde</p><p class="p num">${escapeHTML(formatPrice(priced.price))}</p>`;
    priceEl.classList.remove('hidden');
  }
}

/* ---------- Cifras ---------- */
function renderStats(kermeses) {
  const dishes = new Set(kermeses.flatMap((k) => (k.menu_items ?? []).map((m) => m.name.trim().toLowerCase())));
  const zones = new Set(kermeses.map((k) => k.zone).filter(Boolean));
  const values = { kermeses: kermeses.length, platos: dishes.size, zonas: zones.size };
  document.querySelectorAll('[data-stat]').forEach((el) => countUp(el, values[el.dataset.stat] ?? 0));

  const live = document.getElementById('hero-live-text');
  const thisWeek = kermeses.filter((k) => daysUntil(k.event_date) <= 7).length;
  if (live && kermeses.length) {
    live.textContent = thisWeek
      ? `${thisWeek} ${thisWeek === 1 ? 'kermés solidaria' : 'kermeses solidarias'} esta semana`
      : `${kermeses.length} ${kermeses.length === 1 ? 'kermés solidaria próxima' : 'kermeses solidarias próximas'}`;
  }
}
function countUp(el, to) {
  if (reduce.matches || to < 2) { el.textContent = to; return; }
  const start = performance.now(), dur = 700;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    el.textContent = Math.round(to * (1 - (1 - t) ** 3));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Próxima kermés ---------- */
function renderSpotlight(k) {
  const wrap = document.getElementById('spotlight-wrap');
  const el = document.getElementById('spotlight');
  if (!wrap || !el) return;
  if (!k) { wrap.classList.add('hidden'); return; }
  const d = parseLocalDate(k.event_date);
  const img = safeURL(k.cover_image_url) || PLACEHOLDER_IMG;
  const cause = (k.description || '').split('\n')[0];
  const menu = (k.menu_items ?? []).slice(0, 3);
  const minPrice = Math.min(...(k.menu_items ?? []).map((m) => Number(m.price)).filter((n) => n > 0));
  el.innerHTML = `
    <div class="spot-media">
      <img src="${escapeHTML(img)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'">
      <div class="spot-when" aria-hidden="true"><span class="mo">${MONTHS[d.getMonth()]}</span><span class="d">${d.getDate()}</span></div>
    </div>
    <div class="spot-body">
      <p class="spot-kicker">La próxima kermés <span class="spot-badge">${escapeHTML(whenLabel(k.event_date))}</span></p>
      <h2 id="spotlight-title" class="spot-title">${escapeHTML(k.title)}</h2>
      ${cause ? `<p class="spot-cause">${escapeHTML(cause)}</p>` : ''}
      <div class="spot-meta">
        <span>${icons.clock('h-3.5 w-3.5')}${escapeHTML(formatTimeRange(k.start_time, k.end_time))}</span>
        <span>${icons.pin('h-3.5 w-3.5')}${escapeHTML(k.zone)}</span>
      </div>
      ${menu.length ? `<ul class="spot-menu">${menu.map((m) => `
        <li>${safeURL(m.image_url) ? `<img src="${escapeHTML(safeURL(m.image_url))}" alt="" loading="lazy">` : `<span class="ph"></span>`}
          <span class="n">${escapeHTML(m.name)}</span><span class="p">${escapeHTML(formatPrice(m.price))}</span></li>`).join('')}</ul>` : ''}
      <div class="spot-foot">
        ${menu.length ? `<div class="spot-mini" aria-hidden="true">
          <span class="spot-stack">${menu.map((m) => safeURL(m.image_url)
            ? `<img src="${escapeHTML(safeURL(m.image_url))}" alt="" loading="lazy">` : '<span class="ph"></span>').join('')}</span>
          <span class="spot-from">desde <strong>${escapeHTML(formatPrice(minPrice))}</strong></span>
        </div>` : ''}
        <a href="${escapeHTML(eventURL(k.id))}" class="btn btn-white spot-btn">
          Ver kermés ${icons.arrowRight('h-4 w-4')}
        </a>
      </div>
    </div>`;
  wrap.classList.remove('hidden');
}

/* ---------- Vista previa para organizadores ---------- */
function renderPreview(k) {
  const el = document.getElementById('org-preview');
  if (!el || !k) return;
  const img = safeURL(k.cover_image_url) || PLACEHOLDER_IMG;
  const menu = (k.menu_items ?? []).slice(0, 3);
  el.innerHTML = `
    <div class="phone-notch"></div>
    <div class="phone-cover"><img src="${escapeHTML(img)}" alt="" loading="lazy"></div>
    <div class="phone-body">
      <p class="phone-title">${escapeHTML(k.title)}</p>
      <p class="phone-sub">${escapeHTML(relativeDay(k.event_date))} · ${escapeHTML(k.zone)}</p>
      <ul class="phone-menu">${menu.map((m) => `
        <li>${safeURL(m.image_url) ? `<img src="${escapeHTML(safeURL(m.image_url))}" alt="" loading="lazy">` : '<span class="ph"></span>'}
          <span class="n">${escapeHTML(m.name)}</span><span class="p">${escapeHTML(formatPrice(m.price))}</span></li>`).join('')}</ul>
      <div class="phone-btn">Cómo llegar</div>
    </div>`;
}

export function renderHero(kermeses) {
  const photos = dishPhotos(kermeses);
  renderCollage(photos);
  renderDeck(photos);
  renderFloats(kermeses, photos);
  renderStats(kermeses);
  renderSpotlight(kermeses[0]);
  renderPreview(kermeses[0]);
}
