# Guía paso a paso · Poner CitaSalud en funcionamiento

Tiempo estimado: 45–60 minutos. Necesitan: cuenta en GitHub, cuenta en Supabase, Git instalado y el archivo `citasalud.zip`.

---

## Paso 1 · Crear el proyecto en Supabase (10 min)

1. Entra a https://supabase.com e inicia sesión (puedes usar tu cuenta de GitHub).
2. **New project** → nombre `citasalud` → escribe una contraseña de base de datos y **guárdala** (no va en el código) → región más cercana (p. ej. *East US* o *South America (São Paulo)*) → **Create new project**.
3. Espera 1–2 minutos a que termine de crearse.

## Paso 2 · Crear la base de datos (10 min)

1. En el menú izquierdo abre **SQL Editor** → **New query**.
2. Abre `sql/esquema.sql` con un editor de texto, copia **todo**, pégalo y presiona **Run**. Debe decir *Success. No rows returned*.
3. Nueva consulta → pega **todo** `sql/politicas_rls.sql` → **Run**.
4. Nueva consulta → pega **todo** `sql/datos_prueba.sql` → **Run**. Al final verás dos tablas pequeñas: roles (1 admin, 3 profesional, 2 paciente) y citas por estado.
5. Comprueba en **Table Editor** que existen las 6 tablas y que cada una muestra el candado **RLS enabled**.

> Si el paso 4 falla en la parte de `auth.users`: ve a **Authentication → Users → Add user → Create new user**, crea los 6 correos de la tabla de abajo con la contraseña `CitaDemo2026*` y marca **Auto Confirm User**. Luego vuelve a ejecutar `datos_prueba.sql` completo.
>
> Si algo sale mal y quieres empezar de cero: ejecuta `sql/reset.sql` y repite los pasos 2 a 4.

| Rol | Correo (contraseña `CitaDemo2026*`) |
|---|---|
| Administrador | admin@citasalud.test |
| Profesional (Medicina general) | dra.gomez@citasalud.test |
| Profesional (Pediatría) | dr.ruiz@citasalud.test |
| Profesional (Odontología) | dra.mesa@citasalud.test |
| Paciente | paciente1@citasalud.test |
| Paciente | paciente2@citasalud.test |

## Paso 3 · Conectar el frontend con Supabase (3 min)

1. En Supabase: **Project Settings → API** (o **Data API / API Keys**).
2. Copia la **Project URL** (`https://xxxx.supabase.co`) y la clave **anon public** (o *publishable key*).
3. Abre `assets/js/config.js` y reemplaza:
   - `https://TU-PROYECTO.supabase.co` → tu Project URL
   - `TU_CLAVE_ANON_PUBLICA` → tu clave anon
4. **Nunca** pongas la clave `service_role` / *secret* en ningún archivo.

## Paso 4 · Probar en tu computador (5 min, opcional pero recomendado)

1. Abre una terminal en la carpeta `citasalud` y ejecuta `python -m http.server 8080` (o la extensión *Live Server* de VS Code).
2. Abre http://localhost:8080 e ingresa con `paciente1@citasalud.test` / `CitaDemo2026*`.
3. Reserva una cita, cancélala, y luego entra como profesional y como administrador.

