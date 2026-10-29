import { protegerPagina } from '../auth.js';
import { citasApi, perfilApi } from '../api.js';
import { CONFIG } from '../config.js';
import { montarReserva } from '../componentes/reserva.js';
import { abrirDetalleCita, accionesDisponibles } from '../componentes/detalleCita.js';
import {
  $, el, vaciar, mostrarEstado, mostrarAlerta, mostrarAviso, configurarPestanas, conCarga,
  insigniaEstado, formatearFecha, formatearHora, hoyISO, sumarDias,
} from '../ui.js';
import { validarFormulario, reglas, datosFormulario } from '../validacion.js';

const { perfil: perfilInicial } = await protegerPagina(['paciente']);
let perfil = perfilInicial;

/* ---------------- Utilidades ---------------- */
function itemCita(cita, alCambiar) {
  const acciones = accionesDisponibles(cita, 'paciente');
  return el('li', { class: 'item' },
    el('div', {},
      el('div', { class: 'item__titulo' }, `${formatearFecha(cita.fecha)} · ${formatearHora(cita.hora_inicio)}`),
      el('div', { class: 'item__meta' },
        el('span', { text: cita.especialidad }),
        el('span', { text: cita.profesional_nombre }),
        insigniaEstado(cita.estado))),
    el('div', { class: 'acciones' },
      el('button', {
        type: 'button', class: 'boton boton--secundario boton--pequeno', text: 'Ver detalle',
        attrs: { 'aria-label': `Ver detalle de la cita del ${formatearFecha(cita.fecha)}` },
        onClick: () => abrirDetalleCita(cita, { rol: 'paciente', alCambiar }),
      }),
      acciones.includes('cancelada') ? el('button', {
        type: 'button', class: 'boton boton--peligro boton--pequeno', text: 'Cancelar',
        attrs: { 'aria-label': `Cancelar la cita del ${formatearFecha(cita.fecha)}` },
        onClick: () => abrirDetalleCita(cita, { rol: 'paciente', alCambiar }),
      }) : null));
}

const perfilCompleto = () => Boolean(perfil.documento && perfil.telefono);

function avisoPerfil() {
  mostrarAlerta($('#alerta-perfil-incompleto'),
    perfilCompleto() ? null : 'Complete su documento y teléfono en “Mi perfil” para poder reservar citas.', 'aviso');
}

/* ---------------- Inicio ---------------- */
async function cargarInicio() {
  avisoPerfil();
  $('#regla-cancelacion').textContent =
    `Puede cancelar en línea hasta ${CONFIG.HORAS_MINIMAS_CANCELACION} horas antes de la cita.`;
  const zona = $('#proximas-citas');
  mostrarEstado(zona, 'cargando');
  try {
    const citas = (await citasApi.listar({ desde: hoyISO() }))
      .filter((c) => ['programada', 'confirmada'].includes(c.estado))
      .slice(0, 3);
    if (!citas.length) { mostrarEstado(zona, 'vacio', 'No tiene citas próximas.'); return; }
    vaciar(zona, el('ul', { class: 'lista' }, citas.map((c) => itemCita(c, cargarInicio))));
  } catch (e) {
    mostrarEstado(zona, 'error', e.message);
  }
}

/* ---------------- Mis citas ---------------- */
async function cargarCitas() {
  const zona = $('#lista-citas');
  const ver = $('#ver-citas').value;
  const hoy = hoyISO();
  const filtros = ver === 'proximas' ? { desde: hoy } : ver === 'historial' ? { hasta: sumarDias(hoy, -1) } : {};
  mostrarEstado(zona, 'cargando');
  try {
    let citas = await citasApi.listar(filtros);
    if (ver === 'historial') citas = citas.reverse();
    if (!citas.length) {
      mostrarEstado(zona, 'vacio', ver === 'proximas' ? 'No tiene citas próximas. Puede reservar una en “Reservar cita”.' : 'No hay citas para mostrar.');
      return;
    }
    vaciar(zona, el('ul', { class: 'lista', attrs: { 'aria-label': 'Listado de citas' } }, citas.map((c) => itemCita(c, cargarCitas))));
  } catch (e) {
    mostrarEstado(zona, 'error', e.message);
  }
}
$('#ver-citas').addEventListener('change', cargarCitas);

/* ---------------- Perfil ---------------- */
const formPerfil = $('#form-perfil');
function llenarPerfil() {
  const f = formPerfil.elements;
  f.nombres.value = perfil.nombres ?? '';
  f.documento.value = perfil.documento ?? '';
  f.telefono.value = perfil.telefono ?? '';
  f.fecha_nacimiento.value = perfil.fecha_nacimiento ?? '';
  f.fecha_nacimiento.max = hoyISO();
}
formPerfil.addEventListener('submit', (e) => {
  e.preventDefault();
  const alerta = $('#alerta-perfil');
  mostrarAlerta(alerta, null);
  if (!validarFormulario(formPerfil, {
    nombres: [reglas.requerido, reglas.nombres],
    documento: [reglas.requerido, reglas.documento],
    telefono: [reglas.requerido, reglas.telefono],
    fecha_nacimiento: [reglas.fechaNacimiento],
  })) return;
  conCarga(formPerfil.querySelector('button[type="submit"]'), async () => {
    try {
      perfil = { ...perfil, ...(await perfilApi.actualizar(perfil.id, datosFormulario(formPerfil))) };
      mostrarAlerta(alerta, 'Sus datos se guardaron correctamente.', 'exito');
      avisoPerfil();
    } catch (err) {
      mostrarAlerta(alerta, err.message, 'error');
    }
  }, 'Guardando…');
});

/* ---------------- Pestañas ---------------- */
let reservaMontada = false;
const pestanas = configurarPestanas($('[role="tablist"]'), (nombre) => {
  if (nombre === 'inicio') cargarInicio();
  if (nombre === 'citas') cargarCitas();
  if (nombre === 'perfil') llenarPerfil();
  if (nombre === 'reservar') {
    if (!perfilCompleto()) mostrarAviso('Complete documento y teléfono en “Mi perfil” antes de reservar.', 'error');
    if (!reservaMontada) {
      montarReserva($('#zona-reserva'), { alReservar: () => mostrarAviso('Puede ver la cita en “Mis citas”.', 'info') });
      reservaMontada = true;
    }
  }
});
document.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => pestanas.activar(b.dataset.ir)));
