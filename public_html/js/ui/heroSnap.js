// Snap solo del primer bloque (hero) de la página de inicio.
//  · Rueda / trackpad: al primer movimiento dentro del hero, la página va directo
//    al final del hero (bajando) o arriba del todo (subiendo). Sin esperar a que pare.
//  · Táctil: al soltar el dedo a medio camino, se acomoda según la dirección.
//  · Teclado / barra de scroll: si el scroll termina a medio camino, se acomoda.
// Pasado el hero el scroll es completamente normal (no hay más puntos de snap).
(() => {
  'use strict';
  const hero = document.querySelector('.home .hero2');
  if (!hero) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const EDGE = 2;          // px de tolerancia en los bordes
  const DURATION = 450;    // ms; rápido pero sin brusquedad
  let lastY = scrollY;
  let dir = 0;             // 1 = bajando, -1 = subiendo
  let anim = 0;            // id de requestAnimationFrame mientras animamos
  let lockUntil = 0;       // tras el snap, absorbe la inercia del trackpad
  let touching = false;

  const header = document.getElementById('site-header');
  // Final del hero = cuánto hay que bajar para que el hero quede justo debajo de la barra fija.
  const heroEnd = () => hero.offsetTop + hero.offsetHeight - (header ? header.offsetHeight : 0);
  // Si el hero no cabe en la pantalla, no forzamos el snap (saltaría contenido no visto).
  const fits = () => heroEnd() <= innerHeight + EDGE;
  const inZone = (y, end) => y > EDGE && y < end - EDGE;

  // Curva tipo "ease-out" fuerte: arranca rápido y frena suave.
  const ease = (t) => 1 - Math.pow(1 - t, 4);

  function snapTo(target) {
    cancelAnimationFrame(anim);
    if (reduceMotion.matches) { scrollTo({ top: target, behavior: 'instant' }); return; }
    const from = scrollY;
    const dist = target - from;
    if (Math.abs(dist) < 1) return;
    const dur = Math.min(DURATION, 220 + Math.abs(dist) * 0.35);
    const t0 = performance.now();
    lockUntil = t0 + dur + 120;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      scrollTo({ top: from + dist * ease(t), behavior: 'instant' });
      if (t < 1) anim = requestAnimationFrame(step);
      else { anim = 0; lastY = scrollY; }
    };
    anim = requestAnimationFrame(step);
  }

  /* ---- Rueda y trackpad: snap inmediato ---- */
  addEventListener('wheel', (e) => {
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // zoom o scroll lateral
    const now = performance.now();
    if (anim && now > lockUntil + 300) { cancelAnimationFrame(anim); anim = 0; } // animación trabada (pestaña en segundo plano)
    if (anim || now < lockUntil) {
      e.preventDefault();
      lockUntil = Math.max(lockUntil, now + 120); // la inercia sigue llegando: la seguimos absorbiendo
      return;
    }
    if (!fits()) return;
    const y = scrollY;
    const end = heroEnd();
    if (e.deltaY > 0 && y < end - EDGE) { e.preventDefault(); snapTo(end); }
    else if (e.deltaY < 0 && y > EDGE && y <= end + EDGE) { e.preventDefault(); snapTo(0); }
  }, { passive: false });

  /* ---- Dirección del scroll (para táctil y teclado) ---- */
  addEventListener('scroll', () => {
    const y = scrollY;
    if (!anim && y !== lastY) dir = y > lastY ? 1 : -1;
    lastY = y;
  }, { passive: true });

  function settle() {
    if (anim && performance.now() > lockUntil + 300) { cancelAnimationFrame(anim); anim = 0; }
    if (anim || touching || !fits()) return;
    const end = heroEnd();
    if (inZone(scrollY, end)) snapTo(dir < 0 ? 0 : end);
  }

  /* ---- Táctil: al soltar el dedo, sin esperar a que termine la inercia ---- */
  addEventListener('touchstart', () => { touching = true; cancelAnimationFrame(anim); anim = 0; }, { passive: true });
  addEventListener('touchend', () => { touching = false; requestAnimationFrame(settle); }, { passive: true });

  /* ---- Teclado, barra de scroll, etc. ---- */
  if ('onscrollend' in window) addEventListener('scrollend', settle);
  else {
    let timer = 0;
    addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(settle, 100); }, { passive: true });
  }

  /* ---- Indicador "bajar" del hero ---- */
  document.querySelector('[data-hero-cue]')?.addEventListener('click', (e) => {
    if (!fits()) return;
    e.preventDefault();
    snapTo(heroEnd());
  });

  // El indicador se desvanece en cuanto se empieza a bajar.
  const cue = document.querySelector('[data-hero-cue]');
  if (cue) addEventListener('scroll', () => { cue.style.opacity = scrollY > 40 ? '0' : ''; }, { passive: true });
})();
