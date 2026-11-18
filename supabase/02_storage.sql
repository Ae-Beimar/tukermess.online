-- =====================================================================
--  tukermes.online · FASE 1 · Bucket de imágenes + políticas de Storage
--  Alternativa por SQL a crear el bucket desde la interfaz.
--  Pegar en: SQL Editor > New query > Run  (idempotente)
-- =====================================================================

-- Bucket público: cualquiera puede VER las imágenes por su URL pública.
-- Límite 5 MB por archivo y solo JPG / PNG / WEBP.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kermes-images', 'kermes-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Convención de rutas: cada usuario sube SOLO dentro de su carpeta
--   kermes-images/<user_id>/<kermes_id>/portada.webp
--   kermes-images/<user_id>/<kermes_id>/platos/<archivo>.webp
-- (storage.foldername(name))[1] = primera carpeta de la ruta = user_id

drop policy if exists "kermes_images_select_own" on storage.objects;
drop policy if exists "kermes_images_insert_own" on storage.objects;
drop policy if exists "kermes_images_update_own" on storage.objects;
drop policy if exists "kermes_images_delete_own" on storage.objects;

-- Nota: la lectura pública por URL NO necesita política (el bucket es público).
-- Esta política solo permite al dueño listar sus archivos y usar upsert.
create policy "kermes_images_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kermes-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "kermes_images_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kermes-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "kermes_images_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'kermes-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'kermes-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "kermes_images_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'kermes-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
