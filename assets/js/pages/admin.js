import { protegerPagina } from '../auth.js';
import { adminApi, catalogoApi, citasApi, perfilApi } from '../api.js';
import { montarReserva } from '../componentes/reserva.js';
import { abrirDetalleCita } from '../componentes/detalleCita.js';
import {
  $, el, vaciar, mostrarEstado, mostrarAlerta, mostrarAviso, confirmar, conCarga, configurarPestanas, abrirDialogo,
  insigniaEstado, insigniaActivo, formatearFecha, formatearHora, hoyISO, sumarDias, opcion, ETIQUETAS_ESTADO,
} from '../ui.js';
import { validarFormulario, reglas, datosFormulario } from '../validacion.js';

await protegerPagina(['admin']);
const hoy = hoyISO();

/** Construye una tabla responsive segura. columnas: [{titulo, celda: fila => Node|string}] */
function tabla(columnas, filas, leyenda) {
  return el('div', { class: 'tabla-contenedor' },
    el('table', { class: 'tabla-responsive' },
      el('caption', { class: 'visualmente-oculto', text: leyenda }),
      el('thead', {}, el('tr', {}, columnas.map((c) => el('th', { scope: 'col', text: c.titulo })))),
      el('tbody', {}, filas.map((f) => el('tr', {}, columnas.map((c) => el('td', { dataset: { etiqueta: c.titulo } }, c.celda(f))))))));
}

const boton = (texto, alHacerClic, clase = 'boton--secundario', etiqueta = null) => el('button', {
  type: 'button', class: `boton ${clase} boton--pequeno`, text: texto, attrs: { 'aria-label': etiqueta }, onClick: alHacerClic,
});

/* ===================================================================
   RESUMEN / INDICADORES
   =================================================================== */
const formInd = $('#filtro-indicadores');
formInd.elements.desde.value = sumarDias(hoy, -30);
formInd.elements.hasta.value = sumarDias(hoy, 14);

function graficoBarras(titulo, datos, formatoEtiqueta = (x) => x) {
  const maximo = Math.max(1, ...datos.map((d) => d.total));
  return el('article', { class: 'tarjeta' },
    el('h2', { text: titulo }),
    datos.length
      ? el('ul', { class: 'barras', attrs: { 'aria-label': titulo } }, datos.map((d) => el('li', { class: 'barra', title: `${formatoEtiqueta(d.etiqueta)}: ${d.total}` },
        el('span', { text: formatoEtiqueta(d.etiqueta) }),
        el('span', { class: 'barra__pista' },
          el('span', { class: 'barra__relleno', style: `width:${Math.max(2, (d.total / maximo) * 85)}%`, attrs: { 'aria-hidden': 'true' } }),
          el('span', { class: 'barra__valor', text: d.total })))))
      : el('p', { class: 'subtitulo', text: 'Sin datos en el periodo.' }));
}

async function cargarIndicadores() {
  const zona = $('#indicadores');
  const { desde, hasta } = datosFormulario(formInd);
  if (!desde || !hasta || hasta < desde) { mostrarEstado(zona, 'error', 'Seleccione un rango de fechas válido.'); return; }
  mostrarEstado(zona, 'cargando', 'Calculando indicadores…');
  try {
    const ind = await adminApi.indicadores(desde, hasta);
    const contar = (estado) => ind.por_estado.find((x) => x.etiqueta === estado)?.total ?? 0;
    const kpis = [
      ['Citas en el periodo', ind.total],
      ['Pendientes (programadas + confirmadas)', contar('programada') + contar('confirmada')],
      ['Atendidas', contar('atendida')],
      ['Tasa de inasistencia', ind.tasa_inasistencia === null ? '—' : `${ind.tasa_inasistencia} %`],
    ];
    const meses = (p) => { const [a, m] = p.split('-'); return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+a, +m - 1, 1))); };
    vaciar(zona,
      el('div', { class: 'rejilla rejilla--4' }, kpis.map(([t, v]) => el('div', { class: 'tarjeta kpi' },
        el('span', { class: 'kpi__valor', text: v }), el('span', { class: 'kpi__etiqueta', text: t })))),
      el('div', { class: 'rejilla rejilla--3' },
        graficoBarras('Citas por estado', ind.por_estado, (e) => ETIQUETAS_ESTADO[e] || e),
        graficoBarras('Citas por especialidad', ind.por_especialidad),
        graficoBarras('Citas por mes', ind.por_periodo, meses)));
  } catch (e) {
    mostrarEstado(zona, 'error', e.message);
  }
}
formInd.addEventListener('submit', (e) => { e.preventDefault(); cargarIndicadores(); });

