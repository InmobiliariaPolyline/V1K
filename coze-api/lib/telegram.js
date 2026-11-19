// Bots de Telegram de V1K (solo lectura): el de CONSULTAS (comandos y botones sobre las mismas consultas fijas que usa el agente y el panel)
// y la bienvenida del bot del RESUMEN DIARIO (@v1k_asistente_bot, que solo envía el resumen de la mañana).
// No usan IA: leen y dan formato, así que son instantáneos, no cuestan nada y no pueden inventar datos.
//
// Esta parte es PURA y se prueba sin red: recibe una actualización de Telegram y devuelve las llamadas que hay que hacer a la
// API de Telegram. El webhook (api/telegram.js y api/telegram-resumen.js) solo comprueba el secreto, ejecuta esto y envía las respuestas.
//
// Seguridad: solo responden con datos a los chats autorizados (los administradores de la variable de Vercel y las personas dadas de alta en el
// módulo «Accesos»); a cualquier otro le dicen que el bot es privado y su número de chat. Todo texto que viene de los datos se escapa antes
// de enviarlo como HTML. El diseño (tarjetas, barras, bienvenida animada) está en lib/telegram-diseno.js.
import { createHash, timingSafeEqual } from 'node:crypto';
import { dinero, estadoFrescura, fechaCorta, haceHoras, diasEntre, normalizar, numero, plural, relativoDias, urlSegura } from '../public/js/nucleo/formato.js';
import { inventarioSinCargar, precioDudoso } from '../public/js/nucleo/insights.js';
import { compararCon } from '../public/js/nucleo/tendencias.js';
import { componerResumenHtml, hoyEnLima } from '../scripts/resumen-diario.mjs';
import { BASE_PUBLICA, BOT_CONSULTAS, BOT_RESUMEN, barra, codigo, esc, horaEnLima, nombreCorto, pasosDeAcceso, saludoDe, tarjeta, titulo } from './telegram-diseno.js';

export { esc };
export const MAX_MENSAJE = 3800;      // el límite de Telegram es 4096 caracteres
export const MAX_ARGUMENTO = 60;
export const ESTADOS_PROYECTO = ['atrasado', 'en curso', 'por iniciar', 'terminado'];
const ESTADOS_PEDIDO = ['pendiente', 'enviada', 'parcial'];
const INMUEBLES = ['departamento', 'casa', 'terreno', 'oficina', 'local'];
const NOMBRE_INMUEBLE = { departamento: 'Departamento', casa: 'Casa', terreno: 'Terreno', oficina: 'Oficina', local: 'Local' };

/** «2026-11-18T20:43:00Z» → «18/11/2026 15:43» en hora de Lima, sea cual sea la zona del servidor (en Vercel es UTC). */
export function fechaHoraLima(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

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

// ── Comandos ─────────────────────────────────────────────────────────────────────────────
/** «/Proyectos@mi_bot   atrasado» → { cmd: 'proyectos', args: 'atrasado' }. Lo que no empieza con «/» no es un comando. */
export function parsearComando(texto) {
  const t = String(texto ?? '').trim().slice(0, 200);
  const m = /^\/([a-zA-Záéíóúñ_]{1,32})(?:@[\w]+)?(?:\s+([\s\S]*))?$/.exec(t);
  if (!m) return null;
  return { cmd: normalizar(m[1]), args: (m[2] ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ARGUMENTO) };
}

/** Argumentos de /propiedades: «venta miraflores casa hasta 300000» → filtros de la API. */
export function parsearPropiedades(args) {
  const filtros = {};
  const resto = [];
  const palabras = normalizar(args).split(' ').filter(Boolean);
  const monto = (txt) => { const n = Number(String(txt ?? '').replace(/[.,]/g, '')); return Number.isFinite(n) && n > 0 ? String(n) : null; };
  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i];
    if (['venta', 'vender', 'comprar'].includes(p)) filtros.operacion = 'VENTA';
    else if (['alquiler', 'alquilar'].includes(p)) filtros.operacion = 'ALQUILER';
    else if (INMUEBLES.includes(p)) filtros.inmueble = NOMBRE_INMUEBLE[p];
    else if (['hasta', 'max', 'maximo', 'menos'].includes(p) || ['desde', 'min', 'minimo'].includes(p)) {
      const j = palabras[i + 1] === 'de' ? i + 2 : i + 1;
      const n = monto(palabras[j]);
      if (n) { filtros[['hasta', 'max', 'maximo', 'menos'].includes(p) ? 'precio_max_usd' : 'precio_min_usd'] = n; i = j; }
    } else if (!['en', 'de', 'usd', 'dolares', 'us$', '$'].includes(p)) resto.push(p);
  }
  if (resto.length) filtros.distrito = resto.join(' ').slice(0, MAX_ARGUMENTO);
  return filtros;
}

