// Webhook del bot de Telegram de CONSULTA (solo lectura). Telegram llama aquí con cada mensaje o botón.
//   POST /api/telegram     cabecera X-Telegram-Bot-Api-Secret-Token = TELEGRAM_WEBHOOK_SECRET
//
// La lógica (comandos, diseño de los mensajes, bienvenida, autorización) está en lib/telegram.js y lib/telegram-comandos.js. Aquí solo se conecta
// a la base con el rol de solo lectura.
//
// Variables de entorno (en Vercel, nunca en el código):
//   DATABASE_URL_READER            cadena de coze_reader (la misma de la API)
//   TELEGRAM_BOT_COMANDOS_TOKEN    token del bot de consultas (un bot distinto al del resumen diario)
//   TELEGRAM_WEBHOOK_SECRET        secreto largo y aleatorio que Telegram devuelve en cada llamada
//   TELEGRAM_CHATS_PERMITIDOS      números de chat de los administradores, separados por comas (opcional)
//   (el resto de personas se autoriza desde el módulo «Accesos» del panel: tabla central.telegram_accesos)
import { crearLectorDeChats, crearLectorDeRevocados } from '../lib/chats-activos.js';
import { consultarVista, leerSql } from '../lib/consultar-vistas.js';
import { crearManejador } from '../lib/telegram.js';

export default crearManejador({ modo: 'consultas', consultar: consultarVista, chatsExtra: crearLectorDeChats(leerSql), chatsRevocados: crearLectorDeRevocados(leerSql) });
