-- =====================================================================
-- CitaSalud · reset.sql  (¡DESTRUCTIVO! Solo para entornos de prueba)
-- Elimina todos los objetos del proyecto para volver a ejecutar
-- esquema.sql, politicas_rls.sql y datos_prueba.sql desde cero.
-- =====================================================================
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.status_history cascade;
drop table if exists public.appointments  cascade;
drop table if exists public.schedules     cascade;
drop table if exists public.professionals cascade;
drop table if exists public.specialties   cascade;
drop table if exists public.profiles      cascade;

drop function if exists
  public.app_rol(), public.es_admin(), public.mi_professional_id(),
  public.inicio_local(date, time), public.modo_carga_datos(),
  public.horas_minimas_cancelacion(),
  public.transicion_valida(public.appointment_status, public.appointment_status),
  public.tg_crear_perfil(), public.tg_proteger_perfil(), public.tg_validar_franja(),
  public.tg_validar_profesional(), public.tg_validar_cita(), public.tg_historial_cita(),
  public.catalogo_profesionales(uuid), public.buscar_disponibilidad(date, uuid, uuid),
  public.reservar_cita(uuid, text, uuid),
  public.cambiar_estado_cita(uuid, public.appointment_status, text),
  public.cancelar_cita(uuid, text),
  public.listar_citas(date, date, public.appointment_status),
  public.historial_cita(uuid),
  public.generar_franjas(uuid, date, date, time, time, integer, integer[]),
  public.registrar_profesional(uuid, uuid, text),
  public.indicadores(date, date), public.anonimizar_paciente(uuid)
  cascade;

drop type if exists public.appointment_status cascade;
drop type if exists public.app_role cascade;

-- Cuentas de demostración
delete from auth.identities where user_id in (select id from auth.users where email like '%@citasalud.test');
delete from auth.users where email like '%@citasalud.test';
