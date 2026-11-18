-- =====================================================================
--  tukermes.online · FASE 3 · Ventas durante la kermés (caja)
--  - Categorías y porciones disponibles en los platos
--  - Rifa con boletos numerados
--  - Ventas (efectivo / QR) registradas desde varios celulares
--  Pegar en: SQL Editor > New query > Run   (idempotente; requiere 01_schema.sql)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Platos: categoría y porciones iniciales
-- ---------------------------------------------------------------------
alter table public.menu_items
  add column if not exists category text not null default 'comida',
  add column if not exists stock integer;            -- porciones al iniciar; null = sin límite

do $$ begin
  alter table public.menu_items add constraint menu_items_category_check
    check (category in ('comida', 'bebida', 'otro'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.menu_items add constraint menu_items_stock_check check (stock is null or stock >= 0);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Kermés: configuración de la rifa
-- ---------------------------------------------------------------------
alter table public.kermeses
  add column if not exists raffle_enabled boolean not null default false,
  add column if not exists raffle_price   numeric(10, 2),
  add column if not exists raffle_total   integer,          -- cantidad de números (1..N)
  add column if not exists raffle_prize   text;

do $$ begin
  alter table public.kermeses add constraint kermeses_raffle_check check (
    not raffle_enabled
    or (raffle_price >= 0 and raffle_total between 1 and 5000)
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 3. Ventas
--    El id lo genera el celular: así una venta hecha sin internet se
--    puede reenviar varias veces sin duplicarse.
-- ---------------------------------------------------------------------
create table if not exists public.sales (
  id             uuid primary key,
  kermes_id      uuid not null references public.kermeses (id) on delete cascade,
  payment_method text not null check (payment_method in ('efectivo', 'qr')),
  total          numeric(10, 2) not null check (total >= 0),
  device         text check (char_length(device) <= 40),   -- nombre del celular/caja (opcional)
  voided         boolean not null default false,           -- venta anulada
  sold_at        timestamptz not null default now(),       -- hora del celular al vender
  created_at     timestamptz not null default now()        -- hora en que llegó al servidor
);

create index if not exists sales_kermes_idx on public.sales (kermes_id, sold_at desc);

create table if not exists public.sale_items (
  id           uuid primary key,
  sale_id      uuid not null references public.sales (id) on delete cascade,
  kermes_id    uuid not null references public.kermeses (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  kind         text not null check (kind in ('plato', 'rifa')),
  name         text not null,                               -- copia del nombre al vender
  unit_price   numeric(10, 2) not null check (unit_price >= 0),
  quantity     integer not null check (quantity > 0)
);

create index if not exists sale_items_kermes_idx on public.sale_items (kermes_id);
create index if not exists sale_items_sale_idx   on public.sale_items (sale_id);

-- Un número de rifa se vende una sola vez por kermés
create table if not exists public.raffle_tickets (
  id          uuid primary key,
  kermes_id   uuid not null references public.kermeses (id) on delete cascade,
  sale_id     uuid not null references public.sales (id) on delete cascade,
  number      integer not null check (number > 0),
  buyer_name  text check (char_length(buyer_name) <= 80),
  buyer_phone text check (char_length(buyer_phone) <= 20),
  unique (kermes_id, number)
);

-- ---------------------------------------------------------------------
-- 4. Permisos y RLS: solo el dueño de la kermés ve y registra ventas
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.sales, public.sale_items, public.raffle_tickets to authenticated;

alter table public.sales          enable row level security;
alter table public.sale_items     enable row level security;
alter table public.raffle_tickets enable row level security;

create or replace function public.owns_kermes(k uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.kermeses
    where id = k and organizer_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_kermes(uuid) from public;
grant execute on function public.owns_kermes(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['sales', 'sale_items', 'raffle_tickets'] loop
    execute format('drop policy if exists "%1$s_owner_all" on public.%1$I', t);
    execute format(
      'create policy "%1$s_owner_all" on public.%1$I for all to authenticated
         using (public.owns_kermes(kermes_id)) with check (public.owns_kermes(kermes_id))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Resumen rápido por kermés (respeta RLS: usa los permisos de quien consulta)
-- ---------------------------------------------------------------------
create or replace view public.sales_summary
with (security_invoker = true) as
select
  s.kermes_id,
  count(*) filter (where not s.voided)                                       as sales_count,
  coalesce(sum(s.total) filter (where not s.voided), 0)                      as total,
  coalesce(sum(s.total) filter (where not s.voided and s.payment_method = 'efectivo'), 0) as total_efectivo,
  coalesce(sum(s.total) filter (where not s.voided and s.payment_method = 'qr'), 0)       as total_qr
from public.sales s
group by s.kermes_id;

grant select on public.sales_summary to authenticated;

-- ✅ Listo. La caja (vender.html) usa estas tablas.
