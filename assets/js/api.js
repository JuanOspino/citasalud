/**
 * Capa de acceso a datos. Ningún otro módulo llama a Supabase directamente.
 * Todas las funciones lanzan ErrorApp con un mensaje comprensible.
 */
import { supabase, configuracionCompleta } from './supabaseClient.js';

export class ErrorApp extends Error {
  constructor(mensaje, { codigo = null, conflicto = false, sesionExpirada = false } = {}) {
    super(mensaje);
    this.codigo = codigo;
    this.conflicto = conflicto;
    this.sesionExpirada = sesionExpirada;
  }
}

// Códigos que nuestras funciones SQL lanzan con mensajes ya redactados en español.
const CODIGOS_PROPIOS = new Set(['P0001', 'P0002', '42501', '23505', '23514', '23P01', '28000', '22023', '23502', '23503']);

const POR_RESTRICCION = [
  ['specialties_nombre_uk', 'Ya existe una especialidad con ese nombre.'],
  ['schedules_sin_solape_ex', 'La franja se cruza con otra franja activa del mismo profesional.'],
  ['schedules_horas_ck', 'La hora de fin debe ser posterior a la hora de inicio.'],
  ['schedules_duracion_ck', 'La franja debe durar entre 10 minutos y 4 horas.'],
  ['profiles_documento_key', 'Ese número de documento ya está registrado.'],
  ['professionals_registro_profesional_key', 'Ese registro profesional ya está asignado.'],
  ['appointments_franja_activa_uk', 'La franja acaba de ser reservada por otra persona. Elija otro horario.'],
];

const MENSAJES_AUTH = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/user already registered/i, 'Ya existe una cuenta con ese correo.'],
  [/email not confirmed/i, 'Debe confirmar su correo antes de iniciar sesión. Revise su bandeja de entrada.'],
  [/database error saving new user/i, 'No fue posible crear la cuenta. Verifique que el documento no esté registrado y que los datos tengan el formato correcto.'],
  [/rate limit|too many requests/i, 'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.'],
  [/password should be/i, 'La contraseña no cumple la política de seguridad (mínimo 8 caracteres).'],
  [/new password should be different/i, 'La nueva contraseña debe ser diferente a la anterior.'],
];

export function traducirError(error) {
  if (!error) return new ErrorApp('Error desconocido.');
  if (error instanceof ErrorApp) return error;
  const mensaje = String(error.message || error.error_description || error);
  const codigo = error.code || null;

  if (/failed to fetch|networkerror|load failed/i.test(mensaje)) {
    return new ErrorApp('No hay conexión con el servidor. Verifique su internet e inténtelo de nuevo.', { codigo: 'RED' });
  }
  if (codigo === 'PGRST301' || codigo === 'PGRST303' || /jwt expired|invalid jwt/i.test(mensaje)) {
    return new ErrorApp('Su sesión expiró. Inicie sesión nuevamente.', { codigo, sesionExpirada: true });
  }
  for (const [restriccion, texto] of POR_RESTRICCION) {
    if (mensaje.includes(restriccion)) return new ErrorApp(texto, { codigo, conflicto: restriccion === 'appointments_franja_activa_uk' });
  }
  for (const [patron, texto] of MENSAJES_AUTH) {
    if (patron.test(mensaje)) return new ErrorApp(texto, { codigo });
  }
  if (/permission denied|row-level security/i.test(mensaje)) {
    return new ErrorApp('No tiene permiso para realizar esta acción.', { codigo: '42501' });
  }
  if (/violates check constraint/i.test(mensaje)) {
    return new ErrorApp('Algún dato no cumple el formato requerido.', { codigo });
  }
  if (CODIGOS_PROPIOS.has(codigo)) {
    return new ErrorApp(mensaje, { codigo, conflicto: codigo === '23505' });
  }
  console.error('[api] Error no clasificado', error);
  return new ErrorApp('No fue posible completar la operación. Inténtelo de nuevo.', { codigo });
}

