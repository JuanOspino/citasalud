/**
 * Carrusel de la portada: avance automático cada 7 s, flechas, puntos,
 * botón de pausa (WCAG 2.2.2) y navegación con teclado.
 */
const raiz = document.querySelector('[data-carrusel]');

if (raiz) {
  const slides = [...raiz.querySelectorAll('.carrusel__slide')];
  const puntos = [...raiz.querySelectorAll('.carrusel__punto')];
  const pausa = raiz.querySelector('.carrusel__pausa');
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let actual = 0;
  let pausado = reducido;
  let temporizador = null;

  const mostrar = (i) => {
    actual = (i + slides.length) % slides.length;
    slides.forEach((s, n) => {
      const activo = n === actual;
      s.classList.toggle('activo', activo);
      s.setAttribute('aria-hidden', String(!activo));
      s.querySelectorAll('a, button').forEach((el) => { el.tabIndex = activo ? 0 : -1; });
    });
    puntos.forEach((p, n) => p.setAttribute('aria-current', String(n === actual)));
  };

  const programar = () => {
    clearInterval(temporizador);
    if (!pausado) temporizador = setInterval(() => mostrar(actual + 1), 7000);
  };

  const pintarPausa = () => {
    pausa.querySelector('span').textContent = pausado ? 'Reproducir' : 'Pausar';
    pausa.setAttribute('aria-label', pausado ? 'Reproducir carrusel' : 'Pausar carrusel');
  };

  raiz.querySelector('.carrusel__flecha--prev').addEventListener('click', () => { mostrar(actual - 1); programar(); });
  raiz.querySelector('.carrusel__flecha--next').addEventListener('click', () => { mostrar(actual + 1); programar(); });
  puntos.forEach((p, n) => p.addEventListener('click', () => { mostrar(n); programar(); }));
  pausa.addEventListener('click', () => { pausado = !pausado; pintarPausa(); programar(); });

  // Pausa mientras el usuario interactúa con el carrusel.
  raiz.addEventListener('mouseenter', () => clearInterval(temporizador));
  raiz.addEventListener('mouseleave', programar);
  raiz.addEventListener('focusin', () => clearInterval(temporizador));
  raiz.addEventListener('focusout', programar);
  raiz.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { mostrar(actual + 1); programar(); }
    if (e.key === 'ArrowLeft') { mostrar(actual - 1); programar(); }
  });

  mostrar(0);
  pintarPausa();
  programar();
}
