// reservas.html?id=<kermes>: platos reservados y entregados, y la lista de tickets.
import { requireUser } from './services/authService.js';
import { getMyKermes } from './services/organizerService.js';
import * as sales from './services/salesService.js';
import * as reservations from './services/reservationService.js';
import { escapeHTML, safeURL, formatPrice, normalize } from './utils/format.js';
import { icons } from './utils/icons.js';
import { toast, confirmDialog, withBusy } from './ui/feedback.js';
import { ticketHTML, downloadTicket, whatsappTicketURL } from './ui/ticket.js';

const $ = (id) => document.getElementById(id);
const DEVICE_KEY = 'tk_pos_device';
const money = (n) => formatPrice(n).replace(/\s/g, ' ');
const stamp = (iso) => new Date(iso).toLocaleString('es-BO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const FILTERS = [['reservada', 'Por entregar'], ['entregada', 'Entregadas'], ['anulada', 'Anuladas'], ['', 'Todas']];

const state = { user: null, kermes: null, list: [], filter: 'reservada', q: '', ticket: null };

function readLS(key) { try { return localStorage.getItem(key); } catch { return null; } }
const qty = (r) => r.items.reduce((n, it) => n + Number(it.quantity), 0);

// Platos: cuántos se reservaron, cuántos ya se entregaron y cuántos faltan
function dishTotals() {
  const map = new Map();
  state.list.filter((r) => r.status !== 'anulada').forEach((r) => r.items.forEach((it) => {
    const key = it.menu_item_id ?? it.name;
    const d = map.get(key) ?? { name: it.name, menu_item_id: it.menu_item_id, reserved: 0, delivered: 0 };
    d.reserved += Number(it.quantity);
    if (r.status === 'entregada') d.delivered += Number(it.quantity);
    map.set(key, d);
  }));
  return [...map.values()].sort((a, b) => (b.reserved - b.delivered) - (a.reserved - a.delivered) || b.reserved - a.reserved);
}

function dishesHTML() {
  const rows = dishTotals();
  if (!rows.length) return '';
  return `
    <div class="panel p-5">
      <h2 class="text-lg font-extrabold">Platos reservados</h2>
      <p class="mb-4 text-sm text-muted">Lo que tienes que tener listo y lo que ya entregaste.</p>
      <ul class="space-y-3.5">${rows.map((d) => {
        const img = safeURL(state.kermes.menu_items?.find((m) => m.id === d.menu_item_id)?.image_url);
        const pending = d.reserved - d.delivered;
        const pct = Math.round((d.delivered / Math.max(1, d.reserved)) * 100);
        return `
        <li class="flex items-center gap-3">
          <span class="rank-photo">${img ? `<img src="${escapeHTML(img)}" alt="" loading="lazy">` : icons.dish('h-5 w-5')}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <p class="truncate text-sm font-bold">${escapeHTML(d.name)}</p>
              <span class="pos-stock ${pending ? 'is-low' : 'is-ok'}">${pending ? `Faltan ${pending}` : 'Todo entregado'}</span>
            </div>
            <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas"><div class="h-full rounded-full bg-data-1" style="width:${pct}%"></div></div>
            <p class="num mt-1 text-xs text-muted"><strong class="text-ink">${d.delivered}</strong> de ${d.reserved} entregados</p>
          </div>
        </li>`;
      }).join('')}</ul>
    </div>`;
}

function rowHTML(r) {
  const chip = { reservada: ['is-low', 'Por entregar'], entregada: ['is-ok', 'Entregada'], anulada: ['is-out', 'Anulada'] }[r.status];
  return `
    <li class="py-3.5 ${r.status === 'anulada' ? 'opacity-60' : ''}">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="truncate font-bold">${escapeHTML(r.customer_name)}</p>
            <span class="pos-stock ${chip[0]}">${chip[1]}</span>
          </div>
          <p class="mt-0.5 text-sm">${r.items.map((it) => `${Number(it.quantity)}× ${escapeHTML(it.name)}`).join(', ')}</p>
          <p class="num mt-0.5 text-xs text-muted">${escapeHTML(reservations.formatCode(r.code))} · reservó ${escapeHTML(stamp(r.created_at))}${r.status === 'entregada' && r.delivered_at ? ` · entregada ${escapeHTML(stamp(r.delivered_at))}` : ''}${r.customer_phone ? ` · ${escapeHTML(r.customer_phone)}` : ''}</p>
        </div>
        <p class="price flex-none font-extrabold ${r.status === 'anulada' ? 'line-through' : ''}">${escapeHTML(money(r.total))}</p>
      </div>
      <div class="mt-2.5 flex flex-wrap gap-2">
        <button type="button" class="btn btn-soft !h-9 !px-3.5 text-[13px]" data-ticket="${escapeHTML(r.id)}">Ver ticket</button>
        ${r.status === 'reservada' ? `
          <button type="button" class="btn btn-outline !h-9 !px-3.5 text-[13px]" data-deliver="${escapeHTML(r.id)}">${icons.check('h-4 w-4')} Entregar</button>
          <button type="button" class="btn btn-danger !h-9 !px-3 text-[13px]" data-cancel="${escapeHTML(r.id)}">Anular</button>` : ''}
      </div>
    </li>`;
}

function render() {
  const all = state.list;
  const pending = all.filter((r) => r.status === 'reservada');
  const delivered = all.filter((r) => r.status === 'entregada');
  const count = (st) => (st ? all.filter((r) => r.status === st).length : all.length);
  const q = normalize(state.q);
  const visible = all
    .filter((r) => !state.filter || r.status === state.filter)
    .filter((r) => !q || normalize(`${r.customer_name} ${r.code} ${r.customer_phone ?? ''}`).includes(q.replace(/-/g, '')));

  $('res-main').innerHTML = `
    <div class="grid grid-cols-2 gap-3">
      <div class="goal-card">
        <p class="text-sm font-semibold text-white/75">Por entregar</p>
        <p class="num mt-1 text-[2.25rem] font-extrabold leading-none text-brand-500">${pending.length}</p>
        <p class="num mt-1.5 text-xs text-white/70">${pending.reduce((n, r) => n + qty(r), 0)} productos</p>
      </div>
      <div class="panel p-5">
        <p class="text-sm font-semibold text-muted">Entregadas</p>
        <p class="num mt-1 text-[2.25rem] font-extrabold leading-none">${delivered.length}</p>
        <p class="num mt-1.5 text-xs text-muted">${delivered.reduce((n, r) => n + qty(r), 0)} productos</p>
      </div>
    </div>

    <a href="vender.html?id=${encodeURIComponent(state.kermes.id)}&modo=reserva" class="btn btn-primary w-full">${icons.ticket('h-5 w-5')} Nueva reserva</a>

    ${dishesHTML()}

    <div class="panel p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 class="text-lg font-extrabold">Tickets</h2>
        <input id="res-search" class="input !h-10 sm:w-64" placeholder="Buscar nombre o código" value="${escapeHTML(state.q)}" autocomplete="off">
      </div>
      <div class="segmented no-scrollbar mt-3 overflow-x-auto" role="group" aria-label="Filtrar reservas">
        ${FILTERS.map(([st, label]) => `<button type="button" data-filter="${st}" aria-pressed="${st === state.filter}">${label} <span class="count">${count(st)}</span></button>`).join('')}
      </div>
      ${visible.length ? `<ul class="mt-2 divide-y divide-line">${visible.map(rowHTML).join('')}</ul>`
        : `<p class="py-10 text-center text-sm text-muted">${all.length ? 'No hay reservas aquí.' : 'Todavía no hay reservas. Toca "Nueva reserva" para cobrar un pedido por adelantado.'}</p>`}
    </div>`;
}

async function reload() {
  try {
    state.list = await reservations.listReservations(state.kermes.id);
  } catch (err) {
    toast(err.message, { type: 'error', ms: 6000 });
  }
  renderKeepFocus();
}

function renderKeepFocus() {
  const focused = document.activeElement?.id === 'res-search';
  render();
  if (focused) { const el = $('res-search'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}

const byId = (id) => state.list.find((r) => r.id === id);

async function openTicket(r) {
  // Las reservas antiguas no guardaban la foto del plato: se toma del menú
  const photo = (it) => it.image_url ?? state.kermes.menu_items?.find((m) => m.id === it.menu_item_id)?.image_url ?? null;
  state.ticket = { ...r, items: r.items.map((it) => ({ ...it, image_url: photo(it) })), kermes: state.kermes };
  $('ticket-view').innerHTML = await ticketHTML(state.ticket);
  $('ticket-wa').href = whatsappTicketURL(state.ticket);
  $('ticket-dialog-title').textContent = r.customer_name;
  $('ticket-dialog').showModal();
}

function bind() {
  $('res-main').addEventListener('click', async (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { state.filter = f.dataset.filter; render(); return; }
    const t = e.target.closest('[data-ticket]');
    if (t) { openTicket(byId(t.dataset.ticket)); return; }
    const d = e.target.closest('[data-deliver]');
    if (d) {
      const r = byId(d.dataset.deliver);
      const ok = await confirmDialog({
        title: `¿Entregar a ${r.customer_name}?`,
        message: `${r.items.map((it) => `${it.quantity}× ${it.name}`).join(', ')}. Úsalo solo si no puedes escanear su QR: después el ticket ya no sirve.`,
        confirmText: 'Sí, entregar',
      });
      if (!ok) return;
      await withBusy(d, '…', async () => {
        try {
          const res = await reservations.deliver(r.id, readLS(DEVICE_KEY) || '');
          toast(res.ok ? `Entregado a ${r.customer_name}.` : 'Ese pedido ya estaba entregado.', { type: res.ok ? 'ok' : 'error' });
        } catch (err) { toast(err.message, { type: 'error' }); }
      });
      reload();
      return;
    }
    const c = e.target.closest('[data-cancel]');
    if (c) {
      const r = byId(c.dataset.cancel);
      const ok = await confirmDialog({
        title: '¿Anular esta reserva?',
        message: `La reserva de ${r.customer_name} (${money(r.total)}) se descuenta del recaudado y sus porciones vuelven a estar disponibles. Devuélvele su dinero.`,
        confirmText: 'Sí, anular',
        danger: true,
      });
      if (!ok) return;
      await withBusy(c, '…', async () => {
        try { await reservations.cancel(r); toast('Reserva anulada.'); } catch (err) { toast(err.message, { type: 'error' }); }
      });
      reload();
    }
  });
  $('res-main').addEventListener('input', (e) => {
    if (e.target.id === 'res-search') { state.q = e.target.value; renderKeepFocus(); }
  });

  $('ticket-dialog').addEventListener('click', (e) => {
    if (e.target === $('ticket-dialog') || e.target.closest('[data-close]')) $('ticket-dialog').close();
  });
  $('ticket-download').addEventListener('click', (e) => withBusy(e.currentTarget, 'Preparando…', async () => {
    try { await downloadTicket(state.ticket); } catch (err) { toast(err.message, { type: 'error' }); }
  }));
  // Si se entregan pedidos desde otro celular, la lista se pone al día sola
  setInterval(() => { if (!document.hidden && !$('ticket-dialog').open && document.activeElement?.id !== 'res-search') reload(); }, 20000);
}

async function init() {
  state.user = await requireUser();
  const id = new URLSearchParams(window.location.search).get('id');
  try {
    state.kermes = id ? await getMyKermes(id, state.user.id) : null;
  } catch (err) {
    toast(err.message, { type: 'error', ms: 6000 });
  }
  if (!state.kermes) {
    $('pos-notfound').classList.remove('hidden');
    $('res-main').classList.add('hidden');
    return;
  }
  $('pos-title').textContent = state.kermes.title;
  document.title = `Reservas: ${state.kermes.title} · tukermes`;
  document.querySelectorAll('[data-link]').forEach((a) => { a.href = `${a.dataset.link}?id=${encodeURIComponent(state.kermes.id)}`; });
  // La flecha de volver lleva a "Gestionar kermés" (no al panel general)
  const back = document.querySelector('header a[aria-label="Volver a mi panel"]');
  if (back) { back.href = `gestionar.html?id=${encodeURIComponent(state.kermes.id)}`; back.setAttribute('aria-label', 'Volver a gestionar la kermés'); }
  sales.start(state.kermes.id); // para anular la venta de una reserva
  bind();
  await reload();
}

init();
