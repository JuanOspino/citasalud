/**
 * Cliente único de Supabase compartido por todos los módulos.
 * Versión fijada para builds reproducibles.
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.99.3/+esm';
import { CONFIG } from './config.js';

export const configuracionCompleta =
  !CONFIG.SUPABASE_URL.includes('TU-PROYECTO') && !CONFIG.SUPABASE_ANON_KEY.startsWith('TU_');

export const supabase = createClient(
  configuracionCompleta ? CONFIG.SUPABASE_URL : 'https://configuracion-pendiente.supabase.co',
  configuracionCompleta ? CONFIG.SUPABASE_ANON_KEY : 'clave-pendiente',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
