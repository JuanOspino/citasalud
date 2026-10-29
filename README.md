# CitaSalud · Sistema web de reserva de citas médicas

MVP académico para la asignatura **Análisis y Diseño de Software** (Proyecto Integrador, Ing. Mg. José Javier Zapata Polo).
Caso: **IPS Ambulatoria Bienestar**, institución **ficticia**. Todos los datos son de prueba; no se almacena información clínica.

- **Aplicación publicada:** https://juanospino.github.io/citasalud/
- **Repositorio:** https://github.com/JuanOspino/citasalud
- **Documento de análisis y diseño:** https://claude.ai/artifact/VVxc1xd5ydV3fb7vHpyVDB (copia en `docs/`)
- **Integrantes:** *(completar: nombre · usuario GitHub)*

## Tecnologías

HTML5, CSS3 y JavaScript (módulos ES, sin frameworks) · GitHub Pages (frontend estático) · Supabase (Auth, PostgreSQL, API REST/RPC y Row Level Security) · `@supabase/supabase-js@2.99.3` desde jsDelivr.

## Funcionalidades

| Rol | Puede |
|---|---|
| Paciente | Registrarse, iniciar sesión, recuperar contraseña, editar su perfil, buscar disponibilidad por especialidad/profesional/fecha, reservar, ver "Mis citas" e historial, cancelar con ≥ 2 h de anticipación |
| Profesional | Ver solo su agenda por rango y estado, ver detalle e historial, confirmar, marcar atendida / no asistió (cuando la cita ya inició) o cancelar |
| Administrador | Indicadores (por estado, especialidad y mes, tasa de inasistencia), consultar y gestionar todas las citas, reservar en nombre de un paciente, buscar/editar/activar/desactivar/anonimizar pacientes, crear/editar/activar/desactivar especialidades, registrar y editar profesionales, generar franjas en bloque, agregar/editar/activar/desactivar/eliminar franjas |

## Estructura del repositorio

```
index.html · registro.html · recuperar.html       Acceso
paciente.html · profesional.html · admin.html     Paneles por rol
assets/css/estilos.css                            Estilos responsive (mobile-first, alto contraste)
assets/js/config.js                               URL y clave pública (anon) de Supabase
assets/js/supabaseClient.js                       Cliente único de Supabase
assets/js/api.js                                  Acceso a datos + traducción de errores
assets/js/auth.js                                 Sesión y redirección por rol
assets/js/ui.js                                   Creación segura de nodos, avisos, diálogos, formatos
assets/js/accesibilidad.js                        Alto contraste y tamaño de letra (A−/A+)
assets/js/carrusel.js                             Carrusel accesible de la portada
assets/js/validacion.js                           Validaciones del cliente
assets/js/componentes/                            Reserva y detalle de cita (reutilizados)
assets/js/pages/                                  Lógica de cada página
sql/esquema.sql                                   Tablas, restricciones, índices, disparadores, funciones RPC
sql/politicas_rls.sql                             RLS, políticas y privilegios
sql/datos_prueba.sql                              Cuentas demo y datos ficticios
sql/reset.sql                                     Borra todo para reconstruir (solo pruebas)
pruebas/                                          Pruebas SQL de reglas/seguridad y pruebas E2E
docs/                                             Documento de análisis y diseño, wireframes, capturas, guías
```

## Instalación paso a paso

