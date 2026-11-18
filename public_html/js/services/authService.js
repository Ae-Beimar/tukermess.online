// Registro, inicio de sesión y sesión de los organizadores (Supabase Auth).
import { supabase, isSupabaseConfigured } from '../supabaseConfig.js';
import * as demo from './demoBackend.js';

const pageURL = (page) => new URL(page, window.location.href).href;

// Mensajes de Supabase Auth traducidos al español
function friendlyError(error) {
  const msg = String(error?.message ?? error ?? '');
  const map = [
    [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
    [/email not confirmed/i, 'Aún no confirmaste tu correo. Revisa tu bandeja de entrada (y la carpeta de spam).'],
    [/already registered|already exists/i, 'Ya existe una cuenta con ese correo. Intenta iniciar sesión.'],
    [/password should be at least|weak password/i, 'La contraseña es muy débil: usa al menos 8 caracteres.'],
    [/rate limit|too many|security purposes/i, 'Demasiados intentos. Espera unos minutos y vuelve a intentar.'],
    [/unable to validate email|invalid email/i, 'El correo no es válido.'],
    [/same password|different from the old/i, 'La nueva contraseña debe ser distinta de la anterior.'],
    [/failed to fetch|network/i, 'Sin conexión con el servidor. Revisa tu internet.'],
  ];
  const found = map.find(([re]) => re.test(msg));
  return new Error(found ? found[1] : msg || 'Ocurrió un error inesperado.');
}

export async function getUser() {
  if (!isSupabaseConfigured) return demo.getUser();
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export async function signIn(email, password) {
  if (!isSupabaseConfigured) return demo.signIn(email, password);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw friendlyError(error);
  return data.user;
}

/** @returns {{ user, needsConfirmation: boolean }} */
export async function signUp({ email, password, fullName }) {
  if (!isSupabaseConfigured) return demo.signUp({ email, password, fullName });
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },          // lo usa el trigger handle_new_user para crear el perfil
      emailRedirectTo: pageURL('panel.html'), // a dónde vuelve tras confirmar el correo
    },
  });
  if (error) throw friendlyError(error);
  // Supabase no avisa si el correo ya existía (por seguridad): devuelve un usuario sin identidades
  if (data.user && data.user.identities?.length === 0) {
    throw friendlyError('already registered');
  }
  return { user: data.user, needsConfirmation: !data.session };
}

export async function signOut() {
  if (!isSupabaseConfigured) return demo.signOut();
  await supabase.auth.signOut();
}

export async function sendPasswordReset(email) {
  if (!isSupabaseConfigured) return demo.sendPasswordReset(email);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: pageURL('login.html?modo=nueva-clave'),
  });
  if (error) throw friendlyError(error);
}

export async function updatePassword(password) {
  if (!isSupabaseConfigured) return demo.updatePassword(password);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw friendlyError(error);
}

/** cb(event, user). Eventos útiles: SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY. */
export function onAuthChange(cb) {
  if (!isSupabaseConfigured) return demo.onAuthChange(cb);
  const { data } = supabase.auth.onAuthStateChange((event, session) => cb(event, session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

/** Solo permite volver a páginas propias (evita redirecciones abiertas). */
export function safeNext(next) {
  return /^[a-z-]+\.html(\?[\w=&%-]*)?$/i.test(next ?? '') ? next : 'panel.html';
}

/** Para páginas privadas: devuelve el usuario o redirige a login.html?next=... */
export async function requireUser() {
  const user = await getUser();
  if (user) return user;
  const here = window.location.pathname.split('/').pop() + window.location.search;
  window.location.replace(`login.html?next=${encodeURIComponent(here)}`);
  return new Promise(() => {}); // detiene la ejecución de la página mientras redirige
}