/* ===================================================================
   CITAS
   =================================================================== */
const formCitas = $('#filtro-citas');
formCitas.elements.desde.value = hoy;
formCitas.elements.hasta.value = sumarDias(hoy, 7);

async function cargarCitas() {
  const zona = $('#tabla-citas');
  const { desde, hasta, estado } = datosFormulario(formCitas);
  if (!desde || !hasta || hasta < desde) { mostrarEstado(zona, 'error', 'Seleccione un rango de fechas válido.'); return; }
  mostrarEstado(zona, 'cargando');
  try {
    const citas = await citasApi.listar({ desde, hasta, estado });
    if (!citas.length) { mostrarEstado(zona, 'vacio', 'No hay citas con esos filtros.'); return; }
    vaciar(zona, el('p', { class: 'subtitulo', text: `${citas.length} cita(s)` }), tabla([
      { titulo: 'Fecha', celda: (c) => `${formatearFecha(c.fecha)} ${formatearHora(c.hora_inicio)}` },
      { titulo: 'Paciente', celda: (c) => `${c.paciente_nombre} (${c.paciente_documento ?? 's/d'})` },
      { titulo: 'Profesional', celda: (c) => c.profesional_nombre },
      { titulo: 'Especialidad', celda: (c) => c.especialidad },
      { titulo: 'Estado', celda: (c) => insigniaEstado(c.estado) },
      { titulo: 'Acciones', celda: (c) => boton('Gestionar', () => abrirDetalleCita(c, { rol: 'admin', alCambiar: cargarCitas }), 'boton--secundario', `Gestionar cita de ${c.paciente_nombre}`) },
    ], citas, 'Citas'));
  } catch (e) {
    mostrarEstado(zona, 'error', e.message);
  }
}
formCitas.addEventListener('submit', (e) => { e.preventDefault(); cargarCitas(); });

let reservaAdminMontada = false;
$('#bloque-nueva-cita').addEventListener('toggle', (e) => {
  if (e.target.open && !reservaAdminMontada) {
    montarReserva($('#zona-reserva-admin'), { paraAdmin: true, alReservar: cargarCitas });
    reservaAdminMontada = true;
  }
});

/* ===================================================================
   HORARIOS
   =================================================================== */
const formHor = $('#filtro-horarios');
const formGen = $('#form-generar');
const formFranja = $('#form-franja');
formHor.elements.desde.value = hoy;
formHor.elements.hasta.value = sumarDias(hoy, 7);
formGen.elements.desde.value = sumarDias(hoy, 1);
formGen.elements.hasta.value = sumarDias(hoy, 14);
for (const f of [formGen.elements.desde, formGen.elements.hasta, formFranja.elements.fecha]) f.min = hoy;
formFranja.elements.fecha.value = sumarDias(hoy, 1);

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
vaciar($('#ge-dias'), DIAS.map((d, i) => el('label', {},
  el('input', { type: 'checkbox', name: 'dias', value: i + 1, checked: i < 5 }), d)));

