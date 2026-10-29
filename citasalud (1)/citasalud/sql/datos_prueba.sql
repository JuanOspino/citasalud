-- =====================================================================
-- CitaSalud · Archivo 3 de 3: datos_prueba.sql
-- Datos 100 % ficticios para demostración y pruebas.
-- Crea cuentas de demostración, especialidades, profesionales, franjas
-- para los próximos 14 días y algunas citas históricas para indicadores.
--
-- Contraseña de TODAS las cuentas demo: CitaDemo2026*
--   admin@citasalud.test          -> administrador / recepción
--   dra.gomez@citasalud.test      -> profesional (Medicina general)
--   dr.ruiz@citasalud.test        -> profesional (Pediatría)
--   dra.mesa@citasalud.test       -> profesional (Odontología)
--   paciente1@citasalud.test      -> paciente
--   paciente2@citasalud.test      -> paciente
--
-- Si su proyecto no permite insertar en auth.users desde el SQL Editor,
-- cree estas cuentas en Authentication > Users > Add user (marcando
-- "Auto Confirm User") y ejecute este script desde la sección 2.
-- =====================================================================

begin;

-- Permite insertar datos históricos (fechas pasadas y estados finales)
-- solo durante esta transacción. No es alcanzable desde la API.
select set_config('app.carga_datos', 'on', true);

