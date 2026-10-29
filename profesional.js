import { protegerPagina } from '../auth.js';
import { citasApi } from '../api.js';
import { abrirDetalleCita } from '../componentes/detalleCita.js';
import {
  $, el, vaciar, mostrarEstado, insigniaEstado, formatearFecha, formatearHora, hoyISO, sumarDias, ETIQUETAS_ESTADO,
} from '../ui.js';
import { validarFormulario, reglas } from '../validacion.js';

const { perfil } = await protegerPagina(['profesional']);
$('#info-profesional').textContent = `${perfil.nombres} · Solo se muestran las citas asignadas a usted.`;

const filtro = $('#filtro-agenda');
const hoy = hoyISO();
filtro.elements.desde.value = hoy;
filtro.elements.hasta.value = sumarDias(hoy, 7);

function pintarResumen(citas) {
  const conteo = (estado) => citas.filter((c) => c.estado === estado).length;
  vaciar($('#resumen-agenda'), ['programada', 'confirmada', 'atendida', 'no_asistio'].map((estado) => el('div', { class: 'tarjeta kpi' },
    el('span', { class: 'kpi__valor', text: conteo(estado) }),
    el('span', { class: 'kpi__etiqueta', text: ETIQUETAS_ESTADO[estado] }))));
}

function filaCita(cita) {
  return el('tr', {},
    el('td', { dataset: { etiqueta: 'Hora' } }, `${formatearHora(cita.hora_inicio)} – ${formatearHora(cita.hora_fin)}`),
    el('td', { dataset: { etiqueta: 'Paciente' } }, cita.paciente_nombre),
    el('td', { dataset: { etiqueta: 'Motivo' } }, cita.motivo || '—'),
    el('td', { dataset: { etiqueta: 'Estado' } }, insigniaEstado(cita.estado)),
    el('td', { dataset: { etiqueta: 'Acciones' } }, el('button', {
      type: 'button', class: 'boton boton--secundario boton--pequeno', text: 'Gestionar',
      attrs: { 'aria-label': `Gestionar cita de ${cita.paciente_nombre} a las ${formatearHora(cita.hora_inicio)}` },
      onClick: () => abrirDetalleCita(cita, { rol: 'profesional', alCambiar: cargarAgenda }),
    })));
}

async function cargarAgenda() {
  const zona = $('#agenda');
  if (!validarFormulario(filtro, { desde: [reglas.requerido], hasta: [reglas.requerido] })) return;
  if (filtro.elements.hasta.value < filtro.elements.desde.value) {
    mostrarEstado(zona, 'error', 'La fecha “Hasta” debe ser posterior a “Desde”.');
    return;
  }
  mostrarEstado(zona, 'cargando', 'Cargando agenda…');
  try {
    const citas = await citasApi.listar({
      desde: filtro.elements.desde.value, hasta: filtro.elements.hasta.value, estado: filtro.elements.estado.value,
    });
    pintarResumen(citas);
    if (!citas.length) { mostrarEstado(zona, 'vacio', 'No tiene citas en el rango seleccionado.'); return; }

    const porDia = Map.groupBy ? Map.groupBy(citas, (c) => c.fecha) : citas.reduce((m, c) => m.set(c.fecha, [...(m.get(c.fecha) || []), c]), new Map());
    vaciar(zona, [...porDia.entries()].map(([fecha, lista]) => el('section', { class: 'tarjeta' },
      el('h2', { text: `${formatearFecha(fecha, { weekday: 'long', day: 'numeric', month: 'long' })}${fecha === hoy ? ' · Hoy' : ''}` }),
      el('div', { class: 'tabla-contenedor' },
        el('table', { class: 'tabla-responsive' },
          el('caption', { class: 'visualmente-oculto', text: `Citas del ${fecha}` }),
          el('thead', {}, el('tr', {}, ['Hora', 'Paciente', 'Motivo', 'Estado', 'Acciones'].map((t) => el('th', { scope: 'col', text: t })))),
          el('tbody', {}, lista.map(filaCita)))))));
  } catch (e) {
    mostrarEstado(zona, 'error', e.message);
  }
}

filtro.addEventListener('submit', (e) => { e.preventDefault(); cargarAgenda(); });
$('#btn-hoy').addEventListener('click', () => {
  filtro.elements.desde.value = hoy;
  filtro.elements.hasta.value = hoy;
  cargarAgenda();
});
cargarAgenda();
