// Webhook del bot del RESUMEN DIARIO (@v1k_asistente_bot). El resumen de la mañana lo envía un flujo de GitHub Actions; este webhook le permite
// dar la bienvenida cuando alguien pulsa «Iniciar» (con su número de chat) y responder a un «briefing» de pocos comandos de solo lectura:
// /ahora, /alertas, /agenda, /semana y /guia. Para explorar con filtros está el bot de consultas.
//   POST /api/telegram-resumen     cabecera X-Telegram-Bot-Api-Secret-Token = TELEGRAM_RESUMEN_WEBHOOK_SECRET
//
// Variables de entorno (en Vercel, nunca en el código):
//   DATABASE_URL_READER                  cadena de coze_reader (solo lectura)
//   TELEGRAM_BOT_RESUMEN_TOKEN           token del bot del resumen diario (el mismo TELEGRAM_BOT_TOKEN de GitHub)
//   TELEGRAM_RESUMEN_WEBHOOK_SECRET      secreto largo y aleatorio que Telegram devuelve en cada llamada
//   TELEGRAM_CHATS_PERMITIDOS            números de chat de los administradores, separados por comas (opcional)
import { crearLectorDeChats, crearLectorDeRevocados } from '../lib/chats-activos.js';
import { consultarVista, leerSql } from '../lib/consultar-vistas.js';
import { crearManejador } from '../lib/telegram.js';

export default crearManejador({ modo: 'resumen', consultar: consultarVista, chatsExtra: crearLectorDeChats(leerSql), chatsRevocados: crearLectorDeRevocados(leerSql) });
