// Conecta (o desconecta) un bot de Telegram con su webhook de Vercel y le pone su menú de comandos y sus textos de presentación.
// Se ejecuta UNA vez tras crear el bot y cada vez que cambie la dirección o el secreto. Hay dos bots:
//   consultas (por defecto)  @v1k_consultas_bot   → /api/telegram           TELEGRAM_BOT_COMANDOS_TOKEN  + TELEGRAM_WEBHOOK_SECRET
//   resumen                  @v1k_asistente_bot   → /api/telegram-resumen   TELEGRAM_BOT_RESUMEN_TOKEN   + TELEGRAM_RESUMEN_WEBHOOK_SECRET
//
//   TELEGRAM_BOT_COMANDOS_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... node scripts/telegram-webhook.mjs --instalar
//   TELEGRAM_BOT_RESUMEN_TOKEN=...  TELEGRAM_RESUMEN_WEBHOOK_SECRET=... node scripts/telegram-webhook.mjs --instalar --bot resumen
//   (la misma orden con --info o --borrar muestra el estado o desconecta el bot)
//
// Opcional: WEBHOOK_URL. El token y el secreto NUNCA se escriben en pantalla.
// Ojo: mientras un bot tiene webhook, Telegram no permite getUpdates (el --buscar-chat de resumen-diario.mjs); usa --borrar antes si lo necesitas.
import { fileURLToPath } from 'node:url';
import { MENU_DE_COMANDOS } from '../lib/telegram-comandos.js';

export const BASES = 'https://v1k-coze-api.vercel.app';
export const URL_DEFECTO = `${BASES}/api/telegram`;
export const URL_RESUMEN = `${BASES}/api/telegram-resumen`;

/** Datos de cada bot: variables de entorno, dirección del webhook, comandos y textos de presentación. */
export const BOTS = {
  consultas: {
    token: 'TELEGRAM_BOT_COMANDOS_TOKEN', secreto: 'TELEGRAM_WEBHOOK_SECRET', url: URL_DEFECTO,
    descripcion: 'Consulta proyectos, materiales, pedidos, agenda, mercado y propiedades de V1K con comandos y botones. Solo lectura y de uso privado: pulsa Iniciar para ver tu número de chat y pedirle acceso al administrador.',
    corta: 'Consultas de solo lectura de V1K (uso privado)',
  },
  resumen: {
    token: 'TELEGRAM_BOT_RESUMEN_TOKEN', secreto: 'TELEGRAM_RESUMEN_WEBHOOK_SECRET', url: URL_RESUMEN,
    descripcion: 'Te escribe cada mañana a las 08:07 (hora de Lima) con el resumen de V1K y responde a /ahora, /alertas, /agenda y /semana. Pulsa Iniciar para ver tu número de chat y pedir acceso.',
    corta: 'Resumen diario de V1K, cada mañana a las 08:07',
  },
};

/** Lista de comandos para el menú «/» de Telegram (cada bot tiene la suya). */
export function comandosDelMenu(bot = 'consultas') {
  return MENU_DE_COMANDOS[bot] ?? MENU_DE_COMANDOS.consultas;
}

/** Cuerpo de setWebhook: solo mensajes y botones, y descarta lo que haya quedado pendiente. */
export function cuerpoWebhook(url, secreto) {
  return { url, secret_token: secreto, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true, max_connections: 5 };
}

/** Valida lo que se va a instalar; devuelve el texto del problema o null. */
export function problemaConfiguracion({ token, secreto, url }) {
  if (!/^\d{6,}:[\w-]{30,}$/.test(token ?? '')) return 'El token no tiene el formato de un token de BotFather.';
  if (!/^[A-Za-z0-9_-]{24,256}$/.test(secreto ?? '')) return 'El secreto del webhook debe tener 24–256 caracteres (letras, números, _ o -).';
  if (!/^https:\/\/[^\s/]+\/api\/telegram(-resumen)?$/.test(url ?? '')) return 'WEBHOOK_URL debe ser https://…/api/telegram o https://…/api/telegram-resumen.';
  return null;
}

async function llamar(token, metodo, cuerpo, fetchFn = globalThis.fetch) {
  const r = await fetchFn(`https://api.telegram.org/bot${token}/${metodo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo ?? {}) });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok || !datos.ok) throw new Error(`${metodo}: ${datos.description ?? `HTTP ${r.status}`}`);
  return datos.result;
}

export async function instalar({ token, secreto, bot = 'consultas', url = (BOTS[bot] ?? BOTS.consultas).url, fetchFn }) {
  const problema = problemaConfiguracion({ token, secreto, url });
  if (problema) throw new Error(problema);
  const datos = BOTS[bot] ?? BOTS.consultas;
  await llamar(token, 'setWebhook', cuerpoWebhook(url, secreto), fetchFn);
  await llamar(token, 'setMyCommands', { commands: comandosDelMenu(bot) }, fetchFn);
  await llamar(token, 'setMyDescription', { description: datos.descripcion }, fetchFn);        // lo que se ve antes de pulsar «Iniciar»
  await llamar(token, 'setMyShortDescription', { short_description: datos.corta }, fetchFn);  // lo que se ve al compartir o buscar el bot
  return 'Webhook instalado, menú de comandos y textos de presentación publicados.';
}

export async function info({ token, fetchFn }) {
  const w = await llamar(token, 'getWebhookInfo', {}, fetchFn);
  const yo = await llamar(token, 'getMe', {}, fetchFn);
  const lineas = [`Bot: @${yo.username}`, `Webhook: ${w.url || '(ninguno)'}`, `Mensajes pendientes: ${w.pending_update_count ?? 0}`];
  if (w.last_error_message) lineas.push(`Último error de Telegram: ${w.last_error_message}`);
  return lineas.join('\n');
}

export async function borrar({ token, fetchFn }) {
  await llamar(token, 'deleteWebhook', { drop_pending_updates: true }, fetchFn);
  return 'Webhook borrado: el bot ya no responde.';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv.slice(2);
  const i = arg.indexOf('--bot');
  const bot = i >= 0 && arg[i + 1] === 'resumen' ? 'resumen' : 'consultas';
  const datos = BOTS[bot];
  const token = process.env[datos.token];
  const secreto = process.env[datos.secreto];
  const url = process.env.WEBHOOK_URL || datos.url;
  try {
    if (arg.includes('--instalar')) console.log(await instalar({ token, secreto, bot, url }));
    else if (arg.includes('--info')) console.log(await info({ token }));
    else if (arg.includes('--borrar')) console.log(await borrar({ token }));
    else { console.log('Uso: node scripts/telegram-webhook.mjs --instalar | --info | --borrar   [--bot resumen]'); process.exitCode = 1; }
  } catch (e) {
    console.error(`Error: ${String(e.message).replaceAll(token ?? '\u0000', '***')}`);
    process.exitCode = 1;
  }
}