let profesionalesCache = [];
async function cargarSelectProfesionales() {
  profesionalesCache = await adminApi.profesionales();
  const sel = formHor.elements.profesional;
  const actual = sel.value;
  vaciar(sel, profesionalesCache.length ? null : opcion('', 'No hay profesionales registrados'),
    profesionalesCache.map((p) => opcion(p.id, `${p.perfil.nombres} · ${p.especialidad.nombre}${p.activo ? '' : ' (inactivo)'}`, p.id === actual)));
}

const citaActiva = (f) => f.citas.find((c) => ['programada', 'confirmada'].includes(c.estado));

async function cargarFranjas() {
  const zona = $('#tabla-horarios');
  const { profesional, desde, hasta } = datosFormulario(formHor);
  if (!profesional) { mostrarEstado(zona, 'vacio', 'Seleccione un profesional.'); return; }
  if (!desde || !hasta || hasta < desde) { mostrarEstado(zona, 'error', 'Seleccione un rango de fechas válido.'); return; }
  mostrarEstado(zona, 'cargando');
  try {
    const franjas = await adminApi.franjas({ professionalId: profesional, desde, hasta });
    if (!franjas.length) { mostrarEstado(zona, 'vacio', 'No hay franjas en ese rango. Puede generarlas arriba.'); return; }
    const ocupacion = (f) => {
      const activa = citaActiva(f);
      if (activa) return insigniaEstado(activa.estado);
      const final = f.citas.find((c) => ['atendida', 'no_asistio'].includes(c.estado));
      return final ? insigniaEstado(final.estado) : el('span', { text: 'Libre' });
    };
    vaciar(zona, el('p', { class: 'subtitulo', text: `${franjas.length} franja(s)` }), tabla([
      { titulo: 'Fecha', celda: (f) => formatearFecha(f.fecha) },
      { titulo: 'Horario', celda: (f) => `${formatearHora(f.hora_inicio)} – ${formatearHora(f.hora_fin)}` },
      { titulo: 'Estado franja', celda: (f) => insigniaActivo(f.activo) },
      { titulo: 'Ocupación', celda: ocupacion },
      {
        titulo: 'Acciones',
        celda: (f) => el('div', { class: 'acciones' },
          citaActiva(f) ? null : boton('Editar', () => editarFranja(f), 'boton--secundario', `Editar franja del ${f.fecha} a las ${f.hora_inicio.slice(0, 5)}`),
          boton(f.activo ? 'Desactivar' : 'Activar', () => alternarFranja(f)),
          f.citas.length ? null : boton('Eliminar', () => eliminarFranja(f), 'boton--peligro')),
      },
    ], franjas, 'Franjas del profesional'));
  } catch (e) {
    mostrarEstado(zona, 'error', e.message);
  }
}

function editarFranja(f) {
  const alerta = el('div', { hidden: true });
  const form = el('form', { class: 'formulario', attrs: { novalidate: true } },
    el('div', { class: 'campo' }, el('label', { for: 'ef-fecha', text: 'Fecha' }),
      el('input', { id: 'ef-fecha', name: 'fecha', type: 'date', min: hoy, value: f.fecha, required: true })),
    el('div', { class: 'rejilla rejilla--2' },
      el('div', { class: 'campo' }, el('label', { for: 'ef-inicio', text: 'Hora inicio' }),
        el('input', { id: 'ef-inicio', name: 'inicio', type: 'time', value: f.hora_inicio.slice(0, 5), required: true })),
      el('div', { class: 'campo' }, el('label', { for: 'ef-fin', text: 'Hora fin' }),
        el('input', { id: 'ef-fin', name: 'fin', type: 'time', value: f.hora_fin.slice(0, 5), required: true }))),
    el('p', { class: 'ayuda', text: 'Solo se pueden editar franjas sin cita activa. El sistema rechaza horarios pasados o que se crucen con otra franja.' }));
  const btnCancelar = el('button', { type: 'button', class: 'boton boton--secundario', text: 'Cancelar' });
  const btnGuardar = el('button', { type: 'button', class: 'boton', text: 'Guardar cambios' });
  const dlg = abrirDialogo({ titulo: 'Editar franja', contenido: [alerta, form], acciones: [btnCancelar, btnGuardar] });
  btnCancelar.addEventListener('click', () => dlg.close());
  btnGuardar.addEventListener('click', () => conCarga(btnGuardar, async () => {
    if (!validarFormulario(form, { fecha: [reglas.requerido, reglas.fechaNoPasada], inicio: [reglas.requerido], fin: [reglas.requerido] })) return;
    const d = datosFormulario(form);
    if (d.fin <= d.inicio) { mostrarAlerta(alerta, 'La hora de fin debe ser posterior a la de inicio.'); return; }
    try {
      await adminApi.actualizarFranja(f.id, { fecha: d.fecha, hora_inicio: d.inicio, hora_fin: d.fin });
      dlg.close();
      mostrarAviso('Franja actualizada.', 'exito');
      cargarFranjas();
    } catch (e) { mostrarAlerta(alerta, e.message); }
  }));
}

