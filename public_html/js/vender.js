// vender.html?id=<kermes>: la caja del día de la kermés (celular primero).
import { requireUser } from './services/authService.js';
import { getMyKermes } from './services/organizerService.js';
import * as sales from './services/salesService.js';
import { escapeHTML, safeURL, formatPrice } from './utils/format.js';
import { icons } from './utils/icons.js';
import { toast, confirmDialog, withBusy } from './ui/feedback.js';
import * as reservations from './services/reservationService.js';
import { ticketHTML, downloadTicket, whatsappTicketURL } from './ui/ticket.js';

const $ = (id) => document.getElementById(id);
const KERMES_CACHE = 'tk_pos_kermes_';
const DEVICE_KEY = 'tk_pos_device';
// La misma lógica sirve a dos páginas: vender.html (caja) y ventas.html (resumen)
const VIEW = document.body.dataset.view === 'ventas' ? 'ventas' : 'caja';
// vender.html?modo=reserva: la misma caja, pero el cobro crea una reserva con ticket QR
const RESERVE = VIEW === 'caja' && new URLSearchParams(window.location.search).get('modo') === 'reserva';
const RAFFLE_PAGE = 100;
// Íconos de cantidad del cobro
const MINUS = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';
const PLUS = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

const state = {
  user: null,
  kermes: null,
  tab: 'comida',
  cart: new Map(),          // key -> { key, menu_item_id, kind, name, unit_price, quantity, image }
  tickets: [],              // boletos en el pedido: { number, buyer_name, buyer_phone }
  raffleSel: new Set(),     // números marcados en la grilla (aún no agregados)
  rafflePage: 0,
  method: 'efectivo',
  snap: null,
};

const money = (n) => formatPrice(n).replace(/\s/g, ' ');
const time = (iso) => new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });

// Desde cuántas porciones la caja avisa que se está acabando
const LOW_STOCK = 5;

function readLS(key) { try { return localStorage.getItem(key); } catch { return null; } }
function writeLS(key, v) { try { localStorage.setItem(key, v); } catch { /* sin espacio */ } }

// =====================================================================
//  Carga
// =====================================================================
async function loadKermes(id) {
  try {
    const k = await getMyKermes(id, state.user.id);
    if (k) writeLS(KERMES_CACHE + id, JSON.stringify(k));
    return k;
  } catch {
    const cached = readLS(KERMES_CACHE + id);
    if (cached) {
      toast('Sin señal: usando el menú guardado en este celular.', { type: 'info' });
      return JSON.parse(cached);
    }
    throw new Error('Sin conexión y sin datos guardados de esta kermés.');
  }
}

const items = () => (state.kermes?.menu_items ?? []);
const byCategory = (cat) => items().filter((m) => (cat === 'bebida' ? m.category === 'bebida' : m.category !== 'bebida'));

// =====================================================================
//  Pestañas
// =====================================================================
function tabsList() {
  const tabs = [['comida', 'Comida'], ['bebida', 'Bebidas']];
  if (state.kermes.raffle_enabled && !RESERVE) tabs.push(['rifa', 'Rifa']);
  return tabs;
}

function renderTabs() {
  const tabs = tabsList();
  if (!tabs.some(([id]) => id === state.tab)) state.tab = tabs[0][0];
  $('pos-tabs').innerHTML = tabs.map(([id, label]) =>
    `<button type="button" role="tab" data-tab="${id}" aria-pressed="${id === state.tab}" aria-selected="${id === state.tab}">${label}</button>`).join('');
}

// =====================================================================
//  Productos
// =====================================================================
function productHTML(m) {
  const left = sales.remaining(m, state.snap);
  const inCart = state.cart.get(m.id)?.quantity ?? 0;
  const soldOut = left !== null && left - inCart <= 0 && inCart === 0;
  const img = safeURL(m.image_url);
  const stock = left === null ? '' : left === 0
    ? '<span class="pos-stock is-out">Agotado</span>'
    : left - inCart === 0 ? '<span class="pos-stock is-out">Ya no hay más</span>' : `<span class="pos-stock ${left - inCart <= LOW_STOCK ? 'is-low' : 'is-ok'}">Quedan ${left - inCart}</span>`;

  return `
    <div class="pos-item ${inCart ? 'is-in' : ''} ${left === 0 ? 'is-out' : ''}">
      ${left === 0 ? '<span class="pos-out-tag" aria-hidden="true">Agotado</span>' : ''}
      <button type="button" class="pos-add" data-add="${escapeHTML(m.id)}" ${soldOut ? 'disabled' : ''}
              aria-label="${left === 0 ? `${escapeHTML(m.name)}: agotado` : `Agregar ${escapeHTML(m.name)}, ${escapeHTML(money(m.price))}${left !== null ? `, quedan ${left - inCart}` : ''}`}">
        <span class="pos-photo">${img ? `<img src="${escapeHTML(img)}" alt="" loading="lazy">` : `<span class="text-muted">${icons.dish('h-8 w-8')}</span>`}</span>
        <span class="mt-2 block px-1 text-left text-[15px] font-bold leading-snug">${escapeHTML(m.name)}</span>
        <span class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1 pt-1">
          <span class="price whitespace-nowrap text-base font-extrabold">${escapeHTML(money(m.price))}</span>
          ${stock}
        </span>
      </button>
      ${inCart ? `
        <span class="pos-qty" aria-hidden="true">${inCart}</span>
        <button type="button" class="pos-sub" data-sub="${escapeHTML(m.id)}" aria-label="Quitar uno de ${escapeHTML(m.name)}">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>
        </button>` : ''}
    </div>`;
}

