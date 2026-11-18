// panel.html: lista de kermeses del organizador, cambios de estado y perfil.
import { isSupabaseConfigured } from './supabaseConfig.js';
import { requireUser, signOut } from './services/authService.js';
import {
  getProfile, updateProfile, updateAvatar, listMyKermeses, setStatus, deleteKermes,
} from './services/organizerService.js';
import {
  escapeHTML, safeURL, formatShortDate, formatTime, eventURL, toISODate, PLACEHOLDER_IMG,
} from './utils/format.js';
import { toast, confirmDialog, withBusy } from './ui/feedback.js';
import { compressImage, uploadImage, avatarPath, removeImageByUrl } from './services/storageService.js';
import { icons } from './utils/icons.js';

const STATUS_LABEL = { borrador: 'Borrador', publicada: 'Publicada', finalizada: 'Finalizada' };

const els = {
  list: document.getElementById('my-list'),
  empty: document.getElementById('empty'),
  emptyFilter: document.getElementById('empty-filter'),
  filter: document.getElementById('status-filter'),
  profile: document.getElementById('profile-form'),
};

const state = { user: null, profile: null, kermeses: [], status: '' };

const STATUS_HELP = {
  '': 'Toca "Gestionar kermés" para vender, reservar, entregar y ver lo recaudado. En los tres puntos la editas, publicas o eliminas.',
  publicada: 'Se ven en el muro y en el mapa.',
  borrador: 'Solo tú las ves. Publícalas cuando estén listas.',
  finalizada: 'Ya pasaron. Salen del muro, pero conservas sus ventas.',
};

function menuItem(label, icon, attrs, danger = false) {
  return `<button type="button" class="menu-item ${danger ? 'is-danger' : ''}" role="menuitem" ${attrs}>${icon}${label}</button>`;
}

function rowHTML(k) {
  const img = safeURL(k.cover_image_url) || PLACEHOLDER_IMG;
  const past = k.event_date < toISODate(new Date());
  const id = escapeHTML(k.id);
  const enc = encodeURIComponent(k.id);
  const act = (a) => `data-action="${a}" data-id="${id}"`;

  // El panel solo administra la kermés; vender, reservar y entregar viven en "Gestionar"
  const more = [
    `<a href="editar.html?id=${enc}" class="menu-item" role="menuitem">${icons.edit('h-5 w-5')}Editar</a>`,
    k.status === 'publicada' ? `<a href="${escapeHTML(eventURL(k.id))}" class="menu-item" role="menuitem">${icons.eye('h-5 w-5')}Ver en el muro</a>` : '',
    k.status === 'borrador' ? menuItem('Publicar', icons.eye('h-5 w-5'), act('publish')) : '',
    k.status === 'publicada' ? menuItem('Pasar a borrador', icons.eyeOff('h-5 w-5'), act('unpublish')) : '',
    k.status !== 'finalizada' ? menuItem('Marcar finalizada', icons.checkCircle('h-5 w-5'), act('finish')) : '',
    k.status === 'finalizada' ? menuItem('Reabrir como borrador', icons.rotate('h-5 w-5'), act('reopen')) : '',
    '<div class="menu-sep"></div>',
    menuItem('Eliminar', icons.trash('h-5 w-5'), act('delete'), true),
  ].join('');

  return `
    <li class="kermes-card relative">
      <div class="card-more">
        <button type="button" class="icon-btn !h-10 !w-10" data-more aria-haspopup="true" aria-expanded="false" aria-label="Más opciones de ${escapeHTML(k.title)}">${icons.dots('h-5 w-5')}</button>
        <div class="menu-pop card-menu hidden" role="menu">${more}</div>
      </div>
      <a href="gestionar.html?id=${enc}" class="photo block" tabindex="-1" aria-hidden="true">
        <img src="${escapeHTML(img)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'">
        <span class="status status-${escapeHTML(k.status)} absolute left-3 top-3 !bg-white">${STATUS_LABEL[k.status] ?? k.status}</span>
      </a>
      <div class="flex flex-1 flex-col px-2.5 pb-1.5 pt-3.5">
        <h3 class="line-clamp-2 text-[17px] font-bold leading-snug">${escapeHTML(k.title)}</h3>
        <p class="num mt-1.5 flex items-center gap-1.5 text-sm text-muted">${icons.calendar('h-4 w-4')}${escapeHTML(formatShortDate(k.event_date))}, ${escapeHTML(formatTime(k.start_time))}</p>
        <p class="mt-1 flex items-center gap-1.5 text-sm text-muted">${icons.pin('h-4 w-4')}${escapeHTML(k.zone)}</p>
        <p class="mt-1 flex items-center gap-1.5 text-sm text-muted">${icons.dish('h-4 w-4')}${k.menu_count} ${k.menu_count === 1 ? 'producto' : 'productos'} en el menú</p>
        ${past && k.status === 'publicada' ? '<p class="note note-warn mt-3 !py-2 text-xs">La fecha ya pasó: márcala como finalizada en los tres puntos.</p>' : ''}

        <div class="mt-auto pt-4">
          <a href="gestionar.html?id=${enc}" class="btn btn-dark !h-12 w-full justify-between !pl-5 !pr-2">
            <span class="flex items-center gap-2">${icons.grid('h-5 w-5')} Gestionar kermés</span>
            <span class="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">${icons.arrowRight('h-4 w-4')}</span>
          </a>
        </div>
      </div>
    </li>`;
}