async function alternarFranja(f) {
  try {
    await adminApi.actualizarFranja(f.id, { activo: !f.activo });
    mostrarAviso(`Franja ${f.activo ? 'desactivada' : 'activada'}.`, 'exito');
    cargarFranjas();
  } catch (e) { mostrarAviso(e.message, 'error'); }
}

async function eliminarFranja(f) {
  const ok = await confirmar({
    titulo: 'Eliminar franja',
    mensaje: `Se eliminará la franja del ${formatearFecha(f.fecha)} a las ${formatearHora(f.hora_inicio)}. Esta acción no se puede deshacer.`,
    textoAceptar: 'Eliminar', peligro: true,
  });
  if (!ok) return;
  try {
    await adminApi.eliminarFranja(f.id);
    mostrarAviso('Franja eliminada.', 'exito');
    cargarFranjas();
  } catch (e) { mostrarAviso(e.message, 'error'); }
}

formHor.addEventListener('submit', (e) => { e.preventDefault(); cargarFranjas(); });
formHor.elements.profesional.addEventListener('change', cargarFranjas);

formGen.addEventListener('submit', (e) => {
  e.preventDefault();
  const alerta = $('#alerta-generar');
  mostrarAlerta(alerta, null);
  const profesional = formHor.elements.profesional.value;
  if (!profesional) { mostrarAlerta(alerta, 'Seleccione primero un profesional en el filtro superior.'); return; }
  if (!validarFormulario(formGen, { desde: [reglas.requerido, reglas.fechaNoPasada], hasta: [reglas.requerido], inicio: [reglas.requerido], fin: [reglas.requerido], duracion: [reglas.requerido] })) return;
  const d = datosFormulario(formGen);
  const dias = [...formGen.querySelectorAll('input[name="dias"]:checked')].map((c) => Number(c.value));
  if (!dias.length) { mostrarAlerta(alerta, 'Seleccione al menos un día de la semana.'); return; }
  if (d.fin <= d.inicio) { mostrarAlerta(alerta, 'La hora de fin debe ser posterior a la de inicio.'); return; }
  conCarga(formGen.querySelector('button[type="submit"]'), async () => {
    try {
      const creadas = await adminApi.generarFranjas({
        professionalId: profesional, desde: d.desde, hasta: d.hasta, horaInicio: d.inicio, horaFin: d.fin, duracion: d.duracion, dias,
      });
      mostrarAlerta(alerta, `Se crearon ${creadas} franja(s). Las que se cruzaban o estaban en el pasado se omitieron.`, 'exito');
      cargarFranjas();
    } catch (err) { mostrarAlerta(alerta, err.message); }
  }, 'Generando…');
});

