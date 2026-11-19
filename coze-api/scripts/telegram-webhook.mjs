// Conecta (o desconecta) el bot de consultas de Telegram con el webhook de Vercel. Se ejecuta UNA vez tras crear el bot y cada vez
// que cambie la dirección o el secreto.
//
//   TELEGRAM_BOT_COMANDOS_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... node scripts/telegram-webhook.mjs --instalar
//   TELEGRAM_BOT_COMANDOS_TOKEN=...                              node scripts/telegram-webhook.mjs --info
//   TELEGRAM_BOT_COMANDOS_TOKEN=...                              node scripts/telegram-webhook.mjs --borrar
//
// Opcional: WEBHOOK_URL (por defecto https://v1k-coze-api.vercel.app/api/telegram).
// El token y el secreto NUNCA se escriben en pantalla.
import { fileURLToPath } from 'node:url';
import { NOMBRES_COMANDOS } from '../lib/telegram.js';

export const URL_DEFECTO = 'https://v1k-coze-api.vercel.app/api/telegram';

const DESCRIPCION = {
  resumen: 'Lo urgente del día y los cambios de la semana',
  proyectos: 'Estado y avance de los proyectos',
  materiales: 'Materiales bajo su mínimo',
  pedidos: 'Órdenes de compra abiertas',
  propiedades: 'Propiedades del catálogo con filtros',
  frescura: 'Hace cuánto sincronizó cada app',
  tendencias: 'Cambios frente a hace 7 días',
  ayuda: 'Cómo usar el bot',
};

/** Lista de comandos para el menú «/» de Telegram. */
export const comandosDelMenu = () => NOMBRES_COMANDOS.map((command) => ({ command, description: DESCRIPCION[command] }));

/** Cuerpo de setWebhook: solo mensajes y botones, y descarta lo que haya quedado pendiente. */
export function cuerpoWebhook(url, secreto) {
  return { url, secret_token: secreto, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true, max_connections: 5 };
}

/** Valida lo que se va a instalar; devuelve el texto del problema o null. */
export function problemaConfiguracion({ token, secreto, url }) {
  if (!/^\d{6,}:[\w-]{30,}$/.test(token ?? '')) return 'TELEGRAM_BOT_COMANDOS_TOKEN no tiene el formato de un token de BotFather.';
  if (!/^[A-Za-z0-9_-]{24,256}$/.test(secreto ?? '')) return 'TELEGRAM_WEBHOOK_SECRET debe tener 24–256 caracteres (letras, números, _ o -).';
  if (!/^https:\/\/[^\s/]+\/api\/telegram$/.test(url ?? '')) return 'WEBHOOK_URL debe ser https://…/api/telegram.';
  return null;
}

async function llamar(token, metodo, cuerpo, fetchFn = globalThis.fetch) {
  const r = await fetchFn(`https://api.telegram.org/bot${token}/${metodo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo ?? {}) });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok || !datos.ok) throw new Error(`${metodo}: ${datos.description ?? `HTTP ${r.status}`}`);
  return datos.result;
}

export async function instalar({ token, secreto, url = URL_DEFECTO, fetchFn }) {
  const problema = problemaConfiguracion({ token, secreto, url });
  if (problema) throw new Error(problema);
  await llamar(token, 'setWebhook', cuerpoWebhook(url, secreto), fetchFn);
  await llamar(token, 'setMyCommands', { commands: comandosDelMenu() }, fetchFn);
  return 'Webhook instalado y menú de comandos publicado.';
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
  const token = process.env.TELEGRAM_BOT_COMANDOS_TOKEN;
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET;
  const url = process.env.WEBHOOK_URL || URL_DEFECTO;
  try {
    if (arg.includes('--instalar')) console.log(await instalar({ token, secreto, url }));
    else if (arg.includes('--info')) console.log(await info({ token }));
    else if (arg.includes('--borrar')) console.log(await borrar({ token }));
    else { console.log('Uso: node scripts/telegram-webhook.mjs --instalar | --info | --borrar'); process.exitCode = 1; }
  } catch (e) {
    console.error(`Error: ${String(e.message).replaceAll(token ?? '\u0000', '***')}`);
    process.exitCode = 1;
  }
}
