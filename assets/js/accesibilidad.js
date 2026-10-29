/**
 * Herramienta de accesibilidad: alto contraste y tamaño de letra.
 * La preferencia se guarda solo en este navegador (localStorage).
 */
const CLAVE = 'citasalud-accesibilidad';
const TAMANOS = [87.5, 100, 112.5, 125, 137.5];

function leer() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; }
}
function guardar(pref) {
  try { localStorage.setItem(CLAVE, JSON.stringify(pref)); } catch { /* sin almacenamiento: no pasa nada */ }
}

const pref = { contraste: false, tamano: 1, ...leer() };

function aplicar() {
  document.documentElement.classList.toggle('alto-contraste', pref.contraste);
  document.documentElement.style.fontSize = `${TAMANOS[pref.tamano]}%`;
  const btn = document.getElementById('acc-contraste');
  if (btn) btn.setAttribute('aria-pressed', String(pref.contraste));
}

const ICONO_CONTRASTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>';
const ICONO_RESTABLECER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/></svg>';

function montar() {
  const barra = document.createElement('div');
  barra.className = 'accesibilidad';
  barra.setAttribute('role', 'group');
  barra.setAttribute('aria-label', 'Opciones de accesibilidad');

  const botones = [
    ['acc-contraste', ICONO_CONTRASTE, 'Alto contraste', () => { pref.contraste = !pref.contraste; }],
    ['acc-menos', 'A−', 'Disminuir tamaño de letra', () => { pref.tamano = Math.max(0, pref.tamano - 1); }],
    ['acc-mas', 'A+', 'Aumentar tamaño de letra', () => { pref.tamano = Math.min(TAMANOS.length - 1, pref.tamano + 1); }],
    ['acc-restablecer', ICONO_RESTABLECER, 'Restablecer', () => { pref.contraste = false; pref.tamano = 1; }],
  ];
  for (const [id, contenido, etiqueta, accion] of botones) {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.title = etiqueta;
    b.setAttribute('aria-label', etiqueta);
    if (contenido.startsWith('<svg')) {
      // Ícono fijo definido en este archivo; se interpreta como SVG, no como HTML.
      const svg = new DOMParser().parseFromString(contenido.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), 'image/svg+xml').documentElement;
      b.append(document.importNode(svg, true));
    } else {
      b.textContent = contenido;
    }
    b.addEventListener('click', () => { accion(); aplicar(); guardar(pref); });
    barra.append(b);
  }
  document.body.append(barra);
  aplicar();
}

aplicar();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
else montar();
