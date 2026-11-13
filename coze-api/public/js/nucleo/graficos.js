// Gráficos en SVG y HTML puros (sin librerías). La matemática va en funciones puras (se prueban en Node);
// los constructores de DOM usan dom.js, que nunca interpreta HTML.
import { h, s } from './dom.js';
import { aFecha, aIso, diasEntre, nombreMes, numero, porcentaje, soloFecha, sumarDias } from './formato.js';

// ══════════════ Matemática pura ══════════════

/** Punto en un círculo; ángulo en radianes medido desde las 12 en sentido horario. */
export function punto(cx, cy, r, ang) {
  return [cx + r * Math.sin(ang), cy - r * Math.cos(ang)];
}

/** Camino SVG de un arco de dona entre dos ángulos (radio exterior R, interior r). */
export function arcoPath(cx, cy, R, r, a0, a1) {
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = punto(cx, cy, R, a0), [x1, y1] = punto(cx, cy, R, a1);
  const [x2, y2] = punto(cx, cy, r, a1), [x3, y3] = punto(cx, cy, r, a0);
  const f = (n) => Math.round(n * 100) / 100;
  return `M${f(x0)} ${f(y0)}A${R} ${R} 0 ${grande} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${r} ${r} 0 ${grande} 0 ${f(x3)} ${f(y3)}Z`;
}

/** Segmentos [{etiqueta, valor, color}] -> arcos [{etiqueta, valor, color, pct, a0, a1}] (omite los de valor 0). */
export function calcularArcos(segmentos, hueco = 0.012) {
  const total = segmentos.reduce((a, x) => a + Math.max(0, Number(x.valor) || 0), 0);
  if (total <= 0) return [];
  const activos = segmentos.filter((x) => Number(x.valor) > 0);
  const una = activos.length === 1;
  let ang = 0;
  return activos.map((x) => {
    const frac = Number(x.valor) / total;
    const a0 = ang + (una ? 0 : hueco / 2), a1 = ang + frac * 2 * Math.PI - (una ? 0.0001 : hueco / 2);
    ang += frac * 2 * Math.PI;
    return { ...x, pct: frac * 100, a0, a1 };
  });
}

/** Matriz de semanas (lunes primero) de un mes: cada celda es 'AAAA-MM-DD' o null fuera del mes. */
export function matrizMes(anio, mes) {
  const primero = new Date(anio, mes, 1);
  const desfase = (primero.getDay() + 6) % 7;     // lunes = 0
  const diasMes = new Date(anio, mes + 1, 0).getDate();
  const celdas = [];
  for (let i = 0; i < desfase; i++) celdas.push(null);
  for (let d = 1; d <= diasMes; d++) celdas.push(aIso(new Date(anio, mes, d)));
  while (celdas.length % 7) celdas.push(null);
  const semanas = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

/** Escala de tiempo del Gantt: rango de fechas con holgura y días totales. */
export function escalaGantt(proyectos, hoy) {
  const fechas = [hoy];
  for (const p of proyectos) { const a = soloFecha(p.inicio), b = soloFecha(p.fin); if (a) fechas.push(a); if (b) fechas.push(b); }
  fechas.sort();
  const min = sumarDias(fechas[0], -7), max = sumarDias(fechas[fechas.length - 1], 14);
  return { min, max, dias: Math.max(1, diasEntre(min, max)) };
}

/** Posición horizontal (0..1) de una fecha dentro de la escala. */
export function fraccion(escala, fecha) {
  const d = diasEntre(escala.min, fecha);
  return d === null ? 0 : Math.min(1, Math.max(0, d / escala.dias));
}

/** Marcas de mes (primer día de cada mes dentro del rango). */
export function marcasMes(escala) {
  const marcas = [];
  const d = aFecha(escala.min);
  const fin = aFecha(escala.max);
  const c = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  while (c <= fin) { marcas.push({ fecha: aIso(c), etiqueta: nombreMes(c.getMonth()).slice(0, 3), anio: c.getFullYear(), mes: c.getMonth() }); c.setMonth(c.getMonth() + 1); }
  return marcas;
}

// ══════════════ Constructores de DOM ══════════════

/** Dona con leyenda opcional. centro: { valor, texto }. onClick(segmento) opcional. */
export function dona(segmentos, { tam = 190, grosor = 30, centro = null, onClick = null } = {}) {
  const R = tam / 2 - 2, r = R - grosor, c = tam / 2;
  const arcos = calcularArcos(segmentos);
  const svg = s('svg', { viewBox: `0 0 ${tam} ${tam}`, width: tam, height: tam, class: 'dona', role: 'img', 'aria-label': arcos.map((a) => `${a.etiqueta}: ${numero(a.valor, 0)}`).join(', ') || 'Sin datos' });
  if (!arcos.length) svg.append(s('circle', { cx: c, cy: c, r: (R + r) / 2, fill: 'none', 'stroke-width': grosor, class: 'dona__vacio' }));
  for (const a of arcos) {
    const p = s('path', { d: arcoPath(c, c, R, r, a.a0, a.a1), fill: a.color, class: `dona__arco${onClick ? ' dona__arco--clic' : ''}` }, s('title', {}, `${a.etiqueta}: ${numero(a.valor, 0)} (${numero(a.pct, 0)} %)`));
    if (onClick) { p.setAttribute('tabindex', '0'); p.setAttribute('role', 'button'); p.addEventListener('click', () => onClick(a)); p.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(a); } }); }
    svg.append(p);
  }
  if (centro) {
    svg.append(
      s('text', { x: c, y: c + 4, 'text-anchor': 'middle', class: 'dona__valor' }, String(centro.valor)),
      s('text', { x: c, y: c + 24, 'text-anchor': 'middle', class: 'dona__sub' }, centro.texto ?? ''),
    );
  }
  return svg;
}

