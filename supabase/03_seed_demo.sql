-- =====================================================================
--  tukermes.online · Datos de PRUEBA (opcional, solo para desarrollo)
--  Requisito: crear antes un usuario en Authentication > Users > Add user
--  Las kermeses se asignan al usuario más antiguo del proyecto.
--  Se puede ejecutar varias veces: borra y vuelve a crear los datos demo.
-- =====================================================================
do $$
declare
  uid  uuid;
  sat  date := current_date + ((6 - extract(dow from current_date)::int) % 7);  -- próximo sábado
  k1   uuid;
  k2   uuid;
  k3   uuid;
  k4   uuid;
begin
  select id into uid from auth.users order by created_at limit 1;
  if uid is null then
    raise exception 'No hay usuarios. Crea uno en Authentication > Users > Add user y vuelve a ejecutar.';
  end if;

  insert into public.profiles (id, full_name, organization_name)
  values (uid, 'Organizador Demo', 'Comunidad Demo')
  on conflict (id) do update set organization_name = excluded.organization_name;

  delete from public.kermeses where organizer_id = uid and title like '[DEMO]%';

  insert into public.kermeses (organizer_id, title, description, event_date, start_time, end_time,
                               address, zone, latitude, longitude, whatsapp, status, cover_image_url)
  values (uid, '[DEMO] Kermés Pro Techo de la Parroquia San Roque',
          'Reunimos fondos para reparar el techo del comedor parroquial que atiende a 80 niños cada día. ¡Ven con tu familia, habrá juegos y música en vivo!',
          sat, '10:00', '17:00', 'Calle Ñuflo de Chávez esq. Ayacucho', 'Casco Viejo', -17.7810, -63.1790, '59170000001', 'publicada', 'assets/img/demo/majadito.webp')
  returning id into k1;

  insert into public.kermeses (organizer_id, title, description, event_date, start_time, end_time,
                               address, zone, latitude, longitude, whatsapp, status, cover_image_url)
  values (uid, '[DEMO] Gran Kermés Solidaria por Doña Rosa',
          'Los vecinos del barrio organizamos esta kermés para apoyar el tratamiento médico de Doña Rosa, vecina de toda la vida.',
          sat + 1, '09:00', '15:00', 'Av. San Martín, 3er anillo', 'Equipetrol', -17.7665, -63.1985, '59170000002', 'publicada', 'assets/img/demo/keperi.webp')
  returning id into k2;

  insert into public.kermeses (organizer_id, title, description, event_date, start_time, end_time,
                               address, zone, latitude, longitude, whatsapp, status, cover_image_url)
  values (uid, '[DEMO] Kermés Promoción 2026 – Colegio Santa Ana',
          'Los alumnos de 6.º de secundaria recaudan fondos para su viaje de promoción.',
          sat + 7, '11:00', '18:00', 'Av. Paurito, Plan 3000', 'Plan 3000', -17.8130, -63.1300, '59170000003', 'publicada', 'assets/img/demo/saltenas.webp')
  returning id into k3;

  -- Un borrador: NO debe aparecer en el muro público (prueba de RLS)
  insert into public.kermeses (organizer_id, title, description, event_date, start_time,
                               address, zone, latitude, longitude, status)
  values (uid, '[DEMO] Borrador oculto', 'Si ves esto en el muro público, revisa las políticas RLS.',
          sat, '10:00', 'Av. Banzer, 4to anillo', 'Norte', -17.7550, -63.1780, 'borrador')
  returning id into k4;

  -- Fotos de ejemplo de Wikimedia Commons (servidas desde la web: assets/img/demo/, ver CREDITOS.txt)
  insert into public.menu_items (kermes_id, name, description, price, image_url, is_featured, sort_order) values
    (k1, 'Majadito',          'Con huevo frito, plátano y yuca', 25.00, 'assets/img/demo/majadito.webp',    true,  1),
    (k1, 'Sonso de yuca',     'En palito, recién asado',          8.00, 'assets/img/demo/sonso.webp',       true,  2),
    (k1, 'Cuñapé',            'Media docena',                    10.00, 'assets/img/demo/cunape.webp',      false, 3),
    (k1, 'Mocochinchi',       'Vaso grande',                      5.00, 'assets/img/demo/mocochinchi.webp', false, 4),
    (k2, 'Locro carretero',   'Con charque y huevo',             25.00, 'assets/img/demo/locro.webp',       true,  1),
    (k2, 'Keperí al horno',   'Con yuca y ensalada',             40.00, 'assets/img/demo/keperi.webp',      true,  2),
    (k2, 'Somó',              'Bebida de maíz bien fría',         5.00, 'assets/img/demo/somo.webp',        false, 3),
    (k3, 'Pique macho',       'Para compartir entre dos',        35.00, 'assets/img/demo/pique-macho.webp', true,  1),
    (k3, 'Salteñas',          'De pollo o carne',                 8.00, 'assets/img/demo/saltenas.webp',    true,  2),
    (k3, 'Empanada de arroz', 'Unidad',                           4.00, null,                     false, 3),
    (k4, 'Plato secreto',     null,                              99.00, null,                     true,  1);

  raise notice 'Datos demo creados para el usuario %', uid;
end $$;
