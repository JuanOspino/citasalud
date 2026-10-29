-- =====================================================================
-- CitaSalud · Sistema de reserva de citas médicas (MVP académico)
-- Archivo 1 de 3: esquema.sql
-- Tipos, tablas, restricciones, índices, funciones auxiliares,
-- disparadores (reglas de negocio) y funciones RPC expuestas a la API.
--
-- Orden de ejecución en el SQL Editor de Supabase:
--   1) esquema.sql  2) politicas_rls.sql  3) datos_prueba.sql
-- Para reconstruir desde cero ejecute antes reset.sql.
--
-- Zona horaria del negocio: America/Bogota (UTC-5).
-- Todos los datos son ficticios. No se almacena información clínica.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Tipos enumerados (evitan valores libres en roles y estados)
-- ---------------------------------------------------------------------
create type public.app_role as enum ('paciente', 'profesional', 'admin');

create type public.appointment_status as enum (
  'programada', 'confirmada', 'atendida', 'cancelada', 'no_asistio'
);

-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------

-- Perfil público del usuario. auth.users queda separado (credenciales)
-- y se enlaza por UUID. Se crea automáticamente al registrarse.
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  nombres          text not null
                   check (char_length(btrim(nombres)) between 3 and 120),
  documento        text unique
                   check (documento ~ '^[0-9]{5,15}$'),
  telefono         text
                   check (telefono ~ '^\+?[0-9]{7,15}$'),
  fecha_nacimiento date
                   check (fecha_nacimiento >= date '1900-01-01'),
  rol              public.app_role not null default 'paciente',
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.profiles is
  'Datos básicos del usuario. Sin información clínica. Borrado lógico (activo) o anonimización.';

create table public.specialties (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (char_length(btrim(nombre)) between 3 and 80),
  descripcion text check (char_length(descripcion) <= 300),
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) default auth.uid()
);
create unique index specialties_nombre_uk on public.specialties (lower(btrim(nombre)));

create table public.professionals (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid not null unique references public.profiles (id) on delete restrict,
  specialty_id         uuid not null references public.specialties (id) on delete restrict,
  registro_profesional text unique check (char_length(registro_profesional) between 3 and 30),
  activo               boolean not null default true,
  created_at           timestamptz not null default now(),
  created_by           uuid references public.profiles (id) default auth.uid()
);
create index professionals_specialty_idx on public.professionals (specialty_id);

-- Franja horaria publicada por un profesional.
-- Decisión de modelado: la franja NO cambia de estado al reservarse;
-- su ocupación se deriva de la existencia de una cita activa.
-- Al cancelar la cita, la franja queda libre automáticamente y la cita
-- cancelada se conserva como historial.
create table public.schedules (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete restrict,
  fecha           date not null,
  hora_inicio     time not null,
  hora_fin        time not null,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles (id) default auth.uid(),
  constraint schedules_horas_ck check (hora_fin > hora_inicio),
  constraint schedules_duracion_ck check (hora_fin - hora_inicio between interval '10 minutes' and interval '4 hours'),
  -- Un profesional no puede tener dos franjas activas superpuestas.
  constraint schedules_sin_solape_ex exclude using gist (
    professional_id with =,
    tsrange(fecha + hora_inicio, fecha + hora_fin, '[)') with &&
  ) where (activo)
);
create index schedules_fecha_idx on public.schedules (fecha, professional_id);

create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.profiles (id) on delete restrict,
  professional_id uuid not null references public.professionals (id) on delete restrict,
  schedule_id     uuid not null references public.schedules (id) on delete restrict,
  motivo          text check (char_length(motivo) <= 200),
  estado          public.appointment_status not null default 'programada',
  observaciones   text check (char_length(observaciones) <= 500),
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles (id) default auth.uid(),
  updated_at      timestamptz not null default now(),
  cancelled_at    timestamptz,
  cancelled_by    uuid references public.profiles (id),
  constraint appointments_cancelacion_ck
    check ((estado = 'cancelada') = (cancelled_at is not null))
);
-- REGLA CLAVE ANTI DOBLE RESERVA: una franja solo puede tener UNA cita
-- no cancelada. Lo garantiza PostgreSQL aunque lleguen dos solicitudes
-- simultáneas (la segunda recibe error 23505).
create unique index appointments_franja_activa_uk
  on public.appointments (schedule_id)
  where estado <> 'cancelada';