> No abras `index.html` con doble clic (file://): los módulos de JavaScript necesitan un servidor.

## Paso 5 · Subir a GitHub con commits de ambos integrantes (15 min)

1. En GitHub: **New repository** → nombre `citasalud` → **Public** → sin README → **Create repository**.
2. Integrante A, en la carpeta `citasalud`:

```bash
git init
git branch -M main
git remote add origin https://github.com/USUARIO/citasalud.git

git add sql/
git commit -m "Esquema de base de datos, políticas RLS y datos de prueba"
git add assets/css/ index.html registro.html recuperar.html
git commit -m "Estilos y páginas de acceso"
git add assets/js/config.js assets/js/supabaseClient.js assets/js/api.js assets/js/auth.js assets/js/ui.js assets/js/validacion.js assets/js/pages/login.js assets/js/pages/registro.js assets/js/pages/recuperar.js
git commit -m "Módulos base: cliente Supabase, API, sesión, UI y validaciones"
git push -u origin main
```

3. En GitHub: **Settings → Collaborators → Add people** → agrega al Integrante B.
4. Integrante B, en su computador (con su propia cuenta de GitHub):

```bash
git clone https://github.com/USUARIO/citasalud.git
cd citasalud
# copia aquí desde el zip: paciente.html, profesional.html, admin.html,
# assets/js/componentes/, assets/js/pages/paciente.js, profesional.js, admin.js
git add assets/js/componentes/ paciente.html assets/js/pages/paciente.js
git commit -m "Panel del paciente y componentes de reserva y detalle de cita"
git add profesional.html admin.html assets/js/pages/profesional.js assets/js/pages/admin.js
git commit -m "Agenda del profesional y panel administrativo"
git push
```

5. Integrante A: `git pull`, luego agrega pruebas y documentación:

```bash
git add pruebas/ docs/ README.md .gitignore .env.example
git commit -m "Pruebas, documentación y README"
git push
```

> Mejor aún: repartan los commits a lo largo de varios días según los hitos y cada uno haga los ajustes que pruebe. Revisen antes de cada push que **no** haya claves `service_role` ni contraseñas personales.

## Paso 6 · Publicar con GitHub Pages (3 min)

1. En el repositorio: **Settings → Pages**.
2. *Source*: **Deploy from a branch** → Branch **main** / carpeta **/ (root)** → **Save**.
3. Espera 1–2 minutos y recarga: aparecerá la URL `https://USUARIO.github.io/citasalud/`.

## Paso 7 · Configurar Auth en Supabase con la URL publicada (3 min)

1. Supabase → **Authentication → URL Configuration**.
2. **Site URL**: `https://USUARIO.github.io/citasalud/`
3. **Redirect URLs** → agrega:
   - `https://USUARIO.github.io/citasalud/index.html`
   - `https://USUARIO.github.io/citasalud/recuperar.html`
   - `http://localhost:8080/*` (para pruebas locales)
4. Para la demostración puedes desactivar la confirmación de correo en **Authentication → Sign In / Providers → Email → Confirm email** (opcional).

## Paso 8 · Probar en la URL publicada y tomar evidencias (10 min)

Haz estas pruebas y toma una captura de cada una (guárdalas en `docs/capturas/`):

1. Paciente: reservar una cita (CP-01) y verificar que la hora desaparece.
2. Dos navegadores (uno en incógnito) con paciente1 y paciente2 eligiendo la **misma** hora y confirmando casi al tiempo: solo uno lo logra (CP-02).
3. Paciente: cancelar una cita futura (CP-07).
4. Profesional `dr.ruiz`: verificar que no ve citas de la Dra. Gómez (CP-04).
5. Escribir `…/admin.html` estando como paciente: debe redirigir (CP-14).
6. Admin: indicadores, generar franjas, crear especialidad, reservar por un paciente.
7. Celular o DevTools a 360 px de ancho: sin desplazamiento horizontal (CP-05).
8. Recuperar contraseña con un correo real tuyo (registra una cuenta de prueba con tu correo).
9. Prueba de seguridad (CP-03): en la consola del navegador (F12), estando como paciente2:

```js
const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.99.3/+esm');
const { CONFIG } = await import('./assets/js/config.js');
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
await sb.from('appointments').select('*');           // solo devuelve las citas propias
await sb.from('appointments').insert({});             // debe fallar: permiso denegado
await sb.from('profiles').update({ rol: 'admin' }).eq('id', (await sb.auth.getUser()).data.user.id); // debe fallar
```

## Paso 9 · Cerrar la entrega

- [ ] Completar en `README.md`: integrantes y URL publicada.
- [ ] Actualizar la sección 12 del documento con "Resultado obtenido" en Supabase real y adjuntar capturas.
- [ ] Completar la bitácora de IA (sección 14) con sus propias verificaciones.
- [ ] Exportar el documento de análisis y diseño a Word/PDF.
- [ ] Revisar la lista de verificación final del taller (sección 17).
- [ ] Ambos integrantes repasan: cómo se impide la doble reserva, qué política protege las citas, por qué ese modelo de franjas.

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| "Configuración pendiente" en la portada | Falta editar `assets/js/config.js` (paso 3) |
| Página en blanco al abrir con doble clic | Usa un servidor local (paso 4) o la URL de GitHub Pages |
| "Debe confirmar su correo" | Desactiva *Confirm email* o confirma desde el correo |
| "Complete documento y teléfono…" al reservar | El paciente debe llenar "Mi perfil" |
| No aparecen horarios | Las franjas de prueba son de lunes a viernes, 8:00–12:00, hasta 14 días adelante; elige otra fecha o genera franjas como admin |
| Error al ejecutar `datos_prueba.sql` en `auth.users` | Crea los usuarios a mano (nota del paso 2) |
| El enlace de recuperación lleva a localhost | Revisa *Site URL* y *Redirect URLs* (paso 7) |
| El proyecto de Supabase se "pausa" | En el plan gratuito se pausa por inactividad; reactívalo desde el panel antes de la sustentación |
