import { authApi } from '../api.js';
import { $, mostrarAlerta, conCarga, hoyISO } from '../ui.js';
import { validarFormulario, reglas, datosFormulario } from '../validacion.js';

const formulario = $('#form-registro');
const alerta = $('#alerta-registro');
formulario.elements.fecha_nacimiento.max = hoyISO();

formulario.addEventListener('submit', (e) => {
  e.preventDefault();
  mostrarAlerta(alerta, null);
  const coincide = (v) => (v === formulario.elements.clave.value ? null : 'Las contraseñas no coinciden.');
  const valido = validarFormulario(formulario, {
    nombres: [reglas.requerido, reglas.nombres],
    documento: [reglas.requerido, reglas.documento],
    telefono: [reglas.requerido, reglas.telefono],
    fecha_nacimiento: [reglas.fechaNacimiento],
    correo: [reglas.requerido, reglas.correo],
    clave: [reglas.requerido, reglas.clave],
    clave2: [reglas.requerido, coincide],
  });
  if (!valido) return;

  const datos = datosFormulario(formulario);
  const boton = formulario.querySelector('button[type="submit"]');
  conCarga(boton, async () => {
    try {
      const { session } = await authApi.registrarse(datos);
      formulario.reset();
      if (session) {
        // Confirmación de correo desactivada en el proyecto: entra directamente.
        window.location.replace('paciente.html');
      } else {
        mostrarAlerta(alerta, 'Cuenta creada. Revise su correo y confirme la cuenta para poder iniciar sesión.', 'exito');
      }
    } catch (err) {
      mostrarAlerta(alerta, err.message, 'error');
    }
  }, 'Creando cuenta…');
});
