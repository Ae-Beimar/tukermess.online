-- =====================================================================
--  tukermes.online · FASE 1 · Esquema de base de datos + RLS
--  Pegar completo en: Supabase Dashboard > SQL Editor > New query > Run
--  Es idempotente: puedes ejecutarlo más de una vez sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tipo ENUM para el estado de una kermés
-- ---------------------------------------------------------------------
do $$
begin
  create type public.kermes_status as enum ('borrador', 'publicada', 'finalizada');
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 2. Tabla PROFILES (1 a 1 con auth.users)
--    No guardamos teléfono aquí porque esta tabla es de lectura pública;
--    el WhatsApp de contacto vive en cada kermés.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  full_name         text check (char_length(full_name) <= 100),
  organization_name text check (char_length(organization_name) <= 120),
  avatar_url        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is 'Perfil público de cada organizador (1 a 1 con auth.users).';

-- ---------------------------------------------------------------------
-- 3. Tabla KERMESES
-- ---------------------------------------------------------------------
create table if not exists public.kermeses (
  id              uuid primary key default gen_random_uuid(),
  organizer_id    uuid not null default auth.uid()
                    references public.profiles (id) on delete cascade,
  title           text not null check (char_length(title) between 3 and 120),
  description     text check (char_length(description) <= 4000),   -- historia / motivo solidario
  event_date      date not null,
  start_time      time not null,
  end_time        time,
  address         text not null check (char_length(address) <= 200),
  zone            text not null check (char_length(zone) <= 80),    -- distrito / barrio
  latitude        double precision not null check (latitude  between -90  and 90),
  longitude       double precision not null check (longitude between -180 and 180),
  cover_image_url text,
  whatsapp        text check (whatsapp ~ '^[0-9]{8,15}$'),          -- solo dígitos con código de país, ej. 59171234567
  status          public.kermes_status not null default 'borrador',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.kermeses is 'Eventos publicados por los organizadores.';

create index if not exists kermeses_status_date_idx on public.kermeses (status, event_date);
create index if not exists kermeses_organizer_idx   on public.kermeses (organizer_id);

-- ---------------------------------------------------------------------
-- 4. Tabla MENU_ITEMS (platos de cada kermés)
-- ---------------------------------------------------------------------
create table if not exists public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  kermes_id   uuid not null references public.kermeses (id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 300),
  price       numeric(10, 2) not null check (price >= 0),
  image_url   text,
  is_featured boolean not null default false,   -- se muestra en la tarjeta del muro
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.menu_items is 'Platos del menú de cada kermés.';

create index if not exists menu_items_kermes_idx on public.menu_items (kermes_id, sort_order);

-- ---------------------------------------------------------------------
-- 5. Trigger genérico para updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at   on public.profiles;
drop trigger if exists kermeses_set_updated_at   on public.kermeses;
drop trigger if exists menu_items_set_updated_at on public.menu_items;

create trigger profiles_set_updated_at   before update on public.profiles   for each row execute function public.set_updated_at();
create trigger kermeses_set_updated_at   before update on public.kermeses   for each row execute function public.set_updated_at();
create trigger menu_items_set_updated_at before update on public.menu_items for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 6. Crear el perfil automáticamente cuando alguien se registra
--    (lee "full_name" de options.data en supabase.auth.signUp)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Perfiles para usuarios que ya existían antes de correr este script
insert into public.profiles (id, full_name)
select u.id, split_part(u.email, '@', 1)
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 7. Permisos de la API (las políticas RLS de abajo filtran las filas)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select                 on public.profiles, public.kermeses, public.menu_items to anon, authenticated;
grant insert, update         on public.profiles                                     to authenticated;
grant insert, update, delete on public.kermeses, public.menu_items                  to authenticated;

-- ---------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles   enable row level security;
alter table public.kermeses   enable row level security;
alter table public.menu_items enable row level security;

-- ---------- PROFILES ----------
drop policy if exists "profiles_select_public" on public.profiles;
drop policy if exists "profiles_insert_own"    on public.profiles;
drop policy if exists "profiles_update_own"    on public.profiles;

-- Cualquiera puede ver el nombre del organizador
create policy "profiles_select_public" on public.profiles
  for select to anon, authenticated
  using (true);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using      ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------- KERMESES ----------
drop policy if exists "kermeses_select_published_or_own" on public.kermeses;
drop policy if exists "kermeses_insert_own"              on public.kermeses;
drop policy if exists "kermeses_update_own"              on public.kermeses;
drop policy if exists "kermeses_delete_own"              on public.kermeses;

-- Visitantes ven solo las publicadas; el dueño ve todas las suyas (borradores incluidos)
create policy "kermeses_select_published_or_own" on public.kermeses
  for select to anon, authenticated
  using (
    status = 'publicada'
    or organizer_id = (select auth.uid())
  );

create policy "kermeses_insert_own" on public.kermeses
  for insert to authenticated
  with check (organizer_id = (select auth.uid()));

create policy "kermeses_update_own" on public.kermeses
  for update to authenticated
  using      (organizer_id = (select auth.uid()))
  with check (organizer_id = (select auth.uid()));   -- impide "regalar" la kermés a otro usuario

create policy "kermeses_delete_own" on public.kermeses
  for delete to authenticated
  using (organizer_id = (select auth.uid()));

-- ---------- MENU_ITEMS ----------
drop policy if exists "menu_items_select_visible" on public.menu_items;
drop policy if exists "menu_items_insert_own"     on public.menu_items;
drop policy if exists "menu_items_update_own"     on public.menu_items;
drop policy if exists "menu_items_delete_own"     on public.menu_items;

-- Un plato es visible si su kermés es visible (publicada o propia)
create policy "menu_items_select_visible" on public.menu_items
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.kermeses k
      where k.id = menu_items.kermes_id
        and (k.status = 'publicada' or k.organizer_id = (select auth.uid()))
    )
  );

create policy "menu_items_insert_own" on public.menu_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.kermeses k
      where k.id = menu_items.kermes_id
        and k.organizer_id = (select auth.uid())
    )
  );

create policy "menu_items_update_own" on public.menu_items
  for update to authenticated
  using (
    exists (
      select 1 from public.kermeses k
      where k.id = menu_items.kermes_id
        and k.organizer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.kermeses k
      where k.id = menu_items.kermes_id
        and k.organizer_id = (select auth.uid())
    )
  );

create policy "menu_items_delete_own" on public.menu_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.kermeses k
      where k.id = menu_items.kermes_id
        and k.organizer_id = (select auth.uid())
    )
  );

-- ✅ Listo. Revisa en Table Editor que aparezcan profiles, kermeses y menu_items
--    con la etiqueta "RLS enabled".
