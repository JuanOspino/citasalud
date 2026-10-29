const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = 'http://localhost:8080';
const PW = 'CitaDemo2026*';
const shots = '/home/claude/test/shots';
require('fs').mkdirSync(shots, { recursive: true });

const UMD = require('fs').readFileSync('/home/claude/test/package/dist/umd/supabase.js','utf8') + '\nexport const createClient = supabase.createClient;';
const resultados = [];
const ok = (n, cond, extra = '') => { resultados.push(`${cond ? 'PASA' : 'FALLA'} · ${n}${extra ? ' · ' + extra : ''}`); };

async function login(page, email) {
  await page.goto(`${BASE}/index.html`);
  await page.fill('#correo', email);
  await page.fill('#clave', PW);
  await page.click('#form-login button[type=submit]');
  await page.waitForURL(/(paciente|profesional|admin)\.html/, { timeout: 10000 });
}
async function logout(page) {
  await page.click('#usuario button');
  await page.waitForURL(/index\.html/);
}
async function sinScrollHorizontal(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}
function proximoDiaHabil(dias) {
  const d = new Date(Date.now() - 5 * 3600e3); // Bogotá
  d.setUTCDate(d.getUTCDate() + dias);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

(async () => {
  const browser = await chromium.launch();
  for (const ancho of [1280, 360]) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: ancho === 360 ? 740 : 860 }, locale: 'es-CO' });
    await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, (r) => r.fulfill({ contentType: 'application/javascript', body: UMD }));
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
    const sfx = `_${ancho}`;

    // Portada
    await page.goto(`${BASE}/index.html`);
    await page.waitForSelector('#lista-especialidades li:has-text("Pediatría")');
    ok(`Portada lista especialidades (${ancho}px)`, true);
    ok(`Portada sin scroll horizontal (${ancho}px)`, await sinScrollHorizontal(page));
    await page.screenshot({ path: `${shots}/01_portada${sfx}.png`, fullPage: true });

    // Login inválido
    await page.fill('#correo', 'paciente1@citasalud.test'); await page.fill('#clave', 'malaClave1');
    await page.click('#form-login button[type=submit]');
    await page.waitForSelector('#alerta-login:has-text("incorrectos")');
    ok('Login con clave incorrecta muestra error', true);

    if (ancho === 360) {
      await login(page, 'paciente1@citasalud.test');
      await page.waitForSelector('#proximas-citas .item, #proximas-citas .estado-vista p:not(:has-text("Cargando"))');
      ok('Panel paciente móvil sin scroll horizontal', await sinScrollHorizontal(page));
      await page.screenshot({ path: `${shots}/02_paciente_inicio${sfx}.png`, fullPage: true });
      await page.click('#tab-reservar');
      await page.fill('#rsv1-fecha', proximoDiaHabil(3));
      await page.click('#zona-reserva button[type=submit]');
      await page.waitForSelector('.franja');
      ok('Reserva móvil sin scroll horizontal', await sinScrollHorizontal(page));
      await page.screenshot({ path: `${shots}/03_reserva${sfx}.png`, fullPage: true });
      await page.click('#tab-citas');
      await page.waitForSelector('#lista-citas .item');
      await page.screenshot({ path: `${shots}/04_mis_citas${sfx}.png`, fullPage: true });
      await logout(page);
      await login(page, 'admin@citasalud.test');
      await page.waitForSelector('.kpi__valor');
      ok('Admin móvil sin scroll horizontal', await sinScrollHorizontal(page));
      await page.screenshot({ path: `${shots}/05_admin${sfx}.png`, fullPage: true });
      await page.click('#tab-citas'); await page.waitForSelector('#tabla-citas table, #tabla-citas .estado-vista p:not(:has-text("Cargando"))');
      ok('Admin citas móvil sin scroll horizontal', await sinScrollHorizontal(page));
      await page.screenshot({ path: `${shots}/06_admin_citas${sfx}.png`, fullPage: true });
      ok(`Sin errores de consola (${ancho}px)`, errores.length === 0, errores.join(' | '));
      await ctx.close();
      continue;
    }

    // ---------- Paciente: reservar y cancelar ----------
    await login(page, 'paciente1@citasalud.test');
    ok('Paciente redirigido a su panel', page.url().includes('paciente.html'));
    await page.click('#tab-reservar');
    await page.waitForFunction(() => document.querySelectorAll('#rsv1-esp option').length > 1);
    await page.selectOption('#rsv1-esp', { label: 'Pediatría' });
    await page.waitForFunction(() => [...document.querySelectorAll('#rsv1-prof option')].some((o) => o.textContent.includes('Ruiz')));
    const fecha = proximoDiaHabil(4);
    await page.fill('#rsv1-fecha', fecha);
    await page.click('#zona-reserva button[type=submit]');
    await page.waitForSelector('.franja');
    const nAntes = await page.locator('.franja').count();
    await page.locator('.franja').first().click();
    await page.fill('dialog textarea', 'Control de crecimiento');
    await page.screenshot({ path: `${shots}/07_confirmar_reserva.png` });
    await page.click('dialog button:has-text("Confirmar reserva")');
    await page.waitForSelector('.aviso--exito');
    await page.waitForFunction((n) => document.querySelectorAll('.franja').length === n - 1, nAntes);
    ok('CP-01 Reserva crea cita y la franja desaparece', true, `${nAntes} -> ${nAntes - 1}`);

    // Validación: fecha pasada en cliente
    await page.fill('#rsv1-fecha', '2020-01-01');
    await page.click('#zona-reserva button[type=submit]');
    ok('Validación de fecha pasada en el cliente', await page.locator('.error-campo:has-text("fecha futura")').isVisible());

    await page.click('#tab-citas');
    await page.waitForSelector('#lista-citas .item');
    const cancelar = page.locator('#lista-citas .item', { hasText: 'Pediatría' }).locator('button:has-text("Cancelar")').first();
    await cancelar.click();
    await page.fill('dialog textarea', 'Ya no puedo asistir');
    await page.click('dialog button:has-text("Cancelar cita")');
    await page.click('dialog >> nth=1 >> button:has-text("Sí, continuar")');
    await page.waitForSelector('.aviso--exito:has-text("Cancelada")');
    ok('Paciente cancela su cita futura', true);
    await page.screenshot({ path: `${shots}/08_mis_citas_tras_cancelar.png`, fullPage: true });

    // Perfil: validación y guardado
    await page.click('#tab-perfil');
    await page.fill('#p-telefono', 'abc');
    await page.click('#form-perfil button[type=submit]');
    ok('Validación de teléfono en perfil', await page.locator('#p-telefono[aria-invalid=true]').count() === 1);
    await page.fill('#p-telefono', '3005556677');
    await page.click('#form-perfil button[type=submit]');
    await page.waitForSelector('#alerta-perfil:has-text("correctamente")');
    ok('Perfil se actualiza', true);

    // Acceso a panel admin con rol paciente
    await page.goto(`${BASE}/admin.html`);
    await page.waitForURL(/paciente\.html\?acceso=denegado/);
    ok('Paciente que abre admin.html es redirigido', true);
    await logout(page);

    // ---------- Profesional ----------
    await login(page, 'dra.gomez@citasalud.test');
    await page.waitForSelector('#agenda table, #agenda .estado-vista p:not(:has-text("Cargando"))');
    const filas = await page.locator('#agenda tbody tr').count();
    ok('Profesional ve su agenda', filas > 0, `${filas} citas`);
    const otros = await page.locator('#agenda td:has-text("Ruiz")').count();
    ok('Agenda no muestra citas de otro profesional', otros === 0);
    await page.locator('#agenda tbody tr', { hasText: 'Programada' }).first().locator('button').click();
    await page.click('dialog button:has-text("Confirmar cita")');
    await page.click('dialog >> nth=1 >> button:has-text("Sí, continuar")');
    await page.waitForSelector('.aviso--exito:has-text("Confirmada")');
    ok('Profesional confirma una cita', true);
    await page.screenshot({ path: `${shots}/09_profesional.png`, fullPage: true });
    await logout(page);

    // ---------- Admin ----------
    await login(page, 'admin@citasalud.test');
    await page.waitForSelector('.kpi__valor');
    await page.screenshot({ path: `${shots}/10_admin_resumen.png`, fullPage: true });
    ok('Indicadores visibles', await page.locator('.barra').count() > 3);

    await page.click('#tab-especialidades');
    await page.waitForSelector('#tabla-especialidades table');
    await page.fill('#es-nombre', 'Nutrición');
    await page.click('#form-especialidad button[type=submit]');
    await page.waitForSelector('#alerta-especialidad:has-text("creada")');
    await page.fill('#es-nombre', 'nutrición ');
    await page.click('#form-especialidad button[type=submit]');
    await page.waitForSelector('#alerta-especialidad:has-text("Ya existe")');
    ok('Crear especialidad y rechazar duplicado', true);

    await page.click('#tab-horarios');
    await page.waitForFunction(() => document.querySelectorAll('#ho-profesional option').length > 0);
    await page.selectOption('#ho-profesional', { index: 2 });
    await page.fill('#ge-inicio', '14:00'); await page.fill('#ge-fin', '16:00');
    await page.click('#form-generar button[type=submit]');
    await page.waitForSelector('#alerta-generar:has-text("Se crearon")');
    ok('Generar franjas', true, await page.locator('#alerta-generar').textContent());
    await page.screenshot({ path: `${shots}/11_admin_horarios.png`, fullPage: true });

    await page.click('#tab-citas');
    await page.waitForSelector('#tabla-citas table');
    await page.click('#bloque-nueva-cita summary');
    await page.fill('#rsv1-buscar', 'María');
    await page.click('#zona-reserva-admin button:has-text("Buscar paciente")');
    await page.waitForFunction(() => document.querySelectorAll('#rsv1-paciente option').length > 1);
    await page.selectOption('#rsv1-paciente', { index: 1 });
    await page.fill('#rsv1-fecha', proximoDiaHabil(5));
    await page.click('#zona-reserva-admin button[type=submit]');
    await page.waitForSelector('#zona-reserva-admin .franja');
    await page.locator('#zona-reserva-admin .franja').first().click();
    await page.click('dialog button:has-text("Confirmar reserva")');
    await page.waitForSelector('.aviso--exito:has-text("Cita reservada")');
    ok('Admin reserva en nombre de paciente', true);
    await page.screenshot({ path: `${shots}/12_admin_citas.png`, fullPage: true });

    await page.click('#tab-profesionales');
    await page.waitForSelector('#tabla-profesionales table');
    ok('Listado de profesionales', await page.locator('#tabla-profesionales tbody tr').count() === 3);
    await logout(page);

    // ---------- Registro ----------
    await page.goto(`${BASE}/registro.html`);
    await page.fill('#nombres', 'Paciente Nuevo Prueba');
    await page.fill('#documento', '1000000005'); // duplicado
    await page.fill('#telefono', '3001234567');
    await page.fill('#correo', 'nuevo@citasalud.test');
    await page.fill('#clave', 'Clave1234'); await page.fill('#clave2', 'Clave1234');
    await page.click('#form-registro button[type=submit]');
    await page.waitForSelector('#alerta-registro.alerta--error');
    ok('Registro con documento duplicado se rechaza', true);
    await page.fill('#documento', '1099887766');
    await page.click('#form-registro button[type=submit]');
    await page.waitForURL(/paciente\.html/);
    ok('Registro nuevo entra como paciente', true);

    ok(`Sin errores de consola (${ancho}px)`, errores.filter((e) => !/status of 4\d\d/.test(e)).length === 0, errores.join(' | '));
    await ctx.close();
  }
  await browser.close();
  console.log(resultados.join('\n'));
})().catch((e) => { console.log(resultados.join('\n')); console.error('ERROR', e.message); process.exit(1); });
