// Tarjetas del muro. Cada tarjeta es un enlace a evento.html (en la misma pestaña).
import {
  escapeHTML, safeURL, formatShortDate, formatTime, formatTimeRange, formatPrice, eventURL, toISODate,
  parseLocalDate, PLACEHOLDER_IMG,
} from '../utils/format.js';
import { icons } from '../utils/icons.js';

function featuredDishes(k, max = 3) {
  const items = k.menu_items ?? [];
  const featured = items.filter((m) => m.is_featured);
  return (featured.length ? featured : items).slice(0, max);
}

function minPrice(k) {
  const prices = (k.menu_items ?? []).map((m) => Number(m.price));
  return prices.length ? Math.min(...prices) : null;
}

/** "Hoy", "Mañana" o "Sáb, 14 nov". */
export function relativeDay(isoDate) {
  const today = new Date();
  const d = parseLocalDate(isoDate);
  const diff = Math.round((d - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  return formatShortDate(isoDate);
}

/** Círculos con las fotos de los platos (los que no tienen foto muestran un ícono). */
export function dishStackHTML(k, max = 3) {
  const dishes = featuredDishes(k, max);
  if (!dishes.length) return '';
  return `<span class="dish-stack" aria-hidden="true">${dishes.map((d) => {
    const src = safeURL(d.image_url);
    return src
      ? `<span class="${d.sold_out ? 'dish-out' : ''}"><img src="${escapeHTML(src)}" alt="" loading="lazy"></span>`
      : `<span class="flex items-center justify-center text-ink/60">${icons.dish('h-4 w-4')}</span>`;
  }).join('')}</span>`;
}

export function cardHTML(k) {
  const img = safeURL(k.cover_image_url) || PLACEHOLDER_IMG;
  const dishes = featuredDishes(k);
  const from = minPrice(k);
  const isToday = k.event_date === toISODate(new Date());

  return `
  <a class="kermes-card" data-id="${escapeHTML(k.id)}" href="${escapeHTML(eventURL(k.id))}"
     aria-label="${escapeHTML(k.title)}">
    <div class="photo">
      <img src="${escapeHTML(img)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'">
      <span class="${isToday ? 'chip-date' : 'chip-soft'} absolute left-3 top-3">
        ${icons.calendar('h-3.5 w-3.5')} ${escapeHTML(relativeDay(k.event_date))}, ${escapeHTML(formatTime(k.start_time))}
      </span>
    </div>

    <div class="flex flex-1 flex-col px-2.5 pb-1.5 pt-3.5">
      <h3 class="line-clamp-2 text-[17px] font-bold leading-snug">${escapeHTML(k.title)}</h3>
      <p class="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
        ${icons.pin('h-3.5 w-3.5')} <span class="truncate">${escapeHTML(k.zone)}</span>
      </p>
      ${dishes.length ? `
      <div class="mt-3 flex items-center gap-3">
        ${dishStackHTML(k)}
        <p class="line-clamp-2 text-[13px] leading-snug text-muted">${dishes.map((d) => (d.sold_out
          ? `<span class="line-through decoration-bad/60">${escapeHTML(d.name)}</span> <span class="tag-out">Agotado</span>`
          : escapeHTML(d.name))).join(', ')}</p>
      </div>` : ''}

      <div class="mt-auto flex items-center justify-between pt-4">
        ${from !== null
          ? `<p class="leading-tight"><span class="block text-xs text-muted">Platos desde</span><span class="price text-xl font-extrabold">${escapeHTML(formatPrice(from))}</span></p>`
          : '<p class="text-sm text-muted">Menú pronto</p>'}
        <span class="go" aria-hidden="true">${icons.arrowRight('h-5 w-5')}</span>
      </div>
    </div>
  </a>`;
}

/** La próxima kermés, grande y con su foto. */
export function featureHTML(k) {
  const img = safeURL(k.cover_image_url) || PLACEHOLDER_IMG;
  const from = minPrice(k);
  return `
  <a class="feature" href="${escapeHTML(eventURL(k.id))}" data-id="${escapeHTML(k.id)}"
     aria-label="${escapeHTML(k.title)}">
    <img src="${escapeHTML(img)}" alt="" fetchpriority="high" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'">
    <span class="chip chip-date">${icons.calendar('h-3.5 w-3.5')} ${escapeHTML(relativeDay(k.event_date))}, ${escapeHTML(formatTimeRange(k.start_time, k.end_time))}</span>
    <div class="sheet">
      <h2 class="text-xl font-extrabold leading-tight sm:text-2xl">${escapeHTML(k.title)}</h2>
      <p class="mt-1.5 flex items-center gap-1.5 text-sm text-muted">${icons.pin('h-3.5 w-3.5')} ${escapeHTML(k.zone)}, ${escapeHTML(k.address)}</p>
      <div class="mt-4 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          ${dishStackHTML(k)}
          ${from !== null ? `<p class="text-sm leading-tight text-muted">desde<br><span class="price text-base font-extrabold text-ink">${escapeHTML(formatPrice(from))}</span></p>` : ''}
        </div>
        <span class="btn btn-primary !h-11 !px-5 text-sm">Ver kermés ${icons.arrowRight('h-4 w-4')}</span>
      </div>
    </div>
  </a>`;
}

export function renderCards(container, kermeses) {
  container.innerHTML = kermeses.map(cardHTML).join('');
}

export function skeletonCards(container, n = 6) {
  container.innerHTML = Array.from({ length: n }, () => `
    <div class="kermes-card animate-pulse" aria-hidden="true">
      <div class="aspect-[4/3] rounded-[20px] bg-canvas"></div>
      <div class="space-y-3 px-2 py-4">
        <div class="h-4 w-3/4 rounded-full bg-canvas"></div>
        <div class="h-3 w-1/2 rounded-full bg-canvas"></div>
      </div>
    </div>`).join('');
}