// Aviso arriba de la lista: qué se está por acabar y qué ya se acabó
function stockAlertHTML(list) {
  const rows = list.map((m) => ({ m, left: sales.remaining(m, state.snap) })).filter((x) => x.left !== null && x.left <= LOW_STOCK);
  if (!rows.length) return '';
  const out = rows.filter((x) => x.left === 0).map((x) => escapeHTML(x.m.name));
  const low = rows.filter((x) => x.left > 0).map((x) => `${escapeHTML(x.m.name)} (${x.left})`);
  return `
    <div class="stock-alert mb-3" role="status">
      <svg class="h-4 w-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.01"/></svg>
      ${low.length ? `<span>Por acabarse: ${low.join(', ')}</span>` : ''}
      ${out.length ? `<span class="text-bad">Agotado: ${out.join(', ')}</span>` : ''}
    </div>`;
}

function renderProducts(cat) {
  const list = byCategory(cat);
  return list.length
    ? `${stockAlertHTML(list)}<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">${list.map(productHTML).join('')}</div>`
    : `<div class="panel px-6 py-12 text-center">
        <p class="font-bold">No cargaste ${cat === 'bebida' ? 'bebidas' : 'comida'}</p>
        <p class="mt-1 text-sm text-muted">Agrégalas en el menú de la kermés con su precio y porciones.</p>
        <a href="editar.html?id=${encodeURIComponent(state.kermes.id)}#menu" class="btn btn-outline mt-5">Ir al menú</a>
      </div>`;
}

function addItem(id) {
  const m = items().find((x) => x.id === id);
  if (!m) return;
  const line = state.cart.get(id) ?? { key: id, menu_item_id: id, kind: 'plato', name: m.name, category: m.category, unit_price: Number(m.price), quantity: 0, image: m.image_url };
  const left = sales.remaining(m, state.snap);
  if (left !== null && line.quantity + 1 > left) {
    toast(`No quedan más porciones de ${m.name}.`, { type: 'error' });
    return;
  }
  line.quantity += 1;
  state.cart.set(id, line);
  if (navigator.vibrate) navigator.vibrate(12);
  if (left !== null) {
    const rest = left - line.quantity;
    if (rest === 0) toast(`Esta es la última porción de ${m.name}.`, { type: 'warn' });
    else if (rest <= LOW_STOCK) toast(`${rest === 1 ? 'Queda 1 porción' : `Quedan ${rest} porciones`} de ${m.name}.`, { type: 'warn', ms: 2200 });
  }
  render();
}

function subItem(id) {
  const line = state.cart.get(id);
  if (!line) return;
  line.quantity -= 1;
  if (line.quantity <= 0) state.cart.delete(id);
  render();
}

// =====================================================================
//  Rifa
// =====================================================================
// Premios de la rifa, en orden (kermeses anteriores tenían uno solo en texto)
function prizesHTML(k) {
  const prizes = Array.isArray(k.raffle_prizes) && k.raffle_prizes.length
    ? k.raffle_prizes
    : k.raffle_prize ? [{ name: k.raffle_prize, image_url: null }] : [];
  if (!prizes.length) return '';
  const place = (n) => (n === 1 ? '1.er' : n === 3 ? '3.er' : `${n}.º`);
  return `
    <div>
      <h2 class="mb-2 text-sm font-bold">${prizes.length === 1 ? 'Premio' : `${prizes.length} premios`}</h2>
      <ol class="prize-scroll no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">${prizes.map((p, i) => {
        const img = safeURL(p.image_url);
        return `
        <li class="prize-card">
          <div class="ph">${img ? `<img src="${escapeHTML(img)}" alt="" loading="lazy">` : icons.gift('h-8 w-8')}
            <span class="place">${place(i + 1)}</span></div>
          <p class="mt-2 line-clamp-2 px-1 text-[13px] font-bold leading-snug">${escapeHTML(p.name)}</p>
        </li>`;
      }).join('')}</ol>
    </div>`;
}

