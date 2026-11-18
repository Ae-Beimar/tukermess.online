// entregar.html?id=<kermes>: el día de la kermés, escanea el QR del ticket y entrega el pedido.
import { requireUser } from './services/authService.js';
import { getMyKermes } from './services/organizerService.js';
import * as reservations from './services/reservationService.js';
import { escapeHTML, safeURL, formatPrice } from './utils/format.js';
import { icons } from './utils/icons.js';
import { toast, withBusy } from './ui/feedback.js';

const $ = (id) => document.getElementById(id);
const JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
const DEVICE_KEY = 'tk_pos_device';
const money = (n) => formatPrice(n).replace(/\s/g, ' ');
const stamp = (iso) => new Date(iso).toLocaleString('es-BO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const state = { user: null, kermes: null, stream: null, scanning: false, busy: false, current: null };

function readLS(key) { try { return localStorage.getItem(key); } catch { return null; } }

// =====================================================================
//  Cámara y lectura del QR
// =====================================================================
let detector = null;
let jsQR = null;
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

async function getDecoder() {
  if (!detector && 'BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch { /* se usa jsQR */ }
  }
  if (!detector && !jsQR) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = JSQR;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar el lector de QR. Revisa tu internet.'));
      document.head.append(s);
    });
    jsQR = window.jsQR;
  }
}

async function decodeFrame(video) {
  if (detector) {
    const codes = await detector.detect(video);
    return codes[0]?.rawValue ?? null;
  }
  const w = 480;
  const h = Math.round((video.videoHeight / video.videoWidth) * w) || w;
  canvas.width = w; canvas.height = h;
  ctx.drawImage(video, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  return jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

function scanMsg(html) {
  $('scan-msg').innerHTML = html;
  $('scan-msg').classList.toggle('hidden', !html);
  $('scan-overlay').classList.toggle('hidden', !!html);
}

async function startCamera() {
  scanMsg('<p class="text-sm font-semibold text-white/80">Preparando la cámara…</p>');
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('sin cámara'), { name: 'NotSupported' });
    await getDecoder();
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    const video = $('video');
    video.srcObject = state.stream;
    await video.play();
    scanMsg('');
    state.scanning = true;
    loop();
  } catch (err) {
    const denied = err?.name === 'NotAllowedError';
    scanMsg(`
      <span class="flex h-12 w-12 items-center justify-center rounded-full bg-white/15">${icons.scan('h-6 w-6')}</span>
      <p class="max-w-[260px] text-sm font-semibold">${denied
        ? 'No diste permiso para usar la cámara. Actívalo en el candado de la barra de direcciones.'
        : err?.name === 'NotSupported' ? 'Este navegador no puede usar la cámara aquí (necesita https).' : escapeHTML(err?.message || 'No se pudo abrir la cámara.')}</p>
      <button type="button" id="cam-retry" class="btn btn-white !h-11">Activar cámara</button>`);
  }
}

function stopCamera() {
  state.scanning = false;
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
}

async function loop() {
  const video = $('video');
  while (state.scanning) {
    if (video.readyState >= 2 && !state.busy) {
      try {
        const text = await decodeFrame(video);
        if (text && state.scanning) { onRead(text); return; }
      } catch { /* cuadro ilegible: sigue */ }
    }
    await new Promise((r) => setTimeout(r, 180));
  }
}

// =====================================================================
//  Resultado
// =====================================================================
const photoOf = (it) => safeURL(state.kermes.menu_items?.find((m) => m.id === it.menu_item_id)?.image_url);

function linesHTML(r) {
  return `<ul class="divide-y divide-line">${r.items.map((it) => {
    const img = photoOf(it);
    return `
      <li class="deliver-line">
        <span class="deliver-qty">${Number(it.quantity)}</span>
        <span class="deliver-photo">${img ? `<img src="${escapeHTML(img)}" alt="" loading="lazy">` : icons.dish('h-6 w-6')}</span>
        <span class="min-w-0 flex-1 text-lg font-bold leading-snug">${escapeHTML(it.name)}</span>
      </li>`;
  }).join('')}</ul>`;
}

function verdictHTML(kind, title, sub, icon) {
  return `
    <div class="verdict is-${kind} flex items-center gap-4">
      <span class="verdict-icon">${icon}</span>
      <div class="min-w-0">
        <p class="text-xl font-extrabold leading-tight">${title}</p>
        ${sub ? `<p class="mt-0.5 text-sm font-semibold opacity-90">${sub}</p>` : ''}
      </div>
    </div>`;
}

function showResult(html) {
  $('scan-view').classList.add('hidden');
  $('result-view').innerHTML = html;
  $('result-view').classList.remove('hidden');
  window.scrollTo({ top: 0 });
}

const againBtn = (primary = true) => `<button type="button" data-again class="btn ${primary ? 'btn-primary' : 'btn-outline'} !h-14 w-full text-base">${icons.scan('h-5 w-5')} Escanear otro</button>`;

