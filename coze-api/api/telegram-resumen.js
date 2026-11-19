// Webhook del bot del RESUMEN DIARIO (@v1k_asistente_bot). Ese bot solo envía el resumen de la mañana (lo hace un flujo de GitHub Actions);
// este webhook solo le permite dar la bienvenida cuando alguien pulsa «Iniciar»: le muestra su número de chat y, si ya tiene acceso, que recibirá el resumen.
//   POST /api/telegram-resumen     cabecera X-Telegram-Bot-Api-Secret-Token = TELEGRAM_RESUMEN_WEBHOOK_SECRET
//
// No consulta datos del negocio. Variables de entorno (en Vercel, nunca en el código):
//   DATABASE_URL_READER                  cadena de coze_reader: solo para leer la lista de números de chat con acceso
//   TELEGRAM_BOT_RESUMEN_TOKEN           token del bot del resumen diario (el mismo TELEGRAM_BOT_TOKEN de GitHub)
//   TELEGRAM_RESUMEN_WEBHOOK_SECRET      secreto largo y aleatorio que Telegram devuelve en cada llamada
//   TELEGRAM_CHATS_PERMITIDOS            números de chat de los administradores, separados por comas (opcional)
import { neon } from '@neondatabase/serverless';
import { crearLectorDeChats, crearLectorDeRevocados } from '../lib/chats-activos.js';
import { crearManejador } from '../lib/telegram.js';

const leerSql = (texto) => neon(process.env.DATABASE_URL_READER).query(texto);
const chatsExtra = crearLectorDeChats(leerSql);
const chatsRevocados = crearLectorDeRevocados(leerSql);

export default crearManejador({ modo: 'resumen', chatsExtra, chatsRevocados });