formFranja.addEventListener('submit', (e) => {
  e.preventDefault();
  const alerta = $('#alerta-franja');
  mostrarAlerta(alerta, null);
  const profesional = formHor.elements.profesional.value;
  if (!profesional) { mostrarAlerta(alerta, 'Seleccione primero un profesional en el filtro superior.'); return; }
  if (!validarFormulario(formFranja, { fecha: [reglas.requerido, reglas.fechaNoPasada], inicio: [reglas.requerido], fin: [reglas.requerido] })) return;
  const d = datosFormulario(formFranja);
  conCarga(formFranja.querySelector('button[type="submit"]'), async () => {
    try {
      await adminApi.crearFranja({ professionalId: profesional, fecha: d.fecha, horaInicio: d.inicio, horaFin: d.fin });
      mostrarAlerta(alerta, 'Franja agregada.', 'exito');
      cargarFranjas();
    } catch (err) { mostrarAlerta(alerta, err.message); }
  }, 'Guardando…');
});

/* ===================================================================
   PROFESIONALES
   =================================================================== */
const formProf = $('#form-profesional');

async function llenarSelectEspecialidades(select, { incluirInactivas = false, valor = null } = {}) {
  const lista = await catalogoApi.especialidades({ incluirInactivas });
  vaciar(select, opcion('', 'Seleccione'), lista.map((e) => opcion(e.id, `${e.nombre}${e.activo ? '' : ' (inactiva)'}`, e.id === valor)));
  return lista;
}

async function cargarProfesionales() {
  const zona = $('#tabla-profesionales');
  mostrarEstado(zona, 'cargando');
  try {
    await cargarSelectProfesionales();
    if (!profesionalesCache.length) { mostrarEstado(zona, 'vacio', 'Aún no hay profesionales registrados.'); return; }
    vaciar(zona, tabla([
      { titulo: 'Nombre', celda: (p) => p.perfil.nombres },
      { titulo: 'Documento', celda: (p) => p.perfil.documento ?? '—' },
      { titulo: 'Especialidad', celda: (p) => p.especialidad.nombre },
      { titulo: 'Registro', celda: (p) => p.registro_profesional ?? '—' },
      { titulo: 'Estado', celda: (p) => insigniaActivo(p.activo) },
      {
        titulo: 'Acciones',
        celda: (p) => el('div', { class: 'acciones' },
          boton('Editar', () => editarProfesional(p), 'boton--secundario', `Editar ${p.perfil.nombres}`),
          boton(p.activo ? 'Desactivar' : 'Activar', () => alternarProfesional(p), p.activo ? 'boton--peligro' : 'boton--secundario')),
      },
    ], profesionalesCache, 'Profesionales'));
  } catch (e) {
    mostrarEstado(zona, 'error', e.message);
  }
}

async function alternarProfesional(p) {
  if (p.activo && !(await confirmar({
    titulo: 'Desactivar profesional',
    mensaje: `${p.perfil.nombres} dejará de aparecer en la búsqueda de disponibilidad. Si tiene citas futuras activas, el sistema no permitirá desactivarlo.`,
    textoAceptar: 'Desactivar', peligro: true,
  }))) return;
  try {
    await adminApi.actualizarProfesional(p.id, { activo: !p.activo });
    mostrarAviso('Profesional actualizado.', 'exito');
    cargarProfesionales();
  } catch (e) { mostrarAviso(e.message, 'error'); }
}

