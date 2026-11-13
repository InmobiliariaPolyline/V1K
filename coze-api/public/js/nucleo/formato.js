// Funciones puras de formato y utilidades de datos (sin DOM): se prueban en test/panel.test.mjs.
// Convención: las fechas de calendario llegan como «2026-11-07» o «2026-11-07T00:00:00.000Z» y se tratan SIN zona horaria.

const ISO_FECHA = /^(\d{4})-(\d{2})-(\d{2})/;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const NOMBRE_APP = { planner: 'Planner', mrp: 'MRP', scraper: 'Scraper' };

// ── Fechas ──────────────────────────────────────────────────────────────────────────────
/** «2026-11-07T00:00:00.000Z» -> «2026-11-07»; si no es una fecha, null. */
export function soloFecha(valor) {
  if (typeof valor !== 'string') return null;
  const m = ISO_FECHA.exec(valor);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** «AAAA-MM-DD» -> Date a medianoche LOCAL (sin el corrimiento de zona de new Date('2026-11-07')). */
export function aFecha(valor) {
  const f = soloFecha(valor);
  if (!f) return null;
  const d = new Date(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function aIso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const hoyIso = (ahora = new Date()) => aIso(ahora);

/** Días de calendario entre dos fechas (b − a). */
export function diasEntre(a, b) {
  const x = aFecha(a), y = aFecha(b);
  if (!x || !y) return null;
  return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 86_400_000);
}

export function sumarDias(valor, n) {
  const d = aFecha(valor);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return aIso(d);
}

/** «2026-11-07…» -> «07/11/2026». */
export function fechaCorta(valor) {
  const f = soloFecha(valor);
  return f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—';
}

/** «2026-11-07» -> «7 nov 2026». */
export function fechaLarga(valor) {
  const d = aFecha(valor);
  return d ? `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` : '—';
}

export function nombreMes(indice) { return MESES[indice] ?? ''; }
export function nombreDia(indice) { return DIAS[indice] ?? ''; }
export function mesAnio(valor) {
  const d = aFecha(valor);
  return d ? `${MESES[d.getMonth()]} ${d.getFullYear()}` : '—';
}

/** Instante ISO -> fecha y hora local «13/11/2026 13:37». */
export function fechaHora(valor) {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Relativo a hoy, para fechas de calendario: «hoy», «mañana», «en 3 días», «hace 2 días». */
export function relativoDias(valor, hoy = hoyIso()) {
  const n = diasEntre(hoy, valor);
  if (n === null) return '—';
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  if (n > 1) return `en ${n} días`;
  return `hace ${-n} días`;
}

/** Horas -> texto legible: 0.2 -> «hace 12 min», 1.5 -> «hace 1.5 h», 30 -> «hace 1 día», 100 -> «hace 4 días». */
export function haceHoras(horas) {
  if (typeof horas !== 'number' || !Number.isFinite(horas) || horas < 0) return '—';
  if (horas < 1) return `hace ${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 24) return `hace ${Math.round(horas * 10) / 10} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

/** Instante ISO -> «hace 5 min / 3 h / 2 días» respecto a `ahora`. */
export function haceDesde(valor, ahora = Date.now()) {
  const t = new Date(valor).getTime();
  if (Number.isNaN(t)) return '—';
  return haceHoras(Math.max(0, (ahora - t) / 3_600_000));
}

/** Semáforo de frescura según las horas desde la última sincronización. */
export function estadoFrescura(horas) {
  if (typeof horas !== 'number' || !Number.isFinite(horas)) return 'desconocido';
  if (horas < 24) return 'ok';
  if (horas < 72) return 'aviso';
  return 'viejo';
}

export function saludo(hora = new Date().getHours()) {
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

// ── Números y dinero (es-PE: coma para miles, punto para decimales) ────────────────────
export function numero(n, decimales = 2) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('es-PE', { maximumFractionDigits: decimales }) : '—';
}

/** 1234 -> «1.2 K», 2_500_000 -> «2.5 M». */
export function compacto(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${numero(v / 1e9, 1)} MM`;
  if (a >= 1e6) return `${numero(v / 1e6, 1)} M`;
  if (a >= 1e3) return `${numero(v / 1e3, 1)} K`;
  return numero(v, 0);
}

/** Precio con su moneda: («268000.00», «USD») -> «US$ 268,000»; («3800000», «PEN») -> «S/ 3,800,000». */
export function dinero(valor, moneda) {
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return 'Sin precio';
  const simbolo = moneda === 'USD' ? 'US$' : moneda === 'PEN' ? 'S/' : (moneda ?? '');
  return `${simbolo} ${v.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`.trim();
}

export const dolares = (v) => dinero(v, 'USD');

/** Porcentaje acotado a 0-100 para barras de progreso. */
export function porcentaje(valor) {
  const v = Number(valor);
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

/** Solo enlaces http(s): evita `javascript:` u otros esquemas en datos que vienen de fuera. */
export function urlSegura(valor) {
  if (typeof valor !== 'string') return null;
  try {
    const u = new URL(valor);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

// ── Texto y búsqueda ───────────────────────────────────────────────────────────────────
/** Minúsculas y sin acentos, para comparar. */
export function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
export const contiene = (texto, buscado) => normalizar(texto).includes(normalizar(buscado));

export function iniciales(texto) {
  const p = String(texto ?? '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '·';
}

export const plural = (n, uno, varios) => `${numero(n, 0)} ${Number(n) === 1 ? uno : varios}`;

// ── Tablas: orden, páginas y CSV ───────────────────────────────────────────────────────
/** Ordena una copia de `filas` por `clave`. Números como números, textos con orden natural en español; vacíos al final. */
export function ordenarPor(filas, clave, dir = 'asc', tipo = 'auto') {
  const k = dir === 'desc' ? -1 : 1;
  const colador = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
  const valor = (f) => (typeof clave === 'function' ? clave(f) : f?.[clave]);
  return [...filas].sort((a, b) => {
    const x = valor(a), y = valor(b);
    const vx = x === null || x === undefined || x === '', vy = y === null || y === undefined || y === '';
    if (vx && vy) return 0;
    if (vx) return 1;
    if (vy) return -1;
    const nx = Number(x), ny = Number(y);
    if (tipo === 'numero' || (tipo === 'auto' && Number.isFinite(nx) && Number.isFinite(ny) && String(x).trim() !== '' && String(y).trim() !== '')) {
      return (nx - ny) * k;
    }
    return colador.compare(String(x), String(y)) * k;
  });
}

/** {pagina, paginas, desde, hasta, filas} para mostrar `tam` filas por página. */
export function paginar(filas, pagina = 1, tam = 25) {
  const paginas = Math.max(1, Math.ceil(filas.length / tam));
  const p = Math.min(Math.max(1, pagina), paginas);
  const desde = (p - 1) * tam;
  return { pagina: p, paginas, desde: filas.length ? desde + 1 : 0, hasta: Math.min(filas.length, desde + tam), total: filas.length, filas: filas.slice(desde, desde + tam) };
}

/** Celda CSV segura: comillas dobles escapadas y protección contra inyección de fórmulas (=, +, -, @) en Excel. */
export function celdaCsv(valor) {
  if (valor === null || valor === undefined) return '';
  let t = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
  if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = `'${t}`;
  return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** columnas: [{ clave, titulo }]  ->  texto CSV con BOM (Excel lo abre bien con tildes). */
export function aCsv(columnas, filas) {
  const cab = columnas.map((c) => celdaCsv(c.titulo)).join(',');
  const cuerpo = filas.map((f) => columnas.map((c) => celdaCsv(typeof c.clave === 'function' ? c.clave(f) : f[c.clave])).join(','));
  return `﻿${[cab, ...cuerpo].join('\r\n')}\r\n`;
}

/** Suma segura de una clave numérica. */
export const sumar = (filas, clave) => filas.reduce((a, f) => a + (Number(f?.[clave]) || 0), 0);
export const promedio = (valores) => { const v = valores.filter((x) => Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
export const mediana = (valores) => {
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
