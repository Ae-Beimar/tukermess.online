// Punto de entrada de la página de detalle: evento.html?id=<uuid>
import { fetchKermesById } from './services/kermesService.js';
import { eventDetailHTML } from './ui/eventDetail.js';
import { pinIcon, addTiles } from './ui/map.js';
import { initSiteMenu } from './ui/siteMenu.js';

initSiteMenu();

const root = document.getElementById('event-root');
const notFound = document.getElementById('not-found');
const errorState = document.getElementById('error-state');

function showLocationMap(k) {
  const map = L.map('event-map', { scrollWheelZoom: false, dragging: !L.Browser.mobile })
    .setView([k.latitude, k.longitude], 16);
  addTiles(map);
  L.marker([k.latitude, k.longitude], { icon: pinIcon, title: k.title }).addTo(map);

  // Recentrar cuando el contenedor tenga su tamaño final (Tailwind CDN aplica estilos con retraso)
  new ResizeObserver(() => {
    map.invalidateSize();
    map.setView([k.latitude, k.longitude], map.getZoom(), { animate: false });
  }).observe(document.getElementById('event-map'));
}

// Hay dos botones de compartir (escritorio y celular): mismo comportamiento
function bindShare(k) {
  document.querySelectorAll('[data-share]').forEach((btn) => {
    const label = btn.querySelector('span');
    const original = label.textContent;
    btn.addEventListener('click', async () => {
      const data = { title: k.title, text: `Mira esta kermés: ${k.title}`, url: window.location.href };
      try {
        if (navigator.share) {
          await navigator.share(data);
        } else {
          await navigator.clipboard.writeText(window.location.href);
          label.textContent = 'Enlace copiado';
          setTimeout(() => (label.textContent = original), 2000);
        }
      } catch {
        /* el usuario canceló */
      }
    });
  });
}

async function init() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) {
    root.innerHTML = '';
    notFound.classList.remove('hidden');
    return;
  }

  try {
    const kermes = await fetchKermesById(id);
    if (!kermes) {
      root.innerHTML = '';
      notFound.classList.remove('hidden');
      return;
    }

    document.title = `${kermes.title} · tukermes.online`;
    document.querySelector('meta[name="description"]')
      ?.setAttribute('content', (kermes.description ?? kermes.title).slice(0, 160));

    root.innerHTML = eventDetailHTML(kermes);
    showLocationMap(kermes);
    bindShare(kermes);
  } catch (err) {
    console.error('[tukermes] Error cargando la kermés:', err);
    root.innerHTML = '';
    errorState.classList.remove('hidden');
  }
}

init();
