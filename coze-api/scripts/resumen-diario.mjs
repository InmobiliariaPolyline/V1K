// Resumen diario por Telegram: lee la API (resumen_general e historial), arma un mensaje corto con lo urgente y los cambios de la
// semana, y lo envía a tu chat. Lo ejecuta .github/workflows/diario.yml cada mañana (hora de Lima).
//
// PRIVACIDAD: el repositorio es público y el registro del flujo también. El mensaje lleva nombres de proyectos, así que SOLO viaja a
// Telegram: en el registro se escribe únicamente «enviado (N caracteres)». Para verlo en tu equipo, con tus propios datos:
//   API_TOKEN=... node scripts/resumen-diario.mjs --mostrar         (arma el mensaje y lo muestra, sin enviarlo)
//   TELEGRAM_BOT_TOKEN=... node scripts/resumen-diario.mjs --buscar-chat   (muestra el número de tu chat, tras escribirle «hola» al bot)
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'node:url';
import { fechaCorta, nombreDia, plural, relativoDias } from '../public/js/nucleo/formato.js';
import { generarAlertas, saludGlobal } from '../public/js/nucleo/insights.js';
import { compararCon } from '../public/js/nucleo/tendencias.js';

export const BASE_DEFECTO = 'https://v1k-coze-api.vercel.app';
export const MAX_TELEGRAM = 3900; // el límite de Telegram es 4096 caracteres

/** Fecha de hoy en Lima (UTC−5, sin horario de verano) como AAAA-MM-DD. */
export const hoyEnLima = (ahora = new Date()) => new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);

const ESTADO = { ok: '✅ Todo en orden', aviso: '🟡 Hay puntos por revisar', peligro: '🔴 Requiere atención' };
const MARCA = { peligro: '🔴', aviso: '🟡', info: '🔹' };

/** Arma el mensaje (texto plano). `resumen` = fila de resumen-general; `historial` = filas de la vista historial (puede ser null). */
export function componerResumen(resumen, historial, { hoy = hoyEnLima(), panel = BASE_DEFECTO } = {}) {
  const alertas = generarAlertas(resumen, hoy);
  const salud = saludGlobal(alertas);
  const dia = nombreDia(new Date(`${hoy}T00:00:00`).getDay());
  const L = [`V1K · ${dia} ${fechaCorta(hoy)}`, ESTADO[salud], ''];

  const importantes = alertas.filter((a) => a.tono !== 'ok').slice(0, 6);
  if (importantes.length) {
    L.push('Qué mirar primero');
    for (const a of importantes) {
      L.push(`${MARCA[a.tono] ?? '•'} ${a.titulo}`);
      if (a.tono === 'peligro') L.push(`   ${a.texto}`);
    }
    L.push('');
  }

  const hitos = (resumen.proximos_hitos ?? []).slice(0, 3);
  const pedidos = (resumen.proximos_pedidos ?? []).filter((p) => p.llegada_estimada).slice(0, 3);
  if (hitos.length || pedidos.length) {
    L.push('Próximos días');
    for (const h of hitos) L.push(`• ${h.descripcion} (${h.proyecto ?? 'sin proyecto'}) — ${relativoDias(h.fecha, hoy)}`);
    for (const p of pedidos) L.push(`• Llega ${p.pedido_id} de ${p.proveedor ?? 'proveedor'} — ${relativoDias(p.llegada_estimada, hoy)}`);
    L.push('');
  }

  const cmp = historial ? compararCon(historial, 7) : null;
  if (cmp) {
    const cambios = cmp.filas.filter((f) => f.delta !== null && f.delta !== 0);
    L.push(`Cambios en ${plural(cmp.dias, 'día', 'días')} (desde el ${fechaCorta(cmp.desde)})`);
    if (cambios.length) for (const f of cambios) L.push(`${f.tono === 'mejor' ? '🟢' : f.tono === 'peor' ? '🔴' : '•'} ${f.etiqueta}: ${f.texto}`);
    else L.push('• Sin cambios en lo que se sigue.');
    L.push('');
  } else {
    L.push('Historial: se guarda una foto por día; los cambios aparecerán cuando haya al menos dos días.', '');
  }

  const frescura = (resumen.frescura ?? []).map((f) => `${f.app} ${Number.isFinite(f.hace_horas) ? `${Math.round(f.hace_horas)} h` : '—'}`);
  if (frescura.length) L.push(`Datos al día: ${frescura.join(' · ')}`);
  L.push(`Panel: ${panel}`);

  const texto = L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return texto.length > MAX_TELEGRAM ? `${texto.slice(0, MAX_TELEGRAM - 1)}…` : texto;
}

