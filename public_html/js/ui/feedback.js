// Avisos flotantes (toast) y diálogo de confirmación reutilizables.
import { escapeHTML } from '../utils/format.js';

let wrap;

export function toast(message, { type = 'ok', ms = 3200 } = {}) {
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    document.body.append(wrap);
  }
  const el = document.createElement('div');
  // ok = verde (salió bien), error = rojo, warn = ámbar (aviso), info = neutro
  el.className = `toast ${type === 'error' ? 'error' : type === 'ok' ? 'ok' : type === 'warn' ? 'warn' : ''}`;
  el.textContent = message;
  wrap.append(el);
  // Sale por el mismo camino por el que entró (apple-design §7)
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 260);
  }, ms);
}

/** Muestra un diálogo y resuelve true/false. */
export function confirmDialog({ title, message, confirmText = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog';
    dialog.innerHTML = `
      <form method="dialog" class="p-6">
        <h2 class="text-lg font-bold tracking-tight">${escapeHTML(title)}</h2>
        <p class="mt-2 text-sm leading-relaxed text-muted">${escapeHTML(message)}</p>
        <div class="mt-6 flex justify-end gap-2">
          <button value="cancel" class="btn btn-soft">Cancelar</button>
          <button value="ok" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${escapeHTML(confirmText)}</button>
        </div>
      </form>`;
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok');
      // se quita después de su animación de salida
      setTimeout(() => dialog.remove(), 600);
    });
    dialog.showModal();
  });
}

/** Pone un botón en estado "cargando" mientras corre fn. */
export async function withBusy(button, label, fn) {
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = label;
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}
