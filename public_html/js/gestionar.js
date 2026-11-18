// gestionar.html?id=<kermes>: todo lo de UNA kermés en un solo lugar.
// Recaudado arriba; luego Vender / Reservar / Entregar; luego ventas, reservas y ajustes.
import { requireUser } from './services/authService.js';
import { getMyKermes, getSalesSummary, setStatus } from './services/organizerService.js';
import { listReservations } from './services/reservationService.js';
import {
  escapeHTML, formatPrice, eventURL, toISODate,
} from './utils/format.js';
import { icons } from './utils/icons.js';
import { toast, withBusy } from './ui/feedback.js';

const $ = (id) => document.getElementById(id);
const money = (n) => formatPrice(n).replace(/\s/g, ' ');
const state = { user: null, kermes: null, summary: null, res: { pending: 0, delivered: 0, pendingItems: 0 } };

const chevron = icons.arrowRight('h-4 w-4');

function noticeHTML(k) {
  const enc = encodeURIComponent(k.id);
  const items = k.menu_items?.length ?? 0;
  if (!items) {
    return `<div class="manage-note"><div class="min-w-0"><p class="font-bold">Tu kermés aún no tiene menú</p><p class="text-sm opacity-80">Agrega los platos con su precio para poder vender y reservar.</p></div>
      <a href="editar.html?id=${enc}#menu" class="btn btn-dark !h-10 flex-none !px-4 text-sm">Agregar menú</a></div>`;
  }
  if (k.status === 'borrador') {
    return `<div class="manage-note"><div class="min-w-0"><p class="font-bold">Es un borrador</p><p class="text-sm opacity-80">Puedes vender y reservar, pero no aparece en el muro.</p></div>
      <button type="button" data-publish class="btn btn-dark !h-10 flex-none !px-4 text-sm">Publicar</button></div>`;
  }
  if (k.status === 'finalizada') {
    return '<div class="manage-note"><div class="min-w-0"><p class="font-bold">Kermés finalizada</p><p class="text-sm opacity-80">Ya no está en el muro. Puedes revisar sus ventas y reservas.</p></div></div>';
  }
  if (k.event_date < toISODate(new Date())) {
    return '<div class="manage-note"><div class="min-w-0"><p class="font-bold">La fecha ya pasó</p><p class="text-sm opacity-80">Márcala como finalizada desde los tres puntos de tu panel.</p></div></div>';
  }
  return '';
}