async function editarProfesional(p) {
  const selEsp = el('select', { id: 'ed-esp', name: 'especialidad', required: true });
  const txtReg = el('input', { id: 'ed-reg', name: 'registro', maxLength: 30, value: p.registro_profesional ?? '' });
  const alerta = el('div', { hidden: true });
  const form = el('form', { class: 'formulario', attrs: { novalidate: true } },
    el('div', { class: 'campo' }, el('label', { for: 'ed-esp', text: 'Especialidad' }), selEsp),
    el('div', { class: 'campo' }, el('label', { for: 'ed-reg', text: 'Registro profesional' }), txtReg));
  const btnCancelar = el('button', { type: 'button', class: 'boton boton--secundario', text: 'Cancelar' });
  const btnGuardar = el('button', { type: 'button', class: 'boton', text: 'Guardar' });
  const dlg = abrirDialogo({ titulo: `Editar · ${p.perfil.nombres}`, contenido: [alerta, form], acciones: [btnCancelar, btnGuardar] });
  btnCancelar.addEventListener('click', () => dlg.close());
  await llenarSelectEspecialidades(selEsp, { valor: p.specialty_id });
  btnGuardar.addEventListener('click', () => conCarga(btnGuardar, async () => {
    if (!validarFormulario(form, { especialidad: [reglas.requerido] })) return;
    try {
      await adminApi.actualizarProfesional(p.id, { specialty_id: selEsp.value, registro_profesional: txtReg.value.trim() || null });
      dlg.close();
      mostrarAviso('Profesional actualizado.', 'exito');
      cargarProfesionales();
    } catch (e) { mostrarAlerta(alerta, e.message); }
  }));
}

$('#pr-btn-buscar').addEventListener('click', (e) => conCarga(e.currentTarget, async () => {
  try {
    const lista = await adminApi.buscarPacientes($('#pr-buscar').value);
    vaciar(formProf.elements.usuario, opcion('', lista.length ? 'Seleccione un usuario' : 'Sin resultados'),
      lista.map((u) => opcion(u.id, `${u.nombres} · Doc. ${u.documento ?? 's/d'}`)));
  } catch (err) { mostrarAviso(err.message, 'error'); }
}, 'Buscando…'));

formProf.addEventListener('submit', (e) => {
  e.preventDefault();
  const alerta = $('#alerta-profesional');
  mostrarAlerta(alerta, null);
  if (!validarFormulario(formProf, { usuario: [reglas.requerido], especialidad: [reglas.requerido] })) return;
  const d = datosFormulario(formProf);
  conCarga(formProf.querySelector('button[type="submit"]'), async () => {
    try {
      await adminApi.registrarProfesional({ profileId: d.usuario, specialtyId: d.especialidad, registro: d.registro });
      mostrarAlerta(alerta, 'Profesional registrado. Ahora puede generar sus franjas en “Horarios”.', 'exito');
      formProf.reset();
      cargarProfesionales();
    } catch (err) { mostrarAlerta(alerta, err.message); }
  }, 'Registrando…');
});

/* ===================================================================
   PACIENTES
   =================================================================== */
const formPac = $('#filtro-pacientes');

async function cargarPacientes() {
  const zona = $('#tabla-pacientes');
  const { buscar, estado } = datosFormulario(formPac);
  mostrarEstado(zona, 'cargando');
  try {
    const lista = await adminApi.listarPacientes({ texto: buscar, estado });
    if (!lista.length) { mostrarEstado(zona, 'vacio', 'No hay pacientes con esos filtros.'); return; }
    vaciar(zona, el('p', { class: 'subtitulo', text: `${lista.length} paciente(s)${lista.length === 50 ? ' · se muestran los primeros 50, afine la búsqueda' : ''}` }), tabla([
      { titulo: 'Nombre', celda: (p) => p.nombres },
      { titulo: 'Documento', celda: (p) => p.documento ?? '—' },
      { titulo: 'Teléfono', celda: (p) => p.telefono ?? '—' },
      { titulo: 'Nacimiento', celda: (p) => (p.fecha_nacimiento ? formatearFecha(p.fecha_nacimiento, { day: 'numeric', month: 'short', year: 'numeric' }) : '—') },
      { titulo: 'Estado', celda: (p) => insigniaActivo(p.activo) },
      {
        titulo: 'Acciones',
        celda: (p) => el('div', { class: 'acciones' },
          boton('Editar', () => editarPaciente(p), 'boton--secundario', `Editar a ${p.nombres}`),
          boton(p.activo ? 'Desactivar' : 'Activar', () => alternarPaciente(p), p.activo ? 'boton--peligro' : 'boton--secundario'),
          p.activo ? boton('Anonimizar', () => anonimizar(p), 'boton--texto', `Anonimizar a ${p.nombres}`) : null),
      },
    ], lista, 'Pacientes'));
  } catch (e) {
    mostrarEstado(zona, 'error', e.message);
  }
}

