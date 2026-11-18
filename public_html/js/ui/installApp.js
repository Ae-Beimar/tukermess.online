// "Descargar la app" (panel, celular): instala tukermes como acceso directo en el inicio.
// Al abrirla desde ahí se ve a pantalla completa, sin la barra del navegador (manifest: display standalone).
//  · Android / Chrome / Edge: usa el aviso de instalación del propio navegador (beforeinstallprompt).
//  · iPhone / iPad (Safari no tiene ese aviso) y otros: muestra los pasos en una hoja.
//  · Si ya se abrió como app, la tarjeta no aparece.
(() => {
  'use strict';
  const card = document.getElementById('install-card');
  const btn = document.getElementById('install-btn');
  const sheet = document.getElementById('install-sheet');
  const steps = document.getElementById('install-steps');
  if (!card || !btn) return;

  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone()) return;

  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isIOSNotSafari = isIOS && /crios|fxios|edgios/i.test(ua);

  let deferred = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  addEventListener('appinstalled', () => { deferred = null; card.remove(); });
  card.classList.remove('hidden');

  const icon = {
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  };
  const step = (ic, html) => `<li><span class="install-step-icon">${ic}</span><span>${html}</span></li>`;

  function showSteps() {
    let list;
    if (isIOSNotSafari) {
      list = [
        step(icon.share, 'Abre esta página en <strong>Safari</strong> (en iPhone solo Safari puede agregarla al inicio).'),
        step(icon.share, 'Toca el botón <strong>Compartir</strong> en la barra de abajo.'),
        step(icon.plus, 'Elige <strong>Agregar a inicio</strong> y toca <strong>Agregar</strong>.'),
      ];
    } else if (isIOS) {
      list = [
        step(icon.share, 'Toca el botón <strong>Compartir</strong> en la barra de Safari.'),
        step(icon.plus, 'Desliza y elige <strong>Agregar a inicio</strong>.'),
        step(icon.check, 'Toca <strong>Agregar</strong>. Ábrela desde tu inicio: se ve a pantalla completa.'),
      ];
    } else {
      list = [
        step(icon.dots, 'Abre el menú <strong>⋮</strong> del navegador.'),
        step(icon.plus, 'Elige <strong>Instalar app</strong> o <strong>Agregar a pantalla de inicio</strong>.'),
        step(icon.check, 'Confirma. Ábrela desde tu inicio: se ve a pantalla completa.'),
      ];
    }
    steps.innerHTML = list.join('');
    if (!sheet.open) sheet.showModal();
  }

  btn.addEventListener('click', async () => {
    if (deferred) {
      const prompt = deferred;
      deferred = null; // el aviso solo se puede usar una vez
      prompt.prompt();
      const { outcome } = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
      if (outcome === 'accepted') card.remove();
      return;
    }
    showSteps();
  });

  sheet?.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('[data-close]')) sheet.close();
  });
})();
