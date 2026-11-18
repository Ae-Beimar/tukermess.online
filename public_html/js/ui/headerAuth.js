// En las páginas públicas: si el organizador ya inició sesión, el botón del header lleva a su panel.
import { getUser } from '../services/authService.js';

export async function syncOrganizerLink() {
  const link = document.getElementById('organizer-link');
  const text = document.getElementById('organizer-link-text');
  if (!link) return;
  try {
    if (await getUser()) {
      link.href = 'panel.html';
      if (text) text.textContent = 'Mi panel';
      link.setAttribute('aria-label', 'Mi panel');
      // El "+" es para publicar; con sesión iniciada el botón lleva al panel
      const icon = document.getElementById('organizer-link-icon');
      if (icon) icon.innerHTML = '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>';
    }
  } catch { /* sin sesión */ }
}