function renderRaffle() {
  const k = state.kermes;
  const total = Number(k.raffle_total) || 0;
  const taken = state.snap.takenNumbers;
  const inCart = new Set(state.tickets.map((t) => t.number));
  const pages = Math.ceil(total / RAFFLE_PAGE);
  const from = state.rafflePage * RAFFLE_PAGE + 1;
  const to = Math.min(total, from + RAFFLE_PAGE - 1);
  const free = total - taken.size;

  const nums = [];
  for (let n = from; n <= to; n += 1) {
    const isTaken = taken.has(n);
    const isCart = inCart.has(n);
    const isSel = state.raffleSel.has(n);
    nums.push(`<button type="button" class="raffle-num ${isTaken ? 'is-taken' : ''} ${isCart ? 'is-cart' : ''}" data-num="${n}"
      aria-pressed="${isSel}" ${isTaken || isCart ? 'disabled' : ''}
      aria-label="Número ${n}${isTaken ? ', vendido' : isCart ? ', en el pedido' : ''}">${n}</button>`);
  }

  return `
    <section class="space-y-4">
      <div class="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p class="text-sm text-muted">Boleto</p>
          <p class="price text-2xl font-extrabold">${escapeHTML(money(k.raffle_price))}</p>
        </div>
        <p class="num rounded-full bg-canvas px-3 py-1.5 text-sm font-bold">${free} de ${total} libres</p>
      </div>
      ${prizesHTML(k)}

      <div class="flex flex-wrap items-center gap-2">
        ${pages > 1 ? `<div class="segmented no-scrollbar max-w-full overflow-x-auto">${Array.from({ length: pages }, (_, i) =>
          `<button type="button" data-page="${i}" aria-pressed="${i === state.rafflePage}">${i * RAFFLE_PAGE + 1}–${Math.min(total, (i + 1) * RAFFLE_PAGE)}</button>`).join('')}</div>` : ''}
        <label class="ml-auto flex items-center gap-2 text-sm font-semibold">Ir al
          <input id="raffle-go" type="number" min="1" max="${total}" inputmode="numeric" class="input !h-10 w-24" placeholder="N.º">
        </label>
      </div>

      <div class="grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10">${nums.join('')}</div>

      <div class="panel space-y-3 p-4">
        <p class="text-sm font-bold">${state.raffleSel.size ? `${state.raffleSel.size} número${state.raffleSel.size === 1 ? '' : 's'} marcado${state.raffleSel.size === 1 ? '' : 's'}: ${[...state.raffleSel].sort((a, b) => a - b).join(', ')}` : 'Toca los números que quiere el comprador.'}</p>
        <div class="grid gap-2 sm:grid-cols-2">
          <input id="buyer-name" class="input" maxlength="80" placeholder="Nombre del comprador (opcional)" autocomplete="off">
          <input id="buyer-phone" class="input" maxlength="20" inputmode="tel" placeholder="Celular (opcional)" autocomplete="off">
        </div>
        <button type="button" id="raffle-add" class="btn btn-sun w-full" ${state.raffleSel.size ? '' : 'disabled'}>
          Agregar ${state.raffleSel.size || ''} boleto${state.raffleSel.size === 1 ? '' : 's'} al pedido
        </button>
      </div>
    </section>`;
}

function addTickets() {
  const k = state.kermes;
  const buyer_name = $('buyer-name')?.value.trim();
  const buyer_phone = $('buyer-phone')?.value.trim();
  const numbers = [...state.raffleSel].sort((a, b) => a - b);
  numbers.forEach((number) => state.tickets.push({ number, buyer_name, buyer_phone }));
  state.raffleSel.clear();
  const qty = state.tickets.length;
  state.cart.set('rifa', { key: 'rifa', menu_item_id: null, kind: 'rifa', name: 'Boleto de rifa', unit_price: Number(k.raffle_price), quantity: qty });
  toast(`${numbers.length} boleto${numbers.length === 1 ? '' : 's'} agregado${numbers.length === 1 ? '' : 's'}.`);
  render();
}