function render() {
  const k = state.kermes;
  const s = state.summary ?? { sales_count: 0, total: 0, total_efectivo: 0, total_qr: 0 };
  const r = state.res;
  const enc = encodeURIComponent(k.id);
  const pctCash = s.total > 0 ? Math.round((s.total_efectivo / s.total) * 100) : 0;

  $('manage-main').innerHTML = `
    ${noticeHTML(k)}

    <!-- Recaudado -->
    <section class="goal-card">
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm font-semibold text-white/75">Recaudado</p>
        <a href="ventas.html?id=${enc}" class="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white hover:bg-white/20">Ver detalle</a>
      </div>
      <p class="num price mt-1.5 whitespace-nowrap text-[clamp(2.25rem,11vw,3.25rem)] font-extrabold leading-none tracking-tight text-brand-500">${escapeHTML(money(s.total))}</p>
      <div class="split-bar mt-4 !bg-white/10" role="img" aria-label="Efectivo ${pctCash} por ciento, QR ${100 - pctCash} por ciento">
        ${s.total > 0 ? `<span class="bg-data-1" style="width:${pctCash}%"></span><span class="bg-white/60" style="width:${100 - pctCash}%"></span>` : ''}
      </div>
      <dl class="manage-stats">
        <div><dt>Ventas</dt><dd>${s.sales_count}</dd></div>
        <div><dt>Efectivo</dt><dd>${escapeHTML(money(s.total_efectivo))}</dd></div>
        <div><dt>QR</dt><dd>${escapeHTML(money(s.total_qr))}</dd></div>
      </dl>
    </section>

    <!-- Atender -->
    <section aria-labelledby="t-atender">
      <h3 id="t-atender" class="manage-title">Atender</h3>
      <a href="vender.html?id=${enc}" class="manage-main-action">
        <span class="manage-icon is-light">${icons.register('h-7 w-7')}</span>
        <span class="min-w-0 flex-1">
          <span class="block text-xl font-extrabold leading-tight">Vender</span>
          <span class="block text-sm font-semibold opacity-80">Abrir la caja del día</span>
        </span>
        <span class="manage-go">${chevron}</span>
      </a>
      <div class="mt-3 grid grid-cols-2 gap-3">
        <a href="vender.html?id=${enc}&modo=reserva" class="manage-tile">
          <span class="manage-icon">${icons.ticket('h-6 w-6')}</span>
          <span class="mt-3 block text-[17px] font-extrabold leading-tight">Reservar</span>
          <span class="mt-0.5 block text-[13px] leading-snug text-muted">Cobrar antes y dar ticket con QR</span>
        </a>
        <a href="entregar.html?id=${enc}" class="manage-tile">
          <span class="manage-icon">${icons.scan('h-6 w-6')}</span>
          ${r.pending ? `<span class="manage-badge">${r.pending}</span>` : ''}
          <span class="mt-3 block text-[17px] font-extrabold leading-tight">Entregar</span>
          <span class="mt-0.5 block text-[13px] leading-snug text-muted">Escanear el QR del ticket</span>
        </a>
      </div>
    </section>

    <!-- Seguimiento -->
    <section aria-labelledby="t-seg">
      <h3 id="t-seg" class="manage-title">Seguimiento</h3>
      <div class="manage-list">
        <a href="reservas.html?id=${enc}">
          <span class="manage-icon is-sm">${icons.list('h-5 w-5')}</span>
          <span class="min-w-0 flex-1"><span class="block font-bold">Reservas y entregas</span>
            <span class="block text-[13px] text-muted">${r.pending} por entregar · ${r.delivered} entregadas${r.pendingItems ? ` · ${r.pendingItems} platos pendientes` : ''}</span></span>
          <span class="text-muted">${chevron}</span>
        </a>
        <a href="ventas.html?id=${enc}">
          <span class="manage-icon is-sm">${icons.grid('h-5 w-5')}</span>
          <span class="min-w-0 flex-1"><span class="block font-bold">Ventas</span>
            <span class="block text-[13px] text-muted">Lo más vendido, porciones y últimas ventas</span></span>
          <span class="text-muted">${chevron}</span>
        </a>
      </div>
    </section>

    <!-- Ajustes -->
    <section aria-labelledby="t-aj">
      <h3 id="t-aj" class="manage-title">Kermés</h3>
      <div class="manage-list">
        <a href="editar.html?id=${enc}">
          <span class="manage-icon is-sm">${icons.edit('h-5 w-5')}</span>
          <span class="min-w-0 flex-1"><span class="block font-bold">Editar kermés</span>
            <span class="block text-[13px] text-muted">Datos, portada, menú y rifa</span></span>
          <span class="text-muted">${chevron}</span>
        </a>
        ${k.status === 'publicada' ? `
        <a href="${escapeHTML(eventURL(k.id))}">
          <span class="manage-icon is-sm">${icons.eye('h-5 w-5')}</span>
          <span class="min-w-0 flex-1"><span class="block font-bold">Ver en el muro</span>
            <span class="block text-[13px] text-muted">Así la ven los visitantes</span></span>
          <span class="text-muted">${chevron}</span>
        </a>` : ''}
      </div>
    </section>`;
}

async function loadNumbers() {
  const [summary, list] = await Promise.all([
    getSalesSummary(state.kermes.id).catch(() => null),
    listReservations(state.kermes.id).catch(() => []),
  ]);
  state.summary = summary;
  const pending = list.filter((x) => x.status === 'reservada');
  state.res = {
    pending: pending.length,
    delivered: list.filter((x) => x.status === 'entregada').length,
    pendingItems: pending.reduce((n, x) => n + x.items.reduce((m, it) => m + Number(it.quantity), 0), 0),
  };
  render();
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
    $('manage-main').classList.add('hidden');
    return;
  }
  $('pos-title').textContent = state.kermes.title;
  $('edit-link').href = `editar.html?id=${encodeURIComponent(state.kermes.id)}`;
  document.title = `Gestionar: ${state.kermes.title} · tukermes`;

  $('manage-main').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-publish]');
    if (!b) return;
    await withBusy(b, '…', async () => {
      try {
        await setStatus(state.kermes.id, state.user.id, 'publicada');
        state.kermes.status = 'publicada';
        toast('¡Publicada! Ya aparece en el muro.');
        render();
      } catch (err) { toast(err.message, { type: 'error' }); }
    });
  });

  render();
  await loadNumbers();
  // Los números se ponen al día al volver a esta pantalla (por ejemplo, después de vender)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadNumbers(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) loadNumbers(); });
}

init();
