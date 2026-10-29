# Guía para la sustentación · CitaSalud

Material de estudio para el equipo. Cada integrante debe poder explicar **todas** las respuestas con sus propias palabras y mostrar el código o la consulta que las respalda.

## 1. Guion de demostración (10 minutos)

| Minuto | Quién | Qué mostrar | Dónde |
|---|---|---|---|
| 0–1 | Integrante A | Problema y objetivo en una frase; caso ficticio | Documento, sección 1 |
| 1–3 | Integrante A | Paciente: buscar disponibilidad → reservar → la franja desaparece → cancelar | https://juanospino.github.io/citasalud/ con `paciente1@citasalud.test` |
| 3–4 | Integrante B | Doble reserva: dos navegadores (uno en incógnito) con paciente1 y paciente2 eligen la misma hora; solo uno lo logra | App |
| 4–5 | Integrante B | Profesional: agenda propia, confirmar, ver historial | `dra.gomez@citasalud.test` |
| 5–7 | Integrante A | Administrador: indicadores, generar franjas, editar/desactivar paciente, reservar por un paciente | `admin@citasalud.test` |
| 7–9 | Integrante B | Seguridad: consola del navegador intentando leer citas ajenas (ver sección 3) y `rowsecurity = true` en Supabase | Supabase SQL Editor |
| 9–10 | Ambos | Limitaciones del MVP y siguiente incremento | README |

Contraseña de todas las cuentas demo: `CitaDemo2026*`.

## 2. Respuestas a las preguntas del taller

**¿Qué evidencia demuestra que el sistema resuelve el problema planteado?**
Cada causa del problema tiene un control verificable: los cruces de horario los impide el índice único `appointments_franja_activa_uk` (prueba CP-02); los duplicados de pacientes, `profiles.documento UNIQUE` (CP-19); la falta de confirmación, los estados con historial (CP-07, CP-24); la consulta de disponibilidad sin llamar, `buscar_disponibilidad()` (CP-01); y la falta de datos, los indicadores (CP-21). La matriz de trazabilidad (sección 13) conecta cada necesidad con su prueba.

**¿Qué requisito fue más difícil de implementar y por qué?**
La reserva sin doble asignación (RF-07). No basta con revisar en JavaScript si la franja está libre, porque dos personas pueden hacerlo al mismo tiempo. Se resolvió en la base de datos con tres capas: `SELECT … FOR UPDATE` bloquea la franja dentro de `reservar_cita()`, el índice único parcial rechaza una segunda cita activa, y la interfaz traduce el error 23505 en un aviso y recarga la disponibilidad.

**¿Cómo se impide una doble reserva?**
Con el índice único parcial `appointments_franja_activa_uk (schedule_id) WHERE estado <> 'cancelada'`: PostgreSQL no permite dos citas no canceladas en la misma franja, sin importar desde dónde llegue la petición. Además, la función bloquea la fila de la franja para serializar solicitudes simultáneas. Archivo: `sql/esquema.sql`, sección 2 y función 5.3.

**¿Qué política RLS protege las citas de un paciente?**
`appointments_select_participantes`: una fila solo es visible si `patient_id = auth.uid()`, si el `professional_id` es el del profesional autenticado o si el usuario es administrador. Además, nadie tiene permiso de `INSERT` directo ni de `UPDATE` del estado: solo se puede reservar o cambiar estado mediante funciones que vuelven a validar el rol. Archivo: `sql/politicas_rls.sql`.

**¿Qué ocurriría si una persona modifica un identificador desde el navegador?**
Nada útil para el atacante. Si un paciente pide una cita ajena por su ID, RLS no retorna filas (CP-03). Si intenta cancelarla, `cambiar_estado_cita()` responde "Cita no encontrada o sin permiso", el mismo mensaje que para una cita inexistente, para no revelar información. Si intenta volverse administrador editando su perfil, el disparador `tg_proteger_perfil` lo rechaza (CP-12). Ocultar botones no es la seguridad; la base de datos sí.

**¿Por qué eligieron ese modelo para horarios y disponibilidad?**
La franja (`schedules`) no guarda si está ocupada; la ocupación se deriva de si existe una cita no cancelada. Así no hay dos datos que puedan contradecirse, cancelar libera la franja automáticamente y se conserva el historial de citas canceladas. La restricción de exclusión GiST impide que un profesional tenga franjas superpuestas, y como cada franja admite una sola cita activa, un profesional nunca tiene dos citas a la vez. Alternativa descartada: una columna `estado` en la franja actualizada a mano, que podía desincronizarse.

**¿Qué cambiarían para atender múltiples sedes o consultorios?**
Agregar una tabla `sites` (sedes) y `rooms` (consultorios); `schedules` tendría `site_id` y `room_id`, y la restricción de exclusión incluiría el consultorio para que dos profesionales no usen el mismo espacio a la misma hora. La búsqueda de disponibilidad sumaría un filtro por sede y la zona horaria pasaría a ser un atributo de la sede.

**¿Qué recomendación de IA descartaron o modificaron y por qué?**
Ejemplos reales de este proyecto: (1) se descartó guardar la disponibilidad como columna en `schedules` por el riesgo de inconsistencia; (2) el disparador que protege el rol se escribió primero con `SECURITY DEFINER` y las pruebas mostraron que así un paciente podía volverse administrador; se corrigió quitando esa opción (CP-12); (3) la política de especialidades fallaba para visitantes sin sesión hasta que se dio permiso de ejecución a las funciones de rol (CP-13). *Completen con sus propias decisiones.*

**¿Qué limitación permanece en el MVP y cuál sería el siguiente incremento?**
No hay recordatorios por correo o SMS, hay una sola sede, la reprogramación se hace cancelando y reservando de nuevo, y la regla de 2 horas es fija. El siguiente incremento con más impacto serían los recordatorios automáticos 24 horas antes (Supabase Edge Functions + correo), porque atacan directamente la tasa de inasistencia que ya mide el panel.

## 3. Prueba de seguridad en vivo (consola del navegador)

Inicie sesión como `paciente2@citasalud.test`, abra la consola (F12) y pegue:

```js
const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.99.3/+esm');
const { CONFIG } = await import('./assets/js/config.js');
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
console.log(await sb.from('appointments').select('id, patient_id'));          // solo sus propias citas
console.log(await sb.from('appointments').insert({}));                         // error: permiso denegado
console.log(await sb.from('profiles').select('nombres, documento'));           // solo su propio perfil
```

## 4. Conceptos que cada integrante debe dominar

- Qué es RLS y por qué la clave anon puede estar en el frontend.
- Diferencia entre `auth.users` y `profiles`.
- Qué hace una función `SECURITY DEFINER` y por qué se fija `search_path`.
- Las transiciones de estado válidas y dónde se validan (`transicion_valida()` + disparador).
- Por qué no se usa `innerHTML` con datos (XSS) y cómo se crean los nodos (`el()` en `ui.js`).
- Cómo se despliega: GitHub Pages sirve archivos estáticos; Supabase hace todo lo demás.
