// Comportamiento "fluido" compartido por todas las páginas (skill apple-design · Emil Kowalski).
// Script clásico con `defer`, sin dependencias. Todo es mejora progresiva: si algo falla, la página sigue igual.
//  1. Barras translúcidas: borde/sombra solo cuando hay contenido pasando por debajo (scroll edge).
//  2. Controles segmentados: un "pulgar" que se desliza con resorte hasta la opción elegida.
//  3. Hojas en celular: se arrastran 1:1 con el dedo, con rubber-band hacia arriba,
//     proyección de impulso al soltar y resorte que hereda la velocidad del dedo.
//  4. :active inmediato en iOS (respuesta en pointer-down).
(() => {
  'use strict';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // iOS solo aplica :active si existe algún listener táctil.
  document.addEventListener('touchstart', () => {}, { passive: true });

  /* ---------- 1. Scroll edge ---------- */
  const bars = document.querySelectorAll('.glass-bar');
  if (bars.length) {
    let ticking = false;
    const update = () => {
      ticking = false;
      const scrolled = window.scrollY > 2;
      bars.forEach((b) => b.classList.toggle('is-scrolled', scrolled));
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ---------- 2. Pulgar de los controles segmentados ---------- */
  const lastRect = new WeakMap(); // posición previa por contenedor (el JS de la página a veces re-renderiza los botones)
  const activeOf = (group) =>
    group.querySelector(':scope > button[aria-pressed="true"], :scope > button[aria-selected="true"]');

  function placeThumb(group) {
    if (group.hasAttribute('data-no-thumb')) return;
    const active = activeOf(group);
    let thumb = group.querySelector(':scope > .seg-thumb');
    if (!active) { thumb?.remove(); group.classList.remove('has-thumb'); return; }
    group.classList.add('has-thumb'); // antes de medir: el contenedor pasa a ser el origen (position: relative)
    const rect = { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight };
    if (!rect.w) return; // oculto: lo colocamos cuando se vea
    const isNew = !thumb;
    if (isNew) {
      thumb = document.createElement('span');
      thumb.className = 'seg-thumb no-anim';
      thumb.setAttribute('aria-hidden', 'true');
      group.prepend(thumb);
      group.classList.add('has-thumb');
      const prev = lastRect.get(group);
      if (prev) apply(thumb, prev); // nace donde estaba el anterior → se desliza, no salta
      else apply(thumb, rect);
      thumb.getBoundingClientRect(); // fija el estilo inicial
      thumb.classList.remove('no-anim');
      if (!prev) { lastRect.set(group, rect); return; }
    }
    apply(thumb, rect);
    lastRect.set(group, rect);
  }
  function apply(thumb, r) {
    thumb.style.width = `${r.w}px`;
    thumb.style.height = `${r.h}px`;
    thumb.style.transform = `translate(${r.x}px, ${r.y}px)`;
  }

  const groups = new Set();
  let pending = false;
  function scheduleThumbs() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      document.querySelectorAll('.segmented, .tabs').forEach((g) => { groups.add(g); placeThumb(g); });
    });
  }
  new MutationObserver((records) => {
    for (const r of records) {
      const t = r.target;
      if (r.type === 'attributes' && t.closest?.('.segmented, .tabs')) { scheduleThumbs(); return; }
      if (r.type === 'childList' && (t.matches?.('.segmented, .tabs') || [...r.addedNodes].some((n) => n.nodeType === 1 && (n.matches('.segmented, .tabs') || n.querySelector?.('.segmented, .tabs'))))) { scheduleThumbs(); return; }
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'class'] });
  addEventListener('resize', scheduleThumbs);
  document.fonts?.ready.then(scheduleThumbs);
  scheduleThumbs();

  /* ---------- 3. Hojas que se arrastran ---------- */
  // Resorte (amortiguamiento + respuesta, como en iOS) integrado por cuadro; parte del valor y la velocidad actuales.
  function spring({ from, to, velocity = 0, damping = 1, response = 0.4, onUpdate, onDone }) {
    const w = (2 * Math.PI) / response;
    const k = w * w;
    const c = 2 * damping * w;
    let x = from, v = velocity, last = performance.now(), raf;
    const step = (now) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      // varios sub-pasos para estabilidad
      for (let i = 0; i < 4; i++) {
        const a = -k * (x - to) - c * v;
        v += a * (dt / 4);
        x += v * (dt / 4);
      }
      onUpdate(x, v);
      if (Math.abs(x - to) < 0.3 && Math.abs(v) < 8) { onUpdate(to, 0); onDone?.(); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return { stop: () => cancelAnimationFrame(raf) };
  }
  // Proyección de impulso de Apple (Designing Fluid Interfaces)
  const project = (v, d = 0.998) => ((v / 1000) * d) / (1 - d);
  // Resistencia progresiva al pasar el borde
  const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

  function setupSheet(d) {
    if (d.dataset.fluid) return;
    d.dataset.fluid = '1';
    let y = 0, startY = 0, base = 0, dragging = false, tracking = false, hist = [], anim = null, suppressClick = false;
    const mobile = () => innerWidth < 640;
    const set = (val) => { y = val; d.style.transform = val ? `translateY(${val}px)` : ''; };

    d.addEventListener('pointerdown', (e) => {
      if (!d.open || !mobile() || e.button > 0) return;
      const r = d.getBoundingClientRect();
      // zona de agarre: el tirador y el encabezado; o cualquier parte si el contenido está arriba del todo
      const inHandle = e.clientY - r.top < 72;
      if (!inHandle && d.scrollTop > 0) return;
      if (e.target.closest('input, textarea, select, [contenteditable]')) return;
      anim?.stop(); anim = null; // interrumpible: parte del valor en pantalla
      tracking = true; dragging = false;
      startY = e.clientY; base = y;
      hist = [{ y, t: e.timeStamp }];
    });
    d.addEventListener('pointermove', (e) => {
      if (!tracking) return;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) < 10) return;          // histéresis antes de comprometerse
        if (dy < 0 && base === 0) { tracking = false; return; } // hacia arriba = scroll normal
        dragging = true;
        try { d.setPointerCapture(e.pointerId); } catch { /* puntero ya liberado */ }
        d.classList.add('is-dragging');
        startY = e.clientY - (y - base) ;       // respeta el punto de agarre
      }
      let next = base + (e.clientY - startY);
      if (next < 0) next = -rubberband(-next, d.offsetHeight);
      set(next);
      hist.push({ y: next, t: e.timeStamp });
      while (hist.length > 2 && e.timeStamp - hist[0].t > 100) hist.shift();
      e.preventDefault();
    });
    const release = (e) => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      d.classList.remove('is-dragging');
      const first = hist[0], lastP = hist[hist.length - 1];
      const dt = (lastP.t - first.t) / 1000;
      const v = dt > 0 ? (lastP.y - first.y) / dt : 0; // px/s
      const h = d.offsetHeight;
      const projected = y + project(v);
      // decide por la proyección (y el signo de la velocidad), no solo por la posición
      const dismiss = (projected > h * 0.45 && v > -200) || v > 900;
      d.classList.add('is-dragging'); // el resorte JS manda; CSS no interfiere
      anim = spring({
        from: y, to: dismiss ? h : 0, velocity: v,
        damping: dismiss ? 1 : 0.8, response: 0.3,
        onUpdate: (val) => set(val > h ? h : val),
        onDone: () => {
          anim = null;
          if (dismiss) {
            d.close();
            requestAnimationFrame(() => { set(0); d.classList.remove('is-dragging'); });
          } else { set(0); d.classList.remove('is-dragging'); }
        },
      });
    };
    d.addEventListener('pointerup', release);
    d.addEventListener('pointercancel', release);
    // tras un arrastre no debe dispararse el "clic en el fondo cierra"
    d.addEventListener('click', (e) => { if (suppressClick || y !== 0) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    d.addEventListener('close', () => { anim?.stop(); anim = null; set(0); d.classList.remove('is-dragging'); });
  }
  /* ---------- 5. Aparición al desplazar (.reveal) ---------- */
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('js-reveal');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    reveals.forEach((el) => io.observe(el));
  }

  const initSheets = () => { if (!reduceMotion.matches) document.querySelectorAll('dialog.sheet-dialog').forEach(setupSheet); };
  initSheets();
  new MutationObserver(initSheets).observe(document.body, { childList: true });
})();
