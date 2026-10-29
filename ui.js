/**
 * Utilidades de interfaz.
 * REGLA DE SEGURIDAD: nunca se usa innerHTML con datos. Todo el contenido
 * dinámico se inserta con textContent / createTextNode mediante el().
 */
import { CONFIG } from './config.js';

/**
 * Crea un elemento DOM de forma segura.
 * @param {string} etiqueta
 * @param {object} props  class, text, attrs, dataset, on{Evento}
 * @param  {...(Node|string|number|null|false)} hijos
 */
export function el(etiqueta, props = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(props || {})) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (clave === 'class') nodo.className = valor;
    else if (clave === 'text') nodo.textContent = String(valor);
    else if (clave === 'dataset') Object.assign(nodo.dataset, valor);
    else if (clave === 'attrs') {
      for (const [a, v] of Object.entries(valor)) if (v !== undefined && v !== null && v !== false) nodo.setAttribute(a, v === true ? '' : String(v));
    } else if (clave.startsWith('on') && typeof valor === 'function') {
      nodo.addEventListener(clave.slice(2).toLowerCase(), valor);
    } else if (clave in nodo) {
      nodo[clave] = valor;
    } else {
      nodo.setAttribute(clave, String(valor));
    }
  }
  agregarHijos(nodo, hijos);
  return nodo;
}

function agregarHijos(nodo, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
}

export function vaciar(nodo, ...hijos) {
  nodo.replaceChildren();
  agregarHijos(nodo, hijos);
}

export const $ = (selector, raiz = document) => raiz.querySelector(selector);

/* ------------------------------------------------------------------ */
/* Estados de vista: cargando, vacío, error, acceso denegado           */
/* ------------------------------------------------------------------ */
export function mostrarEstado(contenedor, tipo, mensaje) {
  const textos = {
    cargando: 'Cargando…',
    vacio: 'No hay información para mostrar.',
    error: 'Ocurrió un error al cargar la información.',
    denegado: 'No tiene permiso para ver este contenido.',
  };
  const caja = el('div', {
    class: `estado-vista${tipo === 'error' || tipo === 'denegado' ? ' estado-vista--error' : ''}`,
    attrs: { role: tipo === 'error' ? 'alert' : 'status', 'aria-live': 'polite', 'aria-busy': tipo === 'cargando' ? 'true' : null },
  },
  tipo === 'cargando' ? el('div', { class: 'spinner', attrs: { 'aria-hidden': 'true' } }) : null,
  el('p', { text: mensaje || textos[tipo] }));
  vaciar(contenedor, caja);
}

/* ------------------------------------------------------------------ */
/* Avisos emergentes (toasts) y alertas en línea                        */
/* ------------------------------------------------------------------ */
function contenedorAvisos() {
  let caja = document.getElementById('avisos');
  if (!caja) {
    caja = el('div', { id: 'avisos', class: 'avisos', attrs: { 'aria-live': 'polite', role: 'status' } });
    document.body.append(caja);
  }
  return caja;
}

export function mostrarAviso(mensaje, tipo = 'info', duracionMs = 5000) {
  const aviso = el('div', { class: `aviso aviso--${tipo}`, attrs: { role: tipo === 'error' ? 'alert' : null } }, mensaje);
  contenedorAvisos().append(aviso);
  setTimeout(() => aviso.remove(), tipo === 'error' ? duracionMs + 3000 : duracionMs);
}

export function mostrarAlerta(contenedor, mensaje, tipo = 'error') {
  if (!mensaje) { contenedor.hidden = true; vaciar(contenedor); return; }
  contenedor.className = `alerta alerta--${tipo}`;
  contenedor.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  vaciar(contenedor, mensaje);
  contenedor.hidden = false;
}

/* ------------------------------------------------------------------ */
/* Diálogos                                                             */
/* ------------------------------------------------------------------ */
export function abrirDialogo({ titulo, contenido = [], acciones = [] }) {
  const idTitulo = `dlg-${Math.random().toString(36).slice(2)}`;
  const dialogo = el('dialog', { attrs: { 'aria-labelledby': idTitulo } },
    el('div', { class: 'dialogo__cuerpo' }, el('h2', { id: idTitulo, text: titulo }), contenido),
    el('div', { class: 'dialogo__pie' }, acciones));
  dialogo.addEventListener('close', () => dialogo.remove());
  document.body.append(dialogo);
  dialogo.showModal();
  return dialogo;
}