// =====================================================================
//  Resumen
// =====================================================================
// Fila de ranking: posición (o foto sola), nombre, unidades, monto y porciones que quedan
function rankRowHTML(r, pos, max) {
  const img = safeURL(r.m.image_url);
  const pct = Math.round((r.quantity / Math.max(1, max)) * 100);
  const stock = r.left === null ? ''
    : r.left === 0 ? '<span class="pos-stock is-out">Agotado</span>'
      : `<span class="pos-stock ${r.left <= LOW_STOCK ? 'is-low' : 'is-ok'}">Quedan ${r.left}</span>`;
  return `
    <li class="flex items-center gap-3">
      <span class="rank-photo">
        ${img ? `<img src="${escapeHTML(img)}" alt="" loading="lazy">` : icons.dish('h-5 w-5')}
        ${pos ? `<span class="rank-num">${pos}</span>` : ''}
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <p class="truncate text-sm font-bold">${escapeHTML(r.m.name)}</p>
          ${stock}
        </div>
        <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas"><div class="h-full rounded-full ${pos ? 'bg-data-1' : 'bg-data-3'}" style="width:${pct}%"></div></div>
        <p class="num mt-1 flex justify-between text-xs text-muted"><span>${r.quantity} ${r.quantity === 1 ? 'unidad' : 'unidades'}</span><span class="price font-semibold text-ink">${escapeHTML(money(r.amount))}</span></p>
      </div>
    </li>`;
}