function editarPaciente(p) {
  const alerta = el('div', { hidden: true });
  const campo = (id, etiqueta, props) => el('div', { class: 'campo' }, el('label', { for: id, text: etiqueta }), el('input', { id, ...props }));
  const form = el('form', { class: 'formulario', attrs: { novalidate: true } },
    campo('ep-nombres', 'Nombres y apellidos', { name: 'nombres', value: p.nombres ?? '', maxLength: 120, required: true }),
    campo('ep-documento', 'Número de documento', { name: 'documento', value: p.documento ?? '', inputMode: 'numeric', maxLength: 15, required: true }),
    campo('ep-telefono', 'Teléfono', { name: 'telefono', type: 'tel', value: p.telefono ?? '', maxLength: 16, required: true }),
    campo('ep-nacimiento', 'Fecha de nacimiento (opcional)', { name: 'fecha_nacimiento', type: 'date', min: '1900-01-01', max: hoy, value: p.fecha_nacimiento ?? '' }));
  const btnCancelar = el('button', { type: 'button', class: 'boton boton--secundario', text: 'Cancelar' });
  const btnGuardar = el('button', { type: 'button', class: 'boton', text: 'Guardar cambios' });
  const dlg = abrirDialogo({ titulo: `Editar paciente`, contenido: [alerta, form], acciones: [btnCancelar, btnGuardar] });
  btnCancelar.addEventListener('click', () => dlg.close());
  btnGuardar.addEventListener('click', () => conCarga(btnGuardar, async () => {
    if (!validarFormulario(form, {
      nombres: [reglas.requerido, reglas.nombres], documento: [reglas.requerido, reglas.documento],
      telefono: [reglas.requerido, reglas.telefono], fecha_nacimiento: [reglas.fechaNacimiento],
    })) return;
    try {
      await perfilApi.actualizar(p.id, datosFormulario(form));
      dlg.close();
      mostrarAviso('Datos del paciente actualizados.', 'exito');
      cargarPacientes();
    } catch (e) { mostrarAlerta(alerta, e.message); }
  }));
}

async function alternarPaciente(p) {
  if (p.activo && !(await confirmar({
    titulo: 'Desactivar paciente',
    mensaje: `${p.nombres} no podrá iniciar sesión ni reservar. Sus citas se conservan. Puede reactivarlo después.`,
    textoAceptar: 'Desactivar', peligro: true,
  }))) return;
  try {
    await adminApi.cambiarEstadoPerfil(p.id, !p.activo);
    mostrarAviso(`Paciente ${p.activo ? 'desactivado' : 'activado'}.`, 'exito');
    cargarPacientes();
  } catch (e) { mostrarAviso(e.message, 'error'); }
}

async function anonimizar(p) {
  const ok = await confirmar({
    titulo: 'Anonimizar paciente',
    mensaje: `Se reemplazará el nombre de ${p.nombres} y se borrarán documento, teléfono y fecha de nacimiento. Las citas pasadas se conservan para estadísticas. Esta acción no se puede deshacer.`,
    textoAceptar: 'Anonimizar', peligro: true,
  });
  if (!ok) return;
  try {
    await adminApi.anonimizarPaciente(p.id);
    mostrarAviso('Paciente anonimizado.', 'exito');
    cargarPacientes();
  } catch (e) { mostrarAviso(e.message, 'error'); }
}

formPac.addEventListener('submit', (e) => { e.preventDefault(); cargarPacientes(); });

/* ===================================================================
   ESPECIALIDADES
   =================================================================== */
const formEsp = $('#form-especialidad');

