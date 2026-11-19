// Gráficos de los bots de Telegram, dibujados como SVG con el mismo estilo de las ilustraciones del repositorio (fondo oscuro, tarjetas de vidrio,
// colores de las apps). Telegram no muestra SVG: lib/imagenes.js los convierte en PNG y el bot los envía como foto.
//
// Funciones PURAS: reciben datos ya consultados y devuelven el texto del SVG. Sin emojis (el motor de render no tiene fuente de emojis) y sin recursos
// externos. Todo texto que viene de los datos se escapa. Tamaño pensado para el celular: 720 px de ancho y letra de 18 px o más.
import { recortar } from './telegram-diseno.js';

export const ANCHO = 720;
const PAD = 32;
const C = { f0: '#0d1015', f1: '#0a0c10', texto: '#f0f6fc', suave: '#8b949e', pista: '#ffffff', verde: '#4ade80', cian: '#22d3ee', ambar: '#fbbf24', violeta: '#a78bfa', rojo: '#f2706b', azul: '#60a5fa', gris: '#94a3b8' };
const FUENTE = "font-family=\"Inter, 'Segoe UI', Arial, sans-serif\"";

/** Escapa texto para XML (nombres, etiquetas y demás datos nunca entran al SVG sin escapar). */
export const xml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const num = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);

