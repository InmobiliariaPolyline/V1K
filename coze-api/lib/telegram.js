// Bot de Telegram de CONSULTA (solo lectura): comandos y botones sobre las mismas consultas fijas que usa el agente y el panel.
// No usa IA: lee y da formato, así que es instantáneo, no cuesta nada y no puede inventar datos.
//
// Esta parte es PURA y se prueba sin red: recibe una actualización de Telegram y devuelve las llamadas que hay que hacer a la
// API de Telegram. El webhook (api/telegram.js) solo comprueba el secreto, ejecuta esto y envía las respuestas.
//
// Seguridad: solo responde con datos a los chats de TELEGRAM_CHATS_PERMITIDOS; a cualquier otro le dice que el bot es privado y su
// número de chat (para que el administrador lo autorice). Todo texto que viene de los datos se escapa antes de enviarlo como HTML.
import { createHash, timingSafeEqual } from 'node:crypto';
import { dinero, estadoFrescura, fechaCorta, haceHoras, diasEntre, normalizar, numero, plural, relativoDias, urlSegura } from '../public/js/nucleo/formato.js';
import { inventarioSinCargar, precioDudoso } from '../public/js/nucleo/insights.js';
import { compararCon } from '../public/js/nucleo/tendencias.js';
import { componerResumen, hoyEnLima } from '../scripts/resumen-diario.mjs';

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

/** Escapa texto para el modo HTML de Telegram (nombres, títulos y demás datos nunca se envían sin escapar). */
export const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

/** Une líneas sin pasar del límite de Telegram; si no caben todas, avisa cuántas faltan. */
function unir(cabecera, bloques, pie = '') {
  const partes = [cabecera];
  let largo = cabecera.length + pie.length + 60;
  let usadas = 0;
  for (const b of bloques) {
    if (largo + b.length + 2 > MAX_MENSAJE) break;
    partes.push(b); largo += b.length + 2; usadas++;
  }
  if (usadas < bloques.length) partes.push(`… y ${numero(bloques.length - usadas, 0)} más. Afina con un texto para ver menos.`);
  if (pie) partes.push(pie);
  return partes.join('\n\n');
}

const ICONO_ESTADO = { atrasado: '🔴', 'en curso': '🔵', terminado: '✅', 'por iniciar': '⚪' };

/** «atrasados», «en curso», «por iniciar», «terminados»… → el estado exacto, o undefined. */
export function estadoProyecto(texto) {
  const t = normalizar(texto).replace(/\s+/g, ' ');
  return ESTADOS_PROYECTO.find((e) => t === e || t === `${e}s` || t === e.replace(/ /g, ''));
}

// ── Respuestas de cada comando (devuelven { texto, html, teclado }) ──────────────────────
async function cmdProyectos({ args, consultar, hoy }) {
  const norm = normalizar(args);
  const estado = estadoProyecto(norm);
  const filas = (await consultar('proyectos', { ...(estado ? { estado } : {}), ...(!estado && args ? { q: args } : {}), limite: '200' })).filter(Boolean);
  const bloques = filas.map((p) => {
    const avance = Number(p.avance_pct) || 0;
    const fin = String(p.fin ?? '').slice(0, 10);
    const extra = [p.tareas_atrasadas > 0 ? `${plural(p.tareas_atrasadas, 'tarea atrasada', 'tareas atrasadas')}` : null, p.responsable ? esc(p.responsable) : null].filter(Boolean).join(' · ');
    return `${ICONO_ESTADO[p.estado] ?? '•'} <b>${esc(p.nombre)}</b>\n   ${esc(p.estado)} · ${numero(avance, 0)} % · fin ${fechaCorta(fin)} (${relativoDias(fin, hoy)})${extra ? `\n   ${extra}` : ''}`;
  });
  const titulo = `📁 <b>Proyectos</b>${estado ? ` · ${estado}` : args ? ` · «${esc(args)}»` : ''} (${filas.length})`;
  return { html: filas.length ? unir(titulo, bloques.slice(0, 12), 'Filtra: /proyectos atrasado · /proyectos nombre') : `${titulo}\n\nNo hay proyectos con ese filtro.`, teclado: tecladoProyectos() };
}