function renderSummary() {
  const s = state.snap;
  const k = state.kermes;
  const device = readLS(DEVICE_KEY) ?? '';
  // Ranking de productos del menú (los que no se vendieron cuentan con 0)
  const ranked = items().map((m) => {
    const sold = s.soldByItem.get(m.id) ?? { quantity: 0, amount: 0 };
    return { m, quantity: sold.quantity, amount: sold.amount, left: sales.remaining(m, s) };
  });
  const top = ranked.filter((r) => r.quantity > 0).sort((a, b) => b.quantity - a.quantity || b.amount - a.amount).slice(0, 3);
  const topIds = new Set(top.map((r) => r.m.id));
  const bottom = ranked.filter((r) => !topIds.has(r.m.id)).sort((a, b) => a.quantity - b.quantity || a.amount - b.amount).slice(0, 3);
  const raffle = s.soldByItem.get('rifa');

  return `
    <section class="space-y-5">
      ${(() => {
        // Meta = lo que se juntaría si se vende todo: porciones del menú + todos los números de la rifa
        const menuGoal = items().reduce((n, m) => n + (m.stock === null || m.stock === undefined || m.stock === '' ? 0 : Number(m.price) * Number(m.stock)), 0);
        const raffleGoal = k.raffle_enabled ? Number(k.raffle_price || 0) * Number(k.raffle_total || 0) : 0;
        const goal = menuGoal + raffleGoal;
        const pct = goal > 0 ? Math.min(100, Math.round((s.total / goal) * 100)) : 0;
        const missing = Math.max(0, goal - s.total);
        const avg = s.salesCount ? s.total / s.salesCount : 0;
        const pctCash = s.total > 0 ? Math.round((s.totalEfectivo / s.total) * 100) : 0;
        const pctQr = s.total > 0 ? 100 - pctCash : 0;
        const rifaSold = s.takenNumbers.size;
        const rifaTotal = Number(k.raffle_total || 0);
        const rifaPct = rifaTotal ? Math.round((rifaSold / rifaTotal) * 100) : 0;
        return `
      <div class="space-y-3">
        <div class="goal-card">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-semibold text-white/75">Recaudado</p>
            ${goal > 0 ? `<span class="num rounded-full bg-sun px-2.5 py-0.5 text-xs font-extrabold text-ink">${pct}% de la meta</span>` : ''}
          </div>
          <p class="num price mt-1.5 whitespace-nowrap text-[clamp(2rem,10vw,3rem)] font-extrabold leading-none tracking-tight text-brand-500">${escapeHTML(money(s.total))}</p>
          ${goal > 0 ? `
          <p class="num mt-1.5 text-sm text-white/75">de <strong class="text-white">${escapeHTML(money(goal))}</strong> si se vende todo</p>
          <div class="goal-bar mt-4" role="progressbar" aria-label="Avance hacia la meta" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
            <span style="width:${pct}%"></span>
          </div>
          <div class="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <div>
              <p class="text-xs text-white/60">${missing > 0 ? 'Falta para la meta' : 'Meta cumplida'}</p>
              <p class="num price mt-0.5 font-extrabold ${missing > 0 ? 'text-white' : 'text-sun'}">${missing > 0 ? escapeHTML(money(missing)) : '¡Todo vendido!'}</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-white/60">${s.salesCount} ${s.salesCount === 1 ? 'venta' : 'ventas'}</p>
              <p class="num price mt-0.5 font-extrabold text-white">${s.salesCount ? `${escapeHTML(money(avg))} c/u` : '—'}</p>
            </div>
          </div>
          ${raffleGoal > 0 && menuGoal > 0 ? `<p class="num mt-3 text-xs text-white/55">Meta: menú ${escapeHTML(money(menuGoal))} + rifa ${escapeHTML(money(raffleGoal))}</p>` : ''}` : `
          <p class="num mt-2 text-sm text-white/75">${s.salesCount} ${s.salesCount === 1 ? 'venta' : 'ventas'}${s.salesCount ? `, promedio ${escapeHTML(money(avg))}` : ''}</p>
          <p class="mt-3 text-xs text-white/60">Carga las porciones de cada plato en el menú para ver cuánto falta para venderlo todo.</p>`}
        </div>

        <div class="panel p-5">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="text-lg font-extrabold">Cómo pagaron</h2>
          </div>
          <div class="split-bar mt-3" role="img" aria-label="Efectivo ${pctCash} por ciento, QR ${pctQr} por ciento">
            ${s.total > 0 ? `<span class="bg-data-1" style="width:${pctCash}%"></span><span class="bg-data-2" style="width:${pctQr}%"></span>` : ''}
          </div>
          <div class="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p class="flex items-center gap-1.5 text-sm font-semibold text-ink"><span class="h-2.5 w-2.5 rounded-full bg-data-1"></span>Efectivo <span class="num font-bold text-muted">${pctCash}%</span></p>
              <p class="num price mt-1 text-xl font-extrabold">${escapeHTML(money(s.totalEfectivo))}</p>
            </div>
            <div class="text-right">
              <p class="flex items-center justify-end gap-1.5 text-sm font-semibold text-ink"><span class="h-2.5 w-2.5 rounded-full bg-data-2"></span>QR <span class="num font-bold text-muted">${pctQr}%</span></p>
              <p class="num price mt-1 text-xl font-extrabold">${escapeHTML(money(s.totalQr))}</p>
            </div>
          </div>
        </div>

        ${k.raffle_enabled ? `
        <div class="panel p-5">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="text-lg font-extrabold">Rifa</h2>
            <p class="num price text-xl font-extrabold">${escapeHTML(money(raffle?.amount ?? 0))}</p>
          </div>
          <div class="mt-3 h-2.5 overflow-hidden rounded-full bg-canvas"><div class="h-full rounded-full bg-data-1" style="width:${rifaPct}%"></div></div>
          <p class="num mt-2 flex justify-between gap-3 text-sm text-muted">
            <span><strong class="text-ink">${rifaSold}</strong> de ${rifaTotal} números</span>
            <span>Quedan ${rifaTotal - rifaSold} (${escapeHTML(money((rifaTotal - rifaSold) * Number(k.raffle_price || 0)))})</span>
          </p>
        </div>` : ''}
      </div>`;
      })()}

      <div class="grid gap-5 lg:grid-cols-2">
        <div class="panel p-5">
          <h2 class="text-lg font-extrabold">Lo más vendido</h2>
          <p class="mb-3 text-sm text-muted">Los 3 productos con más unidades vendidas.</p>
          ${top.length ? `<ol class="space-y-2.5">${top.map((r, i) => rankRowHTML(r, i + 1, top[0].quantity)).join('')}</ol>` : '<p class="text-sm text-muted">Todavía no hay ventas.</p>'}
        </div>

        <div class="panel p-5">
          <h2 class="text-lg font-extrabold">Lo menos vendido</h2>
          <p class="mb-3 text-sm text-muted">Ofrécelos más o bájales el precio.</p>
          ${bottom.length ? `<ol class="space-y-2.5">${bottom.map((r) => rankRowHTML(r, null, Math.max(1, top[0]?.quantity ?? 1))).join('')}</ol>` : '<p class="text-sm text-muted">Todos tus productos están entre los más vendidos.</p>'}
        </div>
      </div>

      <div class="panel p-5">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-lg font-extrabold">Últimas ventas</h2>
          <label class="flex items-center gap-2 text-sm"><span class="text-muted">Este celular:</span>
            <input id="device-name" class="input !h-9 w-32" maxlength="40" placeholder="Caja 1" value="${escapeHTML(device)}">
          </label>
        </div>
        ${s.sales.length ? `<ul class="divide-y divide-line">${s.sales.slice(0, 40).map((sale) => `
          <li class="flex items-center gap-3 py-3 text-sm ${sale.voided ? 'opacity-50' : ''}">
            <span class="num w-[4.5rem] flex-none whitespace-nowrap font-bold">${escapeHTML(time(sale.sold_at))}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate">${sale.items.map((it) => `${it.quantity}× ${escapeHTML(it.name)}`).join(', ')}${sale.tickets.length ? ` (N.º ${sale.tickets.map((t) => t.number).join(', ')})` : ''}</span>
              <span class="text-xs text-muted">${sale.payment_method === 'qr' ? 'QR' : 'Efectivo'}${sale.device ? `, ${escapeHTML(sale.device)}` : ''}${sale.pending ? ', por enviar' : ''}${sale.voided ? ', anulada' : ''}</span>
            </span>
            <span class="price flex-none font-extrabold ${sale.voided ? 'line-through' : ''}">${escapeHTML(money(sale.total))}</span>
            ${sale.voided ? '' : `<button type="button" class="btn btn-soft !h-9 !px-3 text-[13px]" data-void="${escapeHTML(sale.id)}">Anular</button>`}
          </li>`).join('')}</ul>` : '<p class="text-sm text-muted">Todavía no hay ventas.</p>'}
      </div>
    </section>`;
}