create index appointments_patient_idx      on public.appointments (patient_id);
create index appointments_professional_idx on public.appointments (professional_id);
create index appointments_estado_idx       on public.appointments (estado);

create table public.status_history (
  id              bigint generated always as identity primary key,
  appointment_id  uuid not null references public.appointments (id) on delete cascade,
  estado_anterior public.appointment_status,
  estado_nuevo    public.appointment_status not null,
  observacion     text check (char_length(observacion) <= 300),
  changed_by      uuid references public.profiles (id),
  changed_at      timestamptz not null default now()
);
create index status_history_appointment_idx on public.status_history (appointment_id);

-- ---------------------------------------------------------------------
-- 3. Funciones auxiliares
-- SECURITY DEFINER para que las políticas RLS puedan consultarlas sin
-- recursión. search_path fijo para evitar secuestro de funciones.
-- ---------------------------------------------------------------------
create or replace function public.app_rol()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select rol from public.profiles where id = auth.uid() and activo;
$$;

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.app_rol() = 'admin', false);
$$;

create or replace function public.mi_professional_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select pr.id
  from public.professionals pr
  join public.profiles p on p.id = pr.profile_id
  where pr.profile_id = auth.uid() and p.activo and p.rol = 'profesional';
$$;

-- Convierte fecha + hora local (Bogotá) a un instante absoluto.
create or replace function public.inicio_local(p_fecha date, p_hora time)
returns timestamptz
language sql immutable
as $$
  select (p_fecha + p_hora) at time zone 'America/Bogota';
$$;

-- Bandera solo disponible para scripts ejecutados en el servidor
-- (datos_prueba.sql). No es alcanzable desde la API.
create or replace function public.modo_carga_datos()
returns boolean
language sql stable
as $$
  select coalesce(current_setting('app.carga_datos', true), 'off') = 'on';
$$;

-- Regla de anticipación para cancelaciones del paciente.
create or replace function public.horas_minimas_cancelacion()
returns integer
language sql immutable
as $$ select 2 $$;

-- ---------------------------------------------------------------------
-- 4. Disparadores (reglas de negocio validadas en la base de datos)
-- ---------------------------------------------------------------------

-- 4.1 Crear el perfil al registrarse. El rol SIEMPRE inicia como
-- 'paciente'; nunca se toma de los metadatos enviados por el cliente.
create or replace function public.tg_crear_perfil()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nombres, documento, telefono, fecha_nacimiento)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombres'), ''), split_part(new.email, '@', 1)),
    nullif(btrim(new.raw_user_meta_data ->> 'documento'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'telefono'), ''),
    nullif(new.raw_user_meta_data ->> 'fecha_nacimiento', '')::date
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_crear_perfil();

-- 4.2 Proteger campos sensibles del perfil.
-- Sin SECURITY DEFINER a propósito: current_user debe reflejar el rol
-- real de la petición (anon/authenticated) y no al dueño de la función.
create or replace function public.tg_proteger_perfil()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.fecha_nacimiento is not null and new.fecha_nacimiento > current_date then
    raise exception 'La fecha de nacimiento no puede ser futura.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.created_at <> old.created_at then
      raise exception 'No se puede modificar el identificador del perfil.' using errcode = '42501';
    end if;
    -- Solo un administrador (o un script de servidor) cambia rol o estado.
    if (new.rol is distinct from old.rol or new.activo is distinct from old.activo)
       and not public.es_admin()
       and current_user in ('anon', 'authenticated') then
      raise exception 'No tiene permiso para cambiar el rol o el estado de la cuenta.' using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_proteger
  before insert or update on public.profiles
  for each row execute function public.tg_proteger_perfil();