async function cmdMateriales({ args, consultar }) {
  const [filas, resumen] = await Promise.all([
    consultar('stock-bajo', { ...(args ? { q: args } : {}), limite: '12' }),
    consultar('resumen-general').then((r) => r?.[0]).catch(() => null),
  ]);
  const aviso = resumen && inventarioSinCargar(resumen.stock)
    ? `⚠️ <b>Inventario casi sin cargar:</b> ${numero(resumen.stock.sin_existencias, 0)} de ${numero(resumen.stock.materiales_con_minimo, 0)} materiales sin existencias. Estos faltantes son mínimos de partida, no una falta real.`
    : '';
  const bloques = filas.map((m) => `• <b>${esc(m.material)}</b>${m.categoria ? ` — ${esc(m.categoria)}` : ''}\n   hay ${numero(m.cantidad, 2)} · mínimo ${numero(m.minimo, 2)} · faltan <b>${numero(m.faltante, 2)}</b>${m.unidad ? `\n   unidad: ${esc(m.unidad)}` : ''}`);
  const titulo = `📦 <b>Materiales bajo su mínimo</b>${args ? ` · «${esc(args)}»` : ''}`;
  const cuerpo = filas.length ? unir(titulo, bloques, 'Busca: /materiales cemento') : `${titulo}\n\nNingún material coincide.`;
  return { html: aviso ? `${aviso}\n\n${cuerpo}` : cuerpo, teclado: tecladoMenu() };
}

async function cmdPedidos({ args, consultar, hoy }) {
  const norm = normalizar(args);
  const estado = ESTADOS_PEDIDO.find((e) => e === norm);
  const filas = await consultar('pedidos', { ...(estado ? { estado } : {}), ...(!estado && args ? { q: args } : {}), limite: '40' });
  const bloques = filas.map((p) => {
    const llegada = p.llegada_estimada ? String(p.llegada_estimada).slice(0, 10) : null;
    const vencido = llegada && diasEntre(hoy, llegada) < 0;
    const pedida = Number(p.cantidad_pedida) || 0, recibida = Number(p.cantidad_recibida) || 0;
    return `${vencido ? '⏰' : '•'} <b>${esc(p.pedido_id)}</b> ${esc(p.proveedor ?? '')}${p.obra ? ` — ${esc(p.obra)}` : ''}\n   ${esc(p.estado)} · ${llegada ? `llega ${fechaCorta(llegada)} (${relativoDias(llegada, hoy)})` : 'sin fecha'}${pedida > 0 ? ` · recibido ${numero((recibida / pedida) * 100, 0)} %` : ''}`;
  });
  const titulo = `🚚 <b>Pedidos abiertos</b>${estado ? ` · ${estado}` : args ? ` · «${esc(args)}»` : ''} (${filas.length})`;
  return { html: filas.length ? unir(titulo, bloques) : `${titulo}\n\nNo hay pedidos abiertos con ese filtro.`, teclado: tecladoMenu() };
}

async function cmdPropiedades({ args, consultar }) {
  const filtros = parsearPropiedades(args);
  const filas = await consultar('propiedades', { ...filtros, limite: '10' });
  const bloques = filas.map((p) => {
    const dudoso = precioDudoso(p);
    const area = parseFloat(p.area);
    const enlace = urlSegura(p.url);
    const datos = [p.distrito ? esc(p.distrito) : null, dinero(p.precio, p.moneda), area > 0 ? `${numero(area, 0)} m²` : null, p.dormitorios ? `${numero(parseFloat(p.dormitorios), 0)} dorm.` : null].filter(Boolean).join(' · ');
    return `• <b>${esc(p.titulo ?? 'Sin título')}</b>\n   ${esc(p.operacion ?? '')} · ${datos}${dudoso ? '\n   ⚠️ precio dudoso (parece por m²)' : ''}${enlace ? `\n   <a href="${esc(enlace)}">Ver aviso</a>` : ''}`;
  });
  const etiqueta = [filtros.operacion?.toLowerCase(), filtros.inmueble?.toLowerCase(), filtros.distrito, filtros.precio_min_usd ? `desde US$ ${numero(Number(filtros.precio_min_usd), 0)}` : null, filtros.precio_max_usd ? `hasta US$ ${numero(Number(filtros.precio_max_usd), 0)}` : null].filter(Boolean).map(esc).join(' · ');
  const titulo = `🏠 <b>Propiedades</b>${etiqueta ? ` (${etiqueta})` : ' recientes'}`;
  const pie = 'Ejemplos: /propiedades venta miraflores hasta 300000 · /propiedades alquiler casa';
  return { html: filas.length ? unir(titulo, bloques, pie) : `${titulo}\n\nNingún aviso coincide.\n${pie}`, teclado: tecladoMenu() };
}