/** Envía un texto a un chat de Telegram. Nunca incluye el token ni la respuesta en el error. */
export async function enviarTelegram({ token, chatId, texto, fetchFn = globalThis.fetch }) {
  const r = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Telegram respondió HTTP ${r.status}`);
  return { estado: r.status };
}

/** «123, -456;abc» → ['123', '-456'] (solo números de chat válidos, sin repetir). TELEGRAM_CHAT_ID admite varios, separados por comas. */
export const listaDeChats = (texto) => [...new Set(String(texto ?? '').split(/[\s,;]+/).filter((x) => /^-?\d{3,20}$/.test(x)))];

/** Envía el mismo texto a cada chat; si uno falla, los demás lo reciben igual. Devuelve solo cuántos (nunca números de chat). */
export async function enviarAVarios({ token, chats, texto, fetchFn = globalThis.fetch }) {
  let enviados = 0, fallidos = 0;
  for (const chatId of chats) {
    try { await enviarTelegram({ token, chatId, texto, fetchFn }); enviados++; } catch { fallidos++; }
  }
  return { enviados, fallidos };
}

/** Números de chat con acceso dado desde el módulo «Accesos» del panel. Lee SOLO la vista de números activos (sin nombres ni teléfonos). */
export async function chatsDeLaBase(consultar) {
  const filas = await consultar('SELECT chat_id FROM central.v_telegram_chats_activos');
  return listaDeChats(filas.map((f) => f.chat_id).join(','));
}

/** Chats que le han escrito al bot (para saber el número de tu chat). */
export async function buscarChats(token, fetchFn = globalThis.fetch) {
  const r = await fetchFn(`https://api.telegram.org/bot${token}/getUpdates`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Telegram respondió HTTP ${r.status}`);
  const j = await r.json();
  const vistos = new Map();
  for (const u of j.result ?? []) {
    const c = u.message?.chat ?? u.channel_post?.chat;
    if (c?.id !== undefined) vistos.set(c.id, { id: c.id, tipo: c.type, nombre: c.title ?? c.first_name ?? c.username ?? '' });
  }
  return [...vistos.values()];
}

/** Lee una ruta de la API con el token. Devuelve { estado, cuerpo }; nunca lanza. */
export async function leerApi(base, ruta, token, fetchFn = globalThis.fetch) {
  try {
    const r = await fetchFn(`${base}${ruta}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000) });
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch { /* sin JSON */ }
    return { estado: r.status, cuerpo };
  } catch {
    return { estado: 0, cuerpo: null };
  }
}

const sinDatos = (r) => !r || r.estado !== 200 || !Array.isArray(r.cuerpo?.datos);

/** Lee la API y devuelve { texto } o { error }. */
export async function prepararMensaje({ base = BASE_DEFECTO, token, fetchFn, ahora = new Date() }) {
  const [resumen, historial] = await Promise.all([
    leerApi(base, '/api/resumen-general', token, fetchFn),
    leerApi(base, '/api/historial?limite=15', token, fetchFn),
  ]);
  if (sinDatos(resumen) || !resumen.cuerpo.datos[0]) return { error: `no se pudo leer la API (HTTP ${resumen?.estado || 'sin respuesta'})` };
  // Si el historial aún no existe (la tabla no se creó) o falla, el resumen sale igual, solo sin la sección de cambios
  const filas = sinDatos(historial) ? null : historial.cuerpo.datos;
  return { texto: componerResumen(resumen.cuerpo.datos[0], filas, { hoy: hoyEnLima(ahora), panel: base }) };
}

// ── Ejecución directa ───────────────────────────────────────────────────────────────────
async function principal() {
  const arg = process.argv.slice(2);
  const tokenTg = process.env.TELEGRAM_BOT_TOKEN ?? '';

  if (arg.includes('--buscar-chat')) {
    if (!tokenTg) { console.error('Define TELEGRAM_BOT_TOKEN con el token que te dio @BotFather.'); process.exit(2); }
    const chats = await buscarChats(tokenTg);
    if (!chats.length) console.log('Ningún chat todavía: abre tu bot en Telegram, escríbele «hola» y vuelve a ejecutar esto.');
    for (const c of chats) console.log(`chat ${c.id} (${c.tipo}) ${c.nombre}`);
    return;
  }

  const apiToken = process.env.API_TOKEN ?? '';
  const base = (process.env.API_BASE || BASE_DEFECTO).replace(/\/+$/, '');
  if (apiToken.length < 24) { console.error('Falta el secreto API_TOKEN o es demasiado corto.'); process.exit(2); }
  const { texto, error } = await prepararMensaje({ base, token: apiToken });

  if (arg.includes('--mostrar')) { console.log(error ? `ERROR: ${error}` : texto); return; }

  // Destinatarios: los del secreto TELEGRAM_CHAT_ID (administrador) y los dados de alta en el módulo «Accesos»
  let chats = listaDeChats(process.env.TELEGRAM_CHAT_ID);
  const urlBase = process.env.HISTORIAL_DATABASE_URL;
  if (urlBase) {
    try { const sql = neon(urlBase); chats = [...new Set([...chats, ...(await chatsDeLaBase((q) => sql.query(q)))])]; }
    catch { console.error('No se pudo leer la lista de accesos; se envía solo a los chats del secreto.'); }
  }
  if (!tokenTg || !chats.length) { console.error('Falta el secreto TELEGRAM_BOT_TOKEN o no hay a quién enviarlo (TELEGRAM_CHAT_ID o personas en «Accesos»).'); process.exit(2); }
  if (error) {
    // Aviso corto: mejor saber que falló que no recibir nada
    await enviarAVarios({ token: tokenTg, chats, texto: `V1K · no pude armar el resumen de hoy: ${error}. Revisa Actions → Vigilancia.` });
    console.error('El resumen no se pudo armar; se avisó por Telegram.');
    process.exit(1);
  }
  const { enviados, fallidos } = await enviarAVarios({ token: tokenTg, chats, texto });
  console.log(`Resumen enviado (${texto.length} caracteres) a ${enviados} ${enviados === 1 ? 'chat' : 'chats'}.`);
  if (fallidos) { console.error(`${fallidos} ${fallidos === 1 ? 'chat no lo recibió' : 'chats no lo recibieron'}: revisa que cada persona le haya escrito «hola» al bot.`); process.exitCode = 1; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  principal().catch((e) => { console.error('El resumen diario falló:', String(e?.message ?? e).replace(/bot[\w:-]+/g, 'bot[token]').slice(0, 200)); process.exit(1); });
}