function modoEdicion(esp) {
  formEsp.elements.id.value = esp?.id ?? '';
  formEsp.elements.nombre.value = esp?.nombre ?? '';
  formEsp.elements.descripcion.value = esp?.descripcion ?? '';
  $('#titulo-form-especialidad').textContent = esp ? `Editar: ${esp.nombre}` : 'Nueva especialidad';
  $('#es-cancelar').hidden = !esp;
  if (esp) formEsp.elements.nombre.focus();
}

async function cargarEspecialidades() {
  const zona = $('#tabla-especialidades');
  mostrarEstado(zona, 'cargando');
  try {
    const lista = await catalogoApi.especialidades({ incluirInactivas: true });
    if (!lista.length) { mostrarEstado(zona, 'vacio', 'No hay especialidades. Cree la primera.'); return; }
    vaciar(zona, tabla([
      { titulo: 'Nombre', celda: (e) => e.nombre },
      { titulo: 'Descripción', celda: (e) => e.descripcion || '—' },
      { titulo: 'Estado', celda: (e) => insigniaActivo(e.activo) },
      {
        titulo: 'Acciones',
        celda: (e) => el('div', { class: 'acciones' },
          boton('Editar', () => modoEdicion(e), 'boton--secundario', `Editar ${e.nombre}`),
          boton(e.activo ? 'Desactivar' : 'Activar', () => alternarEspecialidad(e), e.activo ? 'boton--peligro' : 'boton--secundario')),
      },
    ], lista, 'Especialidades'));
  } catch (e) {
    mostrarEstado(zona, 'error', e.message);
  }
}

async function alternarEspecialidad(esp) {
  if (esp.activo && !(await confirmar({
    titulo: 'Desactivar especialidad',
    mensaje: `“${esp.nombre}” y sus profesionales dejarán de aparecer en la búsqueda de disponibilidad. Las citas existentes se conservan.`,
    textoAceptar: 'Desactivar', peligro: true,
  }))) return;
  try {
    await adminApi.actualizarEspecialidad(esp.id, { activo: !esp.activo });
    mostrarAviso('Especialidad actualizada.', 'exito');
    cargarEspecialidades();
  } catch (e) { mostrarAviso(e.message, 'error'); }
}

formEsp.addEventListener('reset', () => setTimeout(() => modoEdicion(null)));
formEsp.addEventListener('submit', (e) => {
  e.preventDefault();
  const alerta = $('#alerta-especialidad');
  mostrarAlerta(alerta, null);
  if (!validarFormulario(formEsp, { nombre: [reglas.requerido, reglas.nombres], descripcion: [reglas.maximo(300)] })) return;
  const { id, nombre, descripcion } = datosFormulario(formEsp);
  conCarga(formEsp.querySelector('button[type="submit"]'), async () => {
    try {
      if (id) await adminApi.actualizarEspecialidad(id, { nombre, descripcion: descripcion || null });
      else await adminApi.crearEspecialidad({ nombre, descripcion });
      mostrarAlerta(alerta, id ? 'Especialidad actualizada.' : 'Especialidad creada.', 'exito');
      modoEdicion(null);
      cargarEspecialidades();
    } catch (err) { mostrarAlerta(alerta, err.message); }
  }, 'Guardando…');
});

/* ===================================================================
   Pestañas
   =================================================================== */
configurarPestanas($('[role="tablist"]'), async (nombre) => {
  if (nombre === 'resumen') cargarIndicadores();
  if (nombre === 'citas') cargarCitas();
  if (nombre === 'horarios') {
    try { await cargarSelectProfesionales(); cargarFranjas(); } catch (e) { mostrarAviso(e.message, 'error'); }
  }
  if (nombre === 'profesionales') {
    cargarProfesionales();
    llenarSelectEspecialidades(formProf.elements.especialidad).catch((e) => mostrarAviso(e.message, 'error'));
  }
  if (nombre === 'especialidades') cargarEspecialidades();
  if (nombre === 'pacientes') cargarPacientes();
});
