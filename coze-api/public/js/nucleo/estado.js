// Preferencias, sesión (token) y modo demostración. Todo vive en el navegador del usuario.
//  · Preferencias (tema, densidad…): localStorage, clave v1k-prefs.
//  · Token: sessionStorage por defecto; localStorage solo si el usuario marca «Recordar».
//  · Modo demostración: sessionStorage. Con él activo NO se llama a la API ni se muestran datos de la empresa.

const CLAVE_PREFS = 'v1k-prefs';
const CLAVE_TOKEN = 'v1k-token';
const CLAVE_DEMO = 'v1k-demo';

export const PREFS_DEFECTO = Object.freeze({
  tema: 'auto',          // auto | claro | oscuro
  densidad: 'comoda',    // comoda | compacta
  lateral: 'abierto',    // abierto | colapsado
  auto: 0,               // minutos entre actualizaciones automáticas (0 = apagado)
  propVista: 'tarjetas', // tarjetas | lista
  proyVista: 'tarjetas', // tarjetas | linea | tabla
});
export const VALORES = Object.freeze({
  tema: ['auto', 'claro', 'oscuro'],
  densidad: ['comoda', 'compacta'],
  lateral: ['abierto', 'colapsado'],
  auto: [0, 1, 5, 15],
  propVista: ['tarjetas', 'lista'],
  proyVista: ['tarjetas', 'linea', 'tabla'],
});

let memoria = { token: '', demo: false, prefs: { ...PREFS_DEFECTO } };
const oyentes = new Set();

const leer = (almacen, clave) => { try { return globalThis[almacen]?.getItem(clave) ?? null; } catch { return null; } };
const escribir = (almacen, clave, valor) => { try { globalThis[almacen]?.setItem(clave, valor); return true; } catch { return false; } };
const quitar = (almacen, clave) => { try { globalThis[almacen]?.removeItem(clave); } catch { /* sin almacenamiento */ } };

// ── Preferencias ───────────────────────────────────────────────────────────────────────
/** Valida una preferencia: si no está en la lista de valores permitidos, devuelve el valor por defecto. */
export function sanear(clave, valor) {
  return VALORES[clave]?.includes(valor) ? valor : PREFS_DEFECTO[clave];
}

export function leerPrefs() {
  let guardadas = {};
  try { guardadas = JSON.parse(leer('localStorage', CLAVE_PREFS) ?? '{}') ?? {}; } catch { guardadas = {}; }
  const prefs = {};
  for (const k of Object.keys(PREFS_DEFECTO)) prefs[k] = sanear(k, guardadas[k] ?? memoria.prefs[k]);
  memoria.prefs = prefs;
  return { ...prefs };
}

export function prefs() { return { ...memoria.prefs }; }

export function guardarPref(clave, valor) {
  if (!(clave in PREFS_DEFECTO)) return;
  memoria.prefs = { ...memoria.prefs, [clave]: sanear(clave, valor) };
  escribir('localStorage', CLAVE_PREFS, JSON.stringify(memoria.prefs));
  aplicarAspecto();
  for (const fn of oyentes) fn(clave, memoria.prefs[clave]);
}

export const suscribirPrefs = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };

/** Refleja tema y densidad en <html data-tema data-densidad>. */
export function aplicarAspecto(raiz = globalThis.document?.documentElement) {
  if (!raiz) return;
  raiz.setAttribute('data-tema', memoria.prefs.tema);
  raiz.setAttribute('data-densidad', memoria.prefs.densidad);
  const oscuro = memoria.prefs.tema === 'oscuro' || (memoria.prefs.tema === 'auto' && !globalThis.matchMedia?.('(prefers-color-scheme: light)').matches);
  globalThis.document?.querySelector('meta[name="theme-color"]')?.setAttribute('content', oscuro ? '#0b0e13' : '#f3f5f9');
}

/** Alterna entre claro y oscuro (si estaba en automático, pasa al contrario del actual). */
export function alternarTema() {
  const sistemaClaro = globalThis.matchMedia?.('(prefers-color-scheme: light)').matches;
  const actual = memoria.prefs.tema === 'auto' ? (sistemaClaro ? 'claro' : 'oscuro') : memoria.prefs.tema;
  guardarPref('tema', actual === 'oscuro' ? 'claro' : 'oscuro');
}

// ── Token ──────────────────────────────────────────────────────────────────────────────
export const token = () => leer('sessionStorage', CLAVE_TOKEN) || leer('localStorage', CLAVE_TOKEN) || memoria.token || '';

export function guardarToken(valor, recordar = false) {
  memoria.token = valor;
  const ok = escribir('sessionStorage', CLAVE_TOKEN, valor);
  if (recordar) escribir('localStorage', CLAVE_TOKEN, valor); else quitar('localStorage', CLAVE_TOKEN);
  return ok;
}

export function borrarToken() {
  memoria.token = '';
  quitar('sessionStorage', CLAVE_TOKEN);
  quitar('localStorage', CLAVE_TOKEN);
}

// ── Modo demostración ──────────────────────────────────────────────────────────────────
export const esDemo = () => memoria.demo || leer('sessionStorage', CLAVE_DEMO) === '1';
export function activarDemo() { memoria.demo = true; escribir('sessionStorage', CLAVE_DEMO, '1'); }
export function desactivarDemo() { memoria.demo = false; quitar('sessionStorage', CLAVE_DEMO); }

/** ¿Hay una sesión utilizable (token o demostración)? */
export const haySesion = () => esDemo() || token().length >= 24;

/** Cierra todo: token y demostración. */
export function cerrarSesion() { borrarToken(); desactivarDemo(); }
