// Pruebas de los gráficos de los bots de Telegram: los SVG (formato, seguridad, escape), su conversión a PNG con resvg, cómo los comandos los
// envían como foto (con el texto de respaldo) y la subida a Telegram. Datos ficticios y sin red.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCHO, COLORES, graficoBarras, graficoMercado, graficoProyectos, graficoTendencias, xml } from '../lib/graficos.js';
import { FUENTES, renderizarPng } from '../lib/imagenes.js';
import { crearManejador, procesarUpdate } from '../lib/telegram.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const igual = (a, b, m) => { n++; assert.deepEqual(a, b, m); };

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const dimensiones = (b) => ({ ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) });
const MALO = '<script>alert(1)</script> & "comillas" \'simples\'';

/** Etiquetas bien formadas y sin nada que ejecute o cargue de fuera. */
function svgSeguro(svg, nombre) {
  const pila = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    if (m[4] === '/') continue;
    if (m[1] === '/') { igual(pila.pop(), m[2], `${nombre}: cierre inesperado </${m[2]}>`); } else pila.push(m[2]);
  }
  igual(pila, [], `${nombre}: etiquetas sin cerrar`);
  ok(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg.trim()) && /<\/svg>$/.test(svg.trim()), `${nombre}: raíz <svg> con xmlns`);
  ok(!/<script|<foreignObject|<image\b|<iframe|javascript:|\son[a-z]+\s*=|href=|url\(\s*['"]?https?:/i.test(svg), `${nombre}: sin scripts ni recursos externos`);
  ok(!/<script>alert/.test(svg), `${nombre}: el texto de los datos va escapado`);
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(svg), `${nombre}: sin emojis (el motor de render no los dibuja)`);
  ok(/viewBox="0 0 720 \d+"/.test(svg) && new RegExp(`width="${ANCHO}"`).test(svg), `${nombre}: 720 de ancho y viewBox`);
}

// ── Escape ───────────────────────────────────────────────────────────────────────────────
igual(xml(MALO), '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;comillas&quot; &#39;simples&#39;', 'xml() escapa < > & y comillas');
igual(xml(null), '', 'xml(null)');

// ── Cada gráfico ─────────────────────────────────────────────────────────────────────────
const proyectos = graficoProyectos({
  titulo: `Proyectos · ${MALO}`, sub: '3 proyectos', pie: 'Datos: Planner hace 1 día',
  filas: [{ nombre: MALO, estado: 'atrasado', avance: 40, finTexto: 'fin 31/10 · hace 19 días', tareas: 2 }, { nombre: 'Nombre larguísimo que no cabe en una sola línea del gráfico', estado: 'en curso', avance: 250, finTexto: '', tareas: 0 }, { nombre: 'C', estado: 'raro', avance: -5, finTexto: 'x', tareas: 1 }],
});
svgSeguro(proyectos, 'proyectos');
ok(proyectos.includes('2 tareas atrasadas') && proyectos.includes('1 tarea atrasada') && proyectos.includes('100 %') && proyectos.includes('0 %'), 'proyectos: pluraliza las tareas y acota el avance entre 0 y 100');
ok(proyectos.includes('…') && !proyectos.includes('Nombre larguísimo que no cabe en una sola línea'), 'proyectos: recorta los nombres largos');
{
  const dos = graficoProyectos({ titulo: 'a', filas: [{ nombre: 'x', estado: 'atrasado', avance: 1, finTexto: '', tareas: 0 }] });
  const ocho = graficoProyectos({ titulo: 'a', filas: Array.from({ length: 8 }, () => ({ nombre: 'x', estado: 'atrasado', avance: 1, finTexto: '', tareas: 0 })) });
  const alto = (s) => Number(/height="(\d+)"/.exec(s)[1]);
  ok(alto(ocho) > alto(dos) + 7 * 100, 'proyectos: la altura crece con las filas');
}
const barras = graficoBarras({ titulo: 'Stock', sub: MALO, color: COLORES.ambar, filas: [{ etiqueta: MALO, valor: 22600, textoValor: '22.6K', sub: '19 materiales' }, { etiqueta: 'B', valor: 0, textoValor: '0' }, { etiqueta: 'C', valor: 'abc', textoValor: '?' }] });
svgSeguro(barras, 'barras');
ok(barras.includes('22.6K') && barras.includes('19 materiales'), 'barras: valor y detalle');
svgSeguro(graficoBarras({ titulo: 'Vacío', filas: [] }), 'barras vacías');
const mercado = graficoMercado({ titulo: 'Mercado', venta: [{ etiqueta: 'Cayma', valor: 212900, textoValor: '212.9K', sub: '16 avisos' }], alquiler: [{ etiqueta: MALO, valor: 942, textoValor: '942', sub: '36 avisos' }] });
svgSeguro(mercado, 'mercado');
ok(mercado.includes('VENTA') && mercado.includes('ALQUILER'), 'mercado: los dos paneles');
ok(!graficoMercado({ titulo: 'M', venta: [{ etiqueta: 'a', valor: 1, textoValor: '1' }] }).includes('ALQUILER'), 'mercado: sin alquiler no dibuja ese panel');
const tendencias = graficoTendencias({ titulo: 'Tendencias', tarjetas: [
  { nombre: 'Proyectos atrasados', valorTexto: '3', deltaTexto: '+1', tono: 'peor', serie: [2, 2, 3] }, { nombre: MALO, valorTexto: '18', deltaTexto: '+8', tono: 'mejor', serie: [10, 18] },
  { nombre: 'Sin serie', valorTexto: '5', deltaTexto: '', tono: 'igual', serie: [] }, { nombre: 'Un punto', valorTexto: '5', deltaTexto: '=', tono: 'neutro', serie: [5] }, { nombre: 'Con vacíos', valorTexto: '1', deltaTexto: '+1', tono: 'peor', serie: [1, NaN, 3, null] },
] });
svgSeguro(tendencias, 'tendencias');
ok(!/NaN|undefined|null/.test(tendencias), 'tendencias: sin NaN/undefined/null aunque falten datos');
ok(/<path d="M[\d. ]+L/.test(tendencias), 'tendencias: dibuja el minigráfico cuando hay dos o más puntos');

// ── De SVG a PNG ─────────────────────────────────────────────────────────────────────────
ok(FUENTES.length === 3 && FUENTES.every((f) => fs.existsSync(f)), 'las tres fuentes Inter están en el proyecto (assets/fonts)');
ok(fs.existsSync(path.join(aqui, '..', 'assets', 'fonts', 'LICENCIA.txt')) && /Open Font License/.test(fs.readFileSync(path.join(aqui, '..', 'assets', 'fonts', 'LICENCIA.txt'), 'utf8')), 'la licencia de la fuente acompaña a los archivos');
for (const [nombre, svg] of Object.entries({ proyectos, barras, mercado, tendencias })) {
  const png = renderizarPng(svg, { ancho: 720 });
  ok(png.subarray(0, 8).equals(PNG), `${nombre}: es un PNG`);
  const d = dimensiones(png);
  ok(d.ancho === 720 && d.alto > 200 && d.alto < 3000, `${nombre}: 720 px de ancho y ${d.alto} de alto`);
  ok(png.length > 5_000 && png.length < 400_000, `${nombre}: pesa lo razonable para Telegram (${Math.round(png.length / 1024)} KB)`);
}
igual(dimensiones(renderizarPng(proyectos)).ancho, 1280, 'por defecto se dibuja a 1280 px (nitidez en pantallas de alta densidad)');
ok(renderizarPng(graficoBarras({ titulo: 'ñandú áéíóú', filas: [{ etiqueta: 'Árbol', valor: 1, textoValor: '1' }] })).length > 5_000, 'las tildes y la ñ se dibujan');

// ── Los comandos envían el gráfico como foto (y el texto de respaldo) ─────────────────────
const CHAT = 424242424;
const DATOS = {
  proyectos: [{ nombre: 'V7K', estado: 'atrasado', avance_pct: '40', fin: '2026-10-31', tareas_atrasadas: 1, responsable: 'Luis' }, { nombre: 'Torre <Norte>', estado: 'en curso', avance_pct: '62', fin: '2027-02-15', tareas_atrasadas: 0 }],
  frescura: [{ app: 'planner', ultima_sync: '2026-11-19T10:00:00Z', hace_horas: '5' }, { app: 'mrp', ultima_sync: '2026-11-19T10:00:00Z', hace_horas: '30' }, { app: 'scraper', ultima_sync: '2026-11-19T10:00:00Z', hace_horas: '9' }],
  'stock-categorias': [{ categoria: 'Acero y hierro', materiales: 19, en_stock_bajo: 19, sin_existencias: 18, faltante_total: 22600 }, { categoria: 'Cemento', materiales: 4, en_stock_bajo: 2, sin_existencias: 1, faltante_total: 300 }],
  'propiedades-distritos': [{ distrito: 'Miraflores', operacion: 'VENTA', avisos: 12, precio_mediano_usd: 318700 }, { distrito: 'San Isidro', operacion: 'ALQUILER', avisos: 28, precio_mediano_usd: 2100 }],
  'propiedades-resumen': [{ portal: 'infocasas', operacion: 'VENTA', total: 2968, ultima_vista: '2026-11-16T00:00:00Z' }, { portal: 'urbania', operacion: 'ALQUILER', total: 25, ultima_vista: '2026-10-29T00:00:00Z' }],
  historial: [
    { dia: '2026-11-19', proyectos_atrasados: 3, tareas_atrasadas: 18, pedidos_vencidos: 1, materiales_sin_existencias: 499, propiedades_catalogo: 5224, precio_mediano_venta_usd: 260000, precio_mediano_alquiler_usd: 1300 },
    { dia: '2026-11-12', proyectos_atrasados: 2, tareas_atrasadas: 10, pedidos_vencidos: 0, materiales_sin_existencias: 499, propiedades_catalogo: 5000, precio_mediano_venta_usd: 250000, precio_mediano_alquiler_usd: 1300 }],
  'resumen-general': [{ propiedades: { total_catalogo: 5224 }, stock: { materiales_con_minimo: 501, sin_existencias: 499 } }],
};
const consultar = async (vista) => DATOS[vista] ?? [];
const msg = (t) => ({ message: { message_id: 1, chat: { id: CHAT }, from: { first_name: 'Ana' }, text: t } });
const correr = (t, extra = {}) => procesarUpdate(msg(t), { consultar, permitidos: new Set([String(CHAT)]), hoy: '2026-11-19', hora: 9, ...extra });

for (const cmd of ['/proyectos', '/stock', '/mercado', '/portales', '/tendencias']) {
  const texto = await correr(cmd);
  ok(texto.some((a) => a.metodo === 'sendMessage') && !texto.some((a) => a.metodo === 'sendPhoto'), `${cmd}: sin gráficos (por defecto) responde en texto`);
  const a = (await correr(cmd, { graficos: true })).find((x) => x.metodo === 'sendPhoto');
  ok(a, `${cmd}: con gráficos envía una foto`);
  ok(typeof a.imagen === 'string' && a.imagen.startsWith('<svg'), `${cmd}: la imagen es un SVG`);
  svgSeguro(a.imagen, `${cmd} (SVG real)`);
  ok(a.cuerpo.caption.length > 20 && a.cuerpo.caption.length <= 1024 && a.cuerpo.parse_mode === 'HTML', `${cmd}: pie de foto de ≤ 1024 caracteres (${a.cuerpo.caption.length})`);
  ok(a.cuerpo.reply_markup?.inline_keyboard?.length >= 1, `${cmd}: la foto lleva los botones`);
  igual(a.alternativa.metodo, 'sendMessage', `${cmd}: si la foto falla, sale el texto`);
  ok(a.alternativa.cuerpo.text.includes('<pre>') || cmd === '/proyectos' && a.alternativa.cuerpo.text.includes('<pre>'), `${cmd}: el respaldo conserva la tabla de texto`);
  ok(renderizarPng(a.imagen, { ancho: 720 }).subarray(0, 8).equals(PNG), `${cmd}: el gráfico real se convierte en PNG`);
}
{
  const norm = await correr('/alertas', { graficos: true });
  ok(!norm.some((a) => a.metodo === 'sendPhoto'), 'los comandos sin gráfico siguen en texto aunque estén activados');
  const traspaso = await correr('/proyectos', { graficos: true });
  ok(!traspaso.some((a) => a.metodo === 'sendMessage' && a.cuerpo.photo), 'un solo mensaje por comando');
}

// ── El manejador sube la foto a Telegram ─────────────────────────────────────────────────
const SECRETO = 's'.repeat(40);
const TOKEN = '1234567890:AAExampleTokenQueNoEsReal_abcdefghijk';
const env = { TELEGRAM_BOT_COMANDOS_TOKEN: TOKEN, TELEGRAM_WEBHOOK_SECRET: SECRETO, TELEGRAM_CHATS_PERMITIDOS: String(CHAT) };
const res = () => ({ codigo: 0, setHeader() {}, status(c) { this.codigo = c; return this; }, json() { return this; } });
const llamar = async (cmd, extra = {}, respuestas = {}) => {
  const llamadas = [];
  const fetchFn = async (url, init) => {
    const metodo = url.split('/').pop();
    llamadas.push({ metodo, init, url });
    const r = respuestas[metodo];
    return r ? { ok: false, status: r.status, json: async () => ({ ok: false, description: r.descripcion }) } : { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const r = res();
  await crearManejador({ env, consultar, fetchFn, ...extra })({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': SECRETO }, body: msg(cmd) }, r);
  return { llamadas, r };
};
{
  const { llamadas, r } = await llamar('/mercado');
  const foto = llamadas.find((l) => l.metodo === 'sendPhoto');
  ok(r.codigo === 200 && foto, '/mercado: el manejador envía sendPhoto');
  ok(foto.url === `https://api.telegram.org/bot${TOKEN}/sendPhoto`, 'a la API de Telegram con el token del bot');
  ok(foto.init.body instanceof FormData && !foto.init.headers, 'se sube como formulario multipart (el navegador/Node pone el tipo y el límite)');
  const f = foto.init.body;
  igual([f.get('chat_id'), f.get('parse_mode')], [String(CHAT), 'HTML'], 'con el chat y el formato');
  ok(f.get('caption').includes('Mercado') && JSON.parse(f.get('reply_markup')).inline_keyboard.length >= 1, 'con el pie de foto y los botones (JSON)');
  const archivo = f.get('photo');
  ok(archivo instanceof Blob && archivo.type === 'image/png', 'la foto es un archivo PNG');
  ok(Buffer.from(await archivo.arrayBuffer()).subarray(0, 8).equals(PNG), 'y es un PNG de verdad (gráfico real dibujado)');
  ok(!llamadas.some((l) => l.metodo === 'sendMessage'), 'sin foto fallida no se envía además el texto');
}
{
  const { llamadas } = await llamar('/stock', { renderizar: async () => { throw new Error('resvg no disponible'); } });
  igual(llamadas.map((l) => l.metodo).filter((m) => m !== 'sendChatAction'), ['sendMessage'], 'si no se puede dibujar, se envía el texto con la tabla');
  ok(JSON.parse(llamadas.find((l) => l.metodo === 'sendMessage').init.body).text.includes('<pre>'), 'y es el texto de respaldo');
}
{
  const { llamadas } = await llamar('/portales', {}, { sendPhoto: { status: 400, descripcion: 'Bad Request: PHOTO_INVALID_DIMENSIONS' } });
  igual(llamadas.map((l) => l.metodo).filter((m) => m !== 'sendChatAction'), ['sendPhoto', 'sendMessage'], 'si Telegram rechaza la foto, se envía el texto');
}
{
  const { llamadas } = await llamar('/tendencias', { graficos: false });
  ok(!llamadas.some((l) => l.metodo === 'sendPhoto') && llamadas.some((l) => l.metodo === 'sendMessage'), 'con graficos: false todo sale en texto');
  const fallo = await llamar('/proyectos', { renderizar: async () => { throw new Error('x'); } }, { sendMessage: { status: 500, descripcion: 'x' } });
  ok(fallo.r.codigo === 200, 'siempre 200 para que Telegram no reintente, incluso si todo falla');
}

// ── El gráfico se genera con los datos de ese momento, y el botón «Actualizar» lo refresca ──
{
  const AHORA = new Date('2026-11-19T22:45:00Z'); // 17:45 en Lima
  const datos1 = { ...DATOS, proyectos: [{ nombre: 'V7K', estado: 'atrasado', avance_pct: '40', fin: '2026-10-31', tareas_atrasadas: 1 }] };
  const datos2 = { ...DATOS, proyectos: [{ nombre: 'V7K', estado: 'en curso', avance_pct: '55', fin: '2026-10-31', tareas_atrasadas: 0 }] };
  const de = (d) => async (vista) => d[vista] ?? [];
  const svgDe = async (d, cmd = '/proyectos', extra = {}) => (await correr(cmd, { consultar: de(d), graficos: true, ahora: AHORA, ...extra })).find((a) => a.metodo === 'sendPhoto').imagen;
  const antes = await svgDe(datos1), despues = await svgDe(datos2);
  ok(antes !== despues && antes.includes('40 %') && despues.includes('55 %') && !despues.includes('40 %'), 'si cambian los datos (por ejemplo el avance en el Planner), el gráfico siguiente es distinto');
  ok(antes.includes('atrasado') && despues.includes('en curso'), 'y también cambia el estado que muestra');
  ok(antes.includes('gráfico de las 17:45') && antes.includes('Planner hace 5 h'), 'cada gráfico dice a qué hora se generó y qué tan viejos son los datos de la app');
  const consultas = [];
  await correr('/proyectos', { consultar: async (v, f) => { consultas.push(v); return DATOS[v] ?? []; }, graficos: true });
  await correr('/proyectos', { consultar: async (v, f) => { consultas.push(v); return DATOS[v] ?? []; }, graficos: true });
  ok(consultas.filter((v) => v === 'proyectos').length === 2, 'cada pedido consulta la base otra vez (no se guarda en caché)');

  // El botón «Actualizar» de cada gráfico
  const botonesDe = (acciones) => acciones.flatMap((a) => (a.cuerpo?.reply_markup?.inline_keyboard ?? []).flat());
  const esperados = { '/proyectos': 'c:proyectos:p1', '/stock': 'c:stock', '/mercado venta': 'c:mercado:venta', '/portales': 'c:portales', '/tendencias': 'c:tendencias' };
  for (const [cmd, dato] of Object.entries(esperados)) {
    const b = botonesDe(await correr(cmd, { graficos: true })).find((x) => x.text === '🔄 Actualizar');
    ok(b && b.callback_data === dato, `${cmd}: botón «Actualizar» que repite el mismo comando (${dato})`);
  }
  igual(botonesDe(await correr('/proyectos atrasado', { graficos: true })).find((x) => x.text === '🔄 Actualizar').callback_data, 'c:proyectos:atrasado p1', 'conserva el filtro y la página');

  // Tocarlo sobre un gráfico lo reemplaza en su mismo mensaje
  const sobreFoto = (data, mensaje = { photo: [{ file_id: 'x' }] }) => ({ callback_query: { id: 'cb7', data, message: { chat: { id: CHAT }, message_id: 88, ...mensaje } } });
  const r1 = await procesarUpdate(sobreFoto('c:proyectos:p1'), { consultar: de(datos2), permitidos: new Set([String(CHAT)]), hoy: '2026-11-19', graficos: true, ahora: AHORA });
  igual(r1[0].metodo, 'answerCallbackQuery', 'el botón se contesta primero');
  ok(r1[0].cuerpo.text.includes('17:45'), 'con un aviso emergente con la hora del gráfico nuevo');
  const e = r1.find((a) => a.metodo === 'editMessageMedia');
  ok(e && e.archivo === 'foto' && e.cuerpo.message_id === 88 && e.cuerpo.media.media === 'attach://foto' && e.cuerpo.media.type === 'photo', 'sobre una foto se edita la imagen del mismo mensaje');
  ok(e.imagen.includes('55 %') && e.cuerpo.media.caption.length <= 1024 && e.cuerpo.reply_markup.inline_keyboard.length >= 1, 'con el gráfico nuevo, el pie de foto y los botones');
  igual(e.alternativa.metodo, 'sendPhoto', 'si no se puede editar, se envía una foto nueva');
  ok(!r1.some((a) => a.metodo === 'sendMessage'), 'sin mensajes de más');
  const r2 = await procesarUpdate(sobreFoto('c:proyectos:p1', { text: 'menú' }), { consultar: de(datos2), permitidos: new Set([String(CHAT)]), hoy: '2026-11-19', graficos: true, ahora: AHORA });
  ok(r2.some((a) => a.metodo === 'sendPhoto') && !r2.some((a) => a.metodo === 'editMessageMedia'), 'sobre un mensaje de texto se envía la foto (no se puede editar texto a foto)');
  const r3 = await procesarUpdate(sobreFoto('c:alertas'), { consultar: de(DATOS), permitidos: new Set([String(CHAT)]), hoy: '2026-11-19', graficos: true, ahora: AHORA });
  ok(r3.some((a) => a.metodo === 'sendMessage') && !r3.some((a) => a.metodo === 'editMessageMedia'), 'si el nuevo contenido no es un gráfico, se envía un mensaje (no se puede convertir una foto en texto)');
  ok(!r3[0].cuerpo.text, 'y el aviso emergente solo sale cuando hay gráfico');

  // El manejador sube la imagen nueva con el archivo adjunto
  const llamadasEdicion = [];
  const fetchEd = (respuestas = {}) => async (url, init) => {
    const metodo = url.split('/').pop();
    llamadasEdicion.push({ metodo, init });
    const r = respuestas[metodo];
    return r ? { ok: false, status: r.status, json: async () => ({ ok: false, description: r.descripcion }) } : { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const enviar = async (respuestas) => { llamadasEdicion.length = 0; const rr = res(); await crearManejador({ env, consultar: de(datos2), fetchFn: fetchEd(respuestas) })({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': SECRETO }, body: sobreFoto('c:proyectos:p1') }, rr); return rr; };
  await enviar();
  const edicion = llamadasEdicion.find((l) => l.metodo === 'editMessageMedia');
  ok(edicion && edicion.init.body instanceof FormData, 'editMessageMedia se envía como formulario multipart');
  const f = edicion.init.body;
  igual([f.get('chat_id'), f.get('message_id')], [String(CHAT), '88'], 'con el chat y el mensaje a reemplazar');
  igual(JSON.parse(f.get('media')).media, 'attach://foto', 'el medio apunta al archivo adjunto «foto»');
  ok(f.get('foto') instanceof Blob && Buffer.from(await f.get('foto').arrayBuffer()).subarray(0, 8).equals(PNG), 'y el archivo adjunto es el PNG nuevo');
  ok(!llamadasEdicion.some((l) => l.metodo === 'sendPhoto'), 'si la edición funciona no se envía otra foto');
  await enviar({ editMessageMedia: { status: 400, descripcion: 'Bad Request: message to edit not found' } });
  igual(llamadasEdicion.map((l) => l.metodo).filter((m) => m !== 'answerCallbackQuery'), ['editMessageMedia', 'sendPhoto'], 'si no se puede editar, se envía una foto nueva');
  await enviar({ editMessageMedia: { status: 400, descripcion: 'Bad Request: message is not modified: specified new message content and reply markup are exactly the same' } });
  ok(!llamadasEdicion.some((l) => l.metodo === 'sendPhoto'), 'si el gráfico quedó igual, no se envía una foto repetida');
}

// ── Despliegue ───────────────────────────────────────────────────────────────────────────
{
  const raiz = path.join(aqui, '..');
  const vercel = JSON.parse(fs.readFileSync(path.join(raiz, 'vercel.json'), 'utf8'));
  for (const f of ['api/telegram.js', 'api/telegram-resumen.js']) ok(/assets\/fonts/.test(vercel.functions?.[f]?.includeFiles ?? ''), `vercel.json incluye las fuentes en ${f}`);
  const paquete = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
  ok(/^\d+\.\d+\.\d+$/.test(paquete.dependencies['@resvg/resvg-js'] ?? ''), 'resvg está fijado a una versión exacta como dependencia (corre en Vercel)');
  const codigo = fs.readFileSync(path.join(raiz, 'lib', 'imagenes.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  ok(/loadSystemFonts:\s*false/.test(codigo), 'solo usa las fuentes del proyecto (mismo resultado en cualquier equipo)');
}

console.log(`OK: gráficos de los bots — ${n} comprobaciones (SVG seguros, PNG con resvg, fotos con texto de respaldo y subida multipart)`);
