// Números de chat con acceso dado desde el módulo «Accesos» del panel (los usan los dos bots de Telegram).
// Se lee SOLO la vista central.v_telegram_chats_activos (nunca nombres ni teléfonos) con el rol de solo lectura, y se guarda 15 segundos para
// no consultar la base en cada mensaje. Si la base falla, devuelve vacío: ese mensaje se atiende solo con los administradores de la variable
// de Vercel (falla cerrado: nadie entra por error).
export const VISTA_CHATS = 'SELECT chat_id FROM central.v_telegram_chats_activos';

/** crearLectorDeChats(consultarSql) → async () => ['123…', …]. `consultarSql(texto)` devuelve las filas. */
export function crearLectorDeChats(consultarSql, { ttlMs = 15_000, ahora = () => Date.now() } = {}) {
  let memoria = { t: -Infinity, chats: [] };
  return async function chatsExtra() {
    if (ahora() - memoria.t < ttlMs) return memoria.chats;
    try {
      const filas = await consultarSql(VISTA_CHATS);
      memoria = { t: ahora(), chats: filas.map((f) => String(f.chat_id)) };
    } catch {
      memoria = { t: ahora(), chats: [] };
    }
    return memoria.chats;
  };
}
