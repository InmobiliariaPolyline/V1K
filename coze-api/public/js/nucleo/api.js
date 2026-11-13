// Capa de datos: llama a la API (o al motor de demostración), con caché corta, sin peticiones repetidas en vuelo y
// con métricas de latencia para la vista de Sistema.
import { esDemo, token } from './estado.js';

export class ErrorApi extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado; }
}

const TTL_DEFECTO = 30_000;
const cache = new Map();      // clave -> { t, valor }
const enVuelo = new Map();    // clave -> Promise
export const metricas = { llamadas: 0, aciertos: 0, errores: 0, ultimaMs: null, historial: [] };

export const clave = (vista, params = {}) => `${vista}?${Object.keys(params).filter((k) => params[k] !== '' && params[k] != null).sort().map((k) => `${k}=${params[k]}`).join('&')}`;

/** Vacía la caché (por ejemplo, al pulsar «Actualizar» o cambiar de modo). */
export function invalidar() { cache.clear(); }

async function pedir(vista, params) {
  if (esDemo()) {
    const demo = await import('./demo.js');
    return demo.consultar(vista, params);
  }
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  const resp = await fetch(`/api/${vista}${qs.size ? `?${qs}` : ''}`, { headers: { Authorization: `Bearer ${token()}` }, cache: 'no-store' });
  let cuerpo = null;
  try { cuerpo = await resp.json(); } catch { /* respuesta sin JSON */ }
  if (!resp.ok) throw new ErrorApi(resp.status, cuerpo?.error ?? `Error ${resp.status}`);
  return cuerpo;
}

/**
 * consultar('propiedades', { operacion: 'VENTA' }) -> { vista, generado_en, total, datos }
 * Opciones: { ttl, forzar }. Dos llamadas iguales a la vez comparten la misma petición.
 */
export function consultar(vista, params = {}, { ttl = TTL_DEFECTO, forzar = false } = {}) {
  const k = `${esDemo() ? 'demo:' : ''}${clave(vista, params)}`;
  const previo = cache.get(k);
  if (!forzar && previo && Date.now() - previo.t < ttl) { metricas.aciertos++; return Promise.resolve(previo.valor); }
  if (enVuelo.has(k)) return enVuelo.get(k);

  const t0 = performance.now();
  metricas.llamadas++;
  const p = pedir(vista, params)
    .then((valor) => {
      const ms = Math.round(performance.now() - t0);
      metricas.ultimaMs = ms;
      metricas.historial.push({ vista, ms, hora: Date.now(), ok: true });
      if (metricas.historial.length > 40) metricas.historial.shift();
      cache.set(k, { t: Date.now(), valor });
      return valor;
    })
    .catch((e) => {
      metricas.errores++;
      metricas.historial.push({ vista, ms: Math.round(performance.now() - t0), hora: Date.now(), ok: false });
      if (metricas.historial.length > 40) metricas.historial.shift();
      throw e instanceof ErrorApi ? e : new ErrorApi(0, 'No se pudo conectar con la API. Revisa tu conexión e intenta de nuevo.');
    })
    .finally(() => enVuelo.delete(k));
  enVuelo.set(k, p);
  return p;
}

/** Comprueba el token con una consulta barata. Devuelve true si es válido; lanza ErrorApi si no se pudo comprobar. */
export async function validarToken() {
  try { await consultar('frescura', {}, { forzar: true }); return true; }
  catch (e) { if (e instanceof ErrorApi && e.estado === 401) return false; throw e; }
}

/** Metadatos de las vistas (public/vistas.json), para el Explorador y para validar en el modo demostración. */
let metaPromesa = null;
export function metadatos() {
  metaPromesa ??= fetch('vistas.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('vistas.json'); return r.json(); });
  return metaPromesa;
}