-- 4.3 Franjas: no crear en el pasado; no alterar franjas con cita activa.
create or replace function public.tg_validar_franja()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_tiene_cita boolean;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select exists (
      select 1 from public.appointments a
      where a.schedule_id = old.id and a.estado in ('programada', 'confirmada')
    ) into v_tiene_cita;
  end if;

  if tg_op = 'DELETE' then
    if v_tiene_cita then
      raise exception 'La franja tiene una cita activa. Cancele la cita antes de eliminarla.' using errcode = '23503';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and v_tiene_cita and (
       new.fecha <> old.fecha or new.hora_inicio <> old.hora_inicio
    or new.hora_fin <> old.hora_fin or new.professional_id <> old.professional_id
    or (old.activo and not new.activo)) then
    raise exception 'La franja tiene una cita activa. Cancele o atienda la cita antes de modificar o desactivar la franja.' using errcode = '23503';
  end if;

  if (tg_op = 'INSERT' or new.fecha <> old.fecha or new.hora_inicio <> old.hora_inicio)
     and public.inicio_local(new.fecha, new.hora_inicio) <= now()
     and not public.modo_carga_datos() then
    raise exception 'No se pueden publicar franjas en una fecha u hora pasada.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger schedules_validar
  before insert or update or delete on public.schedules
  for each row execute function public.tg_validar_franja();

-- 4.4 Profesionales: no desactivar si tienen citas futuras activas.
create or replace function public.tg_validar_profesional()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.activo and not new.activo and exists (
    select 1 from public.appointments a
    join public.schedules s on s.id = a.schedule_id
    where a.professional_id = old.id
      and a.estado in ('programada', 'confirmada')
      and public.inicio_local(s.fecha, s.hora_inicio) > now()
  ) then
    raise exception 'El profesional tiene citas futuras activas. Reprograme o cancele esas citas antes de desactivarlo.' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger professionals_validar
  before update on public.professionals
  for each row execute function public.tg_validar_profesional();

-- 4.5 Citas: validación de creación y de transiciones de estado.
--   programada -> confirmada | cancelada
--   confirmada -> atendida | no_asistio | cancelada
--   atendida, cancelada, no_asistio  -> estados finales
create or replace function public.transicion_valida(
  p_actual public.appointment_status, p_nuevo public.appointment_status)
returns boolean
language sql immutable
as $$
  select case p_actual
    when 'programada' then p_nuevo in ('confirmada', 'cancelada')
    when 'confirmada' then p_nuevo in ('atendida', 'no_asistio', 'cancelada')
    else false
  end;
$$;

create or replace function public.tg_validar_cita()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_franja public.schedules%rowtype;
  v_inicio timestamptz;
begin
  if tg_op = 'INSERT' then
    select * into v_franja from public.schedules where id = new.schedule_id;
    if not found or not v_franja.activo then
      raise exception 'La franja seleccionada no existe o no está activa.' using errcode = 'P0002';
    end if;
    -- El profesional siempre se toma de la franja (no del cliente).
    new.professional_id := v_franja.professional_id;
    v_inicio := public.inicio_local(v_franja.fecha, v_franja.hora_inicio);
    if v_inicio <= now() and not public.modo_carga_datos() then
      raise exception 'No se puede reservar una franja en fecha u hora pasada.' using errcode = '23514';
    end if;
    if new.estado <> 'programada' and not public.modo_carga_datos() then
      raise exception 'Una cita nueva debe iniciar en estado programada.' using errcode = '23514';
    end if;
    if new.estado = 'cancelada' and new.cancelled_at is null then
      new.cancelled_at := now();
    end if;
    return new;
  end if;

  -- UPDATE: campos inmutables
  if new.patient_id <> old.patient_id or new.schedule_id <> old.schedule_id
     or new.professional_id <> old.professional_id or new.created_at <> old.created_at then
    raise exception 'No se puede reasignar el paciente, la franja ni el profesional de una cita.' using errcode = '42501';
  end if;

  if new.estado <> old.estado then
    if not public.transicion_valida(old.estado, new.estado) then
      raise exception 'Transición de estado no permitida: % -> %.', old.estado, new.estado using errcode = '23514';
    end if;
    select * into v_franja from public.schedules where id = new.schedule_id;
    v_inicio := public.inicio_local(v_franja.fecha, v_franja.hora_inicio);
    if new.estado in ('atendida', 'no_asistio') and v_inicio > now() and not public.modo_carga_datos() then
      raise exception 'Solo se puede marcar como % cuando la hora de la cita ya inició.', new.estado using errcode = '23514';
    end if;
    if new.estado = 'cancelada' then
      if v_inicio <= now() and not public.modo_carga_datos() then
        raise exception 'No se puede cancelar una cita que ya inició o pasó.' using errcode = '23514';
      end if;
      new.cancelled_at := now();
      new.cancelled_by := auth.uid();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger appointments_validar
  before insert or update on public.appointments
  for each row execute function public.tg_validar_cita();

