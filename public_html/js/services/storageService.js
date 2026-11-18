// Imágenes: compresión en el navegador + subida a Supabase Storage.
import { supabase, isSupabaseConfigured, APP_CONFIG } from '../supabaseConfig.js';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_INPUT_MB = 15;

/**
 * Reduce y convierte la imagen a WebP (o JPEG si el navegador no sabe hacer WebP).
 * Una foto de celular de 4 MB suele quedar en ~150-300 KB.
 */
export async function compressImage(file, { maxSize = 1600, quality = 0.82 } = {}) {
  if (!ACCEPTED.includes(file.type)) throw new Error('Formato no permitido. Usa JPG, PNG o WEBP.');
  if (file.size > MAX_INPUT_MB * 1024 * 1024) throw new Error(`La imagen pesa más de ${MAX_INPUT_MB} MB.`);

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const toBlob = (type) => new Promise((r) => canvas.toBlob(r, type, quality));
  let blob = await toBlob('image/webp');
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg');
  return blob;
}

const extFor = (blob) => (blob.type === 'image/webp' ? 'webp' : 'jpg');

/** Ruta dentro del bucket. La primera carpeta DEBE ser el id del usuario (lo exige la política de Storage). */
export function imagePath(uid, kermesId, kind, blob) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${uid}/${kermesId}/${kind}-${Date.now()}-${rand}.${extFor(blob)}`;
}

/** Ruta de la foto de perfil: <user_id>/avatar-<fecha>.webp (nombre nuevo cada vez para no ver la foto vieja en caché). */
export function avatarPath(uid, blob) {
  return `${uid}/avatar-${Date.now()}.${extFor(blob)}`;
}

/** Borra una imagen propia del bucket a partir de su URL pública. Si falla, no pasa nada. */
export async function removeImageByUrl(url) {
  if (!isSupabaseConfigured || !url) return;
  const marker = `/object/public/${APP_CONFIG.storageBucket}/`;
  const i = url.indexOf(marker);
  if (i < 0) return;
  await supabase.storage.from(APP_CONFIG.storageBucket).remove([decodeURIComponent(url.slice(i + marker.length))]).catch(() => {});
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Sube la imagen y devuelve su URL pública. */
export async function uploadImage(blob, path) {
  if (!isSupabaseConfigured) return blobToDataURL(blob); // demo: se guarda dentro del navegador

  const bucket = supabase.storage.from(APP_CONFIG.storageBucket);
  const { error } = await bucket.upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);
  return bucket.getPublicUrl(path).data.publicUrl;
}
