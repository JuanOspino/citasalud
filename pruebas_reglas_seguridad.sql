\set ON_ERROR_STOP 0
\set P1 'a0000000-0000-4000-8000-000000000005'
\set P2 'a0000000-0000-4000-8000-000000000006'
\set ADM 'a0000000-0000-4000-8000-000000000001'
\set GOMEZ 'a0000000-0000-4000-8000-000000000002'
\set RUIZ 'a0000000-0000-4000-8000-000000000003'
-- elegir franja libre futura de Gomez
select s.id as franja from schedules s join professionals p on p.id=s.professional_id
 where p.profile_id=:'GOMEZ' and s.fecha >= current_date+5 and s.hora_inicio='10:00'
 and not exists(select 1 from appointments a where a.schedule_id=s.id) order by fecha limit 1 \gset
select fecha as fecha_franja from schedules where id=:'franja' \gset
select (current_date+5 + (7 - extract(isodow from current_date+5)::int + 1) % 7)::date as dummy \gset

\echo '== CP: paciente busca disponibilidad'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P1', true);
select count(*) as franjas_libres from buscar_disponibilidad(:'fecha_franja');
commit;

\echo '== CP-01: paciente1 reserva franja libre'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P1', true);
select reservar_cita(:'franja', 'Dolor de cabeza leve') as cita \gset
select count(*) as sigue_disponible from buscar_disponibilidad(:'fecha_franja') where schedule_id=:'franja';
commit;

\echo '== CP-02b: paciente2 intenta la misma franja (espera 23505)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P2', true);
select reservar_cita(:'franja');
rollback;

\echo '== CP-03: paciente2 intenta leer cita ajena (espera 0 filas)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P2', true);
select count(*) from appointments where id=:'cita';
select count(*) from listar_citas() where id=:'cita';
select * from historial_cita(:'cita');
rollback;

\echo '== paciente2 intenta cancelar cita ajena (espera 42501)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P2', true);
select cancelar_cita(:'cita');
rollback;

\echo '== paciente1 insert directo / update estado directo (espera permiso denegado)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P1', true);
insert into appointments(patient_id, professional_id, schedule_id) select :'P1', professional_id, id from schedules limit 1;
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P1', true);
update appointments set estado='cancelada' where id=:'cita';
rollback;

\echo '== paciente1 intenta volverse admin (espera error)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P1', true);
update profiles set rol='admin' where id=:'P1';
rollback;
\echo '== paciente1 actualiza su telefono (ok) y el de otro (0 filas)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P1', true);
update profiles set telefono='3001112233' where id=:'P1';
update profiles set telefono='3001112233' where id=:'P2';
rollback;

\echo '== CP-04: profesional Ruiz cambia cita de Gomez (espera 42501)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'RUIZ', true);
select cambiar_estado_cita(:'cita', 'confirmada');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'RUIZ', true);
select count(*) as citas_ajenas_visibles from appointments where id=:'cita';
rollback;

\echo '== Gomez confirma (ok), luego atendida futura (error), luego programada (error)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'GOMEZ', true);
select cambiar_estado_cita(:'cita', 'confirmada', 'Confirmada por teléfono');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'GOMEZ', true);
select cambiar_estado_cita(:'cita', 'atendida');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'GOMEZ', true);
select cambiar_estado_cita(:'cita', 'programada');
rollback;

\echo '== Admin desactiva franja con cita activa (espera error)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ADM', true);
update schedules set activo=false where id=:'franja';
rollback;

\echo '== Paciente1 cancela su cita (ok) y la franja vuelve a estar libre'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P1', true);
select cancelar_cita(:'cita', 'Viaje imprevisto');
select count(*) as disponible_otra_vez from buscar_disponibilidad(:'fecha_franja') where schedule_id=:'franja';
select estado_anterior, estado_nuevo, observacion, cambiado_por from historial_cita(:'cita');
commit;
\echo '== Paciente2 ahora sí puede reservar la franja liberada'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P2', true);
select reservar_cita(:'franja') is not null as reservada;
rollback;

\echo '== Regla 2 horas: franja en 1 hora'
select fecha_x, hora_x from (select (now() at time zone 'America/Bogota' + interval '1 hour') t) x,
 lateral (select t::date as fecha_x, date_trunc('minute', t)::time as hora_x) y \gset
begin;  -- como postgres crea franja de prueba
insert into schedules(professional_id, fecha, hora_inicio, hora_fin) select id, :'fecha_x', :'hora_x', (:'hora_x'::time + interval '20 minutes') from professionals where profile_id=:'RUIZ' returning id as franja_cercana \gset
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P2', true);
select reservar_cita(:'franja_cercana') as cita2 \gset
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P2', true);
select cancelar_cita(:'cita2');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ADM', true);
select cancelar_cita(:'cita2', 'Admin sí puede') ;
rollback;

\echo '== Franja pasada (espera error)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P1', true);
select reservar_cita((select id from schedules where fecha < current_date and not exists(select 1 from appointments a where a.schedule_id=schedules.id) limit 1));
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ADM', true);
select reservar_cita(s.id) from schedules s where s.fecha = current_date - 3 limit 1;
rollback;
\echo '== paciente reserva franja que no ve (buscar via id de franja pasada) - cubierto. Admin crea franja pasada (error)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ADM', true);
insert into schedules(professional_id, fecha, hora_inicio, hora_fin) select id, current_date-1, '08:00','08:30' from professionals limit 1;
rollback;
\echo '== Admin franja solapada (espera exclusion)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ADM', true);
insert into schedules(professional_id, fecha, hora_inicio, hora_fin) select professional_id, fecha, '10:15','10:45' from schedules where id=:'franja';
rollback;

\echo '== Admin generar_franjas e indicadores'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ADM', true);
select generar_franjas((select id from professionals where profile_id=:'RUIZ'), current_date+1, current_date+20, '14:00','17:00', 20) as creadas;
select generar_franjas((select id from professionals where profile_id=:'RUIZ'), current_date+1, current_date+20, '14:00','17:00', 20) as creadas_otra_vez;
select jsonb_pretty(indicadores(current_date-60, current_date+30));
rollback;
\echo '== Paciente pide indicadores (error) / generar_franjas (error)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P1', true);
select indicadores(current_date-60, current_date);
rollback;

\echo '== anon: especialidades si, perfiles no, reservar no'
begin; set local role anon;
select count(*) as especialidades from specialties;
select count(*) from catalogo_profesionales();
select count(*) from profiles;
rollback;
begin; set local role anon; select reservar_cita(:'franja'); rollback;

\echo '== listar_citas por rol'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'P1', true);
select count(*) total, count(*) filter (where paciente_id<>:'P1') ajenas from listar_citas(); rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'RUIZ', true);
select count(*) total, count(distinct profesional_nombre) profesionales from listar_citas(); rollback;