1. **Crear el proyecto** en [supabase.com](https://supabase.com) (región más cercana).
2. **Base de datos:** en *SQL Editor* ejecute, en este orden: `sql/esquema.sql`, `sql/politicas_rls.sql`, `sql/datos_prueba.sql`.
   - Si el paso de cuentas demo falla en su proyecto, créelas en *Authentication › Users › Add user* (marcando *Auto Confirm User*) con los correos de la tabla de abajo y vuelva a ejecutar `datos_prueba.sql`.
3. **Autenticación:** en *Authentication › URL Configuration* configure *Site URL* con la URL de GitHub Pages y agregue `.../recuperar.html` e `.../index.html` en *Redirect URLs*. Para pruebas puede desactivar *Confirm email*.
4. **Frontend:** edite `assets/js/config.js` con *Project URL* y la clave **anon/publishable** (*Project Settings › API*).
5. **Publicar:** suba el repositorio a GitHub › *Settings › Pages* › *Deploy from a branch* › `main` / `root`.
6. **Probar en local (opcional):** `python3 -m http.server 8080` y abra `http://localhost:8080`.

## Credenciales de demostración (ficticias)

Contraseña para todas: `CitaDemo2026*`

| Rol | Correo |
|---|---|
| Administrador | `admin@citasalud.test` |
| Profesional (Medicina general) | `dra.gomez@citasalud.test` |
| Profesional (Pediatría) | `dr.ruiz@citasalud.test` |
| Profesional (Odontología) | `dra.mesa@citasalud.test` |
| Paciente | `paciente1@citasalud.test` |
| Paciente | `paciente2@citasalud.test` |

## Decisiones técnicas principales

- **Doble reserva imposible en la BD:** índice único parcial `appointments_franja_activa_uk (schedule_id) WHERE estado <> 'cancelada'` + `SELECT … FOR UPDATE` de la franja dentro de `reservar_cita()`. Si dos personas reservan a la vez, una recibe el error 23505 y la interfaz refresca la disponibilidad.
- **Sin solapamiento de franjas:** restricción de exclusión GiST `schedules_sin_solape_ex` por profesional y rango horario.
- **Cancelar libera la franja** sin borrar nada: la cita cancelada se conserva (historial) y deja de contar para el índice único.
- **Estados con enum** y transiciones validadas por disparador: `programada → confirmada | cancelada`, `confirmada → atendida | no_asistio | cancelada`. Atendida/no asistió solo cuando la cita ya inició; cancelar solo antes de iniciar.
- **Escrituras críticas solo por RPC** (`SECURITY DEFINER` con `search_path` fijo): el cliente no tiene `INSERT` sobre citas ni `UPDATE` del estado. Toda acción queda en `status_history` con `changed_by = auth.uid()`.
- **RLS en las 6 tablas** + revocación de privilegios por defecto (mínimo privilegio). El rol nunca se toma del registro: siempre inicia como `paciente`; un disparador impide que un usuario cambie su propio rol.
- **Borrado:** `RESTRICT` en llaves foráneas; borrado lógico (`activo`) y función `anonimizar_paciente()`.
- **Zona horaria** del negocio: `America/Bogota`.
- **Seguridad en la interfaz:** nunca se usa `innerHTML` con datos; todos los nodos se crean con `textContent`. La clave anon es pública por diseño; **no** existe `service_role` en el repositorio.

## Pruebas

- `pruebas/pruebas_reglas_seguridad.sql`: casos positivos y negativos de RLS y reglas (ejecutables en un PostgreSQL local con `pruebas/00_entorno_local.sql`, que emula `auth`).
- `pruebas/e2e/`: pruebas de navegador con Playwright sobre un emulador local (PostgREST + autenticación simulada).
- Capturas en `docs/capturas/`.

## Limitaciones conocidas (MVP)

- No se envían recordatorios por correo/SMS.
- Una sola sede; no se gestionan consultorios ni recursos físicos.
- La reprogramación se hace cancelando y reservando de nuevo.
- La regla de anticipación (2 h) es fija en `horas_minimas_cancelacion()` y en `config.js`.

## Documentación (`docs/`)

- `documento_analisis_diseno.md`: copia del documento de análisis y diseño (versión editable en el enlace de arriba).
- `wireframes/`: bocetos de baja fidelidad de las pantallas principales.
- `capturas/`: capturas de la aplicación en computador y celular.
- `GUIA_PASO_A_PASO.md`: instalación y despliegue.
- `GUIA_SUSTENTACION.md`: respuestas preparadas a las preguntas de la sustentación.

## Uso de IA

Se usó un asistente de IA como apoyo. Ver bitácora en el documento de análisis y diseño (anexo).
