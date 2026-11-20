// Bots de Telegram de V1K (solo lectura): el de CONSULTAS (@v1k_consultas_bot, todos los comandos y botones) y el del RESUMEN DIARIO
// (@v1k_asistente_bot, que envía el resumen de la mañana y responde a unos pocos comandos de «briefing»).
// No usan IA: leen y dan formato, así que son instantáneos, no cuestan nada y no pueden inventar datos.
//
// Esta parte es PURA y se prueba sin red: recibe una actualización de Telegram y devuelve las llamadas que hay que hacer a la
// API de Telegram. El webhook (api/telegram.js y api/telegram-resumen.js) solo comprueba el secreto, ejecuta esto y envía las respuestas.
//
// Seguridad: solo responden con datos a los chats autorizados (los administradores de la variable de Vercel y las personas dadas de alta en el
// módulo «Accesos»); a cualquier otro le dicen que el bot es privado (o que su acceso fue revocado) y su número de chat. Todo texto que viene
// de los datos se escapa antes de enviarlo como HTML. Qué responde cada comando: lib/telegram-comandos.js; el diseño: lib/telegram-diseno.js.
import { createHash, timingSafeEqual } from 'node:crypto';
import { normalizar } from '../public/js/nucleo/formato.js';
import { hoyEnLima } from '../scripts/resumen-diario.mjs';
import { COMANDOS, COMANDOS_DEL_BOT, ESTADOS_PROYECTO, MAX_ARGUMENTO, MAX_MENSAJE, NOMBRES_COMANDOS, estadoProyecto, fechaHoraLima, parsearPropiedades, atajoDe, resolverComando, tecladoFijo, tecladoMenu } from './telegram-comandos.js';
import { BASE_PUBLICA, BOT_CONSULTAS, BOT_RESUMEN, codigo, esc, horaEnLima, horaMinutoLima, identidadDe, nombreCorto, pasosDeAcceso, saludoDe, tarjeta, tarjetaIdentidad } from './telegram-diseno.js';

export { BOT_CONSULTAS, BOT_RESUMEN, ESTADOS_PROYECTO, MAX_ARGUMENTO, MAX_MENSAJE, NOMBRES_COMANDOS, esc, estadoProyecto, fechaHoraLima, parsearPropiedades, tecladoMenu };

// ── Seguridad ────────────────────────────────────────────────────────────────────────────
const hash = (v) => createHash('sha256').update(String(v)).digest();
/** El secreto que Telegram envía en la cabecera X-Telegram-Bot-Api-Secret-Token, comparado en tiempo constante. */
export function secretoValido(recibido, esperado) {
  if (typeof esperado !== 'string' || esperado.length < 24 || typeof recibido !== 'string') return false;
  return timingSafeEqual(hash(recibido), hash(esperado));
}

/** «123, -456,abc, 123» → Set { '123', '-456' } (solo números de chat válidos). */
export function chatsPermitidos(texto) {
  return new Set(String(texto ?? '').split(/[\s,;]+/).filter((x) => /^-?\d{3,20}$/.test(x)));
}

/** Límite de mensajes por chat (en memoria; una instancia sirve para frenar ráfagas). */
export function crearLimitador({ max = 20, ventanaMs = 60_000 } = {}) {
  const marcas = new Map();
  return (chat, ahora = Date.now()) => {
    const lista = (marcas.get(chat) ?? []).filter((t) => ahora - t < ventanaMs);
    if (lista.length >= max) { marcas.set(chat, lista); return false; }
    lista.push(ahora);
    marcas.set(chat, lista);
    if (marcas.size > 500) for (const [k, v] of marcas) if (!v.some((t) => ahora - t < ventanaMs)) marcas.delete(k);
    return true;
  };
}

/** «/Proyectos@mi_bot   atrasado» → { cmd: 'proyectos', args: 'atrasado' }. Lo que no empieza con «/» no es un comando. */
export function parsearComando(texto) {
  const t = String(texto ?? '').trim().slice(0, 200);
  const m = /^\/([a-zA-Záéíóúñ_]{1,32})(?:@[\w]+)?(?:\s+([\s\S]*))?$/.exec(t);
  if (!m) return null;
  return { cmd: normalizar(m[1]), args: (m[2] ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ARGUMENTO) };
}

