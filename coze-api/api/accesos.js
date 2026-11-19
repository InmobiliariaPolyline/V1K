// Accesos del bot de Telegram (los usa el módulo «Accesos» del panel). Protegido con un token de ADMINISTRADOR.
//   GET    /api/accesos                       lista de personas con acceso
//   POST   /api/accesos  { chat_id, nombre, telefono }   da acceso (o actualiza a la persona)
//   PATCH  /api/accesos  { chat_id, activo }  revoca (false) o reactiva (true)
//   DELETE /api/accesos  { chat_id }          quita a la persona de la lista
//
// La lógica está en lib/accesos.js. Aquí solo se conecta a la base con el rol writer_accesos (que solo toca esa tabla).
//
// Variables de entorno (en Vercel, nunca en el código):
//   ADMIN_TOKEN                   token de administrador (32 caracteres o más); NO es el token de solo lectura de Coze
//   DATABASE_URL_ACCESOS          cadena del rol writer_accesos
//   TELEGRAM_BOT_COMANDOS_TOKEN   (opcional) el mismo del bot de consultas: sirve para avisar a la persona que ya tiene acceso
import { neon } from '@neondatabase/serverless';
import { crearManejadorAccesos } from '../lib/accesos.js';
import { tecladoMenu } from '../lib/telegram.js';

const sql = (texto, parametros) => neon(process.env.DATABASE_URL_ACCESOS).query(texto, parametros);

/** Le avisa a la persona que ya puede usar el bot. Solo funciona si ella ya pulsó «Iniciar» en el bot. */
async function notificar(chatId) {
  const token = process.env.TELEGRAM_BOT_COMANDOS_TOKEN;
  if (!token) return false;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: '✅ Ya tienes acceso al asistente de V1K. Usa los botones o escribe /ayuda para ver qué puedes consultar.', reply_markup: tecladoMenu() }),
    signal: AbortSignal.timeout(8000),
  });
  return r.ok;
}

export default crearManejadorAccesos({ sql, notificar });
