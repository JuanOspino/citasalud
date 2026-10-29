/**
 * Diálogo de detalle de una cita con historial y cambio controlado de estado.
 * Reutilizado por los paneles de paciente, profesional y administración.
 * Los botones visibles son una ayuda; la BD valida rol y transición.
 */
import { citasApi } from '../api.js';
import { CONFIG } from '../config.js';
import {
  el, vaciar, abrirDialogo, mostrarAlerta, mostrarAviso, confirmar, conCarga, insigniaEstado,
  formatearFecha, formatearHora, formatearFechaHora, msHastaInicio, ETIQUETAS_ESTADO, TRANSICIONES,
} from '../ui.js';

const TEXTO_ACCION = {
  confirmada: 'Confirmar cita',
  atendida: 'Marcar atendida',
  no_asistio: 'Marcar no asistió',
  cancelada: 'Cancelar cita',
};

/** Acciones que el rol puede intentar según estado y momento de la cita. */
export function accionesDisponibles(cita, rol) {
  const falta = msHastaInicio(cita.fecha, cita.hora_inicio);
  return (TRANSICIONES[cita.estado] || []).filter((destino) => {
    if (rol === 'paciente') return destino === 'cancelada' && cita.puede_cancelar;
    if (destino === 'cancelada') return falta > 0;
    if (destino === 'atendida' || destino === 'no_asistio') return falta <= 0;
    return true;
  });
}

export function abrirDetalleCita(cita, { rol, alCambiar }) {
  const alerta = el('div', { hidden: true });
  const listaHistorial = el('ol', { class: 'historial' }, el('li', { text: 'Cargando historial…' }));
  const idObs = `obs-${cita.id}`;
  const txtObs = el('textarea', { id: idObs, maxLength: 300, rows: 2 });
  const acciones = accionesDisponibles(cita, rol);

  const btnCerrar = el('button', { type: 'button', class: 'boton boton--secundario', text: 'Cerrar' });
  const botonesAccion = acciones.map((destino) => el('button', {
    type: 'button',
    class: `boton${destino === 'cancelada' || destino === 'no_asistio' ? ' boton--peligro' : ''}`,
    text: TEXTO_ACCION[destino],
    onClick: (e) => ejecutar(destino, e.currentTarget),
  }));

  const datos = el('dl', { class: 'datos' },
    el('dt', { text: 'Estado' }), el('dd', {}, insigniaEstado(cita.estado)),
    el('dt', { text: 'Fecha' }), el('dd', { text: formatearFecha(cita.fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }),
    el('dt', { text: 'Hora' }), el('dd', { text: `${formatearHora(cita.hora_inicio)} – ${formatearHora(cita.hora_fin)}` }),
    el('dt', { text: 'Profesional' }), el('dd', { text: cita.profesional_nombre }),
    el('dt', { text: 'Especialidad' }), el('dd', { text: cita.especialidad }),
    rol !== 'paciente' ? [
      el('dt', { text: 'Paciente' }), el('dd', { text: cita.paciente_nombre }),
      el('dt', { text: 'Documento' }), el('dd', { text: cita.paciente_documento ?? '—' }),
      el('dt', { text: 'Teléfono' }), el('dd', { text: cita.paciente_telefono ?? '—' }),
    ] : null,
    el('dt', { text: 'Motivo' }), el('dd', { text: cita.motivo || '—' }),
    rol !== 'paciente' ? [el('dt', { text: 'Observaciones' }), el('dd', { text: cita.observaciones || '—' })] : null);

  const ayudaPaciente = rol === 'paciente' && ['programada', 'confirmada'].includes(cita.estado) && !cita.puede_cancelar
    ? el('p', { class: 'alerta alerta--aviso', text: `Las cancelaciones en línea requieren al menos ${CONFIG.HORAS_MINIMAS_CANCELACION} horas de anticipación. Comuníquese con recepción.` })
    : null;

  const dialogo = abrirDialogo({
    titulo: 'Detalle de la cita',
    contenido: [
      alerta, datos, ayudaPaciente,
      acciones.length ? el('div', { class: 'campo' },
        el('label', { for: idObs, text: rol === 'paciente' ? 'Motivo de cancelación (opcional)' : 'Observación administrativa (opcional)' }),
        txtObs,
        el('p', { class: 'ayuda', text: 'Máximo 300 caracteres. No registre información clínica.' })) : null,
      el('h3', { text: 'Historial de estados' }),
      listaHistorial,
    ],
    acciones: [btnCerrar, ...botonesAccion],
  });
  btnCerrar.addEventListener('click', () => dialogo.close());

  citasApi.historial(cita.id)
    .then((filas) => vaciar(listaHistorial, filas.map((h) => el('li', {},
      el('strong', { text: h.estado_anterior ? `${ETIQUETAS_ESTADO[h.estado_anterior]} → ${ETIQUETAS_ESTADO[h.estado_nuevo]}` : `Creada como ${ETIQUETAS_ESTADO[h.estado_nuevo]}` }),
      ` · ${formatearFechaHora(h.changed_at)} · ${h.cambiado_por}`,
      h.observacion ? el('div', { text: `“${h.observacion}”` }) : null))))
    .catch((e) => vaciar(listaHistorial, el('li', { text: e.message })));

  async function ejecutar(destino, boton) {
    const ok = await confirmar({
      titulo: TEXTO_ACCION[destino],
      mensaje: destino === 'cancelada'
        ? 'La cita se cancelará y el horario quedará disponible para otras personas. ¿Desea continuar?'
        : `La cita pasará a estado “${ETIQUETAS_ESTADO[destino]}”. Esta acción queda registrada en el historial.`,
      textoAceptar: 'Sí, continuar',
      peligro: destino === 'cancelada' || destino === 'no_asistio',
    });
    if (!ok) return;
    await conCarga(boton, async () => {
      try {
        await citasApi.cambiarEstado(cita.id, destino, txtObs.value.trim());
        dialogo.close();
        mostrarAviso(`La cita quedó en estado “${ETIQUETAS_ESTADO[destino]}”.`, 'exito');
        alCambiar?.();
      } catch (e) {
        mostrarAlerta(alerta, e.message, 'error');
      }
    });
  }
}