-- 4.6 Historial de estados (auditoría): quién cambió qué y cuándo.
create or replace function public.tg_historial_cita()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.estado <> old.estado then
    insert into public.status_history (appointment_id, estado_anterior, estado_nuevo, observacion, changed_by)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.estado end,
      new.estado,
      nullif(current_setting('app.observacion_estado', true), ''),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

create trigger appointments_historial
  after insert or update on public.appointments
  for each row execute function public.tg_historial_cita();

-- ---------------------------------------------------------------------
-- 5. Funciones RPC (API). Todas validan identidad y rol internamente.
-- ---------------------------------------------------------------------

-- 5.1 Catálogo público de profesionales activos.
create or replace function public.catalogo_profesionales(p_specialty_id uuid default null)
returns table (
  professional_id uuid, nombres text, specialty_id uuid,
  especialidad text, registro_profesional text)
language sql stable security definer set search_path = public
as $$
  select pr.id, p.nombres, s.id, s.nombre, pr.registro_profesional
  from public.professionals pr
  join public.profiles p    on p.id = pr.profile_id
  join public.specialties s on s.id = pr.specialty_id
  where pr.activo and p.activo and s.activo
    and (p_specialty_id is null or s.id = p_specialty_id)
  order by s.nombre, p.nombres;
$$;

-- 5.2 Búsqueda de disponibilidad: franjas activas, futuras y sin cita activa.
create or replace function public.buscar_disponibilidad(
  p_fecha date,
  p_specialty_id uuid default null,
  p_professional_id uuid default null)
returns table (
  schedule_id uuid, professional_id uuid, profesional text,
  specialty_id uuid, especialidad text,
  fecha date, hora_inicio time, hora_fin time)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesión.' using errcode = '28000';
  end if;
  if p_fecha is null then
    raise exception 'Debe indicar una fecha.' using errcode = '22023';
  end if;

  return query
  select sc.id, pr.id, p.nombres, s.id, s.nombre, sc.fecha, sc.hora_inicio, sc.hora_fin
  from public.schedules sc
  join public.professionals pr on pr.id = sc.professional_id
  join public.profiles p       on p.id = pr.profile_id
  join public.specialties s    on s.id = pr.specialty_id
  where sc.fecha = p_fecha
    and sc.activo and pr.activo and p.activo and s.activo
    and public.inicio_local(sc.fecha, sc.hora_inicio) > now()
    and (p_specialty_id is null or s.id = p_specialty_id)
    and (p_professional_id is null or pr.id = p_professional_id)
    and not exists (
      select 1 from public.appointments a
      where a.schedule_id = sc.id and a.estado <> 'cancelada')
  order by sc.hora_inicio, p.nombres;
end;
$$;

-- 5.3 Reservar cita (operación atómica).
-- El paciente reserva para sí mismo. El administrador (recepción) puede
-- reservar en nombre de un paciente indicando p_patient_id.
create or replace function public.reservar_cita(
  p_schedule_id uuid,
  p_motivo text default null,
  p_patient_id uuid default null)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_rol      public.app_role := public.app_rol();
  v_paciente uuid;
  v_perfil   public.profiles%rowtype;
  v_franja   public.schedules%rowtype;
  v_id       uuid;
