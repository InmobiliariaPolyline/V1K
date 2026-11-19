// Tendencias a partir del historial diario (vista «historial»). Funciones puras: las usan el panel y el resumen diario.
import { diasEntre, dolares, numero } from './formato.js';

/** Lo que se sigue en el tiempo. `mejor`: hacia dónde es «bueno» que se mueva ('menos', 'mas' o 'neutro' si no hay juicio). */
export const METRICAS = [
  { clave: 'proyectos_atrasados', etiqueta: 'Proyectos atrasados', mejor: 'menos', formato: 'entero' },
  { clave: 'tareas_atrasadas', etiqueta: 'Tareas atrasadas', mejor: 'menos', formato: 'entero' },
  { clave: 'pedidos_vencidos', etiqueta: 'Pedidos con llegada vencida', mejor: 'menos', formato: 'entero' },
  { clave: 'materiales_sin_existencias', etiqueta: 'Materiales sin existencias', mejor: 'menos', formato: 'entero' },
  { clave: 'propiedades_catalogo', etiqueta: 'Propiedades en el catálogo', mejor: 'neutro', formato: 'entero' },
  { clave: 'precio_mediano_venta_usd', etiqueta: 'Precio mediano de venta', mejor: 'neutro', formato: 'usd' },
  { clave: 'precio_mediano_alquiler_usd', etiqueta: 'Precio mediano de alquiler', mejor: 'neutro', formato: 'usd' },
];

/** Días únicos, del más antiguo al más reciente. Acepta filas en cualquier orden (la API las entrega de la más reciente a la más antigua). */
export function ordenarPorDia(historial) {
  const porDia = new Map();
  for (const f of historial ?? []) if (f && typeof f.dia === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f.dia)) porDia.set(f.dia.slice(0, 10), { ...f, dia: f.dia.slice(0, 10) });
  return [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}

const numeroValido = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Valor de una métrica como número, o null si no hay dato. */
export const valorDe = (fila, clave) => numeroValido(fila?.[clave]);

/** Diferencia (ahora − antes); null si falta alguno de los dos. */
export function delta(antes, ahora) {
  const a = numeroValido(antes), b = numeroValido(ahora);
  return a === null || b === null ? null : Math.round((b - a) * 100) / 100;
}

/** 'mejor' | 'peor' | 'igual' | 'neutro' según hacia dónde se movió y qué es bueno. */
export function tonoDeCambio(d, mejor) {
  if (d === null || d === 0) return 'igual';
  if (mejor === 'neutro') return 'neutro';
  return (d < 0) === (mejor === 'menos') ? 'mejor' : 'peor';
}

const formatear = (v, formato) => (v === null ? '—' : formato === 'usd' ? dolares(v) : numero(v, 0));

/** «2 → 3 (+1)» / «sin cambios» / «sin datos». */
export function textoCambio({ antes, ahora, delta: d, formato }) {
  if (ahora === null) return 'sin datos';
  if (antes === null) return formatear(ahora, formato);
  if (d === 0) return `${formatear(ahora, formato)} (sin cambios)`;
  const signo = d > 0 ? '+' : '−';
  const abs = Math.abs(d);
  return `${formatear(antes, formato)} → ${formatear(ahora, formato)} (${signo}${formato === 'usd' ? dolares(abs) : numero(abs, 0)})`;
}

/**
 * Compara el último día con el de hace `dias` días (o el más antiguo disponible, si el historial es más corto).
 * Devuelve null si hay menos de dos días. { desde, hasta, dias, filas: [{ clave, etiqueta, antes, ahora, delta, tono, formato, texto }] }
 */
export function compararCon(historial, dias = 7, metricas = METRICAS) {
  const orden = ordenarPorDia(historial);
  if (orden.length < 2) return null;
  const actual = orden[orden.length - 1];
  const limite = orden.filter((f) => diasEntre(f.dia, actual.dia) >= dias);
  const base = limite.length ? limite[limite.length - 1] : orden[0];
  if (base.dia === actual.dia) return null;
  const filas = metricas.map((m) => {
    const antes = valorDe(base, m.clave), ahora = valorDe(actual, m.clave), d = delta(antes, ahora);
    const fila = { clave: m.clave, etiqueta: m.etiqueta, formato: m.formato, antes, ahora, delta: d, tono: tonoDeCambio(d, m.mejor) };
    return { ...fila, texto: textoCambio(fila) };
  });
  return { desde: base.dia, hasta: actual.dia, dias: diasEntre(base.dia, actual.dia), filas };
}

/** Puntos [{ dia, valor }] de una métrica para dibujar (sin los días sin dato). */
export function serieDe(historial, clave) {
  return ordenarPorDia(historial).map((f) => ({ dia: f.dia, valor: valorDe(f, clave) })).filter((p) => p.valor !== null);
}