-- ---------------------------------------------------------------------
-- 1. Cuentas de demostración en auth.users (el disparador crea profiles)
-- ---------------------------------------------------------------------
with demo (id, email, nombres, documento, telefono, nacimiento) as (
  values
    ('a0000000-0000-4000-8000-000000000001'::uuid, 'admin@citasalud.test',     'Laura Recepción Demo', '1000000001', '3000000001', '1990-04-12'),
    ('a0000000-0000-4000-8000-000000000002'::uuid, 'dra.gomez@citasalud.test', 'Dra. Ana Gómez (ficticia)', '1000000002', '3000000002', '1985-09-30'),
    ('a0000000-0000-4000-8000-000000000003'::uuid, 'dr.ruiz@citasalud.test',   'Dr. Mateo Ruiz (ficticio)', '1000000003', '3000000003', '1982-01-17'),
    ('a0000000-0000-4000-8000-000000000004'::uuid, 'dra.mesa@citasalud.test',  'Dra. Sofía Mesa (ficticia)', '1000000004', '3000000004', '1991-06-05'),
    ('a0000000-0000-4000-8000-000000000005'::uuid, 'paciente1@citasalud.test', 'Carlos Pérez Demo', '1000000005', '3000000005', '2000-02-20'),
    ('a0000000-0000-4000-8000-000000000006'::uuid, 'paciente2@citasalud.test', 'María López Demo', '1000000006', '3000000006', '1975-11-02')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
select
  '00000000-0000-0000-0000-000000000000', d.id, 'authenticated', 'authenticated', d.email,
  extensions.crypt('CitaDemo2026*', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('nombres', d.nombres, 'documento', d.documento,
                     'telefono', d.telefono, 'fecha_nacimiento', d.nacimiento),
  now(), now(), '', '', '', ''
from demo d
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@citasalud.test'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- ---------------------------------------------------------------------
-- 2. Roles (por correo, para funcionar también con cuentas creadas a mano)
-- ---------------------------------------------------------------------
update public.profiles p set rol = 'admin'
from auth.users u where u.id = p.id and u.email = 'admin@citasalud.test';

update public.profiles p set rol = 'profesional'
from auth.users u where u.id = p.id
  and u.email in ('dra.gomez@citasalud.test', 'dr.ruiz@citasalud.test', 'dra.mesa@citasalud.test');

-- Completa datos si las cuentas se crearon manualmente sin metadatos.
update public.profiles p set
  documento = coalesce(p.documento, '20000000' || right(u.email, 1)),
  telefono  = coalesce(p.telefono, '3109990000')
from auth.users u where u.id = p.id and u.email like 'paciente%@citasalud.test';

-- ---------------------------------------------------------------------
-- 3. Especialidades
-- ---------------------------------------------------------------------
insert into public.specialties (nombre, descripcion) values
  ('Medicina general', 'Consulta de primer nivel para valoración general.'),
  ('Pediatría',        'Atención de niñas, niños y adolescentes.'),
  ('Odontología',      'Valoración y procedimientos odontológicos básicos.'),
  ('Dermatología',     'Consulta de piel, cabello y uñas.'),
  ('Psicología',       'Orientación psicológica ambulatoria.')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4. Profesionales
-- ---------------------------------------------------------------------
insert into public.professionals (profile_id, specialty_id, registro_profesional)
select u.id, s.id, x.registro
from (values
  ('dra.gomez@citasalud.test', 'Medicina general', 'RM-DEMO-001'),
  ('dr.ruiz@citasalud.test',   'Pediatría',        'RM-DEMO-002'),
  ('dra.mesa@citasalud.test',  'Odontología',      'RM-DEMO-003')
) as x (email, especialidad, registro)
join auth.users u on u.email = x.email
join public.specialties s on s.nombre = x.especialidad
on conflict (profile_id) do nothing;

-- ---------------------------------------------------------------------
-- 5. Franjas: 30 días atrás a 14 días adelante, lunes a viernes,
--    08:00-12:00 en bloques de 30 minutos (Hora de Bogotá).
-- ---------------------------------------------------------------------
insert into public.schedules (professional_id, fecha, hora_inicio, hora_fin)
select pr.id, d::date, h::time, (h + interval '30 minutes')::time
from public.professionals pr
cross join generate_series(current_date - 30, current_date + 14, interval '1 day') d
cross join generate_series(timestamp '2000-01-01 08:00', timestamp '2000-01-01 11:30', interval '30 minutes') h
where extract(isodow from d) between 1 and 5
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 6. Citas históricas (pasadas) con estados finales para indicadores
-- ---------------------------------------------------------------------
insert into public.appointments (patient_id, professional_id, schedule_id, motivo, estado, cancelled_at)
select pac.id, s.professional_id, s.id, 'Control de rutina (dato ficticio)',
       e.estado::public.appointment_status,
       case when e.estado = 'cancelada' then now() - interval '20 days' end
from (
  select s.*, row_number() over (order by s.fecha, s.hora_inicio, s.professional_id) rn
  from public.schedules s
  where s.fecha < current_date and s.hora_inicio in ('08:00', '09:30', '10:30')
) s
cross join lateral (
  select case (s.rn % 10)
    when 0 then 'no_asistio' when 1 then 'cancelada' when 2 then 'no_asistio'
    else 'atendida' end as estado
) e
join lateral (
  select p.id from public.profiles p
  join auth.users u on u.id = p.id
  where u.email = case when s.rn % 2 = 0 then 'paciente1@citasalud.test' else 'paciente2@citasalud.test' end
) pac on true
where not exists (select 1 from public.appointments a where a.schedule_id = s.id);

-- ---------------------------------------------------------------------
-- 7. Dos citas futuras para el paciente 1 (para probar cancelación)
-- ---------------------------------------------------------------------
insert into public.appointments (patient_id, professional_id, schedule_id, motivo)
select (select p.id from public.profiles p join auth.users u on u.id = p.id
        where u.email = 'paciente1@citasalud.test'),
       s.professional_id, s.id, 'Consulta de control (dato ficticio)'
from (
  select s.* from public.schedules s
  join public.professionals pr on pr.id = s.professional_id
  join auth.users u on u.id = pr.profile_id
  where s.fecha >= current_date + 3
    and s.hora_inicio = '09:00'
    and u.email in ('dra.gomez@citasalud.test', 'dr.ruiz@citasalud.test')
  order by s.fecha
  limit 2
) s
where not exists (select 1 from public.appointments a where a.schedule_id = s.id and a.estado <> 'cancelada');

commit;

-- Verificación rápida
select rol, count(*) from public.profiles group by rol order by rol;
select estado, count(*) from public.appointments group by estado order by estado;