function render() {
  const visible = state.status ? state.kermeses.filter((k) => k.status === state.status) : state.kermeses;
  els.list.innerHTML = visible.map(rowHTML).join('');
  els.empty.classList.toggle('hidden', state.kermeses.length > 0);
  els.emptyFilter.classList.toggle('hidden', !(state.kermeses.length > 0 && visible.length === 0));
  document.getElementById('status-help').textContent = state.kermeses.length ? STATUS_HELP[state.status] : '';

  const count = (st) => (st ? state.kermeses.filter((k) => k.status === st).length : state.kermeses.length);
  els.filter.querySelectorAll('[data-count]').forEach((el) => (el.textContent = count(el.dataset.count)));
  const pub = count('publicada');
  document.getElementById('greet-sub').textContent = !state.kermeses.length
    ? 'Crea tu primera kermés: te toma unos minutos.'
    : pub ? `Tienes ${pub} ${pub === 1 ? 'kermés' : 'kermeses'} en el muro. ¡A vender!` : 'Ninguna kermés publicada todavía. Publica un borrador cuando esté listo.';
  document.getElementById('pv-count').textContent = state.kermeses.length;
}

async function reload() {
  state.kermeses = await listMyKermeses(state.user.id);
  render();
}

const byId = (id) => state.kermeses.find((k) => k.id === id);

