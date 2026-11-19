// Webhook del bot de Telegram de CONSULTA (solo lectura). Telegram llama aquí con cada mensaje o botón.
//   POST /api/telegram     cabecera X-Telegram-Bot-Api-Secret-Token = TELEGRAM_WEBHOOK_SECRET
//
// La lógica (comandos, formato, autorización) está en lib/telegram.js. Aquí solo se conecta a la base con el rol de solo lectura.
//
// Variables de entorno (en Vercel, nunca en el código):
//   DATABASE_URL_READER            cadena de coze_reader (la misma de la API)
//   TELEGRAM_BOT_COMANDOS_TOKEN    token del bot de consultas (un bot distinto al del resumen diario)
//   TELEGRAM_WEBHOOK_SECRET        secreto largo y aleatorio que Telegram devuelve en cada llamada
//   TELEGRAM_CHATS_PERMITIDOS      números de chat autorizados, separados por comas
import { neon } from '@neondatabase/serverless';
import { buscarVista, construirConsulta } from '../lib/vistas.js';
import { crearManejador } from '../lib/telegram.js';

/** Lee una vista cerrada de lib/vistas.js (los filtros llegan como texto, igual que en la URL de la API). */
async function consultar(nombre, filtros = {}) {
  const vista = buscarVista(nombre);
  if (!vista) throw new Error('vista desconocida');
  const query = Object.fromEntries(Object.entries(filtros).map(([k, v]) => [k, String(v)]));
  const { text, params } = construirConsulta(vista, query);
  return neon(process.env.DATABASE_URL_READER).query(text, params);
}

export default crearManejador({ consultar });
