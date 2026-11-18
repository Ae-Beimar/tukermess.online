// Menú hamburguesa de las páginas públicas (arriba a la derecha).
// La primera opción depende de la sesión: "Publicar una kermés" o, si el organizador ya entró, "Mi panel".
// Nace del botón que lo abre y se cierra por el mismo camino (apple-design §7).
import { getUser } from '../services/authService.js';
import { icons } from '../utils/icons.js';

const item = ({ href, icon, label, hint, primary = false }) => `
  <a href="${href}" class="menu-item site-menu-item${primary ? ' is-primary' : ''}" role="menuitem">
    <span class="site-menu-icon">${icon}</span>
    <span class="min-w-0">
      <span class="block leading-tight">${label}</span>
      ${hint ? `<span class="block text-xs font-normal leading-snug text-muted">${hint}</span>` : ''}
    </span>
  </a>`;

function itemsHTML(user, home) {
  const top = user
    ? [
        item({ href: 'panel.html', icon: icons.grid('h-5 w-5'), label: 'Mi panel', hint: 'Tus kermeses, la caja y las ventas', primary: true }),
        item({ href: 'editar.html', icon: icons.plus('h-5 w-5'), label: 'Publicar una kermés' }),
      ]
    : [
        item({ href: 'editar.html', icon: icons.plus('h-5 w-5'), label: 'Publicar una kermés', hint: 'Gratis: menú, precios, causa y mapa', primary: true }),
        item({ href: 'login.html', icon: icons.user('h-5 w-5'), label: 'Ingresar como organizador' }),
      ];
  return `
    ${top.join('')}
    <div class="menu-sep"></div>
    ${item({ href: `${home}#kermeses`, icon: icons.calendar('h-5 w-5'), label: 'Próximas kermeses' })}
    ${item({ href: `${home}#mapa`, icon: icons.map('h-5 w-5'), label: 'Ver en el mapa' })}
    ${item({ href: 'creditos.html', icon: icons.image('h-5 w-5'), label: 'Créditos de las fotos' })}`;
}

export function initSiteMenu(root = document.getElementById('site-menu')) {
  if (!root) return;
  const onHome = /(^|\/)(index\.html)?$/.test(location.pathname);
  const home = onHome ? '' : './';

  root.innerHTML = `
    <button type="button" class="hamburger" aria-haspopup="menu" aria-expanded="false" aria-controls="site-menu-pop" aria-label="Abrir menú">
      <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
    </button>
    <nav id="site-menu-pop" class="menu-pop site-menu-pop hidden" role="menu" aria-label="Menú">${itemsHTML(null, home)}</nav>`;

  const btn = root.querySelector('.hamburger');
  const pop = root.querySelector('.menu-pop');
  const items = () => [...pop.querySelectorAll('[role="menuitem"]')];

  const setOpen = (open, { focus = false } = {}) => {
    pop.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    if (open) items()[0]?.focus({ preventScroll: true });
    else if (focus) btn.focus();
  };
  const isOpen = () => btn.getAttribute('aria-expanded') === 'true';

  btn.addEventListener('click', () => setOpen(!isOpen()));
  document.addEventListener('pointerdown', (e) => { if (isOpen() && !root.contains(e.target)) setOpen(false); });
  pop.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  root.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    const list = items();
    const i = list.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false, { focus: true }); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
  });
  // Si el foco sale del menú con Tab, se cierra
  root.addEventListener('focusout', (e) => { if (isOpen() && e.relatedTarget && !root.contains(e.relatedTarget)) setOpen(false); });

  getUser().then((user) => {
    if (user) pop.innerHTML = itemsHTML(user, home);
  }).catch(() => { /* sin sesión */ });
}