/** Leyenda de una dona: lista de [punto de color] etiqueta ... valor. */
export function leyenda(segmentos, { onClick = null } = {}) {
  const total = segmentos.reduce((a, x) => a + (Number(x.valor) || 0), 0);
  return h('ul.leyenda', {}, segmentos.map((x) => {
    const fila = h(onClick ? 'button.leyenda__fila' : 'li.leyenda__fila', { attrs: onClick ? { type: 'button' } : {}, on: onClick ? { click: () => onClick(x) } : {} },
      h('span.leyenda__punto', { estilo: { background: x.color } }),
      h('span.leyenda__texto', { texto: x.etiqueta }),
      h('span.leyenda__valor', { texto: `${numero(x.valor, 0)}${total ? ` · ${numero((Number(x.valor) / total) * 100, 0)} %` : ''}` }),
    );
    return onClick ? h('li', {}, fila) : fila;
  }));
}

/** Anillo de progreso: pct 0-100, color CSS, texto grande y subtexto. */
export function anillo(pct, { tam = 84, grosor = 9, color = 'var(--primario)', texto = '', sub = '' } = {}) {
  const r = (tam - grosor) / 2, c = tam / 2, circ = 2 * Math.PI * r, p = porcentaje(pct);
  const svg = s('svg', { viewBox: `0 0 ${tam} ${tam}`, width: tam, height: tam, 'aria-hidden': 'true' },
    s('circle', { cx: c, cy: c, r, fill: 'none', 'stroke-width': grosor, class: 'anillo__pista' }),
    s('circle', { cx: c, cy: c, r, fill: 'none', 'stroke-width': grosor, 'stroke-linecap': 'round', stroke: color, 'stroke-dasharray': `${(circ * p) / 100} ${circ}`, transform: `rotate(-90 ${c} ${c})` }),
  );
  return h('div.anillo', { estilo: { width: `${tam}px`, height: `${tam}px` } }, svg, h('div.anillo__texto', {}, h('div.anillo__valor', { texto }), sub ? h('div.anillo__sub', { texto: sub }) : null));
}

/**
 * Barras horizontales. filas: [{ etiqueta, valor, extra?, color?, onClick? }].
 * formato(valor) -> texto del valor. max opcional (si no, el mayor valor).
 */
export function barrasH(filas, { formato = (v) => numero(v, 0), max = null, color = 'var(--primario-2)' } = {}) {
  const tope = max ?? Math.max(1, ...filas.map((f) => Number(f.valor) || 0));
  return h('div.barras-h', {}, filas.map((f) => {
    const ancho = Math.max(f.valor > 0 ? 2 : 0, Math.min(100, ((Number(f.valor) || 0) / tope) * 100));
    const relleno = h('span', { estilo: { width: `${ancho}%`, background: f.color ?? color } });
    const fila = h(f.onClick ? 'button.barra-h' : 'div.barra-h', { attrs: f.onClick ? { type: 'button' } : {}, on: f.onClick ? { click: () => f.onClick(f) } : {} },
      h('span.barra-h__etiqueta', { texto: f.etiqueta, attrs: { title: f.etiqueta } }),
      h('span.barra-h__pista', {}, relleno),
      h('span.barra-h__valor', { texto: formato(f.valor) }),
      f.extra ? h('span.barra-h__extra', { texto: f.extra }) : null,
    );
    return fila;
  }));
}

/**
 * Línea de tiempo (Gantt) de proyectos. Cada barra va de inicio a fin y se rellena según el avance;
 * una línea vertical marca hoy. Devuelve un contenedor con desplazamiento horizontal.
 */
