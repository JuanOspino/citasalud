import { authApi, perfilApi, catalogoApi } from '../api.js';
import { configuracionCompleta } from '../supabaseClient.js';
import { RUTA_POR_ROL, redirigirSiHaySesion } from '../auth.js';
import { $, el, vaciar, mostrarAlerta, conCarga } from '../ui.js';
import { validarFormulario, reglas, datosFormulario } from '../validacion.js';

const formulario = $('#form-login');
const alerta = $('#alerta-login');

const MENSAJES_URL = {
  'sesion=expirada': ['Su sesión expiró. Inicie sesión nuevamente.', 'aviso'],
  'sesion=requerida': ['Inicie sesión para continuar.', 'info'],
  'sesion=cerrada': ['Cerró sesión correctamente.', 'exito'],
  'cuenta=inactiva': ['Su cuenta está inactiva. Comuníquese con la institución.', 'error'],
};

function mensajeDesdeUrl() {
  const q = location.search.slice(1);
  for (const [clave, [texto, tipo]] of Object.entries(MENSAJES_URL)) {
    if (q.includes(clave)) { mostrarAlerta(alerta, texto, tipo); return; }
  }
}

async function cargarEspecialidades() {
  const lista = $('#lista-especialidades');
  try {
    const especialidades = await catalogoApi.especialidades();
    vaciar(lista, especialidades.length
      ? especialidades.map((e) => el('li', { text: e.nombre, title: e.descripcion || '' }))
      : el('li', { text: 'Aún no hay especialidades publicadas.' }));
  } catch {
    vaciar(lista, el('li', { text: 'No fue posible cargar las especialidades.' }));
  }
}

formulario.addEventListener('submit', (e) => {
  e.preventDefault();
  mostrarAlerta(alerta, null);
  if (!validarFormulario(formulario, { correo: [reglas.requerido, reglas.correo], clave: [reglas.requerido] })) return;
  const { correo, clave } = datosFormulario(formulario);
  const boton = formulario.querySelector('button[type="submit"]');
  conCarga(boton, async () => {
    try {
      const { user } = await authApi.iniciarSesion(correo, clave);
      const perfil = await perfilApi.obtener(user.id);
      if (!perfil.activo) {
        await authApi.cerrarSesion();
        mostrarAlerta(alerta, MENSAJES_URL['cuenta=inactiva'][0]);
        return;
      }
      window.location.replace(RUTA_POR_ROL[perfil.rol]);
    } catch (err) {
      mostrarAlerta(alerta, err.message, 'error');
      formulario.elements.clave.value = '';
    }
  }, 'Ingresando…');
});

if (!configuracionCompleta) {
  const aviso = $('#aviso-config');
  mostrarAlerta(aviso, 'Configuración pendiente: edite assets/js/config.js con la URL y la clave anon de su proyecto Supabase (ver README).', 'aviso');
  vaciar($('#lista-especialidades'), el('li', { text: 'Sin conexión a Supabase' }));
} else {
  mensajeDesdeUrl();
  redirigirSiHaySesion().then((redirigido) => { if (!redirigido) cargarEspecialidades(); });
}
