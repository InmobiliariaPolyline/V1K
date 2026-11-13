// Pantalla de carga con progreso REAL. Se mide con lo que de verdad se descarga: cada archivo esperado (hojas de estilo y
// módulos del arranque) que el navegador termina de bajar suma, y luego avanzan las etapas del propio panel
// (arrancó el JS → llegaron los datos de la primera sección → fin). Si todo viene de la caché, la barra corre rápido.
//
// Este archivo es un módulo para poder probar la matemática en Node; en el navegador, además, anima #carga.
// app.js solo usa `globalThis.v1kCarga` (con `?.`): si este archivo faltara, el panel funciona igual.

/** Archivos que descarga el arranque (relativos a la raíz del sitio). Una prueba comprueba que esta lista esté al día. */
export const ESPERADOS = [
  'css/base.css', 'css/componentes.css', 'css/vistas.css',
  'js/app.js',
  'js/nucleo/api.js', 'js/nucleo/componentes.js', 'js/nucleo/dom.js', 'js/nucleo/estado.js', 'js/nucleo/formato.js', 'js/nucleo/rutas.js',
];

/** Parte de la barra que corresponde a descargar archivos; el resto son las etapas del panel. */
export const PESO_RECURSOS = 70;
export const ETAPAS = ['recursos', 'arranque', 'datos', 'fin'];

/** Cuántos de los archivos esperados aparecen ya en la lista de recursos del navegador (sin contar repetidos). */
export function contarCargados(nombres, esperados = ESPERADOS) {
  const vistos = new Set();
  for (const nombre of nombres) {
    const ruta = String(nombre).split('#')[0].split('?')[0];
    for (const e of esperados) if (ruta === e || ruta.endsWith(`/${e}`)) vistos.add(e);
  }
  return vistos.size;
}

/**
 * Porcentaje al que debe llegar la barra (0-100).
 *  - recursos: proporcional a los archivos ya descargados (hasta 70 %).
 *  - arranque: el JS ya corre → 80 %, y avanza despacio hasta ~90 % mientras llegan los datos.
 *  - datos: llegaron los datos de la primera sección → 92 %.   - fin: 100 %.
 */
export function objetivo({ cargados = 0, total = ESPERADOS.length, etapa = 'recursos', ms = 0 } = {}) {
  if (etapa === 'fin') return 100;
  if (etapa === 'datos') return 92;
  if (etapa === 'arranque') return 80 + 10 * (1 - Math.exp(-Math.max(0, ms) / 2500));
  const frac = Math.min(1, Math.max(0, cargados / Math.max(1, total)));
  return Math.max(3, PESO_RECURSOS * frac);
}

/** Un paso de animación hacia el objetivo: nunca retrocede, nunca lo pasa y siempre avanza algo si falta camino. */
export function siguiente(actual, meta) {
  if (actual >= meta) return actual;
  return Math.min(meta, actual + Math.max(0.35, (meta - actual) * 0.14));
}

export function textoEtapa(etapa, pct = 0) {
  if (etapa === 'fin') return pct >= 99.5 ? 'Listo' : 'Terminando…';
  return { recursos: 'Descargando módulos…', arranque: 'Iniciando el panel…', datos: 'Preparando la vista…' }[etapa] ?? '';
}

// ══════════════ Navegador ══════════════
if (typeof document !== 'undefined' && document.getElementById('carga')) {
  const $ = (id) => document.getElementById(id);
  const caja = $('carga'), relleno = $('carga-relleno'), pct = $('carga-pct'), texto = $('carga-texto'), barra = $('carga-barra');
  const aviso = $('carga-aviso'), avisoTexto = $('carga-aviso-texto'), recargar = $('carga-recargar');
  const inicio = performance.now();
  const MINIMO_MS = 600;           // visible al menos este tiempo, para que no sea un parpadeo
  const AVISO_MS = 12000;          // si tarda más, se ofrece recargar
  let etapa = 'recursos', desdeArranque = 0, mostrado = 0, terminado = false, cerrando = false;

  // Las hojas de estilo del panel llegan sin bloquear (media="print") para que esta pantalla se pinte primero: se activan aquí.
  const activarEstilos = () => document.querySelectorAll('link[rel="stylesheet"][media="print"]').forEach((l) => { l.media = 'all'; });
  activarEstilos();

  const pintar = () => {
    const entero = Math.round(mostrado);
    relleno.style.width = `${mostrado}%`;
    pct.textContent = `${entero} %`;
    barra.setAttribute('aria-valuenow', String(entero));
    texto.textContent = textoEtapa(etapa, mostrado);
  };

  const cerrar = () => {
    if (cerrando) return;
    cerrando = true;
    caja.classList.add('carga--fuera');
    caja.setAttribute('aria-hidden', 'true');
    setTimeout(() => caja.remove(), 600);
    clearInterval(reloj);
  };

  const reloj = setInterval(() => {
    const cargados = contarCargados(performance.getEntriesByType('resource').map((e) => e.name));
    const ms = etapa === 'recursos' ? 0 : performance.now() - desdeArranque;
    mostrado = siguiente(mostrado, objetivo({ cargados, etapa, ms }));
    pintar();
    if (terminado && mostrado >= 100 && performance.now() - inicio >= MINIMO_MS) cerrar();
    else if (!terminado && !cerrando && performance.now() - inicio > AVISO_MS) { aviso.hidden = false; }
  }, 40);

  const fallo = () => {
    if (terminado) return;
    avisoTexto.textContent = 'No se pudo iniciar el panel. Revisa tu conexión e intenta de nuevo.';
    aviso.hidden = false;
  };
  window.addEventListener('error', fallo);
  window.addEventListener('unhandledrejection', fallo);
  recargar.addEventListener('click', () => location.reload());

  globalThis.v1kCarga = {
    /** Marca una etapa del arranque: 'arranque' (el JS corre) o 'datos' (llegaron los datos de la primera sección). */
    etapa(nombre) {
      if (terminado || ETAPAS.indexOf(nombre) <= ETAPAS.indexOf(etapa)) return;
      if (nombre === 'arranque') desdeArranque = performance.now();
      etapa = nombre;
    },
    /** Completa la barra y cierra la pantalla. */
    terminar() { if (!terminado) { terminado = true; etapa = 'fin'; } },
  };
}