// ── Textos de bienvenida (al pulsar «Iniciar») ───────────────────────────────────────────
/** Texto de bienvenida para una persona autorizada del bot de consultas (cabe en el pie de la animación: ≤ 1024 caracteres). */
export function textoBienvenida({ nombre = '', hora = 9 } = {}) {
  const n = nombreCorto(nombre);
  return [
    `👋 <b>${saludoDe(hora)}${n ? `, ${esc(n)}` : ''}</b>`,
    'Soy el asistente de <b>V1K</b>: te cuento cómo van tus obras, materiales, pedidos y propiedades, al instante y sin costo.',
    '',
    tarjeta('📋 /resumen · 🚨 /alertas · 📅 /agenda', '📁 /proyectos · 📦 /materiales · 🚚 /pedidos', '🏠 /propiedades · 💰 /mercado · 🔎 /buscar', '🧭 /guia · ❓ /ayuda'),
    '',
    '<i>Toca un botón o escribe un comando. Solo leo: no modifico nada.</i>',
  ].join('\n');
}

/** Texto para quien todavía no tiene acceso: su número de chat (se copia al tocarlo) y los pasos para pedirlo. */
export function textoPrivado(chatId, { corto = false, nombre = '', usuario = '' } = {}) {
  return [
    `🔒 <b>${corto ? 'Este bot es privado' : 'Acceso privado'}</b>`,
    corto ? '' : 'Este asistente es solo para personas autorizadas.',
    corto ? '' : '',
    tarjetaIdentidad({ chatId, nombre, usuario, acceso: 'privado' }),
    '',
    '<b>Para pedir acceso</b>',
    pasosDeAcceso(chatId),
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

/** Texto para quien tuvo acceso y fue revocado: lo dice claro, muestra su número de chat y qué hacer si cree que es un error. */
export function textoRevocado(chatId, { nombre = '', usuario = '' } = {}) {
  return [
    '🚫 <b>Tu acceso fue revocado</b>',
    'Ya no puedes usar este asistente de V1K.',
    '',
    tarjetaIdentidad({ chatId, nombre, usuario, acceso: 'revocado' }),
    '',
    '<b>¿Crees que es un error?</b>',
    'Escríbele al administrador con tu número de chat para que te dé acceso otra vez.',
  ].join('\n');
}

/** Texto de bienvenida del bot del resumen diario. */
export function textoBienvenidaResumen({ autorizado, chatId, nombre = '', hora = 9, usuario = '' }) {
  const n = nombreCorto(nombre);
  if (!autorizado) return textoPrivado(chatId, { nombre, usuario });
  return [
    `☀️ <b>${saludoDe(hora)}${n ? `, ${esc(n)}` : ''}</b>`,
    'Soy el <b>resumen diario</b> de V1K. Estás en la lista: te escribo cada mañana a las <b>08:07</b> (hora de Lima) con lo urgente y los cambios de la semana.',
    '',
    tarjeta('📋 /ahora · 🚨 /alertas · 📅 /agenda', '📈 /semana · 🧭 /guia · 🪪 /cuenta'),
    '',
    `<i>Para explorar con filtros usa @${BOT_CONSULTAS}.</i>`,
  ].join('\n');
}

// ── Procesar una actualización ───────────────────────────────────────────────────────────
const urlDelVideo = (panel, variante) => `${String(panel).replace(/\/+$/, '')}/bot/${variante}.mp4`;

/** Una respuesta con animación (la bienvenida). Si Telegram no puede cargar el video, se envía el mismo texto sin él (alternativa). */
function conAnimacion(chat, panel, variante, caption, teclado) {
  const texto = { chat_id: chat, text: caption, parse_mode: 'HTML', disable_web_page_preview: true, ...(teclado ? { reply_markup: teclado } : {}) };
  return { metodo: 'sendAnimation', cuerpo: { chat_id: chat, animation: urlDelVideo(panel, variante), caption, parse_mode: 'HTML', ...(teclado ? { reply_markup: teclado } : {}) }, alternativa: { metodo: 'sendMessage', cuerpo: texto } };
}

/**
 * procesarUpdate(update, { consultar, permitidos, revocados, hoy, panel, hora, bot }) → [{ metodo, cuerpo, alternativa? }] (llamadas a la API de Telegram).
 * `bot` es 'consultas' (todos los comandos) o 'resumen' (briefing). Con `graficos`, los comandos que tienen gráfico lo envían como foto (el texto queda de respaldo). `consultar(vista, filtros)` devuelve las filas de una vista (ver lib/vistas.js).
 * Los botones de un mensaje de texto EDITAN ese mismo mensaje (la conversación no se llena de respuestas); si no se puede editar, se envía uno nuevo.
 */
export async function procesarUpdate(update, { consultar = async () => { throw new Error('sin consultar'); }, permitidos, revocados = new Set(), hoy = hoyEnLima(), panel = BASE_PUBLICA, hora = horaEnLima(), bot = 'consultas', graficos = false, ahora = new Date(), administradores = new Set() }) {
  const cb = update?.callback_query;
  const msg = update?.message;
  const quien = identidadDe((cb ?? msg)?.from); // nombre y @usuario de quien escribe o toca el botón
  const chat = cb?.message?.chat?.id ?? msg?.chat?.id;
  if (chat === undefined || chat === null) return [];
  const chatId = String(chat);
  const acciones = [];
  const enviar = (cuerpo) => acciones.push({ metodo: 'sendMessage', cuerpo: { chat_id: chat, disable_web_page_preview: true, ...cuerpo } });
  const menu = () => tecladoMenu(bot);

  if (!permitidos?.has(chatId)) {
    const revocado = Boolean(revocados?.has(chatId)); // tuvo acceso y se le quitó: se le dice claro, no el «bot privado» de quien nunca tuvo
    if (cb?.id) {
      acciones.push({ metodo: 'answerCallbackQuery', cuerpo: { callback_query_id: cb.id, text: revocado ? '🚫 Tu acceso fue revocado.' : 'Este bot es privado.', ...(revocado ? { show_alert: true } : {}) } });
      if (revocado) { // el menú desaparece y en su lugar queda el aviso
        const aviso = { text: textoRevocado(chatId, quien), parse_mode: 'HTML', disable_web_page_preview: true };
        if (typeof cb.message?.text === 'string' && cb.message.message_id !== undefined) acciones.push({ metodo: 'editMessageText', cuerpo: { chat_id: chat, message_id: cb.message.message_id, ...aviso, reply_markup: { inline_keyboard: [] } }, alternativa: { metodo: 'sendMessage', cuerpo: { chat_id: chat, ...aviso } } });
        else {
          if (cb.message?.message_id !== undefined) acciones.push({ metodo: 'editMessageReplyMarkup', cuerpo: { chat_id: chat, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } } });
          enviar(aviso);
        }
      }
      return acciones;
    }
    const esInicio = parsearComando(msg?.text)?.cmd === 'start';
    if (revocado) { // se le quita el teclado de atajos que pudiera tener
      const sinAtajos = { remove_keyboard: true };
      if (esInicio) acciones.push(conAnimacion(chat, panel, 'revocado', textoRevocado(chatId, quien), sinAtajos));
      else enviar({ text: textoRevocado(chatId, quien), parse_mode: 'HTML', reply_markup: sinAtajos });
    } else if (esInicio) acciones.push(conAnimacion(chat, panel, 'privado', textoPrivado(chatId, quien)));
    else enviar({ text: textoPrivado(chatId, { corto: true, ...quien }), parse_mode: 'HTML' });
    return acciones;
  }

  if (cb?.id) acciones.push({ metodo: 'answerCallbackQuery', cuerpo: { callback_query_id: cb.id } });
  const usuario = { chatId, ...quien, acceso: administradores?.has(chatId) ? 'admin' : 'autorizado' };

  let orden = null;
  if (cb) {
    const m = /^c:([a-z]{1,20})(?::([\w ]{1,30}))?$/.exec(String(cb.data ?? ''));
    if (m) orden = { cmd: m[1], args: m[2] ?? '' };
  } else if (typeof msg?.text === 'string') {
    // un comando, la etiqueta de un atajo del teclado fijo («📋 Resumen») o texto libre (que lleva al inicio, no a un «no entiendo»)
    const atajo = parsearComando(msg.text) ? undefined : atajoDe(msg.text, bot);
    orden = parsearComando(msg.text) ?? (atajo ? { ...atajo, atajo: true } : { cmd: 'inicio', args: '', libre: true });
  } else {
    enviar({ text: 'Solo entiendo mensajes de texto. Usa /ayuda o los botones.', reply_markup: menu() });
    return acciones;
  }
  if (!orden) return acciones;

  if (orden.cmd === 'start') { // «Iniciar»: bienvenida con la animación y el menú
    const caption = bot === 'resumen' ? textoBienvenidaResumen({ autorizado: true, chatId, nombre: msg?.from?.first_name, hora }) : textoBienvenida({ nombre: msg?.from?.first_name, hora });
    acciones.push(conAnimacion(chat, panel, bot === 'resumen' ? 'resumen' : 'bienvenida', caption, tecladoFijo(bot))); // el teclado de atajos queda abajo desde el primer mensaje
    const inicio = await COMANDOS.inicio({ consultar, hoy, panel, bot, generado: horaMinutoLima(ahora), usuario });
    enviar({ text: inicio.html, parse_mode: 'HTML', reply_markup: inicio.teclado });
    return acciones;
  }

  const cmd = resolverComando(orden.cmd);
  if (!cmd) { enviar({ text: `No conozco el comando /${esc(orden.cmd).slice(0, 20)}. Usa /ayuda.`, reply_markup: menu() }); return acciones; }
  if (!COMANDOS_DEL_BOT[bot]?.includes(cmd)) { // un comando que existe, pero en el otro bot
    enviar({ text: `Ese comando es de @${BOT_CONSULTAS}. Aquí tienes /ahora, /alertas, /agenda, /semana y /guia.`, reply_markup: menu() });
    return acciones;
  }
  if (!cb && cmd !== 'ayuda' && cmd !== 'guia') acciones.push({ metodo: 'sendChatAction', cuerpo: { chat_id: chat, action: 'typing' } });
  try {
    const generado = horaMinutoLima(ahora);
    const r = await COMANDOS[cmd]({ args: orden.args, consultar, hoy, panel, bot, generado, usuario });
    const cuerpo = { text: r.html, parse_mode: 'HTML', reply_markup: r.teclado ?? menu(), disable_web_page_preview: true };
    if (graficos && r.grafico) { // un gráfico como foto; si no se puede dibujar o enviar, sale el mismo contenido en texto
      const foto = { metodo: 'sendPhoto', imagen: r.grafico.svg, archivo: 'photo', cuerpo: { chat_id: chat, caption: r.grafico.caption, parse_mode: 'HTML', reply_markup: r.teclado ?? menu() }, alternativa: { metodo: 'sendMessage', cuerpo: { chat_id: chat, ...cuerpo } } };
      const esFoto = Array.isArray(cb?.message?.photo) && cb.message.message_id !== undefined;
      if (esFoto) { // un botón sobre un gráfico lo REEMPLAZA en su mismo mensaje (datos nuevos, sin llenar el chat); si no se puede editar, se envía uno nuevo
        acciones.push({ metodo: 'editMessageMedia', imagen: r.grafico.svg, archivo: 'foto', cuerpo: { chat_id: chat, message_id: cb.message.message_id, media: { type: 'photo', media: 'attach://foto', caption: r.grafico.caption, parse_mode: 'HTML' }, reply_markup: r.teclado ?? menu() }, alternativa: foto });
      } else acciones.push(foto);
      const respuesta = acciones.find((a) => a.metodo === 'answerCallbackQuery');
      if (respuesta) respuesta.cuerpo.text = `🔄 Gráfico de las ${generado} (datos de la base en este momento)`;
      return acciones;
    }
    const editable = typeof cb?.message?.text === 'string' && cb.message.message_id !== undefined;
    if (editable) acciones.push({ metodo: 'editMessageText', cuerpo: { chat_id: chat, message_id: cb.message.message_id, ...cuerpo }, alternativa: { metodo: 'sendMessage', cuerpo: { chat_id: chat, ...cuerpo } } });
    else enviar(cuerpo);
    if (cmd === 'inicio' && !cb && !orden.atajo && !orden.libre) enviar({ text: '⌨️ <b>Atajos activados</b>\nTe quedan siempre abajo, junto a donde escribes.', parse_mode: 'HTML', reply_markup: tecladoFijo(bot) });
  } catch {
    enviar({ text: '⚠️ No pude leer los datos ahora. Intenta de nuevo en un momento.', reply_markup: menu() });
  }
  return acciones;
}

/** El bot del resumen diario: bienvenida con su número de chat y un «briefing» de pocos comandos (/ahora, /alertas, /agenda, /semana, /guia). */
export const procesarUpdateResumen = (update, opciones = {}) => procesarUpdate(update, { ...opciones, bot: 'resumen' });

// ── Manejador del webhook (se le inyectan las dependencias para poder probarlo) ─────────
const MODOS = {
  consultas: { token: 'TELEGRAM_BOT_COMANDOS_TOKEN', secreto: 'TELEGRAM_WEBHOOK_SECRET' },
  resumen: { token: 'TELEGRAM_BOT_RESUMEN_TOKEN', secreto: 'TELEGRAM_RESUMEN_WEBHOOK_SECRET' },
};

/** Dibuja un SVG como PNG cargando el motor solo cuando hace falta (si no está disponible, falla y se envía el texto). */
const renderizarPorDefecto = async (svg) => (await import('./imagenes.js')).renderizarPng(svg);

/** Llama a la API de Telegram; si la acción trae una alternativa y falla (salvo «message is not modified»), prueba con ella. */
async function ejecutar(fetchFn, token, accion, renderizar) {
  const llamar = async (a) => {
    let init;
    if (a.imagen) { // una foto se sube como archivo (multipart): primero se dibuja el gráfico
      const png = await renderizar(a.imagen);
      const form = new FormData();
      for (const [k, v] of Object.entries(a.cuerpo)) form.append(k, v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));
      form.append(a.archivo ?? 'photo', new Blob([png], { type: 'image/png' }), 'grafico.png');
      init = { method: 'POST', body: form };
    } else init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a.cuerpo) };
    const r = await fetchFn(`https://api.telegram.org/bot${token}/${a.metodo}`, init);
    if (r.ok) return { ok: true };
    let descripcion = '';
    try { descripcion = String((await r.json())?.description ?? ''); } catch { /* sin cuerpo */ }
    console.error('Telegram respondió', r.status, 'a', a.metodo);
    return { ok: false, noModificado: /not modified/i.test(descripcion) };
  };
  try {
    const r = await llamar(accion);
    if (!r.ok && accion.alternativa && !r.noModificado) await llamar(accion.alternativa);
  } catch {
    console.error('No se pudo enviar a Telegram:', accion.metodo);
    if (accion.alternativa) { try { await llamar(accion.alternativa); } catch { console.error('Tampoco la alternativa:', accion.alternativa.metodo); } }
  }
}

