// Números de chat con acceso (y los revocados) dados desde el módulo «Accesos» del panel; los usan los dos bots de Telegram.
// Se leen SOLO las vistas de números de chat (nunca nombres ni teléfonos) con el rol de solo lectura, y se guardan 15 segundos para
// no consultar la base en cada mensaje. Si la base falla, devuelven vacío: ese mensaje se atiende solo con los administradores de la variable
// de Vercel (falla cerrado: nadie entra por error) y nadie se muestra como «revocado».
export const VISTA_CHATS = 'SELECT chat_id FROM central.v_telegram_chats_activos';
export const VISTA_REVOCADOS = 'SELECT chat_id FROM central.v_telegram_chats_revocados';

/** crearLectorDeChats(consultarSql, { sql }) → async () => ['123…', …]. `consultarSql(texto)` devuelve las filas. */
export function crearLectorDeChats(consultarSql, { sql = VISTA_CHATS, ttlMs = 15_000, ahora = () => Date.now() } = {}) {
  let memoria = { t: -Infinity, chats: [] };
  return async function leer() {
    if (ahora() - memoria.t < ttlMs) return memoria.chats;
    try {
      const filas = await consultarSql(sql);
      memoria = { t: ahora(), chats: filas.map((f) => String(f.chat_id)) };
    } catch {
      memoria = { t: ahora(), chats: [] };
    }
    return memoria.chats;
  };
}

/** Lo mismo para los chats revocados. */
export const crearLectorDeRevocados = (consultarSql, opciones = {}) => crearLectorDeChats(consultarSql, { ...opciones, sql: VISTA_REVOCADOS });
