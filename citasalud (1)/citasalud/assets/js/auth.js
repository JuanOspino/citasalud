/**
 * Manejo de sesión y control de acceso en la interfaz.
 * IMPORTANTE: esto solo decide QUÉ PANTALLA mostrar. La autorización real
 * la imponen RLS y las funciones SQL; ocultar botones no es seguridad.
 */
import { authApi, perfilApi } from './api.js';
import { configuracionCompleta } from './supabaseClient.js';
import { el, vaciar, $, mostrarAviso } from './ui.js';

let cerrandoSesion = false;

export const RUTA_POR_ROL = Object.freeze({
  paciente: 'paciente.html',
  profesional: 'profesional.html',
  admin: 'admin.html',
});

export const NOMBRE_ROL = Object.freeze({
  paciente: 'Paciente',
  profesional: 'Profesional de salud',
  admin: 'Administración',
});

/**
 * Verifica sesión, perfil activo y rol. Si no cumple, redirige.
 * @param {string[]} rolesPermitidos
 * @returns {Promise<{sesion, perfil}>}
 */
export async function protegerPagina(rolesPermitidos) {
  if (!configuracionCompleta) {
    window.location.replace('index.html');
    return new Promise(() => {});
  }
  const sesion = await authApi.obtenerSesion();
  if (!sesion) {
    window.location.replace('index.html?sesion=requerida');
    return new Promise(() => {});
  }

  let perfil;
  try {
    perfil = await perfilApi.obtener(sesion.user.id);
  } catch {
    await authApi.cerrarSesion();
    window.location.replace('index.html?sesion=expirada');
    return new Promise(() => {});
  }

  if (!perfil.activo) {
    await authApi.cerrarSesion();
    window.location.replace('index.html?cuenta=inactiva');
    return new Promise(() => {});
  }

  if (!rolesPermitidos.includes(perfil.rol)) {
    window.location.replace(`${RUTA_POR_ROL[perfil.rol]}?acceso=denegado`);
    return new Promise(() => {});
  }

  // Si la sesión se cierra en otra pestaña o expira, volver al inicio.
  authApi.alCambiarSesion((evento) => {
    if (evento === 'SIGNED_OUT' && !cerrandoSesion) window.location.replace('index.html');
  });

  pintarEncabezado(perfil);
  if (new URLSearchParams(location.search).get('acceso') === 'denegado') {
    mostrarAviso('No tiene permiso para acceder a esa sección. Se le redirigió a su panel.', 'error');
  }
  return { sesion, perfil };
}

function pintarEncabezado(perfil) {
  const saludo = $('#saludo');
  if (saludo) saludo.textContent = `Hola, ${perfil.nombres.trim().split(/\s+/)[0]}`;
  const zona = $('#usuario');
  if (!zona) return;
  const salir = el('button', { class: 'boton boton--secundario boton--pequeno', type: 'button', text: 'Cerrar sesión' });
  salir.addEventListener('click', async () => {
    salir.disabled = true;
    cerrandoSesion = true;
    await authApi.cerrarSesion();
    window.location.replace('index.html?sesion=cerrada');
  });
  vaciar(zona,
    el('span', { text: perfil.nombres }),
    el('span', { class: 'usuario__rol', text: NOMBRE_ROL[perfil.rol] }),
    salir);
}

/** Redirige al panel correspondiente si ya hay sesión activa. */
export async function redirigirSiHaySesion() {
  const sesion = await authApi.obtenerSesion();
  if (!sesion) return false;
  try {
    const perfil = await perfilApi.obtener(sesion.user.id);
    if (perfil.activo) {
      window.location.replace(RUTA_POR_ROL[perfil.rol]);
      return true;
    }
  } catch { /* sesión inválida: se queda en la página */ }
  return false;
}
