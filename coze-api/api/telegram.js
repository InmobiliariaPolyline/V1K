// Webhook del bot de Telegram de CONSULTA (solo lectura). Telegram llama aquí con cada mensaje o botón.
//   POST /api/telegram     cabecera X-Telegram-Bot-Api-Secret-Token = TELEGRAM_WEBHOOK_SECRET
//
// La lógica (comandos, formato, autorización) está en lib/telegram.js. Aquí solo se conecta a la base con el rol de solo lectura.
//
// Variables de entorno (en Vercel, nunca en el código):
//   DATABASE_URL_READER            cadena de coze_reader (la misma de la API)
//   TELEGRAM_BOT_COMANDOS_TOKEN    token del bot de consultas (un bot distinto al del resumen diario)
//   TELEGRAM_WEBHOOK_SECRET        secreto largo y aleatorio que Telegram devuelve en cada llamada
//   TELEGRAM_CHATS_PERMITIDOS      números de chat de los administradores, separados por comas (opcional)
//   (el resto de personas se autoriza desde el módulo «Accesos» del panel: tabla central.telegram_accesos)
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

/**
 * Números de chat con acceso dado desde el módulo «Accesos» del panel. Se lee SOLO la vista de números de chat (nunca nombres ni
 * teléfonos) y se guarda 15 segundos para no consultar la base en cada mensaje. Si la base falla, devuelve vacío: ese mensaje
 * se atiende solo con los administradores de TELEGRAM_CHATS_PERMITIDOS.
 */
let memoria = { t: 0, chats: [] };
async function chatsExtra() {
  if (Date.now() - memoria.t < 15_000) return memoria.chats;
  try {
    const filas = await neon(process.env.DATABASE_URL_READER).query('SELECT chat_id FROM central.v_telegram_chats_activos');
    memoria = { t: Date.now(), chats: filas.map((f) => String(f.chat_id)) };
  } catch {
    memoria = { t: Date.now(), chats: [] };
  }
  return memoria.chats;
}

export default crearManejador({ consultar, chatsExtra });
