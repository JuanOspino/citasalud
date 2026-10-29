/**
 * Configuración pública del frontend.
 *
 * La clave "anon" (o "publishable") de Supabase ES PÚBLICA por diseño:
 * la seguridad real la imponen RLS y las funciones de la base de datos.
 * NUNCA coloque aquí la clave service_role / secret.
 *
 * Reemplace los dos valores con los de su proyecto:
 * Supabase > Project Settings > API (Project URL y anon public key).
 */
export const CONFIG = Object.freeze({
  SUPABASE_URL: 'https://ganlbekkwmbrfqwpdsfd.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_yNovkNE-ubY2dJJvcLG8LQ_qmoPne3D',
  ZONA_HORARIA: 'America/Bogota',
  HORAS_MINIMAS_CANCELACION: 2, // Debe coincidir con horas_minimas_cancelacion() en SQL
  NOMBRE_INSTITUCION: 'IPS Ambulatoria Bienestar (ficticia)',
});
