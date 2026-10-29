-- =====================================================================
-- CitaSalud · Archivo 2 de 3: politicas_rls.sql
-- Row Level Security, políticas por rol/propietario y privilegios.
-- Principio: mínimo privilegio. Las escrituras críticas (reservar,
-- cancelar, cambiar estado) solo se permiten mediante funciones RPC
-- que validan rol y reglas de negocio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Habilitar RLS en TODAS las tablas expuestas
-- ---------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.specialties    enable row level security;
alter table public.professionals  enable row level security;
alter table public.schedules      enable row level security;
alter table public.appointments   enable row level security;
alter table public.status_history enable row level security;

-- ---------------------------------------------------------------------
-- 2. Privilegios de tabla (segunda capa además de RLS)
-- Supabase concede por defecto todo a anon/authenticated; se restringe.
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.specialties, public.professionals,
              public.schedules, public.appointments, public.status_history
  from anon, authenticated;

-- Visitante sin sesión: solo el catálogo de especialidades.
grant select on public.specialties to anon;

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.specialties   to authenticated;
grant select, insert, update on public.professionals to authenticated;
grant select, insert, update, delete on public.schedules to authenticated;
grant select on public.appointments   to authenticated;
-- Directamente solo se puede editar la observación administrativa;
-- el estado cambia únicamente con cambiar_estado_cita().
grant update (observaciones) on public.appointments to authenticated;
grant select on public.status_history to authenticated;

-- ---------------------------------------------------------------------
-- 3. Políticas
-- ---------------------------------------------------------------------

-- PROFILES -------------------------------------------------------------
create policy profiles_select_propio_o_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.es_admin());

create policy profiles_update_propio_o_admin on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.es_admin())
  with check (id = auth.uid() or public.es_admin());
-- (Sin INSERT: el perfil lo crea el disparador on_auth_user_created.)
-- (Sin DELETE: se usa borrado lógico o anonimizar_paciente().)

-- SPECIALTIES ----------------------------------------------------------
create policy specialties_select_activas on public.specialties
  for select to anon, authenticated
  using (activo or public.es_admin());

create policy specialties_insert_admin on public.specialties
  for insert to authenticated
  with check (public.es_admin());

create policy specialties_update_admin on public.specialties
  for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- PROFESSIONALS --------------------------------------------------------
create policy professionals_select_propio_o_admin on public.professionals
  for select to authenticated
  using (profile_id = auth.uid() or public.es_admin());

create policy professionals_insert_admin on public.professionals
  for insert to authenticated
  with check (public.es_admin());

create policy professionals_update_admin on public.professionals
  for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- SCHEDULES ------------------------------------------------------------
-- Pacientes consultan disponibilidad con buscar_disponibilidad().
create policy schedules_select_propio_o_admin on public.schedules
  for select to authenticated
  using (professional_id = public.mi_professional_id() or public.es_admin());

create policy schedules_insert_admin on public.schedules
  for insert to authenticated
  with check (public.es_admin());

create policy schedules_update_admin on public.schedules
  for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy schedules_delete_admin on public.schedules
  for delete to authenticated
  using (public.es_admin());

-- APPOINTMENTS ---------------------------------------------------------
create policy appointments_select_participantes on public.appointments
  for select to authenticated
  using (
    patient_id = auth.uid()
    or professional_id = public.mi_professional_id()
    or public.es_admin()
  );

create policy appointments_update_admin on public.appointments
  for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
-- (Sin INSERT ni DELETE directos: reservar_cita() y cancelación lógica.)

-- STATUS_HISTORY -------------------------------------------------------
create policy status_history_select_participantes on public.status_history
  for select to authenticated
  using (exists (
    select 1 from public.appointments a
    where a.id = status_history.appointment_id
      and (a.patient_id = auth.uid()
           or a.professional_id = public.mi_professional_id()
           or public.es_admin())
  ));
-- (Sin escrituras: lo alimenta el disparador appointments_historial.)

-- ---------------------------------------------------------------------
-- 4. Privilegios sobre funciones
-- Por defecto PUBLIC puede ejecutar funciones; se restringe a usuarios
-- autenticados y solo las funciones pensadas como API.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.app_rol(),
  public.es_admin(),
  public.mi_professional_id(),
  public.inicio_local(date, time),
  public.modo_carga_datos(),
  public.horas_minimas_cancelacion(),
  public.transicion_valida(public.appointment_status, public.appointment_status),
  public.catalogo_profesionales(uuid),
  public.buscar_disponibilidad(date, uuid, uuid),
  public.reservar_cita(uuid, text, uuid),
  public.cambiar_estado_cita(uuid, public.appointment_status, text),
  public.cancelar_cita(uuid, text),
  public.listar_citas(date, date, public.appointment_status),
  public.historial_cita(uuid),
  public.generar_franjas(uuid, date, date, time, time, integer, integer[]),
  public.registrar_profesional(uuid, uuid, text),
  public.indicadores(date, date),
  public.anonimizar_paciente(uuid)
to authenticated;

-- El visitante puede ver el catálogo en la portada. Las funciones de
-- rol se usan dentro de políticas y para anon simplemente devuelven nulo/falso.
grant execute on function
  public.catalogo_profesionales(uuid),
  public.app_rol(), public.es_admin(), public.mi_professional_id()
to anon;

-- Evita que funciones creadas en el futuro queden abiertas por defecto.
alter default privileges in schema public revoke execute on functions from public, anon;