async function cmdFrescura({ consultar }) {
  const filas = await consultar('frescura', {});
  const nombre = { planner: 'Planner', mrp: 'MRP', scraper: 'Scraper' };
  const lineas = filas.map((f) => `${{ ok: '✅', aviso: '🟡', viejo: '🔴', desconocido: '⚪' }[estadoFrescura(Number(f.hace_horas))]} <b>${esc(nombre[f.app] ?? f.app)}</b> — ${haceHoras(Number(f.hace_horas))}\n   ${esc(fechaHoraLima(f.ultima_sync))} (hora de Lima)`);
  return { html: `🕒 <b>Datos al día</b>\n\n${lineas.join('\n\n') || 'Todavía no hay datos de sincronización.'}`, teclado: tecladoMenu() };
}

async function cmdTendencias({ consultar }) {
  const historial = await consultar('historial', { limite: '15' }).catch(() => null);
  const cmp = historial ? compararCon(historial, 7) : null;
  if (!cmp) return { html: '📈 <b>Tendencias</b>\n\nTodavía no hay al menos dos días de historial: se guarda una foto por día.', teclado: tecladoMenu() };
  const lineas = cmp.filas.map((f) => `${f.tono === 'mejor' ? '🟢' : f.tono === 'peor' ? '🔴' : '•'} ${esc(f.etiqueta)}: ${esc(f.texto)}`);
  return { html: `📈 <b>Tendencias</b> · ${plural(cmp.dias, 'día', 'días')} (desde el ${fechaCorta(cmp.desde)})\n\n${lineas.join('\n')}`, teclado: tecladoMenu() };
}

async function cmdResumen({ consultar, hoy, panel }) {
  const [resumen, historial] = await Promise.all([consultar('resumen-general'), consultar('historial', { limite: '15' }).catch(() => null)]);
  if (!resumen?.[0]) return { texto: 'Todavía no hay datos para el resumen.', teclado: tecladoMenu() };
  return { texto: componerResumen(resumen[0], historial, { hoy, panel }), teclado: tecladoMenu() }; // texto plano: lleva nombres de proyectos
}

function cmdAyuda() {
  return {
    html: [
      '🤖 <b>Asistente V1K</b> — consultas de solo lectura',
      '',
      '/resumen — lo urgente del día y los cambios de la semana',
      '/proyectos [atrasado | nombre] — estado y avance',
      '/materiales [texto] — stock bajo su mínimo',
      '/pedidos [estado | texto] — órdenes de compra abiertas',
      '/propiedades [venta|alquiler] [distrito] [casa|departamento…] [hasta 300000]',
      '/frescura — hace cuánto sincronizó cada app',
      '/tendencias — cambios frente a hace 7 días',
      '',
      'También puedes usar los botones. No escribo ni modifico nada.',
    ].join('\n'),
    teclado: tecladoMenu(),
  };
}

const COMANDOS = {
  start: cmdAyuda, ayuda: cmdAyuda, help: cmdAyuda, menu: cmdAyuda,
  resumen: cmdResumen, hoy: cmdResumen, proyectos: cmdProyectos, materiales: cmdMateriales, stock: cmdMateriales,
  pedidos: cmdPedidos, propiedades: cmdPropiedades, frescura: cmdFrescura, tendencias: cmdTendencias,
};
export const NOMBRES_COMANDOS = ['resumen', 'proyectos', 'materiales', 'pedidos', 'propiedades', 'frescura', 'tendencias', 'ayuda'];

// ── Procesar una actualización ───────────────────────────────────────────────────────────
/**
 * procesarUpdate(update, { consultar, permitidos, hoy, panel }) → [{ metodo, cuerpo }] (llamadas a la API de Telegram).
 * `consultar(vista, filtros)` devuelve las filas de una vista (ver lib/vistas.js).
 */