begin
  if v_uid is null or v_rol is null then
    raise exception 'Debe iniciar sesión con una cuenta activa.' using errcode = '28000';
  end if;

  if p_patient_id is not null and p_patient_id <> v_uid then
    if v_rol <> 'admin' then
      raise exception 'Solo puede reservar citas para sí mismo.' using errcode = '42501';
    end if;
    v_paciente := p_patient_id;
  else
    if v_rol <> 'paciente' then
      raise exception 'Solo los pacientes pueden reservar citas para sí mismos.' using errcode = '42501';
    end if;
    v_paciente := v_uid;
  end if;

  select * into v_perfil from public.profiles where id = v_paciente;
  if not found or not v_perfil.activo or v_perfil.rol <> 'paciente' then
    raise exception 'El paciente no existe o no está activo.' using errcode = 'P0002';
  end if;
  if v_perfil.documento is null or v_perfil.telefono is null then
    raise exception 'Complete documento y teléfono en su perfil antes de reservar.' using errcode = '23502';
  end if;

  -- Bloqueo de la fila de la franja: serializa solicitudes simultáneas.
  select * into v_franja from public.schedules where id = p_schedule_id for update;
  if not found or not v_franja.activo then
    raise exception 'La franja seleccionada no existe o ya no está disponible.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.professionals pr
    join public.specialties s on s.id = pr.specialty_id
    where pr.id = v_franja.professional_id and pr.activo and s.activo) then
    raise exception 'El profesional o la especialidad no están disponibles.' using errcode = 'P0002';
  end if;

  -- El paciente no puede tener dos citas activas que se crucen.
  if exists (
    select 1 from public.appointments a
    join public.schedules s on s.id = a.schedule_id
    where a.patient_id = v_paciente
      and a.estado in ('programada', 'confirmada')
      and tsrange(s.fecha + s.hora_inicio, s.fecha + s.hora_fin, '[)')
       && tsrange(v_franja.fecha + v_franja.hora_inicio, v_franja.fecha + v_franja.hora_fin, '[)')) then
    raise exception 'Ya tiene otra cita activa que se cruza con este horario.' using errcode = '23P01';
  end if;

  begin
    insert into public.appointments (patient_id, professional_id, schedule_id, motivo)
    values (v_paciente, v_franja.professional_id, v_franja.id, nullif(btrim(p_motivo), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'La franja acaba de ser reservada por otra persona. Elija otro horario.' using errcode = '23505';
  end;

  return v_id;
end;
$$;

-- 5.4 Cambiar el estado de una cita según el rol.
create or replace function public.cambiar_estado_cita(
  p_appointment_id uuid,
  p_estado public.appointment_status,
  p_observacion text default null)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_rol    public.app_role := public.app_rol();
  v_cita   public.appointments%rowtype;
  v_inicio timestamptz;
begin
  if v_uid is null or v_rol is null then
    raise exception 'Debe iniciar sesión con una cuenta activa.' using errcode = '28000';
  end if;

  select * into v_cita from public.appointments where id = p_appointment_id for update;

  -- Mismo mensaje si no existe o no es suya: no se revela información.
  if not found
     or (v_rol = 'paciente'    and v_cita.patient_id <> v_uid)
     or (v_rol = 'profesional' and v_cita.professional_id is distinct from public.mi_professional_id()) then
    raise exception 'Cita no encontrada o sin permiso para modificarla.' using errcode = '42501';
  end if;

  if v_rol = 'paciente' then
    if p_estado <> 'cancelada' then
      raise exception 'El paciente solo puede cancelar sus citas.' using errcode = '42501';
    end if;
    select public.inicio_local(s.fecha, s.hora_inicio) into v_inicio
    from public.schedules s where s.id = v_cita.schedule_id;
    if v_inicio - now() < make_interval(hours => public.horas_minimas_cancelacion()) then
      raise exception 'Solo puede cancelar con al menos % horas de anticipación. Comuníquese con recepción.',
        public.horas_minimas_cancelacion() using errcode = '23514';
    end if;
  end if;

  perform set_config('app.observacion_estado', coalesce(left(btrim(p_observacion), 300), ''), true);

  update public.appointments
     set estado = p_estado,
         observaciones = case
           when p_observacion is not null and v_rol <> 'paciente' then left(btrim(p_observacion), 500)
           else observaciones end
   where id = p_appointment_id;

  perform set_config('app.observacion_estado', '', true);
end;
$$;

create or replace function public.cancelar_cita(p_appointment_id uuid, p_motivo text default null)
returns void
language sql volatile security definer set search_path = public
as $$
  select public.cambiar_estado_cita(p_appointment_id, 'cancelada', p_motivo);
$$;

-- 5.5 Listado de citas filtrado por rol (paciente: propias;
-- profesional: asignadas; admin: todas).
create or replace function public.listar_citas(
  p_desde date default null,
  p_hasta date default null,
  p_estado public.appointment_status default null)
returns table (
  id uuid, fecha date, hora_inicio time, hora_fin time,
  estado public.appointment_status, motivo text, observaciones text,
  paciente_id uuid, paciente_nombre text, paciente_documento text, paciente_telefono text,
  professional_id uuid, profesional_nombre text,
  specialty_id uuid, especialidad text,
  created_at timestamptz, cancelled_at timestamptz,
  puede_cancelar boolean)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_rol  public.app_role := public.app_rol();
  v_prof uuid := public.mi_professional_id();
begin
  if v_uid is null or v_rol is null then
    raise exception 'Debe iniciar sesión con una cuenta activa.' using errcode = '28000';
  end if;

  return query
  select a.id, s.fecha, s.hora_inicio, s.hora_fin, a.estado, a.motivo,
         case when v_rol = 'paciente' then null else a.observaciones end,
         pa.id, pa.nombres, pa.documento, pa.telefono,
         pr.id, pp.nombres, sp.id, sp.nombre,
         a.created_at, a.cancelled_at,
         (a.estado in ('programada', 'confirmada')
          and public.inicio_local(s.fecha, s.hora_inicio) - now()
              >= make_interval(hours => case when v_rol = 'paciente'
                                             then public.horas_minimas_cancelacion() else 0 end))
  from public.appointments a
  join public.schedules s      on s.id = a.schedule_id
  join public.profiles pa      on pa.id = a.patient_id
  join public.professionals pr on pr.id = a.professional_id
  join public.profiles pp      on pp.id = pr.profile_id
  join public.specialties sp   on sp.id = pr.specialty_id
  where (v_rol = 'admin'
         or (v_rol = 'paciente'    and a.patient_id = v_uid)
         or (v_rol = 'profesional' and a.professional_id = v_prof))
    and (p_desde  is null or s.fecha >= p_desde)
    and (p_hasta  is null or s.fecha <= p_hasta)
    and (p_estado is null or a.estado = p_estado)
  order by s.fecha, s.hora_inicio;
end;
$$;

-- 5.6 Historial de una cita (mismas reglas de visibilidad).
create or replace function public.historial_cita(p_appointment_id uuid)
returns table (
  estado_anterior public.appointment_status, estado_nuevo public.appointment_status,
  observacion text, cambiado_por text, changed_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rol public.app_role := public.app_rol();
begin
  if not exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id
      and (v_rol = 'admin'
           or (v_rol = 'paciente'    and a.patient_id = v_uid)
           or (v_rol = 'profesional' and a.professional_id = public.mi_professional_id()))) then
    raise exception 'Cita no encontrada o sin permiso.' using errcode = '42501';
  end if;

  return query
  select h.estado_anterior, h.estado_nuevo, h.observacion,
         coalesce(p.nombres, 'Sistema'), h.changed_at
  from public.status_history h
  left join public.profiles p on p.id = h.changed_by
  where h.appointment_id = p_appointment_id
  order by h.changed_at, h.id;
end;
$$;

-- 5.7 Generación masiva de franjas (solo administrador).
-- p_dias_semana usa ISO: 1 = lunes ... 7 = domingo.
create or replace function public.generar_franjas(
  p_professional_id uuid,
  p_desde date,
  p_hasta date,
  p_hora_inicio time,
  p_hora_fin time,
  p_duracion_min integer default 30,
  p_dias_semana integer[] default array[1, 2, 3, 4, 5])
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_dia    date;
  v_hora   time;
  v_fin    time;
  v_creadas integer := 0;
  v_n      integer;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede generar franjas.' using errcode = '42501';
  end if;
  if p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'El rango de fechas debe ser válido y de máximo 62 días.' using errcode = '22023';
  end if;
  if p_duracion_min not between 10 and 240 or p_hora_fin <= p_hora_inicio then
    raise exception 'Duración u horas inválidas.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.professionals where id = p_professional_id and activo) then
    raise exception 'El profesional no existe o está inactivo.' using errcode = 'P0002';
  end if;

  v_dia := p_desde;
  while v_dia <= p_hasta loop
    if extract(isodow from v_dia)::int = any (p_dias_semana) then
      v_hora := p_hora_inicio;
      loop
        v_fin := v_hora + make_interval(mins => p_duracion_min);
        exit when v_fin > p_hora_fin or v_fin <= v_hora;
        if public.inicio_local(v_dia, v_hora) > now() then
          -- DO NOTHING omite franjas que se superpongan con otras existentes.
          insert into public.schedules (professional_id, fecha, hora_inicio, hora_fin)
          values (p_professional_id, v_dia, v_hora, v_fin)
          on conflict do nothing;
          get diagnostics v_n = row_count;
          v_creadas := v_creadas + v_n;
        end if;
        v_hora := v_fin;
      end loop;
    end if;
    v_dia := v_dia + 1;
  end loop;
  return v_creadas;
end;
$$;

-- 5.8 Convertir un usuario registrado en profesional (solo admin).
create or replace function public.registrar_profesional(
  p_profile_id uuid,
  p_specialty_id uuid,
  p_registro text default null)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede registrar profesionales.' using errcode = '42501';
  end if;
  if exists (select 1 from public.appointments
             where patient_id = p_profile_id and estado in ('programada', 'confirmada')) then
    raise exception 'El usuario tiene citas activas como paciente.' using errcode = '23514';
  end if;

  update public.profiles set rol = 'profesional' where id = p_profile_id and rol <> 'admin';
  if not found then
    raise exception 'Usuario no encontrado o es administrador.' using errcode = 'P0002';
  end if;

  insert into public.professionals (profile_id, specialty_id, registro_profesional)
  values (p_profile_id, p_specialty_id, nullif(btrim(p_registro), ''))
  on conflict (profile_id) do update
    set specialty_id = excluded.specialty_id,
        registro_profesional = excluded.registro_profesional,
        activo = true
  returning id into v_id;
  return v_id;
end;
$$;

-- 5.9 Indicadores para el panel administrativo.
create or replace function public.indicadores(p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_res jsonb;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede consultar indicadores.' using errcode = '42501';
  end if;

  with base as (
    select a.estado, sp.nombre as especialidad, s.fecha
    from public.appointments a
    join public.schedules s      on s.id = a.schedule_id
    join public.professionals pr on pr.id = a.professional_id
    join public.specialties sp   on sp.id = pr.specialty_id
    where s.fecha between p_desde and p_hasta
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'por_estado', coalesce((select jsonb_agg(jsonb_build_object('etiqueta', estado, 'total', n) order by n desc)
                   from (select estado::text, count(*) n from base group by estado) x), '[]'),
    'por_especialidad', coalesce((select jsonb_agg(jsonb_build_object('etiqueta', especialidad, 'total', n) order by n desc)
                   from (select especialidad, count(*) n from base group by especialidad) x), '[]'),
    'por_periodo', coalesce((select jsonb_agg(jsonb_build_object('etiqueta', periodo, 'total', n) order by periodo)
                   from (select to_char(fecha, 'YYYY-MM') periodo, count(*) n from base group by 1) x), '[]'),
    'tasa_inasistencia', (select round(100.0 * count(*) filter (where estado = 'no_asistio')
                            / nullif(count(*) filter (where estado in ('atendida', 'no_asistio')), 0), 1) from base)
  ) into v_res;
  return v_res;
end;
$$;

-- 5.10 Anonimizar un paciente (alternativa al borrado físico).
create or replace function public.anonimizar_paciente(p_profile_id uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede anonimizar pacientes.' using errcode = '42501';
  end if;
  if exists (select 1 from public.appointments a join public.schedules s on s.id = a.schedule_id
             where a.patient_id = p_profile_id and a.estado in ('programada', 'confirmada')
               and public.inicio_local(s.fecha, s.hora_inicio) > now()) then
    raise exception 'El paciente tiene citas futuras activas.' using errcode = '23514';
  end if;
  update public.profiles
     set nombres = 'Paciente anonimizado', documento = null, telefono = null,
         fecha_nacimiento = null, activo = false
   where id = p_profile_id and rol = 'paciente';
  if not found then
    raise exception 'Paciente no encontrado.' using errcode = 'P0002';
  end if;
end;
$$;
