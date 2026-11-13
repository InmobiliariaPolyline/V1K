// Enrutador por hash (sin dependencias). Formato: #/propiedades?operacion=VENTA&limite=20
// Funciones puras: se prueban en test/panel.test.mjs.

export const RUTAS = ['inicio', 'proyectos', 'calendario', 'materiales', 'pedidos', 'propiedades', 'explorador', 'asistente', 'sistema'];
export const RUTA_INICIAL = 'inicio';

/** '#/propiedades?operacion=VENTA' -> { ruta: 'propiedades', params: { operacion: 'VENTA' } }. Rutas desconocidas -> inicio. */
export function parsearHash(hash = '') {
  const limpio = String(hash).replace(/^#\/?/, '');
  const [camino, consulta = ''] = limpio.split('?');
  const ruta = RUTAS.includes(camino) ? camino : RUTA_INICIAL;
  const params = {};
  for (const par of consulta.split('&')) {
    if (!par) continue;
    const i = par.indexOf('=');
    const k = decodificar(i < 0 ? par : par.slice(0, i));
    const v = decodificar(i < 0 ? '' : par.slice(i + 1));
    if (k && v !== '') params[k] = v;
  }
  return { ruta, params };
}

function decodificar(t) {
  try { return decodeURIComponent(t.replace(/\+/g, ' ')); } catch { return t; }
}

/** ('propiedades', { operacion: 'VENTA', q: '' }) -> '#/propiedades?operacion=VENTA'. Omite los vacíos y ordena las claves. */
export function armarHash(ruta, params = {}) {
  const base = `#/${RUTAS.includes(ruta) ? ruta : RUTA_INICIAL}`;
  const pares = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && String(params[k]) !== '')
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`);
  return pares.length ? `${base}?${pares.join('&')}` : base;
}

/** Une dos conjuntos de parámetros; un valor vacío o null borra la clave. */
export function combinarParams(actual, cambios) {
  const r = { ...actual };
  for (const [k, v] of Object.entries(cambios)) {
    if (v === undefined || v === null || String(v) === '') delete r[k]; else r[k] = String(v);
  }
  return r;
}
