/**
 * Validaciones del lado del cliente (primera barrera, mejora la UX).
 * La base de datos vuelve a validar todo con CHECK, disparadores y RLS.
 */
import { hoyISO } from './ui.js';

export const reglas = {
  requerido: (v) => (String(v ?? '').trim() ? null : 'Este campo es obligatorio.'),
  correo: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'Ingrese un correo válido.'),
  clave: (v) => (/^(?=.*[A-Za-z])(?=.*\d).{8,72}$/.test(v) ? null : 'Mínimo 8 caracteres, con al menos una letra y un número.'),
  nombres: (v) => {
    const t = String(v ?? '').trim();
    return t.length >= 3 && t.length <= 120 ? null : 'Escriba entre 3 y 120 caracteres.';
  },
  documento: (v) => (/^[0-9]{5,15}$/.test(v) ? null : 'Solo números, entre 5 y 15 dígitos.'),
  telefono: (v) => (/^\+?[0-9]{7,15}$/.test(v) ? null : 'Solo números (7 a 15), opcionalmente con + al inicio.'),
  fechaNacimiento: (v) => {
    if (!v) return null;
    return v >= '1900-01-01' && v <= hoyISO() ? null : 'La fecha debe estar entre 1900 y hoy.';
  },
  fechaNoPasada: (v) => (v && v >= hoyISO() ? null : 'Seleccione hoy o una fecha futura.'),
  maximo: (n) => (v) => (String(v ?? '').length <= n ? null : `Máximo ${n} caracteres.`),
};

/**
 * Valida un formulario. `esquema` = { nombreCampo: [regla, regla...] }.
 * Marca aria-invalid, muestra el mensaje junto al campo y enfoca el primero inválido.
 * @returns {boolean}
 */
export function validarFormulario(formulario, esquema) {
  let primero = null;
  for (const [nombre, validadores] of Object.entries(esquema)) {
    const campo = formulario.elements[nombre];
    if (!campo) continue;
    const valor = campo.value;
    const error = validadores.map((fn) => fn(valor)).find(Boolean) || null;
    const idError = `${campo.id || nombre}-error`;
    let nodoError = formulario.querySelector(`#${CSS.escape(idError)}`);
    if (!nodoError) {
      nodoError = document.createElement('p');
      nodoError.id = idError;
      nodoError.className = 'error-campo';
      campo.insertAdjacentElement('afterend', nodoError);
    }
    nodoError.textContent = error || '';
    campo.setAttribute('aria-invalid', error ? 'true' : 'false');
    const describedBy = new Set((campo.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
    describedBy.add(idError);
    campo.setAttribute('aria-describedby', [...describedBy].join(' '));
    if (error && !primero) primero = campo;
  }
  primero?.focus();
  return !primero;
}

export function datosFormulario(formulario) {
  const datos = {};
  for (const [k, v] of new FormData(formulario).entries()) datos[k] = typeof v === 'string' ? v.trim() : v;
  return datos;
}