// =====================================================================
//  Pedido y cobro
// =====================================================================
const cartTotal = () => [...state.cart.values()].reduce((n, l) => n + l.unit_price * l.quantity, 0);
const cartCount = () => [...state.cart.values()].reduce((n, l) => n + l.quantity, 0);

function renderCartBar() {
  const n = cartCount();
  $('cart-bar').classList.toggle('hidden', n === 0);
  $('cart-count').textContent = `${n} ${n === 1 ? 'producto' : 'productos'} en el pedido`;
  $('cart-total').textContent = money(cartTotal());
}

function renderCheckout() {
  const lines = [...state.cart.values()];
  $('checkout-lines').innerHTML = lines.map((l) => `
    <li class="flex items-center gap-3 py-3">
      <div class="min-w-0 flex-1">
        <p class="font-bold leading-snug">${escapeHTML(l.name)}</p>
        <p class="num text-sm text-muted">${escapeHTML(money(l.unit_price))} c/u${l.kind === 'rifa' ? `, N.º ${state.tickets.map((t) => t.number).join(', ')}` : ''}</p>
      </div>
      ${l.kind === 'rifa'
        ? `<button type="button" class="btn btn-soft !h-9 !px-3 text-[13px]" data-co-clear-rifa>Quitar</button>`
        : `<div class="flex items-center gap-2">
            <button type="button" class="icon-btn !h-9 !w-9" data-co-sub="${escapeHTML(l.key)}" aria-label="Quitar uno">${MINUS}</button>
            <span class="num w-6 text-center font-extrabold">${l.quantity}</span>
            <button type="button" class="icon-btn !h-9 !w-9" data-co-add="${escapeHTML(l.key)}" aria-label="Agregar uno">${PLUS}</button>
          </div>`}
      <p class="price w-20 flex-none text-right font-extrabold">${escapeHTML(money(l.unit_price * l.quantity))}</p>
    </li>`).join('');

  document.querySelectorAll('#pay-method [data-method]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.method === state.method)));
  $('cash-box').classList.toggle('hidden', state.method !== 'efectivo');

  const total = cartTotal();
  const quick = [...new Set([total, Math.ceil(total / 10) * 10, 50, 100, 200].filter((v) => v >= total))].slice(0, 4);
  $('cash-quick').innerHTML = quick.map((v) => `<button type="button" class="btn btn-soft !h-10 !px-4 text-sm" data-cash="${v}">${v === total ? 'Justo' : escapeHTML(money(v))}</button>`).join('');
  updateChange();
  $('checkout-confirm').textContent = RESERVE ? `Confirmar reserva, ${money(total)}` : `Confirmar venta, ${money(total)}`;
}

function updateChange() {
  const total = cartTotal();
  const received = Number($('cash-received').value);
  const box = $('cash-change');
  if (!$('cash-received').value) {
    box.className = 'note note-neutral';
    box.textContent = 'Escribe cuánto te dieron para calcular el vuelto.';
  } else if (received < total) {
    box.className = 'note note-bad';
    box.textContent = `Faltan ${money(total - received)}`;
  } else {
    box.className = 'note note-ok';
    box.textContent = received === total ? 'Pago justo, sin vuelto' : `Vuelto: ${money(received - total)}`;
  }
}

function openCheckout() {
  $('cash-received').value = '';
  if (RESERVE) { $('res-name').value = ''; $('res-phone').value = ''; $('res-name').removeAttribute('aria-invalid'); }
  renderCheckout();
  $('checkout').showModal();
}

async function confirmReservation(button) {
  const name = $('res-name').value.trim();
  if (!name) {
    $('res-name').setAttribute('aria-invalid', 'true');
    $('res-name').focus();
    toast('Escribe a nombre de quién es la reserva.', { type: 'error' });
    return;
  }
  $('res-name').removeAttribute('aria-invalid');
  await withBusy(button, 'Reservando…', async () => {
    try {
      const lines = [...state.cart.values()].map(({ menu_item_id, name: n, category, unit_price, quantity, image }) => ({ menu_item_id, name: n, category, unit_price, quantity, image_url: image ?? null }));
      const r = await reservations.createReservation({
        kermes: state.kermes, customer_name: name, customer_phone: $('res-phone').value,
        lines, payment_method: state.method, device: readLS(DEVICE_KEY) || '',
      });
      state.cart.clear();
      $('checkout').close();
      render();
      showTicket(r);
    } catch (err) {
      toast(err.message, { type: 'error', ms: 6000 });
    }
  });
}

let lastTicket = null;
async function showTicket(r) {
  lastTicket = r;
  $('ticket-view').innerHTML = `<div class="ticket-wrap !p-0">${await ticketHTML(r)}</div>`;
  $('ticket-wa').href = whatsappTicketURL(r);
  $('ticket-dialog').showModal();
  if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
}

async function confirmSale(button) {
  if (!cartCount()) return;
  if (RESERVE) { await confirmReservation(button); return; }
  if (state.method === 'efectivo' && $('cash-received').value && Number($('cash-received').value) < cartTotal()) {
    toast('El monto recibido no alcanza.', { type: 'error' });
    return;
  }
  await withBusy(button, 'Guardando…', async () => {
    const lines = [...state.cart.values()].map(({ menu_item_id, kind, name, unit_price, quantity }) => ({ menu_item_id, kind, name, unit_price, quantity }));
    const { sale } = await sales.recordSale({
      lines, tickets: state.tickets, payment_method: state.method, device: readLS(DEVICE_KEY) || '',
    });
    // Platos que se acabaron con esta venta
    const after = sales.snapshot();
    const soldOut = lines.filter((l) => l.menu_item_id)
      .map((l) => items().find((x) => x.id === l.menu_item_id))
      .filter((m) => m && sales.remaining(m, after) === 0)
      .map((m) => m.name);
    state.cart.clear();
    state.tickets = [];
    $('checkout').close();
    const pendingNow = sales.snapshot().sales.find((x) => x.id === sale.id)?.pending;
    toast(pendingNow ? `Venta guardada sin señal (${money(sale.total)}). Se enviará sola.` : `Venta registrada: ${money(sale.total)}.`, { type: pendingNow ? 'info' : 'ok' });
    if (soldOut.length) toast(`Se agotó: ${soldOut.join(', ')}.`, { type: 'error', ms: 5000 });
    render();
  });
}

// =====================================================================
//  Estado de conexión y totales
// =====================================================================
function renderStatus() {
  const s = state.snap;
  const dot = (color) => `<span class="inline-block h-2 w-2 flex-none rounded-full ${color}"></span>`;
  const conn = !s.online
    ? `${dot('bg-bad')} <span class="text-bad">Sin señal${s.pendingCount ? `: ${s.pendingCount} por enviar` : ''}</span>`
    : s.pendingCount
      ? `${dot('bg-sun')} <span class="text-warn">Enviando ${s.pendingCount}…</span>`
      : `${dot('bg-ok')} <span class="text-ok">En línea</span>`;
  // En la caja: cuántas ventas hizo ESTE celular y a qué hora fue la última (el total va en "Ver ventas")
  let extra = '';
  if (VIEW === 'caja') {
    const device = readLS(DEVICE_KEY) || '';
    const mine = s.sales.filter((x) => !x.voided && (!device || x.device === device));
    const last = mine[0];
    extra = `<span class="min-w-0 truncate text-muted">· ${device ? `${escapeHTML(device)}: ` : ''}${mine.length} ${mine.length === 1 ? 'venta' : 'ventas'}${last ? `, última ${new Date(last.sold_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}</span>`;
  } else if (s.lastSyncAt) {
    extra = `<span class="text-muted">· actualizado ${time(s.lastSyncAt)}</span>`;
  }
  $('sync').innerHTML = `${conn} ${extra}`;
}

// =====================================================================
//  Render general + eventos
// =====================================================================
function render() {
  state.snap = sales.snapshot();
  renderStatus();
  const main = $('pos-main');
  if (VIEW === 'ventas') { main.innerHTML = renderSummary(); return; }
  renderTabs();
  if (state.tab === 'rifa') main.innerHTML = renderRaffle();
  else main.innerHTML = renderProducts(state.tab);
  renderCartBar();
}

function bind() {
  $('pos-tabs')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    state.tab = b.dataset.tab;
    render();
    window.scrollTo({ top: 0 });
  });

  $('pos-main').addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.add) addItem(t.dataset.add);
    else if (t.dataset.sub) subItem(t.dataset.sub);
    else if (t.dataset.num) {
      const n = Number(t.dataset.num);
      if (state.raffleSel.has(n)) state.raffleSel.delete(n); else state.raffleSel.add(n);
      render();
    } else if (t.dataset.page) {
      state.rafflePage = Number(t.dataset.page);
      render();
    } else if (t.id === 'raffle-add') addTickets();
    else if (t.dataset.void) {
      const ok = await confirmDialog({
        title: '¿Anular esta venta?',
        message: 'Se descuenta del total y, si tenía boletos de rifa, esos números vuelven a quedar libres.',
        confirmText: 'Sí, anular',
        danger: true,
      });
      if (!ok) return;
      await sales.voidSale(t.dataset.void);
      toast('Venta anulada.');
      render();
    }
  });

  $('pos-main').addEventListener('change', (e) => {
    if (e.target.id === 'device-name') {
      writeLS(DEVICE_KEY, e.target.value.trim());
      toast('Nombre del celular guardado.');
    }
    if (e.target.id === 'raffle-go') {
      const n = Number(e.target.value);
      if (n >= 1 && n <= Number(state.kermes.raffle_total)) {
        state.rafflePage = Math.floor((n - 1) / RAFFLE_PAGE);
        render();
        document.querySelector(`[data-num="${n}"]`)?.focus();
      }
    }
  });

  if (VIEW === 'caja') bindCaja();

  sales.onChange(() => render());
  // Aviso aunque la venta se haya enviado sola al volver la señal
  sales.onConflict((list) => list.forEach((c) => toast(
    `El número ${c.numbers.join(', ')} de la rifa ya lo vendió otro celular. La venta se guardó sin ese boleto: devuelve ese dinero o véndele otro número.`,
    { type: 'error', ms: 10000 },
  )));
}

function bindCaja() {
  $('cart-clear').addEventListener('click', () => {
    state.cart.clear();
    state.tickets = [];
    render();
  });
  $('cart-checkout').addEventListener('click', openCheckout);

  $('checkout').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.method) { state.method = b.dataset.method; renderCheckout(); }
    else if (b.dataset.cash) { $('cash-received').value = b.dataset.cash; updateChange(); }
    else if (b.dataset.coAdd || b.dataset.coSub || b.hasAttribute('data-co-clear-rifa')) {
      if (b.dataset.coAdd) addItem(b.dataset.coAdd);
      if (b.dataset.coSub) subItem(b.dataset.coSub);
      if (b.hasAttribute('data-co-clear-rifa')) { state.cart.delete('rifa'); state.tickets = []; render(); }
      if (!cartCount()) { $('checkout').close(); return; }
      renderCheckout();
    }
  });
  $('cash-received').addEventListener('input', updateChange);
  if (RESERVE) {
    $('reserve-box').classList.remove('hidden');
    $('cart-checkout').textContent = 'Reservar';
    $('checkout-title').textContent = 'Nueva reserva';
    $('ticket-dialog').addEventListener('click', (e) => {
      if (e.target === $('ticket-dialog') || e.target.closest('[data-close]')) $('ticket-dialog').close();
    });
    $('ticket-download').addEventListener('click', (e) => withBusy(e.currentTarget, 'Preparando…', async () => {
      try { await downloadTicket(lastTicket); } catch (err) { toast(err.message, { type: 'error' }); }
    }));
  }
  $('checkout-confirm').addEventListener('click', (e) => confirmSale(e.currentTarget));
}

// Guarda la caja en el celular para abrirla sin señal (requiere https o localhost)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function init() {
  state.user = await requireUser();
  const id = new URLSearchParams(window.location.search).get('id');
  try {
    state.kermes = id ? await loadKermes(id) : null;
  } catch (err) {
    toast(err.message, { type: 'error', ms: 6000 });
  }
  if (!state.kermes) {
    $('pos-notfound').classList.remove('hidden');
    $('pos-tabs')?.parentElement.classList.add('hidden');
    return;
  }
  $('pos-title').textContent = RESERVE ? `Reservar · ${state.kermes.title}` : state.kermes.title;
  document.title = `${VIEW === 'ventas' ? 'Ventas' : RESERVE ? 'Reservar' : 'Caja'}: ${state.kermes.title} · tukermes`;
  if (RESERVE) {
    const link = document.querySelector('[data-link="ventas.html"]');
    link.dataset.link = 'reservas.html';
    link.textContent = 'Reservas';
  }
  // La flecha de volver lleva a "Gestionar kermés" (no al panel general)
  const back = document.querySelector('header a[aria-label="Volver a mi panel"]');
  if (back) { back.href = `gestionar.html?id=${encodeURIComponent(state.kermes.id)}`; back.setAttribute('aria-label', 'Volver a gestionar la kermés'); }
  // Cada página enlaza a la otra
  document.querySelectorAll('[data-link]').forEach((a) => {
    a.href = `${a.dataset.link}?id=${encodeURIComponent(state.kermes.id)}`;
  });
  bind();
  render();
  await sales.start(state.kermes.id);
}

init();