export async function procesarUpdate(update, { consultar, permitidos, hoy = hoyEnLima(), panel = 'https://v1k-coze-api.vercel.app' }) {
  const cb = update?.callback_query;
  const msg = update?.message;
  const chat = cb?.message?.chat?.id ?? msg?.chat?.id;
  if (chat === undefined || chat === null) return [];
  const chatId = String(chat);
  const acciones = [];
  const enviar = (cuerpo) => acciones.push({ metodo: 'sendMessage', cuerpo: { chat_id: chat, disable_web_page_preview: true, ...cuerpo } });

  if (!permitidos?.has(chatId)) {
    if (cb?.id) acciones.push({ metodo: 'answerCallbackQuery', cuerpo: { callback_query_id: cb.id, text: 'Este bot es privado.' } });
    else enviar({ text: `🔒 Este bot es privado.\nTu número de chat es ${chatId}. Pídele al administrador que lo autorice.` });
    return acciones;
  }

  if (cb?.id) acciones.push({ metodo: 'answerCallbackQuery', cuerpo: { callback_query_id: cb.id } });

  let orden = null;
  if (cb) {
    const m = /^c:([a-z]{1,20})(?::([\w ]{1,30}))?$/.exec(String(cb.data ?? ''));
    if (m) orden = { cmd: m[1], args: m[2] ?? '' };
  } else if (typeof msg?.text === 'string') {
    orden = parsearComando(msg.text);
    if (!orden) { enviar({ ...(cmdAyudaCorta()), reply_markup: tecladoMenu() }); return acciones; }
  } else {
    enviar({ text: 'Solo entiendo mensajes de texto. Usa /ayuda o los botones.', reply_markup: tecladoMenu() });
    return acciones;
  }
  if (!orden) return acciones;

  const fn = COMANDOS[orden.cmd];
  if (!fn) { enviar({ text: `No conozco el comando /${esc(orden.cmd).slice(0, 20)}. Usa /ayuda.`, reply_markup: tecladoMenu() }); return acciones; }
  try {
    const r = await fn({ args: orden.args, consultar, hoy, panel });
    enviar({ ...(r.html ? { text: r.html, parse_mode: 'HTML' } : { text: r.texto }), reply_markup: r.teclado ?? tecladoMenu() });
  } catch {
    enviar({ text: '⚠️ No pude leer los datos ahora. Intenta de nuevo en un momento.', reply_markup: tecladoMenu() });
  }
  return acciones;
}

const cmdAyudaCorta = () => ({ text: 'Soy un bot de consultas: usa /ayuda o los botones. No entiendo mensajes libres.' });

// ── Manejador del webhook (se le inyectan las dependencias para poder probarlo) ─────────
export function crearManejador({ env = process.env, consultar, fetchFn = globalThis.fetch, limitar = crearLimitador(), ahora = () => new Date() } = {}) {
  return async function manejador(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Solo POST' }); }
    const token = env.TELEGRAM_BOT_COMANDOS_TOKEN;
    if (!token || !env.TELEGRAM_WEBHOOK_SECRET || !env.TELEGRAM_CHATS_PERMITIDOS) return res.status(503).json({ error: 'No configurado' });
    if (!secretoValido(req.headers?.['x-telegram-bot-api-secret-token'], env.TELEGRAM_WEBHOOK_SECRET)) return res.status(401).json({ error: 'No autorizado' });

    let update = req.body;
    if (typeof update === 'string') { try { update = JSON.parse(update); } catch { update = null; } }
    if (!update || typeof update !== 'object') return res.status(200).json({ ok: true });

    const chat = update.callback_query?.message?.chat?.id ?? update.message?.chat?.id;
    if (chat === undefined || !limitar(String(chat), ahora().getTime())) return res.status(200).json({ ok: true }); // ráfaga: se ignora en silencio

    const acciones = await procesarUpdate(update, { consultar, permitidos: chatsPermitidos(env.TELEGRAM_CHATS_PERMITIDOS), hoy: hoyEnLima(ahora()) });
    for (const a of acciones) {
      try {
        const r = await fetchFn(`https://api.telegram.org/bot${token}/${a.metodo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a.cuerpo) });
        if (!r.ok) console.error('Telegram respondió', r.status, 'a', a.metodo);
      } catch { console.error('No se pudo enviar a Telegram:', a.metodo); }
    }
    return res.status(200).json({ ok: true }); // siempre 200: Telegram reintenta si no
  };
}
