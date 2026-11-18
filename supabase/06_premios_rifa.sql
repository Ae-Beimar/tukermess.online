-- =====================================================================
--  tukermes · 06_premios_rifa.sql
--  La rifa puede tener varios premios, cada uno con su foto.
--  Ejecutar después de 04_ventas.sql. Se puede repetir.
-- =====================================================================

-- Lista ordenada: [{ "id": uuid, "name": "Licuadora", "image_url": "https://..." }, ...]
-- El orden es el del sorteo: el primero es el 1.er premio.
alter table public.kermeses
  add column if not exists raffle_prizes jsonb not null default '[]'::jsonb;

alter table public.kermeses drop constraint if exists kermeses_raffle_prizes_check;
alter table public.kermeses
  add constraint kermeses_raffle_prizes_check check (
    jsonb_typeof(raffle_prizes) = 'array' and jsonb_array_length(raffle_prizes) <= 10
  );

-- Pasa el premio único que ya existía (raffle_prize) a la lista nueva
update public.kermeses
set raffle_prizes = jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'name', raffle_prize, 'image_url', null))
where raffle_prize is not null and raffle_prize <> '' and raffle_prizes = '[]'::jsonb;