/** Confirmación accesible. Devuelve Promise<boolean>. */
export function confirmar({ titulo = '¿Confirmar acción?', mensaje, textoAceptar = 'Confirmar', peligro = false }) {
  return new Promise((resolver) => {
    let aceptado = false;
    const cancelar = el('button', { class: 'boton boton--secundario', type: 'button', text: 'Volver' });
    const aceptar = el('button', { class: `boton${peligro ? ' boton--peligro' : ''}`, type: 'button', text: textoAceptar });
    const dialogo = abrirDialogo({ titulo, contenido: [el('p', { text: mensaje })], acciones: [cancelar, aceptar] });
    cancelar.addEventListener('click', () => dialogo.close());
    aceptar.addEventListener('click', () => { aceptado = true; dialogo.close(); });
    dialogo.addEventListener('close', () => resolver(aceptado));
    cancelar.focus();
  });
}

/** Deshabilita el botón mientras se ejecuta la operación asíncrona. */
export async function conCarga(boton, operacion, textoCargando = 'Procesando…') {
  const original = boton ? boton.textContent : '';
  if (boton) { boton.disabled = true; boton.textContent = textoCargando; boton.setAttribute('aria-busy', 'true'); }
  try {
    return await operacion();
  } finally {
    if (boton) { boton.disabled = false; boton.textContent = original; boton.removeAttribute('aria-busy'); }
  }
}

/* ------------------------------------------------------------------ */
/* Pestañas accesibles (role=tablist) con soporte de teclado           */
/* ------------------------------------------------------------------ */
export function configurarPestanas(lista, alCambiar) {
  const botones = [...lista.querySelectorAll('[role="tab"]')];
  const activar = (boton, enfocar = false) => {
    for (const b of botones) {
      const activo = b === boton;
      b.setAttribute('aria-selected', String(activo));
      b.tabIndex = activo ? 0 : -1;
      document.getElementById(b.getAttribute('aria-controls')).hidden = !activo;
    }
    if (enfocar) boton.focus();
    history.replaceState(null, '', `#${boton.dataset.pestana}`);
    alCambiar?.(boton.dataset.pestana);
  };
  botones.forEach((b, i) => {
    b.addEventListener('click', () => activar(b));
    b.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') activar(botones[(i + 1) % botones.length], true);
      if (e.key === 'ArrowLeft') activar(botones[(i - 1 + botones.length) % botones.length], true);
    });
  });
  const inicial = botones.find((b) => `#${b.dataset.pestana}` === location.hash) || botones[0];
  activar(inicial);
  return { activar: (nombre) => activar(botones.find((b) => b.dataset.pestana === nombre)) };
}

/* ------------------------------------------------------------------ */
/* Formato de fechas, horas y estados                                   */
/* ------------------------------------------------------------------ */
export const ETIQUETAS_ESTADO = Object.freeze({
  programada: 'Programada',
  confirmada: 'Confirmada',
  atendida: 'Atendida',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
});

/** Transiciones válidas (espejo de transicion_valida() en SQL; la BD decide). */
export const TRANSICIONES = Object.freeze({
  programada: ['confirmada', 'cancelada'],
  confirmada: ['atendida', 'no_asistio', 'cancelada'],
  atendida: [], cancelada: [], no_asistio: [],
});

export function insigniaEstado(estado) {
  return el('span', { class: `insignia insignia--${estado}`, text: ETIQUETAS_ESTADO[estado] || estado });
}

export function insigniaActivo(activo) {
  return el('span', { class: `insignia insignia--${activo ? 'activo' : 'inactivo'}`, text: activo ? 'Activo' : 'Inactivo' });
}

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria del negocio. */
export function hoyISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.ZONA_HORARIA }).format(new Date());
}

export function sumarDias(fechaISO, dias) {
  const [a, m, d] = fechaISO.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

export function formatearFecha(fechaISO, opciones = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  const [a, m, d] = fechaISO.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { ...opciones, timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, d)));
}

export function formatearHora(hora) {
  const [h, m] = hora.split(':').map(Number);
  return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' })
    .format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

export function formatearFechaHora(marca) {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: CONFIG.ZONA_HORARIA })
    .format(new Date(marca));
}

/** Milisegundos desde ahora hasta el inicio de la cita (hora de Bogotá, UTC-5 sin horario de verano). */
export function msHastaInicio(fechaISO, hora) {
  const inicio = new Date(`${fechaISO}T${hora.slice(0, 5)}:00-05:00`);
  return inicio.getTime() - Date.now();
}

export function opcion(valor, texto, seleccionado = false) {
  return el('option', { value: valor, text: texto, selected: seleccionado });
}
