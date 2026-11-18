// login.html: ingresar, crear cuenta, recuperar y cambiar contraseña.
import { isSupabaseConfigured } from './supabaseConfig.js';
import {
  getUser, signIn, signUp, sendPasswordReset, updatePassword, onAuthChange, safeNext,
} from './services/authService.js';
import { withBusy } from './ui/feedback.js';

const params = new URLSearchParams(window.location.search);
const next = safeNext(params.get('next'));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const forms = {
  login: document.getElementById('form-login'),
  signup: document.getElementById('form-signup'),
  forgot: document.getElementById('form-forgot'),
  newpass: document.getElementById('form-newpass'),
};
const tabs = document.getElementById('tabs');
const msg = document.getElementById('msg');

function show(view) {
  Object.entries(forms).forEach(([name, form]) => form.classList.toggle('hidden', name !== view));
  tabs.classList.toggle('hidden', view === 'forgot' || view === 'newpass');
  tabs.querySelectorAll('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === view)));
  hideMessage();
  forms[view].querySelector('input')?.focus();
}

function message(text, type = 'error') {
  msg.textContent = text;
  msg.className = `note mb-5 !font-semibold ${type === 'error' ? 'note-bad' : 'note-ok'}`;
}

function hideMessage() {
  msg.className = 'hidden';
}

const value = (form, name) => form.elements[name].value.trim();

// ------------------------------------------------------------------
tabs.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) show(tab.dataset.tab);
});

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) show(go.dataset.go);
});

forms.login.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = value(forms.login, 'email');
  const password = forms.login.elements.password.value;
  if (!EMAIL_RE.test(email) || !password) return message('Escribe tu correo y tu contraseña.');

  await withBusy(e.submitter, 'Ingresando…', async () => {
    try {
      await signIn(email, password);
      window.location.replace(next);
    } catch (err) {
      message(err.message);
    }
  });
});

forms.signup.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fullName = value(forms.signup, 'name');
  const email = value(forms.signup, 'email');
  const password = forms.signup.elements.password.value;

  if (fullName.length < 2) return message('Escribe tu nombre.');
  if (!EMAIL_RE.test(email)) return message('El correo no es válido.');
  if (password.length < 8) return message('La contraseña debe tener al menos 8 caracteres.');

  await withBusy(e.submitter, 'Creando cuenta…', async () => {
    try {
      const { needsConfirmation } = await signUp({ email, password, fullName });
      if (needsConfirmation) {
        forms.signup.reset();
        message(`¡Listo! Te enviamos un correo a ${email}. Ábrelo y confirma tu cuenta para entrar a tu panel.`, 'ok');
      } else {
        window.location.replace(next);
      }
    } catch (err) {
      message(err.message);
    }
  });
});

forms.forgot.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = value(forms.forgot, 'email');
  if (!EMAIL_RE.test(email)) return message('El correo no es válido.');

  await withBusy(e.submitter, 'Enviando…', async () => {
    try {
      await sendPasswordReset(email);
      message('Si ese correo tiene cuenta, te llegará un enlace para crear una nueva contraseña.', 'ok');
    } catch (err) {
      message(err.message);
    }
  });
});

forms.newpass.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = forms.newpass.elements.password.value;
  if (password.length < 8) return message('La contraseña debe tener al menos 8 caracteres.');

  await withBusy(e.submitter, 'Guardando…', async () => {
    try {
      await updatePassword(password);
      message('Contraseña actualizada. Te llevamos a tu panel…', 'ok');
      setTimeout(() => window.location.replace('panel.html'), 1200);
    } catch (err) {
      message(err.message);
    }
  });
});

// ------------------------------------------------------------------
async function init() {
  document.getElementById('demo-note').classList.toggle('hidden', isSupabaseConfigured);

  const recovering = params.get('modo') === 'nueva-clave';
  onAuthChange((event) => {
    if (event === 'PASSWORD_RECOVERY') show('newpass');
  });

  if (recovering) {
    show('newpass');
    return;
  }

  // Si ya hay sesión, no tiene sentido mostrar el login
  if (await getUser()) {
    window.location.replace(next);
    return;
  }

  show(params.get('modo') === 'registro' ? 'signup' : 'login');
}

init();
