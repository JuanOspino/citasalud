/**
 * Componente reutilizable de búsqueda de disponibilidad y reserva.
 * Lo usan el panel del paciente y el panel administrativo (reserva en
 * nombre de un paciente), evitando duplicar código.
 */
import { catalogoApi, citasApi, adminApi } from '../api.js';
import {
  el, vaciar, mostrarEstado, mostrarAviso, mostrarAlerta, abrirDialogo, conCarga,
  hoyISO, sumarDias, formatearFecha, formatearHora, opcion,
} from '../ui.js';
import { validarFormulario, reglas } from '../validacion.js';

let contador = 0;

export function montarReserva(contenedor, { paraAdmin = false, alReservar } = {}) {
  const p = `rsv${++contador}`;
  const hoy = hoyISO();

  const selPaciente = el('select', { id: `${p}-paciente`, name: 'paciente', required: true },
    opcion('', 'Busque y seleccione un paciente'));
  const txtBuscarPaciente = el('input', { id: `${p}-buscar`, type: 'search', placeholder: 'Nombre o documento', autocomplete: 'off' });
  const btnBuscarPaciente = el('button', { type: 'button', class: 'boton boton--secundario', text: 'Buscar paciente' });

  const selEspecialidad = el('select', { id: `${p}-esp`, name: 'especialidad' }, opcion('', 'Todas las especialidades'));
  const selProfesional = el('select', { id: `${p}-prof`, name: 'profesional' }, opcion('', 'Cualquier profesional'));
  const txtFecha = el('input', { id: `${p}-fecha`, name: 'fecha', type: 'date', min: hoy, max: sumarDias(hoy, 90), value: hoy, required: true });
  const btnBuscar = el('button', { type: 'submit', class: 'boton', text: 'Buscar disponibilidad' });
  const resultados = el('div', { attrs: { 'aria-live': 'polite' } });

  const formulario = el('form', { class: 'formulario formulario--fila', attrs: { novalidate: true, 'aria-label': 'Buscar disponibilidad' } },
    el('div', { class: 'campo' }, el('label', { for: selEspecialidad.id, text: 'Especialidad' }), selEspecialidad),
    el('div', { class: 'campo' }, el('label', { for: selProfesional.id, text: 'Profesional' }), selProfesional),
    el('div', { class: 'campo' }, el('label', { for: txtFecha.id, text: 'Fecha' }), txtFecha),
    el('div', { class: 'campo' }, btnBuscar));

  const bloquePaciente = paraAdmin
    ? el('div', { class: 'formulario formulario--fila', attrs: { role: 'group', 'aria-label': 'Paciente' } },
      el('div', { class: 'campo' }, el('label', { for: txtBuscarPaciente.id, text: 'Buscar paciente' }), txtBuscarPaciente),
      el('div', { class: 'campo' }, btnBuscarPaciente),
      el('div', { class: 'campo' }, el('label', { for: selPaciente.id, text: 'Paciente' }), selPaciente))
    : null;

  vaciar(contenedor, bloquePaciente, formulario, el('h3', { text: 'Horarios disponibles', class: 'visualmente-oculto' }), resultados);
  mostrarEstado(resultados, 'vacio', 'Elija los filtros y presione “Buscar disponibilidad”.');

  /* ---------- Carga de catálogos ---------- */
  async function cargarEspecialidades() {
    try {
      const lista = await catalogoApi.especialidades();
      vaciar(selEspecialidad, opcion('', 'Todas las especialidades'), lista.map((e) => opcion(e.id, e.nombre)));
    } catch (e) {
      mostrarAviso(e.message, 'error');
    }
  }
  async function cargarProfesionales() {
    try {
      const lista = await catalogoApi.profesionales(selEspecialidad.value || null);
      vaciar(selProfesional, opcion('', 'Cualquier profesional'),
        lista.map((pr) => opcion(pr.professional_id, `${pr.nombres} · ${pr.especialidad}`)));
    } catch (e) {
      mostrarAviso(e.message, 'error');
    }
  }
  selEspecialidad.addEventListener('change', cargarProfesionales);

  if (paraAdmin) {
    const buscarPacientes = () => conCarga(btnBuscarPaciente, async () => {
      try {
        const lista = await adminApi.buscarPacientes(txtBuscarPaciente.value);
        vaciar(selPaciente, opcion('', lista.length ? 'Seleccione un paciente' : 'Sin resultados'),
          lista.map((pa) => opcion(pa.id, `${pa.nombres} · Doc. ${pa.documento ?? 'sin registrar'}`)));
      } catch (e) {
        mostrarAviso(e.message, 'error');
      }
    }, 'Buscando…');
    btnBuscarPaciente.addEventListener('click', buscarPacientes);
    txtBuscarPaciente.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarPacientes(); } });
  }

  /* ---------- Búsqueda ---------- */
  async function buscar() {
    if (!validarFormulario(formulario, { fecha: [reglas.requerido, reglas.fechaNoPasada] })) return;
    mostrarEstado(resultados, 'cargando', 'Buscando horarios disponibles…');
    try {
      const franjas = await citasApi.buscarDisponibilidad({
        fecha: txtFecha.value, specialtyId: selEspecialidad.value, professionalId: selProfesional.value,
      });
      pintarFranjas(franjas);
    } catch (e) {
      mostrarEstado(resultados, 'error', e.message);
    }
  }

  function pintarFranjas(franjas) {
    if (!franjas.length) {
      mostrarEstado(resultados, 'vacio', `No hay horarios disponibles el ${formatearFecha(txtFecha.value, { weekday: 'long', day: 'numeric', month: 'long' })}. Pruebe otra fecha o profesional.`);
      return;
    }
    const porProfesional = new Map();
    for (const f of franjas) {
      if (!porProfesional.has(f.professional_id)) porProfesional.set(f.professional_id, []);
      porProfesional.get(f.professional_id).push(f);
    }
    vaciar(resultados,
      el('p', { class: 'subtitulo', text: `${franjas.length} horario(s) disponible(s) · ${formatearFecha(txtFecha.value, { weekday: 'long', day: 'numeric', month: 'long' })}` }),
      [...porProfesional.values()].map((lista) => el('section', { class: 'tarjeta' },
        el('h3', { text: `${lista[0].profesional} · ${lista[0].especialidad}` }),
        el('div', { class: 'franjas' }, lista.map((f) => el('button', {
          type: 'button', class: 'franja',
          attrs: { 'aria-label': `Reservar ${formatearHora(f.hora_inicio)} con ${f.profesional}` },
          onClick: () => confirmarReserva(f),
        }, el('strong', { text: formatearHora(f.hora_inicio) }), el('span', { text: `hasta ${formatearHora(f.hora_fin)}` })))))));
  }

  /* ---------- Confirmación y reserva ---------- */
  function confirmarReserva(franja) {
    if (paraAdmin && !selPaciente.value) {
      mostrarAviso('Primero busque y seleccione el paciente.', 'error');
      txtBuscarPaciente.focus();
      return;
    }
    const alerta = el('div', { hidden: true });
    const txtMotivo = el('textarea', { id: `${p}-motivo`, name: 'motivo', maxLength: 200, rows: 3 });
    const formMotivo = el('form', { class: 'formulario', attrs: { novalidate: true } },
      el('div', { class: 'campo' },
        el('label', { for: txtMotivo.id, text: 'Motivo breve de la consulta (opcional)' }),
        txtMotivo,
        el('p', { class: 'ayuda', text: 'Máximo 200 caracteres. No escriba diagnósticos ni información clínica sensible.' })));

    const btnVolver = el('button', { type: 'button', class: 'boton boton--secundario', text: 'Volver' });
    const btnConfirmar = el('button', { type: 'button', class: 'boton', text: 'Confirmar reserva' });

    const dialogo = abrirDialogo({
      titulo: 'Confirmar reserva',
      contenido: [
        alerta,
        el('dl', { class: 'datos' },
          paraAdmin ? [el('dt', { text: 'Paciente' }), el('dd', { text: selPaciente.selectedOptions[0].textContent })] : null,
          el('dt', { text: 'Profesional' }), el('dd', { text: franja.profesional }),
          el('dt', { text: 'Especialidad' }), el('dd', { text: franja.especialidad }),
          el('dt', { text: 'Fecha' }), el('dd', { text: formatearFecha(franja.fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }),
          el('dt', { text: 'Hora' }), el('dd', { text: `${formatearHora(franja.hora_inicio)} – ${formatearHora(franja.hora_fin)}` })),
        formMotivo,
      ],
      acciones: [btnVolver, btnConfirmar],
    });
    btnVolver.addEventListener('click', () => dialogo.close());
    btnConfirmar.addEventListener('click', () => conCarga(btnConfirmar, async () => {
      if (!validarFormulario(formMotivo, { motivo: [reglas.maximo(200)] })) return;
      try {
        await citasApi.reservar({
          scheduleId: franja.schedule_id,
          motivo: txtMotivo.value.trim(),
          patientId: paraAdmin ? selPaciente.value : null,
        });
        dialogo.close();
        mostrarAviso(`Cita reservada para el ${formatearFecha(franja.fecha)} a las ${formatearHora(franja.hora_inicio)}.`, 'exito');
        await buscar();
        alReservar?.();
      } catch (e) {
        if (e.conflicto) {
          dialogo.close();
          mostrarAviso(e.message, 'error');
          await buscar(); // Actualiza la disponibilidad tras el conflicto.
        } else {
          mostrarAlerta(alerta, e.message, 'error');
        }
      }
    }, 'Reservando…'));
    btnConfirmar.focus();
  }

  formulario.addEventListener('submit', (e) => { e.preventDefault(); conCarga(btnBuscar, buscar, 'Buscando…'); });

  cargarEspecialidades().then(cargarProfesionales);
  return { buscar };
}