async function handleAction(action, id, button) {
  const k = byId(id);
  if (!k) return;

  if (action === 'publish' && k.menu_count === 0) {
    toast('Agrega al menos un plato antes de publicar.', { type: 'error' });
    window.location.href = `editar.html?id=${encodeURIComponent(id)}#menu`;
    return;
  }

  if (action === 'delete') {
    const ok = await confirmDialog({
      title: '¿Eliminar esta kermés?',
      message: `"${k.title}" y todo su menú se borrarán para siempre. Esta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      danger: true,
    });
    if (!ok) return;
  }

  const next = { publish: 'publicada', unpublish: 'borrador', finish: 'finalizada', reopen: 'borrador' }[action];
  const done = {
    publish: '¡Publicada! Ya aparece en el muro.',
    unpublish: 'Pasó a borrador. Ya no se ve en el muro.',
    finish: 'Marcada como finalizada.',
    reopen: 'Reabierta como borrador.',
    delete: 'Kermés eliminada.',
  }[action];

  await withBusy(button, '…', async () => {
    try {
      if (action === 'delete') await deleteKermes(id, state.user.id);
      else await setStatus(id, state.user.id, next);
      toast(done);
      await reload();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  });
}

function filterBy(status) {
  state.status = status;
  els.filter.querySelectorAll('[data-status]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.status === status)));
  render();
}

// ---------- Menús desplegables (cuenta y "Más" de cada tarjeta) ----------
let openMenu = null;
function closeMenu({ focus = false } = {}) {
  if (!openMenu) return;
  openMenu.pop.classList.add('hidden');
  openMenu.btn.setAttribute('aria-expanded', 'false');
  openMenu.btn.parentElement.classList.remove('is-open');
  if (focus) openMenu.btn.focus();
  openMenu = null;
}
function toggleMenu(btn, pop) {
  const same = openMenu?.btn === btn;
  closeMenu();
  if (same) return;
  pop.classList.remove('hidden');
  btn.setAttribute('aria-expanded', 'true');
  btn.parentElement.classList.add('is-open');
  openMenu = { btn, pop };
  pop.querySelector('.menu-item')?.focus();
}

// ---------- Perfil ----------
const sheet = document.getElementById('profile-sheet');
function openProfile(mode) {
  closeMenu();
  const editing = mode === 'edit';
  document.getElementById('profile-view').classList.toggle('hidden', editing);
  els.profile.classList.toggle('hidden', !editing);
  document.getElementById('profile-title').textContent = editing ? 'Editar perfil' : 'Mi perfil';
  if (editing) {
    els.profile.elements.full_name.value = state.profile?.full_name ?? '';
    els.profile.elements.organization_name.value = state.profile?.organization_name ?? '';
  }
  if (!sheet.open) sheet.showModal();
  if (editing) els.profile.elements.full_name.focus();
}

function bindEvents() {
  els.list.addEventListener('click', (e) => {
    const more = e.target.closest('[data-more]');
    if (more) { toggleMenu(more, more.nextElementSibling); return; }
    const btn = e.target.closest('[data-action]');
    if (btn) { closeMenu(); handleAction(btn.dataset.action, btn.dataset.id, btn); }
  });

  els.filter.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-status]');
    if (btn) filterBy(btn.dataset.status);
  });

  const menuBtn = document.getElementById('menu-btn');
  menuBtn.addEventListener('click', () => toggleMenu(menuBtn, document.getElementById('menu-pop')));
  document.addEventListener('click', (e) => {
    if (openMenu && !openMenu.pop.contains(e.target) && !openMenu.btn.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu({ focus: true });
    if (openMenu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const items = [...openMenu.pop.querySelectorAll('.menu-item')];
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  });

  document.addEventListener('click', (e) => {
    const m = e.target.closest('[data-menu]');
    if (m) openProfile(m.dataset.menu === 'edit-profile' ? 'edit' : 'view');
  });
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('[data-close]')) sheet.close();
  });

  els.profile.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      full_name: els.profile.elements.full_name.value.trim(),
      organization_name: els.profile.elements.organization_name.value.trim(),
    };
    if (!data.full_name) {
      els.profile.elements.full_name.setAttribute('aria-invalid', 'true');
      toast('Escribe tu nombre.', { type: 'error' });
      return;
    }
    els.profile.elements.full_name.removeAttribute('aria-invalid');
    await withBusy(e.submitter, 'Guardando…', async () => {
      try {
        await updateProfile(state.user.id, data);
        state.profile = { ...state.profile, ...data };
        showProfile();
        toast('Perfil guardado.');
        openProfile('view');
      } catch (err) {
        toast(err.message, { type: 'error' });
      }
    });
  });

  // ---------- Foto de perfil ----------
  const avatarInput = document.getElementById('avatar-input');
  const avatarLabel = document.getElementById('avatar-label');
  document.getElementById('avatar-change').addEventListener('click', () => avatarInput.click());

  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    avatarInput.value = '';
    if (!file) return;
    const old = state.profile?.avatar_url;
    avatarLabel.setAttribute('aria-busy', 'true');
    try {
      const blob = await compressImage(file, { maxSize: 400, quality: 0.85 });
      const url = await uploadImage(blob, avatarPath(state.user.id, blob));
      await updateAvatar(state.user.id, url);
      state.profile = { ...state.profile, avatar_url: url };
      showProfile();
      toast('Foto actualizada.');
      removeImageByUrl(old);
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      avatarLabel.removeAttribute('aria-busy');
    }
  });

  document.getElementById('avatar-remove').addEventListener('click', async (e) => {
    const old = state.profile?.avatar_url;
    if (!old) return;
    await withBusy(e.currentTarget, 'Quitando…', async () => {
      try {
        await updateAvatar(state.user.id, null);
        state.profile = { ...state.profile, avatar_url: null };
        showProfile();
        toast('Foto quitada.');
        removeImageByUrl(old);
      } catch (err) {
        toast(err.message, { type: 'error' });
      }
    });
  });

  document.getElementById('logout').addEventListener('click', async () => {
    await signOut();
    window.location.replace('./');
  });
}

function showProfile() {
  const p = state.profile ?? {};
  const display = p.full_name || state.user.email;
  const initial = display.charAt(0).toUpperCase();
  const publicName = p.organization_name || p.full_name || 'sin nombre todavía';
  document.getElementById('greet-name').textContent = display.split(' ')[0];
  ['user-initial', 'menu-initial', 'profile-initial'].forEach((x) => {
    const el = document.getElementById(x);
    if (p.avatar_url) {
      const img = document.createElement('img');
      img.src = p.avatar_url;
      img.alt = '';
      el.replaceChildren(img);
    } else {
      el.textContent = initial;
    }
  });
  document.getElementById('avatar-change').textContent = p.avatar_url ? 'Cambiar foto' : 'Subir foto';
  document.getElementById('avatar-remove').classList.toggle('hidden', !p.avatar_url);
  const pubImg = document.getElementById('pv-public-img');
  pubImg.classList.toggle('hidden', !p.avatar_url);
  document.getElementById('pv-public-icon').classList.toggle('hidden', !!p.avatar_url);
  if (p.avatar_url) pubImg.src = p.avatar_url;
  document.getElementById('menu-name').textContent = display;
  document.getElementById('menu-email').textContent = state.user.email ?? '';
  document.getElementById('profile-display').textContent = display;
  document.getElementById('profile-email').textContent = state.user.email ?? '';
  document.getElementById('pv-name').textContent = p.full_name || 'Sin completar';
  document.getElementById('pv-org').textContent = p.organization_name || 'Sin completar';
  document.getElementById('pv-public').textContent = publicName;
  document.getElementById('menu-btn').setAttribute('aria-label', `Abrir menú de ${display}`);
}

// Guarda la caja en el celular para abrirla sin señal (requiere https o localhost)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function init() {
  document.getElementById('demo-banner').classList.toggle('hidden', isSupabaseConfigured);
  state.user = await requireUser();
  bindEvents();

  // Mensaje que dejó el editor al publicar
  try {
    const flash = sessionStorage.getItem('tk_flash');
    if (flash) { sessionStorage.removeItem('tk_flash'); toast(flash); }
  } catch { /* nada */ }

  try {
    const [profile] = await Promise.all([getProfile(state.user.id), reload()]);
    state.profile = profile ?? {};
    showProfile();
  } catch (err) {
    els.list.innerHTML = '';
    toast(`No pudimos cargar tus datos: ${err.message}`, { type: 'error', ms: 6000 });
  }
}

init();