export function gantt(proyectos, { hoy, onClick = null } = {}) {
  const escala = escalaGantt(proyectos, hoy);
  const ETQ = 210, ANCHO = 980, ALTO_FILA = 38, CAB = 34;
  const util = ANCHO - ETQ - 14;
  const x = (f) => ETQ + fraccion(escala, f) * util;
  const alto = CAB + proyectos.length * ALTO_FILA + 8;
  const svg = s('svg', { viewBox: `0 0 ${ANCHO} ${alto}`, width: ANCHO, height: alto, class: 'gantt', role: 'img', 'aria-label': 'Línea de tiempo de proyectos' });

  for (const m of marcasMes(escala)) {
    const mx = x(m.fecha);
    svg.append(s('line', { x1: mx, x2: mx, y1: CAB - 6, y2: alto - 4, class: 'gantt__rejilla' }), s('text', { x: mx + 4, y: 14, class: 'gantt__mes' }, m.mes === 0 ? `${m.etiqueta} ${m.anio}` : m.etiqueta));
  }
  proyectos.forEach((p, i) => {
    const y = CAB + i * ALTO_FILA;
    const a = soloFecha(p.inicio), b = soloFecha(p.fin);
    const x0 = x(a), x1 = Math.max(x0 + 6, x(b));
    const estado = (p.estado ?? '').replace(/\s+/g, '-');
    const g = s('g', { class: 'gantt__fila', tabindex: onClick ? '0' : null, role: onClick ? 'button' : null });
    g.append(
      s('rect', { x: 0, y, width: ANCHO, height: ALTO_FILA, class: 'gantt__banda' }),
      s('text', { x: 10, y: y + 15, class: 'gantt__nombre' }, recortar(p.nombre, 28)),
      s('text', { x: 10, y: y + 30, class: 'gantt__meta' }, `${p.estado} · ${numero(p.avance_pct, 0)} %`),
      s('rect', { x: x0, y: y + 8, width: x1 - x0, height: 20, rx: 6, class: `gantt__barra gantt__barra--${estado}` }),
      s('rect', { x: x0, y: y + 8, width: Math.max(0, (x1 - x0) * (porcentaje(p.avance_pct) / 100)), height: 20, rx: 6, class: `gantt__avance gantt__avance--${estado}` }),
      s('title', {}, `${p.nombre}\n${p.estado} · ${numero(p.avance_pct, 0)} % de avance\n${a} → ${b}`),
    );
    if (onClick) { g.addEventListener('click', () => onClick(p)); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(p); } }); }
    svg.append(g);
  });
  const hx = x(hoy);
  svg.append(s('line', { x1: hx, x2: hx, y1: CAB - 8, y2: alto - 4, class: 'gantt__hoy' }), s('text', { x: hx, y: 28, 'text-anchor': 'middle', class: 'gantt__hoy-texto' }, 'hoy'));
  return h('div.gantt-envoltorio', {}, svg);
}

const recortar = (t, n) => (String(t).length > n ? `${String(t).slice(0, n - 1)}…` : String(t));

/**
 * Calendario de un mes. eventosPorDia: Map('AAAA-MM-DD' -> cantidad). onDia(fecha) al elegir un día.
 */
export function calendarioMes(anio, mes, { eventosPorDia = new Map(), hoy, seleccion = null, onDia = null } = {}) {
  const semanas = matrizMes(anio, mes);
  const cab = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => h('div.cal__dia-semana', { texto: d }));
  const celdas = [];
  for (const sem of semanas) for (const f of sem) {
    if (!f) { celdas.push(h('div.cal__celda.cal__celda--fuera')); continue; }
    const n = eventosPorDia.get(f) ?? 0;
    const clases = ['cal__celda', f === hoy ? 'cal__celda--hoy' : '', n ? 'cal__celda--evento' : '', f === seleccion ? 'cal__celda--sel' : ''].filter(Boolean).join(' ');
    const boton = h('button', { clase: clases, attrs: { type: 'button', 'aria-label': `${Number(f.slice(8))} de ${nombreMes(mes)}${n ? `, ${n} hito${n > 1 ? 's' : ''}` : ''}`, 'aria-pressed': f === seleccion ? 'true' : 'false' }, on: onDia ? { click: () => onDia(f) } : {} },
      h('span.cal__numero', { texto: String(Number(f.slice(8))) }),
      n ? h('span.cal__puntos', {}, Array.from({ length: Math.min(n, 3) }, () => h('i'))) : null,
    );
    celdas.push(boton);
  }
  return h('div.cal', {}, h('div.cal__semana', {}, cab), h('div.cal__rejilla', {}, celdas));
}
