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