const MENU = [
  [['📋 Resumen', 'resumen'], ['🕒 Datos al día', 'frescura']],
  [['📁 Proyectos', 'proyectos'], ['📦 Materiales', 'materiales']],
  [['🚚 Pedidos', 'pedidos'], ['🏠 Propiedades', 'propiedades']],
  [['📈 Tendencias', 'tendencias'], ['❓ Ayuda', 'ayuda']],
];
const boton = ([texto, clave]) => ({ text: texto, callback_data: `c:${clave}` });
export const tecladoMenu = () => ({ inline_keyboard: MENU.map((fila) => fila.map(boton)) });
const tecladoProyectos = () => ({ inline_keyboard: [[boton(['🔴 Atrasados', 'proyectos:atrasado']), boton(['🔵 En curso', 'proyectos:en curso'])], [boton(['⚪ Por iniciar', 'proyectos:por iniciar']), boton(['✅ Terminados', 'proyectos:terminado'])], ...MENU.slice(0, 1).map((f) => f.map(boton))] });

/** Une la cabecera y las tarjetas sin pasar del límite de Telegram; si no caben todas, avisa cuántas faltan. */
function unir(cabecera, bloques, pie = '', maximo = 8) {
  const partes = [cabecera];
  let largo = cabecera.length + pie.length + 80;
  let usadas = 0;
  for (const b of bloques.slice(0, maximo)) {
    if (largo + b.length + 2 > MAX_MENSAJE) break;
    partes.push(b); largo += b.length + 2; usadas++;
  }
  if (usadas < bloques.length) partes.push(`<i>… y ${numero(bloques.length - usadas, 0)} más. Afina la búsqueda con un texto para ver menos.</i>`);
  if (pie) partes.push(`<i>${pie}</i>`);
  return partes.join('\n\n');
}

const ICONO_ESTADO = { atrasado: '🔴', 'en curso': '🔵', terminado: '✅', 'por iniciar': '⚪' };

/** «atrasados», «en curso», «por iniciar», «terminados»… → el estado exacto, o undefined. */
export function estadoProyecto(texto) {
  const t = normalizar(texto).replace(/\s+/g, ' ');
  return ESTADOS_PROYECTO.find((e) => t === e || t === `${e}s` || t === e.replace(/ /g, ''));
}

// ── Respuestas de cada comando (devuelven { html, teclado }) ──────────────────────────────
async function cmdProyectos({ args, consultar, hoy }) {
  const estado = estadoProyecto(normalizar(args));
  const filas = (await consultar('proyectos', { ...(estado ? { estado } : {}), ...(!estado && args ? { q: args } : {}), limite: '200' })).filter(Boolean);
  const bloques = filas.map((p) => {
    const avance = Number(p.avance_pct) || 0;
    const fin = String(p.fin ?? '').slice(0, 10);
    return tarjeta(
      `${ICONO_ESTADO[p.estado] ?? '•'} <b>${esc(p.nombre)}</b> · ${esc(p.estado)}`,
      `${barra(avance)} ${numero(avance, 0)} %`,
      `📅 fin ${fechaCorta(fin)} · ${relativoDias(fin, hoy)}`,
      [p.responsable ? `👤 ${esc(p.responsable)}` : null, p.tareas_atrasadas > 0 ? `⚠️ ${plural(p.tareas_atrasadas, 'tarea atrasada', 'tareas atrasadas')}` : null].filter(Boolean).join(' · '),
    );
  });
  const filtro = estado ? ` · ${estado}` : args ? ` · «${esc(args)}»` : '';
  const cab = titulo('📁', `Proyectos${filtro}`, plural(filas.length, 'proyecto', 'proyectos'));
  return { html: filas.length ? unir(cab, bloques, 'Filtra: /proyectos atrasado · /proyectos nombre') : `${cab}\n\nNo hay proyectos con ese filtro.`, teclado: tecladoProyectos() };
}