/** Marco común: fondo, brillo, borde, título, subtítulo y pie. `cuerpo` se dibuja a partir de y = 112. */
function marco({ alto, titulo, sub = '', cuerpo, pie = '', acento = C.cian }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${alto}" viewBox="0 0 ${ANCHO} ${alto}" role="img" aria-label="${xml(titulo)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.f0}"/><stop offset="1" stop-color="${C.f1}"/></linearGradient>
    <radialGradient id="gl" cx="0.92" cy="0" r="0.7"><stop offset="0" stop-color="${acento}" stop-opacity="0.24"/><stop offset="1" stop-color="${acento}" stop-opacity="0"/></radialGradient>
    <pattern id="rej" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#ffffff" stroke-opacity="0.035"/></pattern>
  </defs>
  <rect width="${ANCHO}" height="${alto}" rx="26" fill="url(#bg)"/><rect width="${ANCHO}" height="${alto}" rx="26" fill="url(#rej)"/><rect width="${ANCHO}" height="${alto}" rx="26" fill="url(#gl)"/>
  <rect x="1" y="1" width="${ANCHO - 2}" height="${alto - 2}" rx="25" fill="none" stroke="#ffffff" stroke-opacity="0.09" stroke-width="2"/>
  <circle cx="${PAD + 8}" cy="46" r="8" fill="${acento}"/>
  <text x="${PAD + 26}" y="54" ${FUENTE} font-size="30" font-weight="700" fill="${C.texto}">${xml(titulo)}</text>
  ${sub ? `<text x="${PAD}" y="88" ${FUENTE} font-size="20" font-weight="400" fill="${C.suave}">${xml(sub)}</text>` : ''}
  ${cuerpo}
  ${pie ? `<text x="${PAD}" y="${alto - 22}" ${FUENTE} font-size="18" font-weight="400" fill="${C.suave}">${xml(pie)}</text>` : ''}
  <text x="${ANCHO - PAD}" y="${alto - 22}" text-anchor="end" ${FUENTE} font-size="18" font-weight="700" fill="${acento}" fill-opacity="0.9">V1K</text>
</svg>`;
}

const pista = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${C.pista}" fill-opacity="0.09"/>`;
const barra = (x, y, w, h, frac, color) => (frac > 0 ? `<rect x="${x}" y="${y}" width="${num(Math.max(h, w * Math.min(1, frac)))}" height="${h}" rx="${h / 2}" fill="${color}"/>` : '');
const texto = (x, y, t, { tam = 20, peso = 400, color = C.texto, alinea = 'start' } = {}) => `<text x="${x}" y="${y}" text-anchor="${alinea}" ${FUENTE} font-size="${tam}" font-weight="${peso}" fill="${color}">${xml(t)}</text>`;

// ── 1. Barras horizontales (portales, stock, mercado) ────────────────────────────────────
/** Filas de barras: { etiqueta, valor, textoValor, sub?, color? }. Devuelve { svg, alto } con la altura que ocupan. */
function filasDeBarras(filas, { y0 = 112, color = C.cian, maximo = null } = {}) {
  const max = maximo ?? Math.max(1, ...filas.map((f) => Number(f.valor) || 0));
  const ancho = ANCHO - 2 * PAD;
  let y = y0;
  const partes = filas.map((f) => {
    const frac = (Number(f.valor) || 0) / max;
    const s = [
      texto(PAD, y + 24, recortar(f.etiqueta, 28), { tam: 22, peso: 600 }),
      texto(ANCHO - PAD, y + 24, f.textoValor, { tam: 22, peso: 700, alinea: 'end', color: f.color ?? color }),
      pista(PAD, y + 36, ancho, 16), barra(PAD, y + 36, ancho, 16, frac, f.color ?? color),
      f.sub ? texto(PAD, y + 76, f.sub, { tam: 18, color: C.suave }) : '',
    ].join('\n  ');
    y += f.sub ? 92 : 72;
    return s;
  });
  return { svg: partes.join('\n  '), alto: y - y0 };
}

/** Barras horizontales con título: portales, stock por categoría… */
export function graficoBarras({ titulo, sub = '', filas, color = C.cian, pie = '', acento = color }) {
  const { svg, alto } = filasDeBarras(filas, { color });
  return marco({ alto: 112 + alto + 56, titulo, sub, cuerpo: svg, pie, acento });
}

// ── 2. Proyectos: avance de cada uno ─────────────────────────────────────────────────────
const COLOR_ESTADO = { atrasado: C.rojo, 'en curso': C.azul, 'por iniciar': C.gris, terminado: C.verde };

/** Cada proyecto: nombre, estado, barra de avance, fecha de fin y tareas atrasadas. filas: { nombre, estado, avance, finTexto, tareas }. */
export function graficoProyectos({ titulo, sub = '', filas, pie = '' }) {
  const ancho = ANCHO - 2 * PAD;
  let y = 112;
  const partes = filas.map((f) => {
    const col = COLOR_ESTADO[f.estado] ?? C.gris;
    const av = Math.max(0, Math.min(100, Number(f.avance) || 0));
    const s = [
      texto(PAD, y + 26, recortar(f.nombre, 24), { tam: 24, peso: 700 }),
      `<rect x="${ANCHO - PAD - 132}" y="${y + 2}" width="132" height="32" rx="16" fill="${col}" fill-opacity="0.18" stroke="${col}" stroke-opacity="0.7"/>`,
      texto(ANCHO - PAD - 66, y + 24, f.estado, { tam: 18, peso: 700, color: col, alinea: 'middle' }),
      pista(PAD, y + 46, ancho - 96, 18), barra(PAD, y + 46, ancho - 96, 18, av / 100, col),
      texto(ANCHO - PAD, y + 62, `${Math.round(av)} %`, { tam: 24, peso: 700, alinea: 'end', color: col }),
      texto(PAD, y + 92, [f.finTexto, f.tareas > 0 ? `${f.tareas} ${f.tareas === 1 ? 'tarea atrasada' : 'tareas atrasadas'}` : ''].filter(Boolean).join('  ·  '), { tam: 18, color: f.tareas > 0 ? C.ambar : C.suave }),
    ].join('\n  ');
    y += 112;
    return s;
  });
  return marco({ alto: y + 56, titulo, sub, cuerpo: partes.join('\n  '), pie, acento: C.azul });
}

// ── 3. Mercado: precio mediano por distrito, venta y alquiler ────────────────────────────
/** venta y alquiler: arreglos de { etiqueta, valor, textoValor, sub }. Cada uno es un panel; si falta uno se muestra solo el otro. */
export function graficoMercado({ titulo, sub = '', venta = [], alquiler = [], pie = '' }) {
  let y = 112;
  const bloques = [];
  for (const [nombre, filas, color] of [['VENTA  (US$)', venta, C.verde], ['ALQUILER  (US$ por mes)', alquiler, C.azul]]) {
    if (!filas.length) continue;
    bloques.push(`<rect x="${PAD}" y="${y - 6}" width="12" height="28" rx="6" fill="${color}"/>`, texto(PAD + 24, y + 17, nombre, { tam: 20, peso: 700, color }));
    const r = filasDeBarras(filas, { y0: y + 34, color });
    bloques.push(r.svg);
    y += 34 + r.alto + 24;
  }
  return marco({ alto: y + 32, titulo, sub, cuerpo: bloques.join('\n  '), pie, acento: C.verde });
}

// ── 4. Tendencias: una tarjeta con minigráfico por métrica ───────────────────────────────
/**
 * tarjetas: { nombre, valorTexto, deltaTexto, tono: 'mejor'|'peor'|'igual'|'neutro', serie: [números] }.
 * Dos columnas; el minigráfico une los valores de cada día (del más antiguo al más reciente).
 */
export function graficoTendencias({ titulo, sub = '', tarjetas, pie = '' }) {
  const colAncho = (ANCHO - 2 * PAD - 16) / 2, alto = 150;
  const partes = tarjetas.map((t, i) => {
    const x = PAD + (i % 2) * (colAncho + 16), y = 112 + Math.floor(i / 2) * (alto + 14);
    const col = t.tono === 'mejor' ? C.verde : t.tono === 'peor' ? C.rojo : C.cian;
    const serie = (t.serie ?? []).filter((v) => Number.isFinite(v));
    const gx0 = x + 18, gx1 = x + colAncho - 18, gy0 = y + 78, gy1 = y + alto - 20;
    let linea = '';
    if (serie.length >= 2) {
      const min = Math.min(...serie), max = Math.max(...serie), rango = max - min || 1;
      const pts = serie.map((v, k) => [gx0 + ((gx1 - gx0) * k) / (serie.length - 1), gy1 - ((gy1 - gy0) * (v - min)) / rango]);
      const d = pts.map((p, k) => `${k ? 'L' : 'M'}${num(p[0])} ${num(p[1])}`).join(' ');
      const ultimo = pts.at(-1);
      linea = `<path d="${d} L${num(ultimo[0])} ${gy1 + 8} L${num(pts[0][0])} ${gy1 + 8} Z" fill="${col}" fill-opacity="0.12"/><path d="${d}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${num(ultimo[0])}" cy="${num(ultimo[1])}" r="6" fill="${col}"/>`;
    }
    return `<rect x="${x}" y="${y}" width="${colAncho}" height="${alto}" rx="20" fill="#ffffff" fill-opacity="0.05" stroke="${col}" stroke-opacity="0.45" stroke-width="2"/>
  ${texto(x + 18, y + 30, t.nombre, { tam: 19, color: C.suave })}
  ${texto(x + 18, y + 66, t.valorTexto, { tam: 32, peso: 700 })}
  ${t.deltaTexto ? `<rect x="${x + colAncho - 104}" y="${y + 40}" width="86" height="30" rx="15" fill="${col}" fill-opacity="0.18"/>${texto(x + colAncho - 61, y + 61, t.deltaTexto, { tam: 18, peso: 700, color: col, alinea: 'middle' })}` : ''}
  ${linea}`;
  });
  const filas = Math.ceil(tarjetas.length / 2);
  return marco({ alto: 112 + filas * (alto + 14) + 44, titulo, sub, cuerpo: partes.join('\n  '), pie, acento: C.cian });
}

/** Colores de la paleta, para elegir el de cada gráfico. */
export const COLORES = { verde: C.verde, cian: C.cian, ambar: C.ambar, violeta: C.violeta, rojo: C.rojo, azul: C.azul };