function renderReservation(r, { justDelivered = false } = {}) {
  state.current = r;
  const otherKermes = r.kermes_id !== state.kermes.id;
  const n = r.items.reduce((s, it) => s + Number(it.quantity), 0);
  let verdict;
  let action = '';
  if (otherKermes) {
    verdict = verdictHTML('warn', 'Ticket de otra kermés', 'Este pedido no es de esta kermés. No lo entregues aquí.', icons.alert('h-7 w-7'));
  } else if (justDelivered) {
    verdict = verdictHTML('ok', '¡Entregado!', 'Listo. Si vuelven a escanear este QR dirá que ya se entregó.', icons.check('h-7 w-7'));
  } else if (r.status === 'entregada') {
    verdict = verdictHTML('bad', 'Pedido ya entregado', `Este ticket ya se usó${r.delivered_at ? ` el ${escapeHTML(stamp(r.delivered_at))}` : ''}${r.delivered_device ? ` (${escapeHTML(r.delivered_device)})` : ''}. No lo entregues de nuevo.`, icons.close('h-7 w-7'));
  } else if (r.status === 'anulada') {
    verdict = verdictHTML('bad', 'Ticket inválido', 'Esta reserva fue anulada.', icons.close('h-7 w-7'));
  } else {
    verdict = verdictHTML('ok', 'Ticket válido', 'Revisa el pedido y entrégalo.', icons.check('h-7 w-7'));
    action = `<button type="button" data-deliver class="btn btn-primary !h-16 w-full text-lg">${icons.check('h-6 w-6')} Entregar</button>`;
  }

  showResult(`
    ${verdict}
    <div class="panel p-5 ${r.status !== 'reservada' && !justDelivered ? 'opacity-70' : ''}">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted">A nombre de</p>
          <p class="truncate text-xl font-extrabold">${escapeHTML(r.customer_name)}</p>
        </div>
        <span class="num flex-none rounded-full bg-canvas px-3 py-1 text-xs font-bold tracking-[0.08em]">${escapeHTML(reservations.formatCode(r.code))}</span>
      </div>
      <p class="mt-4 text-sm font-bold">${n} ${n === 1 ? 'producto' : 'productos'}</p>
      ${linesHTML(r)}
      <div class="mt-2 flex items-center justify-between border-t border-line pt-3 text-sm">
        <span class="text-muted">${r.payment_method === 'qr' ? 'Pagado por QR' : r.payment_method === 'efectivo' ? 'Pagado en efectivo' : 'Pagado'}</span>
        <span class="price text-lg font-extrabold">${escapeHTML(money(r.total))}</span>
      </div>
    </div>
    ${action}
    ${againBtn(!action)}`);
  if (navigator.vibrate) navigator.vibrate(r.status === 'reservada' || justDelivered ? 30 : [60, 60, 60]);
}

async function onRead(text) {
  stopCamera();
  const code = reservations.parseCode(text);
  if (!code) {
    showResult(`${verdictHTML('bad', 'QR no reconocido', 'Este código no es un ticket de tukermes.', icons.close('h-7 w-7'))}${againBtn()}`);
    if (navigator.vibrate) navigator.vibrate([60, 60, 60]);
    return;
  }
  showResult(`<div class="panel px-6 py-12 text-center text-sm font-semibold text-muted">Buscando el ticket ${escapeHTML(reservations.formatCode(code))}…</div>`);
  try {
    const r = await reservations.findByCode(code);
    if (!r) {
      showResult(`${verdictHTML('bad', 'Ticket no encontrado', `No hay ninguna reserva con el código ${escapeHTML(reservations.formatCode(code))} en tus kermeses.`, icons.close('h-7 w-7'))}${againBtn()}`);
      return;
    }
    renderReservation(r);
  } catch (err) {
    showResult(`${verdictHTML('warn', 'No se pudo revisar', escapeHTML(err.message), icons.alert('h-7 w-7'))}${againBtn()}`);
  }
}

async function deliverCurrent(button) {
  const r = state.current;
  if (!r) return;
  await withBusy(button, 'Entregando…', async () => {
    try {
      const res = await reservations.deliver(r.id, readLS(DEVICE_KEY) || '');
      if (res.ok) renderReservation(res.reservation, { justDelivered: true });
      else {
        renderReservation(res.reservation ?? r);
        toast('Otro celular ya entregó este pedido.', { type: 'error', ms: 5000 });
      }
      loadStats();
    } catch (err) {
      toast(err.message, { type: 'error', ms: 5000 });
    }
  });
}

function scanAgain() {
  state.current = null;
  $('result-view').classList.add('hidden');
  $('scan-view').classList.remove('hidden');
  $('code-input').value = '';
  startCamera();
}

async function loadStats() {
  try {
    const list = await reservations.listReservations(state.kermes.id);
    $('stat-pending').textContent = list.filter((r) => r.status === 'reservada').length;
    $('stat-delivered').textContent = list.filter((r) => r.status === 'entregada').length;
  } catch { /* sin datos */ }
}

function bind() {
  $('result-view').addEventListener('click', (e) => {
    if (e.target.closest('[data-again]')) scanAgain();
    const d = e.target.closest('[data-deliver]');
    if (d) deliverCurrent(d);
  });
  $('scan-msg').addEventListener('click', (e) => { if (e.target.closest('#cam-retry')) startCamera(); });
  $('code-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('code-input').value;
    if (!reservations.parseCode(v)) {
      $('code-input').setAttribute('aria-invalid', 'true');
      toast('El código tiene 10 letras y números, como ABCDE-12345.', { type: 'error' });
      return;
    }
    $('code-input').removeAttribute('aria-invalid');
    onRead(v);
  });
  // Al volver a la pestaña la cámara se reabre; al salir se apaga
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
    else if (!$('scan-view').classList.contains('hidden') && !state.stream) startCamera();
  });
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
    $('deliver-main').classList.add('hidden');
    return;
  }
  $('pos-title').textContent = state.kermes.title;
  document.title = `Entregar: ${state.kermes.title} · tukermes`;
  document.querySelectorAll('[data-link]').forEach((a) => { a.href = `${a.dataset.link}?id=${encodeURIComponent(state.kermes.id)}`; });
  // La flecha de volver lleva a "Gestionar kermés" (no al panel general)
  const back = document.querySelector('header a[aria-label="Volver a mi panel"]');
  if (back) { back.href = `gestionar.html?id=${encodeURIComponent(state.kermes.id)}`; back.setAttribute('aria-label', 'Volver a gestionar la kermés'); }
  bind();
  loadStats();
  startCamera();
}

init();
