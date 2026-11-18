// Ticket de reserva: el mismo diseño en pantalla (HTML) y como imagen para descargar (canvas).
// Estilo "pase de abordar": portada de la kermés, franja de datos, platos con foto y QR enmarcado.
import { escapeHTML, safeURL, formatPrice, formatShortDate, formatTime } from '../utils/format.js';
import { formatCode, ticketURL } from '../services/reservationService.js';

const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
const money = (n) => formatPrice(n).replace(/\s/g, ' ');

let qrLib;
function loadQRLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  qrLib ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = QR_LIB;
    s.onload = () => resolve(window.qrcode);
    s.onerror = () => { qrLib = null; reject(new Error('No se pudo cargar el generador de QR. Revisa tu internet.')); };
    document.head.append(s);
  });
  return qrLib;
}

/** Matriz del QR: { size, dark(r, c) } */
async function qrMatrix(text) {
  const qrcode = await loadQRLib();
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return { size: qr.getModuleCount(), dark: (r, c) => qr.isDark(r, c) };
}

async function qrSVG(text) {
  const m = await qrMatrix(text);
  let d = '';
  for (let r = 0; r < m.size; r += 1) for (let c = 0; c < m.size; c += 1) if (m.dark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return `<svg viewBox="0 0 ${m.size} ${m.size}" shape-rendering="crispEdges" role="img" aria-label="Código QR del ticket"><path d="${d}" fill="#1d1d1f"/></svg>`;
}

const STATUS = {
  reservada: { label: 'Válido', cls: 'is-ok' },
  entregada: { label: 'Entregado', cls: 'is-done' },
  anulada: { label: 'Anulado', cls: 'is-void' },
};

const stamp = (iso) => new Date(iso).toLocaleString('es-BO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const qtyTotal = (t) => t.items.reduce((n, it) => n + Number(it.quantity), 0);
const payLabel = (t) => (t.payment_method === 'qr' ? 'Pagado por QR' : t.payment_method === 'efectivo' ? 'Pagado en efectivo' : 'Pagado');
const hintText = (t) => (t.status === 'entregada'
  ? `Pedido entregado${t.delivered_at ? ` el ${stamp(t.delivered_at)}` : ''}.`
  : t.status === 'anulada' ? 'Esta reserva fue anulada.' : 'Muestra este QR al recoger tu pedido. Vale para una sola entrega.');

/** Fecha / Hora / Lugar de la franja de datos */
function infoCells(k) {
  return [
    ['Fecha', k.event_date ? formatShortDate(k.event_date) : '—'],
    ['Hora', k.start_time ? `${formatTime(k.start_time)}${k.end_time ? ` – ${formatTime(k.end_time)}` : ''}` : '—'],
    ['Lugar', k.zone || k.address || '—'],
  ];
}

const DISH = '<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 15h18M5 15a7 7 0 0 1 14 0M12 6V4.5M2.5 19h19"/></svg>';

/** Ticket en HTML. t = { code, customer_name, items, total, payment_method, status, delivered_at, kermes } */
export async function ticketHTML(t) {
  const st = STATUS[t.status] ?? STATUS.reservada;
  const k = t.kermes ?? {};
  const cover = safeURL(k.cover_image_url);
  let qr = '';
  try { qr = await qrSVG(ticketURL(t.code)); } catch (err) { qr = `<p class="p-4 text-sm text-muted">${escapeHTML(err.message)}</p>`; }
  const n = qtyTotal(t);

  return `
    <article class="ticket ${st.cls}">
      <div class="ticket-cover ${cover ? '' : 'is-empty'}">
        ${cover ? `<img src="${escapeHTML(cover)}" alt="" onerror="this.remove()">` : ''}
        <span class="ticket-chip is-logo"><img src="assets/img/logo.svg" alt="tukermes.online"></span>
        <span class="ticket-chip is-accent">Ticket de reserva</span>
      </div>

      <div class="ticket-sec !pb-5 !pt-4">
        <h2 class="text-[22px] font-extrabold leading-tight tracking-tight">${escapeHTML(k.title ?? 'Kermés')}</h2>
        <dl class="ticket-info">${infoCells(k).map(([l, v]) => `<div><dt>${l}</dt><dd>${escapeHTML(v)}</dd></div>`).join('')}</dl>
      </div>

      <div class="ticket-cut" aria-hidden="true"></div>

      <div class="ticket-sec">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="ticket-label">A nombre de</p>
            <p class="truncate text-lg font-extrabold leading-tight">${escapeHTML(t.customer_name)}</p>
          </div>
          <span class="ticket-status ${st.cls}">${st.label}</span>
        </div>

        <ul class="mt-4 space-y-3">${t.items.map((it) => {
          const img = safeURL(it.image_url);
          return `
          <li class="ticket-item">
            <span class="ticket-thumb">${img ? `<img src="${escapeHTML(img)}" alt="" loading="lazy">` : DISH}<span class="ticket-qty">${Number(it.quantity)}</span></span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[15px] font-bold leading-snug">${escapeHTML(it.name)}</span>
              <span class="num block text-xs text-muted">${Number(it.quantity)} × ${escapeHTML(money(it.unit_price))}</span>
            </span>
            <span class="price flex-none whitespace-nowrap text-[15px] font-bold">${escapeHTML(money(it.unit_price * it.quantity))}</span>
          </li>`;
        }).join('')}</ul>

        <div class="ticket-total">
          <div class="min-w-0">
            <p class="text-xs font-semibold text-muted">Total · ${n} ${n === 1 ? 'producto' : 'productos'}</p>
            <p class="text-sm font-bold">${payLabel(t)}</p>
          </div>
          <p class="price flex-none whitespace-nowrap text-2xl font-extrabold tracking-tight">${escapeHTML(money(t.total))}</p>
        </div>
      </div>

      <div class="ticket-cut" aria-hidden="true"></div>

      <div class="ticket-sec pb-6 text-center">
        <div class="ticket-qr">
          <span class="c1"></span><span class="c2"></span><span class="c3"></span><span class="c4"></span>
          ${qr}
          ${t.status !== 'reservada' ? `<span class="ticket-stamp">${st.label}</span>` : ''}
        </div>
        <p class="ticket-code num">${escapeHTML(formatCode(t.code))}</p>
        <p class="mx-auto mt-2 max-w-[250px] text-[13px] leading-snug text-muted">${escapeHTML(hintText(t))}</p>
      </div>
    </article>`;
}

// =====================================================================
//  Imagen descargable: el mismo diseño dibujado en canvas
// =====================================================================
const C = {
  canvas: '#f5f5f7', ink: '#1d1d1f', muted: '#6e6e73', line: '#e5e5ea', fill: '#ececf0',
  accent: '#f97316', accentSoft: '#ffedd5', accentText: '#9a3412',
  ok: '#166534', okSoft: '#e6f4ea', bad: '#b42318', badSoft: '#fdecea',
};
const STATUS_COLORS = { reservada: [C.okSoft, C.ok], entregada: [C.fill, C.muted], anulada: [C.badSoft, C.bad] };
const FONT = 'Figtree, system-ui, sans-serif';

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function wrap(ctx, text, maxW, maxLines = 3) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  words.forEach((w) => {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  });
  if (cur) lines.push(cur);
  if (lines.length > maxLines) lines.length = maxLines;
  lines.forEach((l, i) => {
    let s = l;
    const last = i === lines.length - 1 && words.join(' ') !== lines.join(' ');
    while ((ctx.measureText(last ? `${s}…` : s).width > maxW) && s.length > 1) s = s.slice(0, -1);
    lines[i] = last || s !== l ? `${s}…` : s;
  });
  return lines;
}

function loadImg(src) {
  const url = safeURL(src);
  if (!url) return Promise.resolve(null);
  return new Promise((res) => {
    const i = new Image();
    if (new URL(url, location.href).origin !== location.origin && !url.startsWith('data:')) i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = url;
  });
}

function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s; const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/** Dibuja el ticket. Primero mide (draw=false) y luego pinta. Devuelve el alto. */
function paint(ctx, t, m, draw) {
  const W = 720; const P = 36; const X = P; const CW = W - P * 2; const IX = X + 36; const IW = CW - 72;
  const st = STATUS[t.status] ?? STATUS.reservada;
  const k = t.kermes ?? {};
  const font = (size, weight) => { ctx.font = `${weight} ${size}px ${FONT}`; };
  const text = (s, x, y, { size = 24, weight = 600, color = C.ink, align = 'left', spacing = 0 } = {}) => {
    if (!draw) return;
    font(size, weight);
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(s, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  };
  const chip = (label, x, y, { bg, color, size = 17, icon = null, align = 'left' }) => {
    font(size, 800);
    const w = ctx.measureText(label).width + 32 + (icon ? 34 : 0);
    const cx = align === 'right' ? x - w : x;
    if (draw) {
      ctx.fillStyle = bg; rr(ctx, cx, y, w, 42, 21); ctx.fill();
      if (icon) ctx.drawImage(icon, cx + 12, y + 8, 26, 26);
    }
    text(label, cx + 16 + (icon ? 34 : 0), y + 28, { size, weight: 800, color });
    return w;
  };
  const cuts = [];

  if (draw) {
    ctx.fillStyle = C.canvas; ctx.fillRect(0, 0, W, m.H);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.12)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#fff'; rr(ctx, X, P, CW, m.H - P * 2, 40); ctx.fill();
    ctx.restore();
  }

  // ---- portada
  const coverH = m.cover ? 300 : 150;
  if (draw) {
    ctx.save(); rr(ctx, X + 10, P + 10, CW - 20, coverH, 32); ctx.clip();
    if (m.cover) drawCover(ctx, m.cover, X + 10, P + 10, CW - 20, coverH);
    else { ctx.fillStyle = C.ink; ctx.fillRect(X + 10, P + 10, CW - 20, coverH); }
    ctx.restore();
  }
  if (draw) { // logo de tukermes.online en una píldora blanca
    const lh = 20, lw = m.logo ? Math.round(lh * 732 / 103) : 0;
    ctx.fillStyle = 'rgba(255,255,255,.94)'; rr(ctx, X + 30, P + 30, lw + 36, 42, 21); ctx.fill();
    if (m.logo) ctx.drawImage(m.logo, X + 48, P + 41, lw, lh);
  }
  chip('TICKET DE RESERVA', X + CW - 30, P + 30, { bg: C.accent, color: C.ink, size: 15, align: 'right' });
  let y = P + 10 + coverH + 58;

  // ---- título y franja de datos
  font(38, 800);
  wrap(ctx, k.title ?? 'Kermés', IW, 2).forEach((l) => { text(l, IX, y, { size: 38, weight: 800 }); y += 46; });
  y += 4;
  const cells = infoCells(k);
  const cw = IW / 3;
  font(21, 700);
  const cellLines = cells.map(([, v]) => wrap(ctx, v, cw - 28, 2));
  const boxH = 64 + Math.max(...cellLines.map((l) => l.length)) * 27;
  if (draw) {
    ctx.fillStyle = C.canvas; rr(ctx, IX, y, IW, boxH, 22); ctx.fill();
    ctx.fillStyle = C.line; ctx.fillRect(IX + cw, y + 18, 2, boxH - 36); ctx.fillRect(IX + cw * 2, y + 18, 2, boxH - 36);
  }
  cells.forEach(([label], i) => {
    const cx = IX + cw * i + 18;
    text(label.toUpperCase(), cx, y + 34, { size: 14, weight: 700, color: C.muted, spacing: 1.2 });
    cellLines[i].forEach((l, j) => text(l, cx, y + 64 + j * 27, { size: 21, weight: 700 }));
  });
  y += boxH + 40; cuts.push(y); y += 58;

  // ---- cliente y pedido
  text('A NOMBRE DE', IX, y, { size: 15, weight: 700, color: C.muted, spacing: 1.2 });
  const [sbg, sfg] = STATUS_COLORS[t.status] ?? STATUS_COLORS.reservada;
  chip(st.label, IX + IW, y - 30, { bg: sbg, color: sfg, size: 17, align: 'right' });
  y += 38;
  font(32, 800);
  wrap(ctx, t.customer_name, IW - 150, 2).forEach((l) => { text(l, IX, y, { size: 32, weight: 800 }); y += 40; });
  y += 18;

  t.items.forEach((it, i) => {
    const th = 72;
    if (draw) {
      ctx.save(); rr(ctx, IX, y, th, th, 18); ctx.clip();
      if (m.thumbs[i]) drawCover(ctx, m.thumbs[i], IX, y, th, th);
      else { ctx.fillStyle = C.accentSoft; ctx.fillRect(IX, y, th, th); }
      ctx.restore();
      // cantidad sobre la foto
      ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(IX + th - 4, y + 6, 18, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    text(String(Number(it.quantity)), IX + th - 4, y + 13, { size: 19, weight: 800, align: 'center' });
    const price = money(it.unit_price * it.quantity);
    font(25, 700); const pw = ctx.measureText(price).width;
    text(price, IX + IW, y + 44, { size: 25, weight: 700, align: 'right' });
    font(25, 700);
    const name = wrap(ctx, it.name, IW - th - 24 - pw - 20, 1)[0];
    text(name, IX + th + 22, y + 32, { size: 25, weight: 700 });
    text(`${Number(it.quantity)} × ${money(it.unit_price)}`, IX + th + 22, y + 60, { size: 18, weight: 500, color: C.muted });
    y += th + 20;
  });

  // banda del total
  y += 6;
  const n = qtyTotal(t);
  if (draw) { ctx.fillStyle = C.canvas; rr(ctx, IX, y, IW, 104, 24); ctx.fill(); }
  text(`TOTAL · ${n} ${n === 1 ? 'PRODUCTO' : 'PRODUCTOS'}`, IX + 24, y + 42, { size: 15, weight: 700, color: C.muted, spacing: 1 });
  text(payLabel(t), IX + 24, y + 74, { size: 21, weight: 700 });
  text(money(t.total), IX + IW - 24, y + 66, { size: 40, weight: 800, align: 'right' });
  y += 104 + 40; cuts.push(y); y += 56;

  // ---- QR enmarcado
  const qs = 340; const qx = (W - qs) / 2;
  if (draw && m.qr) {
    const cell = qs / m.qr.size;
    ctx.fillStyle = C.ink;
    for (let r = 0; r < m.qr.size; r += 1) for (let c = 0; c < m.qr.size; c += 1) {
      if (m.qr.dark(r, c)) ctx.fillRect(Math.floor(qx + c * cell), Math.floor(y + r * cell), Math.ceil(cell), Math.ceil(cell));
    }
    // esquinas naranjas
    const o = 26; const L = 44;
    ctx.strokeStyle = C.accent; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    [[qx - o, y - o, 1, 1], [qx + qs + o, y - o, -1, 1], [qx - o, y + qs + o, 1, -1], [qx + qs + o, y + qs + o, -1, -1]].forEach(([cx, cy, dx, dy]) => {
      ctx.beginPath(); ctx.moveTo(cx, cy + dy * L); ctx.lineTo(cx, cy + dy * 10);
      ctx.quadraticCurveTo(cx, cy, cx + dx * 10, cy); ctx.lineTo(cx + dx * L, cy); ctx.stroke();
    });
    if (t.status !== 'reservada') {
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(qx, y, qs, qs);
      ctx.save(); ctx.translate(W / 2, y + qs / 2); ctx.rotate(-0.21);
      const col = t.status === 'entregada' ? C.ok : C.bad;
      font(52, 800); const sw = ctx.measureText(st.label.toUpperCase()).width + 60;
      ctx.fillStyle = '#fff'; rr(ctx, -sw / 2, -46, sw, 92, 18); ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = col; ctx.stroke();
      ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(st.label.toUpperCase(), 0, 18);
      ctx.restore();
    }
  }
  y += qs + 50;

  // código en píldora
  font(32, 800);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
  const code = formatCode(t.code);
  const cwid = ctx.measureText(code).width + 56;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  if (draw) { ctx.fillStyle = C.canvas; rr(ctx, (W - cwid) / 2, y, cwid, 62, 31); ctx.fill(); }
  text(code, W / 2 + 3, y + 42, { size: 32, weight: 800, align: 'center', spacing: 6 });
  y += 62 + 40;
  font(20, 500);
  wrap(ctx, hintText(t), 470, 3).forEach((l) => { text(l, W / 2, y, { size: 20, weight: 500, color: C.muted, align: 'center' }); y += 28; });
  y += 34;

  // muescas de ticket
  if (draw) {
    cuts.forEach((cy) => {
      ctx.fillStyle = C.canvas;
      ctx.beginPath(); ctx.arc(X, cy, 22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(X + CW, cy, 22, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.line; ctx.lineWidth = 3; ctx.setLineDash([12, 10]); ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(X + 40, cy); ctx.lineTo(X + CW - 40, cy); ctx.stroke(); ctx.setLineDash([]);
    });
  }
  return y + P;
}

export async function ticketCanvas(t) {
  try { await Promise.all([document.fonts.load('800 30px Figtree'), document.fonts.load('700 24px Figtree'), document.fonts.load('500 20px Figtree')]); } catch { /* fuente del sistema */ }
  const [qr, logo, cover, ...thumbs] = await Promise.all([
    qrMatrix(ticketURL(t.code)),
    loadImg('assets/img/logo.svg'),
    loadImg(t.kermes?.cover_image_url),
    ...t.items.map((it) => loadImg(it.image_url)),
  ]);
  const S = 2;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const m = { H: 0, qr, logo, cover, thumbs };
  m.H = paint(ctx, t, m, false);
  canvas.width = 720 * S;
  canvas.height = m.H * S;
  ctx.scale(S, S);
  paint(ctx, t, m, true);
  return canvas;
}

/** Descarga (o comparte, en celular) el ticket como imagen PNG. */
export async function downloadTicket(t) {
  const canvas = await ticketCanvas(t);
  let blob;
  try {
    blob = await new Promise((res, rej) => { try { canvas.toBlob(res, 'image/png'); } catch (e) { rej(e); } });
  } catch {
    // una foto sin permiso CORS "ensució" el canvas: se dibuja sin fotos
    const plain = await ticketCanvas({ ...t, kermes: { ...t.kermes, cover_image_url: null }, items: t.items.map((it) => ({ ...it, image_url: null })) });
    blob = await new Promise((res) => plain.toBlob(res, 'image/png'));
  }
  const name = `ticket-${t.code}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ files: [file], title: 'Ticket de reserva' }); return; } catch (err) { if (err?.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Enlace de WhatsApp para mandarle el ticket al cliente. */
export function whatsappTicketURL(t) {
  let digits = String(t.customer_phone ?? '').replace(/\D/g, '');
  if (digits.length === 8) digits = `591${digits}`; // celular boliviano sin código de país
  const text = encodeURIComponent(`Hola ${t.customer_name}, esta es tu reserva para "${t.kermes?.title ?? 'la kermés'}":\n${t.items.map((it) => `${it.quantity}× ${it.name}`).join('\n')}\n\nMuestra este ticket al recoger tu pedido: ${ticketURL(t.code)}`);
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
}
