import { authApi } from '../api.js';
import { $, mostrarAlerta, conCarga } from '../ui.js';
import { validarFormulario, reglas, datosFormulario } from '../validacion.js';

const pasoSolicitar = $('#paso-solicitar');
const pasoNueva = $('#paso-nueva');
const formSolicitar = $('#form-solicitar');
const formNueva = $('#form-nueva');

// Cuando el usuario llega desde el enlace del correo, Supabase emite PASSWORD_RECOVERY.
authApi.alCambiarSesion((evento) => {
  if (evento === 'PASSWORD_RECOVERY') {
    pasoSolicitar.hidden = true;
    pasoNueva.hidden = false;
    formNueva.elements.clave.focus();
  }
});

formSolicitar.addEventListener('submit', (e) => {
  e.preventDefault();
  const alerta = $('#alerta-solicitar');
  if (!validarFormulario(formSolicitar, { correo: [reglas.requerido, reglas.correo] })) return;
  const { correo } = datosFormulario(formSolicitar);
  conCarga(formSolicitar.querySelector('button'), async () => {
    try {
      await authApi.enviarRecuperacion(correo);
      // Mensaje neutro: no revela si el correo existe.
      mostrarAlerta(alerta, 'Si el correo está registrado, recibirá un enlace en los próximos minutos.', 'exito');
      formSolicitar.reset();
    } catch (err) {
      mostrarAlerta(alerta, err.message, 'error');
    }
  }, 'Enviando…');
});

formNueva.addEventListener('submit', (e) => {
  e.preventDefault();
  const alerta = $('#alerta-nueva');
  const coincide = (v) => (v === formNueva.elements.clave.value ? null : 'Las contraseñas no coinciden.');
  if (!validarFormulario(formNueva, { clave: [reglas.requerido, reglas.clave], clave2: [reglas.requerido, coincide] })) return;
  conCarga(formNueva.querySelector('button'), async () => {
    try {
      await authApi.actualizarClave(formNueva.elements.clave.value);
      await authApi.cerrarSesion();
      window.location.replace('index.html?sesion=cerrada');
    } catch (err) {
      mostrarAlerta(alerta, err.message, 'error');
    }
  }, 'Guardando…');
});
