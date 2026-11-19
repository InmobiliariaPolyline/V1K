// Gráfico de líneas en SVG puro para las tendencias. La matemática va en funciones puras (se prueban en Node); el dibujo usa dom.js.
import { h, s } from './dom.js';
import { diasEntre, fechaCorta, numero } from './formato.js';

/** Paso «redondo» (1, 2, 5 × 10^n) para repartir `rango` en unas `n` marcas. */
export function pasoRedondo(rango, n = 4) {
  if (!(rango > 0) || !Number.isFinite(rango)) return 1;
  const bruto = rango / Math.max(1, n);
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / pot;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pot;
}

/** Escala del eje Y: { min, max, marcas } con valores redondos que contienen [min, max]. */
export function escalaY(min, max, { desdeCero = false, marcas = 4 } = {}) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, marcas: [0, 1] };
  let lo = desdeCero ? Math.min(0, min) : min, hi = max;
  if (hi === lo) { const pad = Math.abs(hi) * 0.1 || 1; lo -= pad; hi += pad; if (desdeCero && min >= 0) lo = Math.min(lo, 0); }
  const paso = pasoRedondo(hi - lo, marcas);
  const bajo = Math.floor(lo / paso) * paso, alto = Math.ceil(hi / paso) * paso;
  const lista = [];
  for (let v = bajo, i = 0; v <= alto + paso / 1000 && i < 12; v += paso, i++) lista.push(Math.round(v * 1e6) / 1e6);
  return { min: bajo, max: alto, marcas: lista };
}

/** Posición horizontal 0..1 de un día dentro de [primero, ultimo]. */
export function fraccionDia(dia, primero, ultimo) {
  const total = diasEntre(primero, ultimo);
  if (!total) return 0.5;
  const d = diasEntre(primero, dia);
  return d === null ? 0 : Math.min(1, Math.max(0, d / total));
}

/**
 * Convierte puntos [{ dia, valor }] a coordenadas del gráfico. `area` = { x0, x1, y0, y1 } (y0 = borde de arriba).
 * Devuelve [{ x, y, dia, valor }].
 */
export function coordenadas(puntos, { primero, ultimo, escala, area }) {
  const alto = escala.max - escala.min || 1;
  return puntos.map((p) => ({
    x: Math.round((area.x0 + fraccionDia(p.dia, primero, ultimo) * (area.x1 - area.x0)) * 10) / 10,
    y: Math.round((area.y1 - ((p.valor - escala.min) / alto) * (area.y1 - area.y0)) * 10) / 10,
    dia: p.dia, valor: p.valor,
  }));
}

/** Camino SVG «M x y L x y …» (vacío si no hay puntos). */
export const rutaDe = (coords) => coords.map((c, i) => `${i ? 'L' : 'M'}${c.x} ${c.y}`).join('');

/**
 * Gráfico de líneas. series: [{ nombre, color, puntos: [{ dia: 'AAAA-MM-DD', valor }] }].
 * Opciones: { ancho, alto, formato(valor) -> texto, desdeCero }. Cada punto lleva un <title> con su día y su valor.
 */
export function lineas(series, { ancho = 640, alto = 230, formato = (v) => numero(v, 0), desdeCero = false } = {}) {
  const todos = series.flatMap((x) => x.puntos);
  const vacio = !todos.length;
  const dias = todos.map((p) => p.dia).sort();
  const primero = dias[0], ultimo = dias[dias.length - 1];
  const escala = vacio ? escalaY(0, 1) : escalaY(Math.min(...todos.map((p) => p.valor)), Math.max(...todos.map((p) => p.valor)), { desdeCero });
  const area = { x0: 58, x1: ancho - 16, y0: 14, y1: alto - 30 };
  const svg = s('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'lineas', role: 'img', 'aria-label': `Gráfico de ${series.map((x) => x.nombre).join(' y ')}` });

  for (const m of escala.marcas) {
    const y = area.y1 - ((m - escala.min) / (escala.max - escala.min || 1)) * (area.y1 - area.y0);
    svg.append(s('line', { x1: area.x0, x2: area.x1, y1: y, y2: y, class: 'lineas__rejilla' }), s('text', { x: area.x0 - 8, y: y + 4, 'text-anchor': 'end', class: 'lineas__eje' }, formato(m)));
  }
  if (!vacio) {
    const etiquetas = [primero, ...(diasEntre(primero, ultimo) > 6 ? [dias[Math.floor((dias.length - 1) / 2)]] : []), ultimo];
    for (const d of new Set(etiquetas)) {
      const x = area.x0 + fraccionDia(d, primero, ultimo) * (area.x1 - area.x0);
      svg.append(s('text', { x, y: alto - 8, 'text-anchor': d === primero && d !== ultimo ? 'start' : d === ultimo && d !== primero ? 'end' : 'middle', class: 'lineas__eje' }, fechaCorta(d).slice(0, 5)));
    }
  }
  for (const serie of series) {
    const c = coordenadas(serie.puntos, { primero, ultimo, escala, area });
    if (!c.length) continue;
    if (c.length > 1) svg.append(s('path', { d: rutaDe(c), fill: 'none', stroke: serie.color, class: 'lineas__serie' }));
    const pintar = c.length <= 45 ? c : [c[c.length - 1]];
    for (const p of pintar) {
      const ultimoPunto = p === c[c.length - 1];
      svg.append(s('circle', { cx: p.x, cy: p.y, r: ultimoPunto ? 4.5 : 2.6, fill: serie.color, class: 'lineas__punto' }, s('title', {}, `${serie.nombre} · ${fechaCorta(p.dia)}: ${formato(p.valor)}`)));
    }
  }
  return svg;
}

/** Leyenda sencilla de las series de un gráfico. */
export const leyendaLineas = (series) => h('div.lineas-leyenda', {}, series.map((x) => h('span', {}, h('i', { estilo: { background: x.color } }), x.nombre)));


