// Accesos del bot de Telegram: quién puede usar el bot de consultas y recibir el resumen diario.
// Los administra el módulo «Accesos» del panel con un TOKEN DE ADMINISTRADOR (distinto del token de solo lectura de Coze).
//
// Esta parte es PURA y se prueba sin red: valida los datos y arma el manejador HTTP con la base y el aviso a Telegram inyectados.
// Seguridad: sin el token de administrador no se ve ni se cambia nada; el número de chat y el teléfono se validan; la lista tiene
// un tope; los errores de la base nunca llegan al cliente. El teléfono es solo un dato de registro del administrador: Telegram
// identifica a las personas por su número de chat, y eso es lo que autoriza.
import { createHash, timingSafeEqual } from 'node:crypto';

export const MAX_ACCESOS = 50;
export const TELEFONO_RE = /^\+?[0-9][0-9 -]{5,18}[0-9]$/;   // la misma regla que la tabla (db/04_accesos.sql)
const CHAT_RE = /^[1-9][0-9]{4,14}$/;                        // los chats de personas son números positivos (≥ 5 cifras)
const MAX_CUERPO = 2000;

const hash = (v) => createHash('sha256').update(String(v)).digest();
/** «Bearer <token>» comparado en tiempo constante. El token de administrador debe tener al menos 32 caracteres. */
export function adminTokenValido(cabecera, esperado) {
  if (typeof esperado !== 'string' || esperado.length < 32 || typeof cabecera !== 'string') return false;
  const m = /^Bearer (.+)$/.exec(cabecera);
  return Boolean(m) && timingSafeEqual(hash(m[1]), hash(esperado));
}

// Caracteres de control e invisibles (incluidos los que cambian la dirección del texto) se cambian por un espacio
const RANGOS_CONTROL = [[0, 31], [127, 159], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069]];
const esControl = (c) => RANGOS_CONTROL.some(([a, b]) => c >= a && c <= b);
const sinControl = (t) => [...String(t ?? '')].map((ch) => (esControl(ch.codePointAt(0)) ? ' ' : ch)).join('').replace(/\s+/g, ' ').trim();

/** Valida y normaliza los datos de una persona. { ok: true, valor } o { ok: false, error } (el mensaje se muestra al administrador). */
export function validarPersona(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return { ok: false, error: 'Faltan los datos de la persona.' };
  const chat = String(cuerpo.chat_id ?? '').replace(/[\s.,]/g, '');
  if (!CHAT_RE.test(chat)) return { ok: false, error: 'El número de chat debe tener solo dígitos (de 5 a 15), por ejemplo 123456789.' };
  const nombre = sinControl(cuerpo.nombre);
  if (nombre.length < 2 || nombre.length > 60) return { ok: false, error: 'El nombre debe tener entre 2 y 60 caracteres.' };
  const telefono = sinControl(cuerpo.telefono);
  if (!TELEFONO_RE.test(telefono)) return { ok: false, error: 'El teléfono no parece válido: usa dígitos, espacios o guiones, por ejemplo +51 999 888 777.' };
  return { ok: true, valor: { chat_id: chat, nombre, telefono } };
}

const COLUMNAS = 'chat_id::text AS chat_id, nombre, telefono, activo, creado_en, actualizado_en';

/**
 * crearManejadorAccesos({ env, sql, notificar, ahora }) → (req, res) => …
 *   sql(texto, parametros) → filas   (la base, con el rol writer_accesos)
 *   notificar(chatId) → boolean      (avisa a la persona por Telegram que ya tiene acceso; opcional)
 * Rutas: GET lista · POST alta/actualización · PATCH {chat_id, activo} revocar o reactivar · DELETE {chat_id} quitar.
 */
export function crearManejadorAccesos({ env = process.env, sql, notificar = async () => false } = {}) {
  return async function manejador(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const metodo = req.method;
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(metodo)) { res.setHeader('Allow', 'GET, POST, PATCH, DELETE'); return res.status(405).json({ error: 'Método no permitido' }); }
    if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32 || !env.DATABASE_URL_ACCESOS) return res.status(503).json({ error: 'El módulo de accesos no está configurado en el servidor.' });
    if (!adminTokenValido(req.headers?.authorization, env.ADMIN_TOKEN)) return res.status(401).json({ error: 'Token de administrador incorrecto.' });

    let cuerpo = req.body;
    if (typeof cuerpo === 'string') { try { cuerpo = JSON.parse(cuerpo); } catch { cuerpo = null; } }
    if (metodo !== 'GET' && JSON.stringify(cuerpo ?? {}).length > MAX_CUERPO) return res.status(413).json({ error: 'Solicitud demasiado grande.' });

    try {
      if (metodo === 'GET') {
        const filas = await sql(`SELECT ${COLUMNAS} FROM central.telegram_accesos ORDER BY activo DESC, lower(nombre)`, []);
        return res.status(200).json({ total: filas.length, maximo: MAX_ACCESOS, datos: filas });
      }

      if (metodo === 'POST') {
        const v = validarPersona(cuerpo);
        if (!v.ok) return res.status(400).json({ error: v.error });
        const { chat_id, nombre, telefono } = v.valor;
        const [{ n, existe }] = await sql('SELECT count(*)::int AS n, bool_or(chat_id = $1::bigint) AS existe FROM central.telegram_accesos', [chat_id]);
        if (!existe && n >= MAX_ACCESOS) return res.status(409).json({ error: `Se alcanzó el máximo de ${MAX_ACCESOS} personas. Quita a alguien antes de agregar a otra.` });
        const [fila] = await sql(
          `INSERT INTO central.telegram_accesos (chat_id, nombre, telefono, activo) VALUES ($1::bigint, $2, $3, true)
             ON CONFLICT (chat_id) DO UPDATE SET nombre = EXCLUDED.nombre, telefono = EXCLUDED.telefono, activo = true, actualizado_en = now()
             RETURNING ${COLUMNAS}`, [chat_id, nombre, telefono]);
        const notificado = await notificar(chat_id).catch(() => false);
        return res.status(existe ? 200 : 201).json({ persona: fila, notificado: Boolean(notificado), actualizado: Boolean(existe) });
      }

      const chat = String(cuerpo?.chat_id ?? '').replace(/[\s.,]/g, '');
      if (!CHAT_RE.test(chat)) return res.status(400).json({ error: 'Indica el número de chat de la persona.' });

      if (metodo === 'PATCH') {
        if (typeof cuerpo.activo !== 'boolean') return res.status(400).json({ error: 'Indica si la persona queda con acceso (activo: true) o sin él (activo: false).' });
        const filas = await sql(`UPDATE central.telegram_accesos SET activo = $2, actualizado_en = now() WHERE chat_id = $1::bigint RETURNING ${COLUMNAS}`, [chat, cuerpo.activo]);
        if (!filas.length) return res.status(404).json({ error: 'Esa persona no está en la lista.' });
        const notificado = cuerpo.activo ? await notificar(chat).catch(() => false) : false;
        return res.status(200).json({ persona: filas[0], notificado: Boolean(notificado) });
      }

      const filas = await sql('DELETE FROM central.telegram_accesos WHERE chat_id = $1::bigint RETURNING chat_id::text AS chat_id', [chat]);
      if (!filas.length) return res.status(404).json({ error: 'Esa persona no está en la lista.' });
      return res.status(200).json({ eliminada: filas[0].chat_id });
    } catch {
      return res.status(502).json({ error: 'No se pudo completar la operación en la base de datos.' });
    }
  };
}