async function cmdMateriales({ args, consultar }) {
  const [filas, resumen] = await Promise.all([
    consultar('stock-bajo', { ...(args ? { q: args } : {}), limite: '12' }),
    consultar('resumen-general').then((r) => r?.[0]).catch(() => null),
  ]);
  const aviso = resumen && inventarioSinCargar(resumen.stock)
    ? tarjeta(`⚠️ <b>Inventario casi sin cargar</b>`, `${numero(resumen.stock.sin_existencias, 0)} de ${numero(resumen.stock.materiales_con_minimo, 0)} materiales sin existencias.`, 'Estos faltantes son mínimos de partida, no una falta real.')
    : '';
  const bloques = filas.map((m) => {
    const minimo = Number(m.minimo) || 0, cantidad = Number(m.cantidad) || 0;
    return tarjeta(
      `📦 <b>${esc(m.material)}</b>${m.categoria ? ` · ${esc(m.categoria)}` : ''}`,
      `${barra(minimo > 0 ? (cantidad / minimo) * 100 : 0)} ${numero(minimo > 0 ? Math.min(100, (cantidad / minimo) * 100) : 0, 0)} % del mínimo`,
      `hay ${numero(m.cantidad, 2)} · mínimo ${numero(m.minimo, 2)} · faltan <b>${numero(m.faltante, 2)}</b>`,
      m.unidad ? `unidad: ${esc(m.unidad)}` : '',
    );
  });
  const cab = titulo('📦', `Materiales bajo su mínimo${args ? ` · «${esc(args)}»` : ''}`, 'los de mayor faltante primero');
  const cuerpo = filas.length ? unir(cab, bloques, 'Busca: /materiales cemento') : `${cab}\n\nNingún material coincide.`;
  return { html: aviso ? `${aviso}\n\n${cuerpo}` : cuerpo, teclado: tecladoMenu() };
}

async function cmdPedidos({ args, consultar, hoy }) {
  const estado = ESTADOS_PEDIDO.find((e) => e === normalizar(args));
  const filas = await consultar('pedidos', { ...(estado ? { estado } : {}), ...(!estado && args ? { q: args } : {}), limite: '40' });
  const bloques = filas.map((p) => {
    const llegada = p.llegada_estimada ? String(p.llegada_estimada).slice(0, 10) : null;
    const vencido = llegada && diasEntre(hoy, llegada) < 0;
    const pedida = Number(p.cantidad_pedida) || 0, recibida = Number(p.cantidad_recibida) || 0;
    const pct = pedida > 0 ? (recibida / pedida) * 100 : null;
    return tarjeta(
      `${vencido ? '⏰' : '🚚'} <b>${esc(p.pedido_id)}</b> · ${esc(p.proveedor ?? '')}`,
      [p.obra ? `🏗 ${esc(p.obra)}` : null, `📌 ${esc(p.estado)}`].filter(Boolean).join(' · '),
      `📅 ${llegada ? `llega ${fechaCorta(llegada)} · ${relativoDias(llegada, hoy)}` : 'sin fecha'}`,
      pct !== null ? `${barra(pct)} ${numero(pct, 0)} % recibido` : '',
    );
  });
  const filtro = estado ? ` · ${estado}` : args ? ` · «${esc(args)}»` : '';
  const cab = titulo('🚚', `Pedidos abiertos${filtro}`, `${plural(filas.length, 'orden', 'órdenes')} · las que llegan antes, primero`);
  return { html: filas.length ? unir(cab, bloques) : `${cab}\n\nNo hay pedidos abiertos con ese filtro.`, teclado: tecladoMenu() };
}

