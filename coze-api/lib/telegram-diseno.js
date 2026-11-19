// Diseño de los mensajes de los bots de Telegram. Telegram no admite SVG, colores ni animaciones dentro del texto, así que el aspecto sale de:
//   · tarjetas (<blockquote>: una barra a la izquierda y fondo propio), negritas, cursivas y código que se copia al tocarlo
//   · barras de progreso con bloques (▰▰▰▱▱), iconos y flechas
//   · una bienvenida animada (MP4 que se ve como un GIF) al pulsar «Iniciar», generada con scripts/generar-banners.mjs
// Aquí solo hay funciones PURAS (se prueban sin red). Todo dato que viene de la base se escapa con esc() antes de entrar en un mensaje.

export const BOT_CONSULTAS = 'v1k_consultas_bot';
export const BOT_RESUMEN = 'v1k_asistente_bot';
export const BASE_PUBLICA = 'https://v1k-coze-api.vercel.app';

/** Escapa texto para el modo HTML de Telegram. */
export const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Barra de progreso de n bloques: barra(40) → ▰▰▰▰▱▱▱▱▱▱. Acepta cualquier número (se acota entre 0 y 100). */
export function barra(pct, n = 10) {
  const p = Number.isFinite(Number(pct)) ? Math.max(0, Math.min(100, Number(pct))) : 0;
  const llenos = Math.round((p / 100) * n);
  return '▰'.repeat(llenos) + '▱'.repeat(n - llenos);
}

/** Tarjeta: las líneas (ya escapadas) dentro de un <blockquote>. Ignora las vacías. */
export const tarjeta = (...lineas) => `<blockquote>${lineas.flat().filter((l) => l !== null && l !== undefined && l !== false && l !== '').join('\n')}</blockquote>`;

/** Título de una respuesta: icono, texto en negrita y, debajo, una línea en cursiva. */
export const titulo = (icono, texto, sub = '') => `${icono} <b>${texto}</b>${sub ? `\n<i>${sub}</i>` : ''}`;

/** Texto que se copia al tocarlo (por ejemplo, el número de chat). */
export const codigo = (t) => `<code>${esc(t)}</code>`;

/** «Buenos días / Buenas tardes / Buenas noches» según la hora de Lima (0–23). */
export const saludoDe = (hora) => (hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches');

/** Hora (0–23) en Lima de un instante, sin depender de la zona del servidor. */
export const horaEnLima = (ahora = new Date()) => (ahora.getUTCHours() + 24 - 5) % 24;

/** Primer nombre apto para saludar: solo letras, hasta 20 caracteres; si no hay, ''. */
export function nombreCorto(nombre) {
  const n = String(nombre ?? '').trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}][\p{L}'’.-]{0,19}$/u.test(n) ? n : '';
}

/** Pasos para pedir acceso (los usa el bot cuando el chat aún no está autorizado). */
export function pasosDeAcceso(chatId) {
  return [
    `${'1️⃣'} Toca tu número para copiarlo: ${codigo(chatId)}`,
    '2️⃣ Envíalo al administrador con tu nombre y tu teléfono',
    '3️⃣ Te aviso aquí apenas tengas acceso',
  ].join('\n');
}

// ── Tablas, páginas y contexto ──────────────────────────────────────────────────────────

/** Recorta un texto con «…» para que quepa en n caracteres (y lo deja en una línea). */
export function recortar(t, n) {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : `${s.slice(0, Math.max(1, n - 1))}…`;
}

/**
 * Tabla en texto de ancho fijo dentro de <pre> (Telegram la muestra en monoespaciado y con fondo propio).
 * columnas: [{ titulo, ancho, alinea: 'izq' | 'der' }]; filas: arreglos de textos. Sin emojis dentro (ocupan doble ancho). Todo se escapa.
 */
export function tablaPre(columnas, filas) {
  const celda = (txt, c) => { const t = recortar(txt, c.ancho); return c.alinea === 'der' ? t.padStart(c.ancho) : t.padEnd(c.ancho); };
  const cab = columnas.map((c) => celda(c.titulo, c)).join(' ');
  const sep = columnas.map((c) => '-'.repeat(c.ancho)).join(' ');
  const cuerpo = filas.map((f) => columnas.map((c, i) => celda(f[i] ?? '', c)).join(' '));
  return `<pre>${esc([cab, sep, ...cuerpo].join('\n'))}</pre>`;
}

/** Divide una lista en páginas: { filas, pagina, paginas, total, desde, hasta }. La página se acota a lo que existe. */
export function paginaDe(lista, pagina = 1, tam = 5) {
  const total = lista.length;
  const paginas = Math.max(1, Math.ceil(total / tam));
  const p = Math.min(paginas, Math.max(1, Number(pagina) || 1));
  const desde = (p - 1) * tam;
  return { filas: lista.slice(desde, desde + tam), pagina: p, paginas, total, desde: total ? desde + 1 : 0, hasta: Math.min(total, desde + tam) };
}

/** Lee «atrasado p2» → { texto: 'atrasado', pagina: 2 }. */
export function separarPagina(args) {
  const m = /^(.*?)(?:\s*\bp(\d{1,2}))?$/.exec(String(args ?? '').trim());
  return { texto: (m?.[1] ?? '').trim(), pagina: m?.[2] ? Number(m[2]) : 1 };
}

/** Datos de «a qué hora» cada app sincronizó, para cerrar una respuesta: «🕒 Planner ✅ hace 20 h · MRP 🟡 hace 1 día». */
export function pieDatos(frescura, apps, { estado, haceHoras: hace }) {
  const filas = (frescura ?? []).filter((f) => apps.includes(f.app));
  if (!filas.length) return '';
  const nombre = { planner: 'Planner', mrp: 'MRP', scraper: 'Scraper' };
  const icono = { ok: '✅', aviso: '🟡', viejo: '🔴', desconocido: '⚪' };
  const partes = filas.map((f) => `${nombre[f.app] ?? esc(f.app)} ${icono[estado(Number(f.hace_horas))]} ${hace(Number(f.hace_horas))}`);
  const viejo = filas.some((f) => Number(f.hace_horas) >= 24);
  return `🕒 <i>Datos: ${partes.join(' · ')}${viejo ? ' — pueden estar desactualizados' : ''}</i>`;
}

/** Una línea de lectura/interpretación debajo de los datos. El texto debe venir ya escapado. */
export const lectura = (html) => `💡 <i>${html}</i>`;

/** «2026-11-20» → «vie 20/11» (día de la semana abreviado y fecha corta). */
export function diaCorto(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso ?? '');
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  return `${dias[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
