-- =====================================================================
--  tukermes · 05_stock_publico.sql
--  Permite que el muro público sepa qué platos ya se agotaron,
--  sin exponer las ventas (que siguen protegidas por RLS).
--  Ejecutar después de 04_ventas.sql.
-- =====================================================================

-- Porciones que quedan de cada plato con límite, solo de kermeses publicadas.
-- security definer: cuenta las ventas aunque el visitante no pueda leerlas,
-- pero devuelve únicamente id del plato y cuántas porciones quedan.
create or replace function public.public_menu_remaining(kermes_ids uuid[])
returns table (menu_item_id uuid, remaining integer)
language sql
stable
security definer
set search_path = public
as $$
  select mi.id,
         greatest(mi.stock - coalesce(sum(si.quantity) filter (where s.voided is false), 0), 0)::integer
  from menu_items mi
  join kermeses k on k.id = mi.kermes_id and k.status = 'publicada'
  left join sale_items si on si.menu_item_id = mi.id and si.kind = 'plato'
  left join sales s on s.id = si.sale_id
  where mi.stock is not null
    and mi.kermes_id = any (kermes_ids)
  group by mi.id, mi.stock;
$$;

revoke all on function public.public_menu_remaining(uuid[]) from public;
grant execute on function public.public_menu_remaining(uuid[]) to anon, authenticated;