async function cmdPropiedades({ args, consultar }) {
  const filtros = parsearPropiedades(args);
  const filas = await consultar('propiedades', { ...filtros, limite: '10' });
  const bloques = filas.map((p) => {
    const dudoso = precioDudoso(p);
    const area = parseFloat(p.area);
    const enlace = urlSegura(p.url);
    const nombre = esc(p.titulo ?? 'Sin título');
    return tarjeta(
      `${p.operacion === 'VENTA' ? '🟢' : '🔵'} <b>${esc(p.operacion ?? '')}</b>${p.distrito ? ` · ${esc(p.distrito)}` : ''}`,
      enlace ? `<a href="${esc(enlace)}">${nombre}</a>` : nombre,
      [`💵 ${dinero(p.precio, p.moneda)}`, area > 0 ? `📐 ${numero(area, 0)} m²` : null, p.dormitorios ? `🛏 ${numero(parseFloat(p.dormitorios), 0)} dorm.` : null].filter(Boolean).join(' · '),
      dudoso ? '⚠️ precio dudoso (parece por m²)' : '',
    );
  });
  const etiqueta = [filtros.operacion?.toLowerCase(), filtros.inmueble?.toLowerCase(), filtros.distrito, filtros.precio_min_usd ? `desde US$ ${numero(Number(filtros.precio_min_usd), 0)}` : null, filtros.precio_max_usd ? `hasta US$ ${numero(Number(filtros.precio_max_usd), 0)}` : null].filter(Boolean).map(esc).join(' · ');
  const cab = titulo('🏠', `Propiedades${etiqueta ? ` (${etiqueta})` : ' recientes'}`, 'las más nuevas del catálogo');
  const pie = 'Ejemplos: /propiedades venta miraflores hasta 300000 · /propiedades alquiler casa';
  return { html: filas.length ? unir(cab, bloques, pie, 6) : `${cab}\n\nNingún aviso coincide.\n<i>${pie}</i>`, teclado: tecladoMenu() };
}

async function cmdFrescura({ consultar }) {
  const filas = await consultar('frescura', {});
  const nombre = { planner: 'Planner', mrp: 'MRP', scraper: 'Scraper' };
  const bloques = filas.map((f) => {
    const h = Number(f.hace_horas);
    const icono = { ok: '✅', aviso: '🟡', viejo: '🔴', desconocido: '⚪' }[estadoFrescura(h)];
    return tarjeta(`${icono} <b>${esc(nombre[f.app] ?? f.app)}</b> · ${haceHoras(h)}`, `${barra(Number.isFinite(h) ? 100 - Math.min(100, (h / 72) * 100) : 0)} frescura`, `🗓 ${esc(fechaHoraLima(f.ultima_sync))}`);
  });
  const cab = titulo('🕒', 'Datos al día', 'hora de Lima · ✅ menos de 24 h, 🟡 hasta 72 h, 🔴 más');
  return { html: bloques.length ? `${cab}\n\n${bloques.join('\n\n')}` : `${cab}\n\nTodavía no hay datos de sincronización.`, teclado: tecladoMenu() };
}

async function cmdTendencias({ consultar }) {
  const historial = await consultar('historial', { limite: '15' }).catch(() => null);
  const cmp = historial ? compararCon(historial, 7) : null;
  if (!cmp) return { html: `${titulo('📈', 'Tendencias')}\n\nTodavía no hay al menos dos días de historial: se guarda una foto por día.`, teclado: tecladoMenu() };
  const lineas = cmp.filas.map((f) => `${f.tono === 'mejor' ? '🟢' : f.tono === 'peor' ? '🔴' : '▫️'} ${esc(f.etiqueta)}: ${esc(f.texto)}`);
  return { html: `${titulo('📈', 'Tendencias', `${plural(cmp.dias, 'día', 'días')} · desde el ${fechaCorta(cmp.desde)}`)}\n\n${tarjeta(...lineas)}\n\n<i>🟢 mejoró · 🔴 empeoró · ▫️ sin cambio</i>`, teclado: tecladoMenu() };
}

async function cmdResumen({ consultar, hoy, panel }) {
  const [resumen, historial] = await Promise.all([consultar('resumen-general'), consultar('historial', { limite: '15' }).catch(() => null)]);
  if (!resumen?.[0]) return { html: `${titulo('📋', 'Resumen')}\n\nTodavía no hay datos para el resumen.`, teclado: tecladoMenu() };
  return { html: componerResumenHtml(resumen[0], historial, { hoy, panel }), teclado: tecladoMenu() };
}

const COMANDOS_AYUDA = [
  '📋 /resumen — lo urgente y los cambios de la semana',
  '📁 /proyectos — estado y avance (<i>atrasado</i>, <i>nombre</i>)',
  '📦 /materiales — stock bajo su mínimo (<i>cemento</i>)',
  '🚚 /pedidos — órdenes de compra abiertas',
  '🏠 /propiedades — <i>venta miraflores hasta 300000</i>',
  '🕒 /frescura — hace cuánto sincronizó cada app',
  '📈 /tendencias — cambios frente a hace 7 días',
];

