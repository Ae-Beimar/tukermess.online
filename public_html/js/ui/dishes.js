// Fila "¿Qué se te antoja?": platos populares como accesos rápidos de filtro.
import { escapeHTML, safeURL } from '../utils/format.js';
import { icons } from '../utils/icons.js';

const PASTELS = ['bg-sun-soft', 'bg-teal-soft', 'bg-rose-soft', 'bg-lime-soft'];

export function renderDishes(container, dishes, selected = '') {
  container.innerHTML = dishes.map((d, i) => {
    const img = safeURL(d.image_url);
    const thumb = img
      ? `<img src="${escapeHTML(img)}" alt="" class="h-full w-full object-cover">`
      : `<span class="text-ink/70">${icons.dish('h-6 w-6')}</span>`;
    return `
      <button type="button" class="dish-tile" data-dish="${escapeHTML(d.name)}"
              aria-pressed="${d.name === selected}">
        <span class="dish-thumb ${PASTELS[i % PASTELS.length]}">${thumb}</span>
        <span class="line-clamp-2 leading-tight">${escapeHTML(d.name)}</span>
      </button>`;
  }).join('');
}

export function syncDishes(container, selected) {
  container.querySelectorAll('[data-dish]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dish === selected)));
}