/** Ejecuta una consulta de Supabase y devuelve data o lanza ErrorApp. */
async function ejecutar(consulta) {
  if (!configuracionCompleta) {
    throw new ErrorApp('La aplicación no está configurada: edite assets/js/config.js con la URL y la clave anon de Supabase.');
  }
  let respuesta;
  try {
    respuesta = await consulta;
  } catch (e) {
    throw traducirError(e);
  }
  if (respuesta.error) {
    const err = traducirError(respuesta.error);
    if (err.sesionExpirada) {
      setTimeout(() => { window.location.href = 'index.html?sesion=expirada'; }, 1500);
    }
    throw err;
  }
  return respuesta.data;
}

/* ===================== Autenticación ===================== */
export const authApi = {
  iniciarSesion: (correo, clave) => ejecutar(supabase.auth.signInWithPassword({ email: correo, password: clave })),

  registrarse: ({ correo, clave, nombres, documento, telefono, fecha_nacimiento }) => ejecutar(
    supabase.auth.signUp({
      email: correo,
      password: clave,
      options: {
        // Solo datos básicos. El rol NO se envía: el servidor siempre asigna "paciente".
        data: { nombres, documento, telefono, fecha_nacimiento: fecha_nacimiento || null },
        emailRedirectTo: new URL('index.html', window.location.href).href,
      },
    }),
  ),

  enviarRecuperacion: (correo) => ejecutar(
    supabase.auth.resetPasswordForEmail(correo, { redirectTo: new URL('recuperar.html', window.location.href).href }),
  ),

  actualizarClave: (clave) => ejecutar(supabase.auth.updateUser({ password: clave })),

  cerrarSesion: () => supabase.auth.signOut(),

  async obtenerSesion() {
    if (!configuracionCompleta) return null;
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  alCambiarSesion: (callback) => supabase.auth.onAuthStateChange(callback),
};

/* ===================== Perfil ===================== */
export const perfilApi = {
  obtener: (id) => ejecutar(
    supabase.from('profiles').select('id, nombres, documento, telefono, fecha_nacimiento, rol, activo').eq('id', id).single(),
  ),
  actualizar: (id, { nombres, documento, telefono, fecha_nacimiento }) => ejecutar(
    supabase.from('profiles')
      .update({ nombres, documento, telefono, fecha_nacimiento: fecha_nacimiento || null })
      .eq('id', id).select().single(),
  ),
};

/* ===================== Catálogos ===================== */
export const catalogoApi = {
  especialidades: ({ incluirInactivas = false } = {}) => {
    let q = supabase.from('specialties').select('id, nombre, descripcion, activo').order('nombre');
    if (!incluirInactivas) q = q.eq('activo', true);
    return ejecutar(q);
  },
  profesionales: (specialtyId = null) => ejecutar(
    supabase.rpc('catalogo_profesionales', { p_specialty_id: specialtyId || null }),
  ),
};

/* ===================== Citas ===================== */
export const citasApi = {
  buscarDisponibilidad: ({ fecha, specialtyId = null, professionalId = null }) => ejecutar(
    supabase.rpc('buscar_disponibilidad', {
      p_fecha: fecha, p_specialty_id: specialtyId || null, p_professional_id: professionalId || null,
    }),
  ),
  reservar: ({ scheduleId, motivo = null, patientId = null }) => ejecutar(
    supabase.rpc('reservar_cita', { p_schedule_id: scheduleId, p_motivo: motivo || null, p_patient_id: patientId || null }),
  ),
  listar: ({ desde = null, hasta = null, estado = null } = {}) => ejecutar(
    supabase.rpc('listar_citas', { p_desde: desde || null, p_hasta: hasta || null, p_estado: estado || null }),
  ),
  cambiarEstado: (id, estado, observacion = null) => ejecutar(
    supabase.rpc('cambiar_estado_cita', { p_appointment_id: id, p_estado: estado, p_observacion: observacion || null }),
  ),
  cancelar: (id, motivo = null) => ejecutar(
    supabase.rpc('cancelar_cita', { p_appointment_id: id, p_motivo: motivo || null }),
  ),
  historial: (id) => ejecutar(supabase.rpc('historial_cita', { p_appointment_id: id })),
};

/* ===================== Administración ===================== */
/** Elimina caracteres con significado en la sintaxis de filtros de PostgREST. */
const limpiarBusqueda = (texto) => String(texto || '').replace(/[,()*%\\"':.]/g, ' ').trim().slice(0, 60);

export const adminApi = {
  crearEspecialidad: ({ nombre, descripcion }) => ejecutar(
    supabase.from('specialties').insert({ nombre, descripcion: descripcion || null }).select().single(),
  ),
  actualizarEspecialidad: (id, cambios) => ejecutar(
    supabase.from('specialties').update(cambios).eq('id', id).select().single(),
  ),

  profesionales: () => ejecutar(
    supabase.from('professionals')
      .select('id, registro_profesional, activo, specialty_id, profile_id, perfil:profiles!professionals_profile_id_fkey(nombres, documento, telefono, activo), especialidad:specialties(nombre)')
      .order('created_at'),
  ),
  actualizarProfesional: (id, cambios) => ejecutar(
    supabase.from('professionals').update(cambios).eq('id', id).select().single(),
  ),
  registrarProfesional: ({ profileId, specialtyId, registro }) => ejecutar(
    supabase.rpc('registrar_profesional', { p_profile_id: profileId, p_specialty_id: specialtyId, p_registro: registro || null }),
  ),

  buscarPacientes: (texto) => {
    const t = limpiarBusqueda(texto);
    let q = supabase.from('profiles').select('id, nombres, documento, telefono, activo')
      .eq('rol', 'paciente').eq('activo', true).order('nombres').limit(20);
    if (t) q = q.or(`nombres.ilike.*${t}*,documento.ilike.*${t}*`);
    return ejecutar(q);
  },

  listarPacientes: ({ texto = '', estado = 'activos' } = {}) => {
    const t = limpiarBusqueda(texto);
    let q = supabase.from('profiles').select('id, nombres, documento, telefono, fecha_nacimiento, activo')
      .eq('rol', 'paciente').order('nombres').limit(50);
    if (estado === 'activos') q = q.eq('activo', true);
    if (estado === 'inactivos') q = q.eq('activo', false);
    if (t) q = q.or(`nombres.ilike.*${t}*,documento.ilike.*${t}*`);
    return ejecutar(q);
  },
  cambiarEstadoPerfil: (id, activo) => ejecutar(
    supabase.from('profiles').update({ activo }).eq('id', id).select('id, activo').single(),
  ),
  anonimizarPaciente: (id) => ejecutar(supabase.rpc('anonimizar_paciente', { p_profile_id: id })),

  franjas: ({ professionalId, desde, hasta }) => ejecutar(
    supabase.from('schedules')
      .select('id, fecha, hora_inicio, hora_fin, activo, citas:appointments(id, estado)')
      .eq('professional_id', professionalId)
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha').order('hora_inicio'),
  ),
  crearFranja: ({ professionalId, fecha, horaInicio, horaFin }) => ejecutar(
    supabase.from('schedules').insert({ professional_id: professionalId, fecha, hora_inicio: horaInicio, hora_fin: horaFin }).select().single(),
  ),
  actualizarFranja: (id, cambios) => ejecutar(supabase.from('schedules').update(cambios).eq('id', id).select().single()),
  eliminarFranja: (id) => ejecutar(supabase.from('schedules').delete().eq('id', id)),
  generarFranjas: ({ professionalId, desde, hasta, horaInicio, horaFin, duracion, dias }) => ejecutar(
    supabase.rpc('generar_franjas', {
      p_professional_id: professionalId, p_desde: desde, p_hasta: hasta,
      p_hora_inicio: horaInicio, p_hora_fin: horaFin, p_duracion_min: Number(duracion), p_dias_semana: dias,
    }),
  ),

  indicadores: (desde, hasta) => ejecutar(supabase.rpc('indicadores', { p_desde: desde, p_hasta: hasta })),
};