export function crearManejador({ modo = 'consultas', env = process.env, consultar, chatsExtra = async () => [], chatsRevocados = async () => [], fetchFn = globalThis.fetch, limitar = crearLimitador(), ahora = () => new Date(), renderizar = renderizarPorDefecto, graficos = true } = {}) {
  const vars = MODOS[modo] ?? MODOS.consultas;
  return async function manejador(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Solo POST' }); }
    const token = env[vars.token];
    const secreto = env[vars.secreto];
    if (!token || !secreto) return res.status(503).json({ error: 'No configurado' });
    if (!secretoValido(req.headers?.['x-telegram-bot-api-secret-token'], secreto)) return res.status(401).json({ error: 'No autorizado' });

    let update = req.body;
    if (typeof update === 'string') { try { update = JSON.parse(update); } catch { update = null; } }
    if (!update || typeof update !== 'object') return res.status(200).json({ ok: true });

    const chat = update.callback_query?.message?.chat?.id ?? update.message?.chat?.id;
    if (chat === undefined || !limitar(String(chat), ahora().getTime())) return res.status(200).json({ ok: true }); // ráfaga: se ignora en silencio

    // Autorizados: los de la variable (administradores) y los que da de alta el módulo «Accesos»; si la base falla, solo los de la variable
    const administradores = chatsPermitidos(env.TELEGRAM_CHATS_PERMITIDOS);
    const permitidos = new Set(administradores);
    try { for (const c of await chatsExtra()) permitidos.add(String(c)); } catch { /* la lista de la base no está disponible: se sigue solo con la variable */ }
    let revocados = new Set();
    try { revocados = new Set((await chatsRevocados()).map(String)); } catch { /* sin la lista de revocados, se les trata como «bot privado» */ }
    const hora = horaEnLima(ahora());
    const acciones = await procesarUpdate(update, { consultar, permitidos, revocados, hoy: hoyEnLima(ahora()), hora, bot: modo === 'resumen' ? 'resumen' : 'consultas', graficos, ahora: ahora(), administradores });
    for (const a of acciones) await ejecutar(fetchFn, token, a, renderizar);
    return res.status(200).json({ ok: true }); // siempre 200: Telegram reintenta si no
  };
}
