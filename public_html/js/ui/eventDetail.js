// HTML de la página de detalle de una kermés (evento.html).
import {
  escapeHTML, safeURL, formatDate, formatTimeRange, formatPrice,
  googleMapsURL, whatsappURL, PLACEHOLDER_IMG,
} from '../utils/format.js';
import { icons } from '../utils/icons.js';

function menuHTML(items) {
  if (!items?.length) return '<p class="text-muted">El organizador todavía no publicó el menú.</p>';

  return `
    <ul class="grid gap-3 sm:grid-cols-2">
      ${items.map((m) => {
        const img = safeURL(m.image_url);
        return `
        <li class="flex items-center gap-4 rounded-[22px] border border-line bg-white p-2.5 pr-4 ${m.sold_out ? 'dish-out' : ''}">
          ${img
            ? `<img src="${escapeHTML(img)}" alt="${escapeHTML(m.name)}" loading="lazy" class="h-24 w-24 flex-none rounded-[18px] object-cover">`
            : `<div class="flex h-24 w-24 flex-none items-center justify-center rounded-[18px] bg-canvas text-muted">${icons.dish('h-8 w-8')}</div>`}
          <div class="min-w-0 flex-1">
            <p class="font-bold leading-snug ${m.sold_out ? 'text-muted' : ''}">${escapeHTML(m.name)}</p>
            ${m.description ? `<p class="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">${escapeHTML(m.description)}</p>` : ''}
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <span class="price text-lg font-extrabold ${m.sold_out ? 'text-muted line-through' : ''}">${escapeHTML(formatPrice(m.price))}</span>
              ${m.sold_out ? '<span class="tag-out">Agotado</span>' : m.remaining !== null && m.remaining !== undefined && m.remaining <= 5 ? `<span class="tag-low">Últimas ${m.remaining}</span>` : ''}
              ${m.is_featured && !m.sold_out ? '<span class="rounded-full bg-tang-soft px-2 py-0.5 text-[11px] font-bold text-tang-text">Recomendado</span>' : ''}
            </div>
          </div>
        </li>`;
      }).join('')}
    </ul>`;
}

function infoRow(icon, tone, label, value, extra = '') {
  return `
    <div class="flex items-center gap-3">
      <span class="flex h-11 w-11 flex-none items-center justify-center rounded-full ${tone}">${icon}</span>
      <div class="min-w-0">
        <p class="text-xs text-muted">${label}</p>
        <p class="font-bold leading-snug">${value}</p>
        ${extra}
      </div>
    </div>`;
}

export function eventDetailHTML(k) {
  const img = safeURL(k.cover_image_url) || PLACEHOLDER_IMG;
  const wa = whatsappURL(k.whatsapp, k.title);
  const maps = googleMapsURL(k.latitude, k.longitude);
  const organizer = k.organizer?.organization_name || k.organizer?.full_name;

  return `
    <div class="grid gap-6 pt-5 lg:grid-cols-[minmax(0,1fr)_380px]">

      <!-- En móvil: portada → información → menú. En escritorio: dos columnas -->
      <div class="contents min-w-0 lg:block lg:space-y-6">
        <section class="panel order-1 overflow-hidden p-2.5">
          <img src="${escapeHTML(img)}" alt="" fetchpriority="high" class="aspect-[4/3] w-full rounded-[18px] object-cover sm:aspect-[16/8]"
               onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'">
          <div class="px-3 pb-4 pt-5 sm:px-5">
            <div class="flex flex-wrap gap-2 text-[13px] font-bold">
              <span class="inline-flex items-center gap-1.5 rounded-full bg-canvas px-3 py-1 font-semibold"><span class="text-brand-700">${icons.calendar("h-3.5 w-3.5")}</span>${escapeHTML(formatDate(k.event_date))}</span>
              <span class="num inline-flex items-center gap-1.5 rounded-full bg-canvas px-3 py-1">${icons.clock('h-3.5 w-3.5')}${escapeHTML(formatTimeRange(k.start_time, k.end_time))}</span>
            </div>
            <h1 class="mt-4 text-[1.75rem] font-extrabold leading-[1.1] tracking-tight sm:text-4xl">${escapeHTML(k.title)}</h1>
            ${organizer ? `
            <p class="mt-3 flex items-center gap-2 text-sm text-muted">
              ${safeURL(k.organizer?.avatar_url)
                ? `<img src="${escapeHTML(safeURL(k.organizer.avatar_url))}" alt="" class="h-7 w-7 rounded-full object-cover" loading="lazy">`
                : `<span class="flex h-7 w-7 items-center justify-center rounded-full bg-canvas text-ink">${icons.user('h-3.5 w-3.5')}</span>`}
              Organiza <strong class="font-bold text-ink">${escapeHTML(organizer)}</strong>
            </p>` : ''}
            ${k.description ? `
            <p class="mt-5 max-w-[65ch] whitespace-pre-line text-[17px] leading-relaxed text-ink/80">${escapeHTML(k.description)}</p>` : ''}
          </div>
        </section>

        <section class="panel order-3 p-5 sm:p-6" aria-labelledby="menu-title">
          <div class="mb-4 flex items-baseline justify-between">
            <h2 id="menu-title" class="text-xl font-extrabold tracking-tight">Menú</h2>
            <p class="num text-sm text-muted">${k.menu_items?.length ?? 0} platos</p>
          </div>
          ${menuHTML(k.menu_items)}
        </section>
      </div>

      <aside class="order-2 lg:sticky lg:top-24 lg:order-none lg:self-start" aria-labelledby="info-title">
        <div class="panel space-y-5 p-5">
          <h2 id="info-title" class="text-xl font-extrabold tracking-tight">Dónde es</h2>
          ${infoRow(icons.pin('h-5 w-5'), 'bg-sun-soft', 'Dirección', escapeHTML(k.address), `<p class="text-sm text-muted">${escapeHTML(k.zone)}</p>`)}

          <div id="event-map" class="h-44 w-full overflow-hidden rounded-[18px]"
               role="region" aria-label="Ubicación de la kermés"></div>

          <div class="hidden gap-2 lg:grid">
            ${wa ? `<a href="${escapeHTML(wa)}" target="_blank" rel="noopener" class="btn btn-whatsapp">${icons.whatsapp('h-5 w-5')} Escribir por WhatsApp</a>` : ''}
            <div class="grid grid-cols-2 gap-2">
              <a href="${maps}" target="_blank" rel="noopener" class="btn btn-primary !px-3">${icons.map()} Cómo llegar</a>
              <button type="button" data-share class="btn btn-outline !px-3">${icons.share()} <span>Compartir</span></button>
            </div>
          </div>
          <button type="button" data-share class="btn btn-outline w-full lg:hidden">${icons.share()} <span>Compartir esta kermés</span></button>
        </div>
      </aside>
    </div>

    <!-- Acciones a un toque del pulgar (celular) -->
    <div class="actionbar" role="group" aria-label="Acciones">
      <a href="${maps}" target="_blank" rel="noopener" class="btn btn-primary !px-3 ${wa ? '' : 'col-span-2'}">${icons.map()} Cómo llegar</a>
      ${wa ? `<a href="${escapeHTML(wa)}" target="_blank" rel="noopener" class="btn btn-whatsapp !px-3">${icons.whatsapp('h-5 w-5')} WhatsApp</a>` : ''}
    </div>`;
}
