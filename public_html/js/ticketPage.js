// ticket.html?c=<código>: el ticket de reserva que ve el cliente (sin cuenta).
import * as reservations from './services/reservationService.js';
import { ticketHTML, downloadTicket } from './ui/ticket.js';
import { escapeHTML } from './utils/format.js';
import { toast, withBusy } from './ui/feedback.js';

const $ = (id) => document.getElementById(id);
const code = reservations.parseCode(new URLSearchParams(window.location.search).get('c'));
let ticket = null;

function notFound(msg) {
  $('ticket-view').innerHTML = `
    <div class="panel px-6 py-14 text-center">
      <p class="text-lg font-bold">No encontramos este ticket</p>
      <p class="mx-auto mt-1 max-w-xs text-sm text-muted">${escapeHTML(msg)}</p>
      <a href="./" class="btn btn-primary mt-5">Ver kermeses</a>
    </div>`;
  $('ticket-actions').classList.add('hidden');
}

async function load() {
  if (!code) { notFound('Revisa que el enlace esté completo.'); return; }
  try {
    ticket = await reservations.publicTicket(code);
  } catch (err) {
    if (!ticket) notFound(err.message);
    return;
  }
  if (!ticket) { notFound('El código no existe o la reserva se eliminó.'); return; }
  $('ticket-view').innerHTML = `<div class="ticket-wrap !p-0">${await ticketHTML(ticket)}</div>`;
  $('ticket-actions').classList.remove('hidden');
  document.title = `Ticket: ${ticket.kermes?.title ?? 'reserva'} · tukermes`;
}

$('ticket-download').addEventListener('click', (e) => withBusy(e.currentTarget, 'Preparando…', async () => {
  try { await downloadTicket(ticket); } catch (err) { toast(err.message, { type: 'error' }); }
}));
// Si el cliente vuelve a abrir la pestaña, ve si su pedido ya se entregó
document.addEventListener('visibilitychange', () => { if (!document.hidden && ticket) load(); });

load();