function cmdAyuda() {
  return {
    html: `${titulo('🤖', 'Asistente V1K', 'consultas de solo lectura')}\n\n${tarjeta(...COMANDOS_AYUDA)}\n\n<i>Toca un botón o escribe un comando. Solo leo: no modifico nada.</i>`,
    teclado: tecladoMenu(),
  };
}

const COMANDOS = {
  ayuda: cmdAyuda, help: cmdAyuda, menu: cmdAyuda,
  resumen: cmdResumen, hoy: cmdResumen, proyectos: cmdProyectos, materiales: cmdMateriales, stock: cmdMateriales,
  pedidos: cmdPedidos, propiedades: cmdPropiedades, frescura: cmdFrescura, tendencias: cmdTendencias,
};
export const NOMBRES_COMANDOS = ['resumen', 'proyectos', 'materiales', 'pedidos', 'propiedades', 'frescura', 'tendencias', 'ayuda'];

// ── Bienvenida (al pulsar «Iniciar») ─────────────────────────────────────────────────────
/** Texto de bienvenida para una persona autorizada del bot de consultas (cabe en el pie de la animación: ≤ 1024 caracteres). */
export function textoBienvenida({ nombre = '', hora = 9 } = {}) {
  const n = nombreCorto(nombre);
  return [
    `👋 <b>${saludoDe(hora)}${n ? `, ${esc(n)}` : ''}</b>`,
    'Soy el asistente de <b>V1K</b>: te cuento cómo van tus obras, materiales, pedidos y propiedades.',
    '',
    tarjeta('📋 /resumen · 📁 /proyectos · 📦 /materiales', '🚚 /pedidos · 🏠 /propiedades · 🕒 /frescura', '📈 /tendencias · ❓ /ayuda'),
    '',
    '<i>Toca un botón o escribe un comando. Solo leo: no modifico nada.</i>',
  ].join('\n');
}

