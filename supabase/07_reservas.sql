-- =====================================================================
--  tukermes · 07_reservas.sql
--  Reservas con ticket QR de un solo uso.
--  - Se reserva días antes: se cobra igual que en la caja (la venta
--    descuenta porciones y suma al recaudado) y se guarda la reserva.
--  - El ticket lleva un código único; el QR abre ticket.html?c=<código>.
--  - El día de la kermés, "Entregar" escanea el QR y la marca entregada
--    UNA sola vez (el segundo escaneo dice "pedido ya entregado").
--  Ejecutar después de 04_ventas.sql (idempotente).
-- =====================================================================

create table if not exists public.reservations (
  id               uuid primary key,                       -- lo genera el celular
  kermes_id        uuid not null references public.kermeses (id) on delete cascade,
  sale_id          uuid,                                   -- venta que cobró la reserva
  code             text not null unique check (code ~ '^[0-9A-Z]{10}$'),
  customer_name    text not null check (char_length(customer_name) between 1 and 80),
  customer_phone   text check (char_length(customer_phone) <= 20),
  items            jsonb not null default '[]'::jsonb,     -- [{menu_item_id, name, category, unit_price, quantity}]
  total            numeric(10, 2) not null default 0 check (total >= 0),
  payment_method   text check (payment_method in ('efectivo', 'qr')),
  status           text not null default 'reservada' check (status in ('reservada', 'entregada', 'anulada')),
  created_at       timestamptz not null default now(),
  delivered_at     timestamptz,
  delivered_device text check (char_length(delivered_device) <= 40)
);

create index if not exists reservations_kermes_idx on public.reservations (kermes_id, created_at desc);
create index if not exists reservations_sale_idx   on public.reservations (sale_id);

-- Una reserva entregada o anulada no vuelve atrás (protege el "un solo escaneo")
create or replace function public.reservations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'reservada' and new.status is distinct from old.status then
    raise exception 'La reserva ya está %', old.status using errcode = 'P0001';
  end if;
  if new.status = 'entregada' and old.status = 'reservada' then
    new.delivered_at := coalesce(new.delivered_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_guard on public.reservations;
create trigger reservations_guard before update on public.reservations
  for each row execute function public.reservations_guard();

-- Si se anula la venta en "Ver ventas", la reserva queda anulada
create or replace function public.reservations_on_sale_void()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.voided and not old.voided then
    update public.reservations set status = 'anulada'
    where sale_id = new.id and status = 'reservada';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_void_reservation on public.sales;
create trigger sales_void_reservation after update of voided on public.sales
  for each row execute function public.reservations_on_sale_void();

-- Permisos: solo el dueño de la kermés ve, crea y entrega reservas
grant select, insert, update, delete on public.reservations to authenticated;
alter table public.reservations enable row level security;

drop policy if exists "reservations_owner_all" on public.reservations;
create policy "reservations_owner_all" on public.reservations for all to authenticated
  using (public.owns_kermes(kermes_id)) with check (public.owns_kermes(kermes_id));

-- Ticket público: quien tiene el código (el cliente) ve SU ticket y nada más
create or replace function public.public_ticket(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', r.code,
    'customer_name', r.customer_name,
    -- cada plato con su foto (las reservas antiguas no la guardaban: se toma del menú)
    'items', (
      select coalesce(jsonb_agg(it.value || jsonb_build_object('image_url', coalesce(it.value ->> 'image_url', mi.image_url)) order by it.ord), '[]'::jsonb)
      from jsonb_array_elements(r.items) with ordinality as it (value, ord)
      left join public.menu_items mi on mi.id::text = it.value ->> 'menu_item_id'
    ),
    'total', r.total,
    'payment_method', r.payment_method,
    'status', r.status,
    'created_at', r.created_at,
    'delivered_at', r.delivered_at,
    'kermes', jsonb_build_object(
      'id', k.id, 'title', k.title, 'event_date', k.event_date,
      'start_time', k.start_time, 'end_time', k.end_time,
      'address', k.address, 'zone', k.zone, 'cover_image_url', k.cover_image_url
    )
  )
  from public.reservations r
  join public.kermeses k on k.id = r.kermes_id
  where r.code = upper(p_code);
$$;

revoke all on function public.public_ticket(text) from public;
grant execute on function public.public_ticket(text) to anon, authenticated;

-- ✅ Listo. Usan esto: vender.html?modo=reserva, entregar.html, reservas.html y ticket.html.