/** Texto para quien todavía no tiene acceso: su número de chat (se copia al tocarlo) y los pasos para pedirlo. */
export function textoPrivado(chatId, { corto = false } = {}) {
  return [
    `🔒 <b>${corto ? 'Este bot es privado' : 'Acceso privado'}</b>`,
    corto ? '' : 'Este asistente es solo para personas autorizadas.',
    corto ? '' : '',
    tarjeta(`Tu número de chat: ${codigo(chatId)}`),
    '',
    '<b>Para pedir acceso</b>',
    pasosDeAcceso(chatId),
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

/** Texto para quien tuvo acceso y fue revocado: lo dice claro, muestra su número de chat y qué hacer si cree que es un error. */
export function textoRevocado(chatId) {
  return [
    '🚫 <b>Tu acceso fue revocado</b>',
    'Ya no puedes usar este asistente de V1K.',
    '',
    tarjeta(`Tu número de chat: ${codigo(chatId)}`),
    '',
    '<b>¿Crees que es un error?</b>',
    'Escríbele al administrador con tu número de chat para que te dé acceso otra vez.',
  ].join('\n');
}

/** Texto de bienvenida del bot del resumen diario. */
export function textoBienvenidaResumen({ autorizado, chatId, nombre = '', hora = 9 }) {
  const n = nombreCorto(nombre);
  if (!autorizado) return textoPrivado(chatId);
  return [
    `☀️ <b>${saludoDe(hora)}${n ? `, ${esc(n)}` : ''}</b>`,
    'Soy el <b>resumen diario</b> de V1K. Estás en la lista: te escribo cada mañana a las <b>08:07</b> (hora de Lima) con lo urgente y los cambios de la semana.',
    '',
    tarjeta(`Tu número de chat: ${codigo(chatId)}`),
    '',
    `<i>Para hacer consultas en cualquier momento usa @${BOT_CONSULTAS}.</i>`,
  ].join('\n');
}

// ── Procesar una actualización ───────────────────────────────────────────────────────────
const tipoDeAnimacion = (panel, variante) => `${String(panel).replace(/\/+$/, '')}/bot/${variante}.mp4`;

/**
 * Una respuesta con animación (la bienvenida). Si Telegram no puede cargar el video, se envía el mismo texto sin él (alternativa).
 */
function conAnimacion(chat, panel, variante, caption, teclado) {
  const texto = { chat_id: chat, text: caption, parse_mode: 'HTML', disable_web_page_preview: true, ...(teclado ? { reply_markup: teclado } : {}) };
  return { metodo: 'sendAnimation', cuerpo: { chat_id: chat, animation: tipoDeAnimacion(panel, variante), caption, parse_mode: 'HTML', ...(teclado ? { reply_markup: teclado } : {}) }, alternativa: { metodo: 'sendMessage', cuerpo: texto } };
}

/**
 * procesarUpdate(update, { consultar, permitidos, revocados, hoy, panel, hora }) → [{ metodo, cuerpo, alternativa? }] (llamadas a la API de Telegram).
 * `consultar(vista, filtros)` devuelve las filas de una vista (ver lib/vistas.js).
 * Los botones de un mensaje de texto EDITAN ese mismo mensaje (la conversación no se llena de respuestas); si no se puede editar, se envía uno nuevo.
 */
export async function procesarUpdate(update, { consultar, permitidos, revocados = new Set(), hoy = hoyEnLima(), panel = BASE_PUBLICA, hora = horaEnLima() }) {
  const cb = update?.callback_query;
  const msg = update?.message;
  const chat = cb?.message?.chat?.id ?? msg?.chat?.id;
  if (chat === undefined || chat === null) return [];
  const chatId = String(chat);
  const acciones = [];
  const enviar = (cuerpo) => acciones.push({ metodo: 'sendMessage', cuerpo: { chat_id: chat, disable_web_page_preview: true, ...cuerpo } });

  if (!permitidos?.has(chatId)) {
    const revocado = Boolean(revocados?.has(chatId)); // tuvo acceso y se le quitó: se le dice claro, no el «bot privado» de quien nunca tuvo
    if (cb?.id) {
      acciones.push({ metodo: 'answerCallbackQuery', cuerpo: { callback_query_id: cb.id, text: revocado ? '🚫 Tu acceso fue revocado.' : 'Este bot es privado.', ...(revocado ? { show_alert: true } : {}) } });
      if (revocado) { // el menú desaparece y en su lugar queda el aviso
        const aviso = { text: textoRevocado(chatId), parse_mode: 'HTML', disable_web_page_preview: true };
        if (typeof cb.message?.text === 'string' && cb.message.message_id !== undefined) acciones.push({ metodo: 'editMessageText', cuerpo: { chat_id: chat, message_id: cb.message.message_id, ...aviso, reply_markup: { inline_keyboard: [] } }, alternativa: { metodo: 'sendMessage', cuerpo: { chat_id: chat, ...aviso } } });
        else {
          if (cb.message?.message_id !== undefined) acciones.push({ metodo: 'editMessageReplyMarkup', cuerpo: { chat_id: chat, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } } });
          enviar(aviso);
        }
      }
      return acciones;
    }
    const esInicio = parsearComando(msg?.text)?.cmd === 'start';
    if (revocado) {
      if (esInicio) acciones.push(conAnimacion(chat, panel, 'revocado', textoRevocado(chatId)));
      else enviar({ text: textoRevocado(chatId), parse_mode: 'HTML' });
    } else if (esInicio) acciones.push(conAnimacion(chat, panel, 'privado', textoPrivado(chatId)));
    else enviar({ text: textoPrivado(chatId, { corto: true }), parse_mode: 'HTML' });
    return acciones;
  }

  if (cb?.id) acciones.push({ metodo: 'answerCallbackQuery', cuerpo: { callback_query_id: cb.id } });

  let orden = null;
  if (cb) {
    const m = /^c:([a-z]{1,20})(?::([\w ]{1,30}))?$/.exec(String(cb.data ?? ''));
    if (m) orden = { cmd: m[1], args: m[2] ?? '' };
  } else if (typeof msg?.text === 'string') {
    orden = parsearComando(msg.text);
    if (!orden) { enviar({ text: 'Soy un bot de consultas: usa /ayuda o los botones. No entiendo mensajes libres.', reply_markup: tecladoMenu() }); return acciones; }
  } else {
    enviar({ text: 'Solo entiendo mensajes de texto. Usa /ayuda o los botones.', reply_markup: tecladoMenu() });
    return acciones;
  }
  if (!orden) return acciones;

  if (orden.cmd === 'start') { // «Iniciar»: bienvenida con la animación y el menú
    acciones.push(conAnimacion(chat, panel, 'bienvenida', textoBienvenida({ nombre: msg?.from?.first_name, hora }), tecladoMenu()));
    return acciones;
  }

  const fn = COMANDOS[orden.cmd];
  if (!fn) { enviar({ text: `No conozco el comando /${esc(orden.cmd).slice(0, 20)}. Usa /ayuda.`, reply_markup: tecladoMenu() }); return acciones; }
  if (!cb && orden.cmd !== 'ayuda' && orden.cmd !== 'help' && orden.cmd !== 'menu') acciones.push({ metodo: 'sendChatAction', cuerpo: { chat_id: chat, action: 'typing' } });
  try {
    const r = await fn({ args: orden.args, consultar, hoy, panel });
    const cuerpo = { text: r.html, parse_mode: 'HTML', reply_markup: r.teclado ?? tecladoMenu(), disable_web_page_preview: true };
    const editable = typeof cb?.message?.text === 'string' && cb.message.message_id !== undefined;
    if (editable) acciones.push({ metodo: 'editMessageText', cuerpo: { chat_id: chat, message_id: cb.message.message_id, ...cuerpo }, alternativa: { metodo: 'sendMessage', cuerpo: { chat_id: chat, ...cuerpo } } });
    else enviar(cuerpo);
  } catch {
    enviar({ text: '⚠️ No pude leer los datos ahora. Intenta de nuevo en un momento.', reply_markup: tecladoMenu() });
  }
  return acciones;
}

/** El bot del resumen diario solo da la bienvenida y el número de chat: no consulta nada. */
export function procesarUpdateResumen(update, { permitidos, revocados = new Set(), panel = BASE_PUBLICA, hora = horaEnLima() }) {
  const msg = update?.message;
  const chat = msg?.chat?.id;
  if (chat === undefined || chat === null) return [];
  const chatId = String(chat);
  const autorizado = Boolean(permitidos?.has(chatId));
  const revocado = !autorizado && Boolean(revocados?.has(chatId));
  const caption = autorizado ? textoBienvenidaResumen({ autorizado, chatId, nombre: msg?.from?.first_name, hora }) : revocado ? textoRevocado(chatId) : textoPrivado(chatId);
  if (parsearComando(msg?.text)?.cmd === 'start') return [conAnimacion(chat, panel, autorizado ? 'resumen' : revocado ? 'revocado' : 'privado', caption)];
  return [{ metodo: 'sendMessage', cuerpo: { chat_id: chat, text: autorizado || revocado ? caption : textoPrivado(chatId, { corto: true }), parse_mode: 'HTML', disable_web_page_preview: true } }];
}

// ── Manejador del webhook (se le inyectan las dependencias para poder probarlo) ─────────
const MODOS = {
  consultas: { token: 'TELEGRAM_BOT_COMANDOS_TOKEN', secreto: 'TELEGRAM_WEBHOOK_SECRET' },
  resumen: { token: 'TELEGRAM_BOT_RESUMEN_TOKEN', secreto: 'TELEGRAM_RESUMEN_WEBHOOK_SECRET' },
};

/** Llama a la API de Telegram; si la acción trae una alternativa y falla (salvo «message is not modified»), prueba con ella. */
async function ejecutar(fetchFn, token, accion) {
  const llamar = async (a) => {
    const r = await fetchFn(`https://api.telegram.org/bot${token}/${a.metodo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a.cuerpo) });
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

export function crearManejador({ modo = 'consultas', env = process.env, consultar, chatsExtra = async () => [], chatsRevocados = async () => [], fetchFn = globalThis.fetch, limitar = crearLimitador(), ahora = () => new Date() } = {}) {
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
    const permitidos = chatsPermitidos(env.TELEGRAM_CHATS_PERMITIDOS);
    try { for (const c of await chatsExtra()) permitidos.add(String(c)); } catch { /* la lista de la base no está disponible: se sigue solo con la variable */ }
    let revocados = new Set();
    try { revocados = new Set((await chatsRevocados()).map(String)); } catch { /* sin la lista de revocados, se les trata como «bot privado» */ }
    const hora = horaEnLima(ahora());
    const acciones = modo === 'resumen'
      ? procesarUpdateResumen(update, { permitidos, revocados, hora })
      : await procesarUpdate(update, { consultar, permitidos, revocados, hoy: hoyEnLima(ahora()), hora });
    for (const a of acciones) await ejecutar(fetchFn, token, a);
    return res.status(200).json({ ok: true }); // siempre 200: Telegram reintenta si no
  };
}

export { BOT_CONSULTAS, BOT_RESUMEN };
