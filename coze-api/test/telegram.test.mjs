// Pruebas del bot de Telegram de consulta (lib/telegram.js y api/telegram.js). Todo con datos ficticios y sin red.
// Se cuida sobre todo: que solo respondan los chats autorizados, que el secreto del webhook se exija, que ningún dato
// llegue sin escapar y que el bot nunca pueda escribir en la base.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_MENSAJE, NOMBRES_COMANDOS, chatsPermitidos, crearLimitador, crearManejador, esc, estadoProyecto,
  parsearComando, parsearPropiedades, procesarUpdate, secretoValido, tecladoMenu,
} from '../lib/telegram.js';
import { VISTAS } from '../lib/vistas.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const igual = (a, b, m) => { n++; assert.deepEqual(a, b, m); };

const HOY = '2026-11-19';
const PERMITIDOS = chatsPermitidos('5878860971, -1001234567890');

// ── Datos ficticios por vista ────────────────────────────────────────────────────────────
const DATOS = {
  proyectos: [
    { proyecto_id: 'P1', nombre: 'Torre <Miraflores> & Co', responsable: 'Ana', estado: 'atrasado', avance_pct: '62.5', fin: '2026-11-01', tareas_atrasadas: 6 },
    { proyecto_id: 'P2', nombre: 'Edificio San Isidro', responsable: null, estado: 'en curso', avance_pct: '30', fin: '2027-01-15', tareas_atrasadas: 0 },
  ],
  'stock-bajo': [{ material: 'Acero 1/2"', categoria: 'Acero', cantidad: '15', minimo: '4200', unidad: 'kg', faltante: '4185' }],
  pedidos: [
    { pedido_id: 'OC-1040', proveedor: 'Aceros del Sur', obra: 'Torre', estado: 'enviada', llegada_estimada: '2026-11-17', cantidad_pedida: '100', cantidad_recibida: '40' },
    { pedido_id: 'OC-1041', proveedor: 'Cementos', obra: null, estado: 'pendiente', llegada_estimada: null, cantidad_pedida: '0', cantidad_recibida: '0' },
  ],
  propiedades: [
    { propiedad_id: 'X1', operacion: 'VENTA', titulo: '<script>alert(1)</script> Casa', precio: '250000', moneda: 'USD', precio_usd: '250000', distrito: 'Miraflores', dormitorios: '3', area: '180', url: 'https://portal.test/aviso/1' },
    { propiedad_id: 'X2', operacion: 'ALQUILER', titulo: 'Oficina', precio: '25', moneda: 'USD', precio_usd: '25', distrito: 'San Isidro', dormitorios: null, area: '90', url: 'javascript:alert(1)' },
  ],
  frescura: [{ app: 'planner', ultima_sync: '2026-11-19T10:00:00Z', hace_horas: '5' }, { app: 'scraper', ultima_sync: '2026-11-17T10:00:00Z', hace_horas: '60' }],
  'resumen-general': [{
    proyectos: { total: 10, atrasados: 3, en_curso: 4, por_iniciar: 1, terminados: 2, tareas_atrasadas: 18 },
    proyectos_atrasados: [{ nombre: 'Torre Miraflores', responsable: 'Ana', avance_pct: 62, fin: '2026-11-01', tareas_atrasadas: 6 }],
    proximos_hitos: [], stock: { materiales_con_minimo: 501, en_stock_bajo: 501, sin_existencias: 499 }, mayor_faltante: [],
    pedidos: { abiertos: 2 }, proximos_pedidos: [], propiedades: { total_catalogo: 5224, copiadas: 200 }, propiedades_por_portal: [],
    frescura: [{ app: 'planner', ultima_sync: 'x', hace_horas: 5 }, { app: 'mrp', ultima_sync: 'x', hace_horas: 6 }, { app: 'scraper', ultima_sync: 'x', hace_horas: 3 }],
  }],
  historial: [
    { dia: '2026-11-19', proyectos_atrasados: 3, tareas_atrasadas: 18, pedidos_vencidos: 1, materiales_sin_existencias: 499, propiedades_catalogo: 5224 },
    { dia: '2026-11-12', proyectos_atrasados: 2, tareas_atrasadas: 10, pedidos_vencidos: 0, materiales_sin_existencias: 499, propiedades_catalogo: 5000 },
  ],
};

/** consultar falso: registra qué se pidió y devuelve los datos ficticios. */
function crearConsulta(extra = {}) {
  const llamadas = [];
  const fn = async (vista, filtros = {}) => {
    llamadas.push({ vista, filtros });
    if (extra[vista] instanceof Error) throw extra[vista];
    return extra[vista] ?? DATOS[vista] ?? [];
  };
  fn.llamadas = llamadas;
  return fn;
}
const msg = (texto, chat = 5878860971) => ({ update_id: 1, message: { message_id: 1, chat: { id: chat, type: 'private' }, text: texto } });
const boton = (data, chat = 5878860971) => ({ update_id: 2, callback_query: { id: 'cb1', data, message: { message_id: 9, chat: { id: chat } } } });
const ejecutar = (update, consultar = crearConsulta()) => procesarUpdate(update, { consultar, permitidos: PERMITIDOS, hoy: HOY, panel: 'https://ejemplo.test' });
const envios = (acciones) => acciones.filter((a) => a.metodo === 'sendMessage');

// ── Utilidades ───────────────────────────────────────────────────────────────────────────
igual(esc('<b>&"x"</b>'), '&lt;b&gt;&amp;"x"&lt;/b&gt;', 'esc escapa < > &');
igual(esc(null), '', 'esc de null');
igual(esc(42), '42', 'esc de número');

ok(secretoValido('a'.repeat(40), 'a'.repeat(40)), 'secreto correcto');
ok(!secretoValido('b'.repeat(40), 'a'.repeat(40)), 'secreto distinto');
ok(!secretoValido(undefined, 'a'.repeat(40)), 'sin cabecera');
ok(!secretoValido('corto', 'corto'), 'un secreto esperado corto nunca vale');
ok(!secretoValido('x', undefined), 'sin secreto configurado');
ok(!secretoValido(['a'.repeat(40)], 'a'.repeat(40)), 'una cabecera repetida (arreglo) no vale');

igual([...chatsPermitidos('123456, -100987 ,abc,12;999999 ')].sort(), ['-100987', '123456', '999999'], 'chats permitidos: solo números válidos');
igual(chatsPermitidos(undefined).size, 0, 'sin variable, nadie está autorizado');
igual(chatsPermitidos('').size, 0, 'vacío, nadie');

{
  const limitar = crearLimitador({ max: 3, ventanaMs: 1000 });
  ok(limitar('a', 0) && limitar('a', 1) && limitar('a', 2), 'caben 3');
  ok(!limitar('a', 3), 'la cuarta se frena');
  ok(limitar('b', 3), 'otro chat no se ve afectado');
  ok(limitar('a', 1200), 'pasada la ventana vuelve a permitir');
}

// ── Análisis de comandos ─────────────────────────────────────────────────────────────────
igual(parsearComando('/proyectos atrasado'), { cmd: 'proyectos', args: 'atrasado' }, 'comando con argumento');
igual(parsearComando('/Proyectos@mi_bot   en   curso '), { cmd: 'proyectos', args: 'en curso' }, 'con @bot, mayúsculas y espacios');
igual(parsearComando('/ayuda'), { cmd: 'ayuda', args: '' }, 'sin argumentos');
igual(parsearComando('hola'), null, 'texto libre no es comando');
igual(parsearComando(''), null, 'vacío');
igual(parsearComando(undefined), null, 'indefinido');
ok(parsearComando('/materiales ' + 'x'.repeat(500)).args.length <= 60, 'el argumento se acota');
igual(parsearComando('/ ayuda'), null, 'barra sola no es comando');

igual(estadoProyecto('Atrasados'), 'atrasado', 'plural y mayúscula');
igual(estadoProyecto('en curso'), 'en curso', 'en curso');
igual(estadoProyecto('porIniciar'.toLowerCase()), 'por iniciar', 'sin espacio');
igual(estadoProyecto('torre'), undefined, 'un nombre no es un estado');

igual(parsearPropiedades('venta miraflores casa hasta 300000'), { operacion: 'VENTA', inmueble: 'Casa', precio_max_usd: '300000', distrito: 'miraflores' }, 'propiedades: venta + distrito + tipo + tope');
igual(parsearPropiedades('alquiler san isidro desde de 500'), { operacion: 'ALQUILER', precio_min_usd: '500', distrito: 'san isidro' }, 'propiedades: distrito de dos palabras y «desde de»');
igual(parsearPropiedades('Departamento hasta 120.000'), { inmueble: 'Departamento', precio_max_usd: '120000' }, 'puntos de millar');
igual(parsearPropiedades(''), {}, 'sin filtros');
igual(parsearPropiedades('hasta abc'), { distrito: 'abc' }, 'un tope que no es número no se pierde ni rompe');
igual(parsearPropiedades("miraflores'; DROP TABLE x;--").distrito.includes('drop'), true, 'texto raro pasa como texto (los parámetros van enlazados)');

// ── Autorización ─────────────────────────────────────────────────────────────────────────
{
  const consulta = crearConsulta();
  const a = await ejecutar(msg('/resumen', 999999), consulta);
  igual(consulta.llamadas.length, 0, 'un chat ajeno NO consulta la base');
  igual(a.length, 1, 'una sola respuesta');
  ok(a[0].cuerpo.text.includes('privado') && a[0].cuerpo.text.includes('999999'), 'le dice que es privado y su número de chat');
  ok(!a[0].cuerpo.reply_markup, 'sin botones para ajenos');
  ok(!JSON.stringify(a).includes('Torre'), 'ni una pizca de datos');

  const b = await ejecutar(boton('c:resumen', 999999), consulta);
  igual(b.length, 1, 'botón ajeno: una acción');
  igual(b[0].metodo, 'answerCallbackQuery', 'solo se contesta el botón');
  igual(consulta.llamadas.length, 0, 'tampoco consulta');

  igual(await ejecutar({}, consulta), [], 'update vacío no hace nada');
  igual(await ejecutar({ edited_message: { chat: { id: 5878860971 }, text: '/resumen' } }, consulta), [], 'tipos de update no soportados se ignoran');
  igual(await procesarUpdate(msg('/resumen'), { consultar: consulta, permitidos: new Set(), hoy: HOY }).then((x) => consulta.llamadas.length), 0, 'sin lista de permitidos nadie entra');
}

// ── Cada comando ─────────────────────────────────────────────────────────────────────────
for (const c of NOMBRES_COMANDOS) {
  const consulta = crearConsulta();
  const a = envios(await ejecutar(msg(`/${c}`), consulta));
  igual(a.length, 1, `/${c}: una respuesta`);
  const t = a[0].cuerpo.text;
  ok(typeof t === 'string' && t.length > 10 && t.length <= MAX_MENSAJE + 300, `/${c}: texto razonable (${t.length})`);
  ok(a[0].cuerpo.reply_markup?.inline_keyboard?.length >= 1, `/${c}: con botones`);
  ok(a[0].cuerpo.disable_web_page_preview === true, `/${c}: sin vista previa de enlaces`);
  ok(!/undefined|NaN|\[object/.test(t), `/${c}: sin undefined/NaN/[object]`);
  ok(consulta.llamadas.every((l) => Object.hasOwn(VISTAS, l.vista)), `/${c}: solo pide vistas que existen`);
}

{
  const a = envios(await ejecutar(msg('/proyectos')));
  const t = a[0].cuerpo.text;
  ok(a[0].cuerpo.parse_mode === 'HTML', 'proyectos va en HTML');
  ok(t.includes('Torre &lt;Miraflores&gt; &amp; Co'), 'el nombre del proyecto va ESCAPADO');
  ok(!t.includes('<Miraflores>'), 'nunca queda el < crudo de un dato');
  ok(/6[23] %/.test(t) && t.includes('atrasado'), 'avance y estado');
  ok(/6 tareas atrasadas/.test(t), 'tareas atrasadas');

  const consulta = crearConsulta();
  await ejecutar(msg('/proyectos atrasados'), consulta);
  igual(consulta.llamadas[0].filtros.estado, 'atrasado', 'el estado va como filtro');
  await ejecutar(msg('/proyectos torre'), consulta);
  igual(consulta.llamadas[1].filtros.q, 'torre', 'un texto va como búsqueda');
}
{
  const t = envios(await ejecutar(msg('/materiales')))[0].cuerpo.text;
  ok(t.includes('Acero 1/2"') && t.includes('4.185') || t.includes('4185') || t.includes('4,185'), 'material y faltante');
  ok(t.includes('Inventario casi sin cargar'), 'avisa que el inventario está casi sin cargar (499 de 501)');
  const consulta = crearConsulta();
  await ejecutar(msg('/materiales cemento'), consulta);
  igual(consulta.llamadas.find((l) => l.vista === 'stock-bajo').filtros.q, 'cemento', 'búsqueda de material');
}
{
  const t = envios(await ejecutar(msg('/pedidos')))[0].cuerpo.text;
  ok(t.includes('OC-1040') && t.includes('⏰'), 'el pedido con llegada vencida se marca');
  ok(t.includes('40 %'), 'porcentaje recibido');
  ok(t.includes('sin fecha'), 'pedido sin fecha');
  const consulta = crearConsulta();
  await ejecutar(msg('/pedidos parcial'), consulta);
  igual(consulta.llamadas[0].filtros.estado, 'parcial', 'estado de pedido');
}
{
  const t = envios(await ejecutar(msg('/propiedades venta miraflores')))[0].cuerpo.text;
  ok(t.includes('&lt;script&gt;'), 'el título del aviso va escapado');
  ok(!t.includes('<script>'), 'sin <script> crudo');
  ok(t.includes('href="https://portal.test/aviso/1"'), 'enlace seguro como vínculo');
  ok(!t.includes('javascript:'), 'un enlace javascript: se descarta');
  ok(t.includes('precio dudoso'), 'alquiler de 25 USD se marca como dudoso');
  const consulta = crearConsulta();
  await ejecutar(msg('/propiedades venta miraflores casa hasta 300000'), consulta);
  igual(consulta.llamadas[0].filtros, { operacion: 'VENTA', inmueble: 'Casa', precio_max_usd: '300000', distrito: 'miraflores', limite: '10' }, 'filtros de propiedades');
}
{
  const t = envios(await ejecutar(msg('/frescura')))[0].cuerpo.text;
  ok(t.includes('Planner') && t.includes('Scraper'), 'apps');
  ok(t.includes('🟡') && t.includes('✅'), 'hace 60 h sale en amarillo y hace 5 h en verde');
}
{
  const t = envios(await ejecutar(msg('/tendencias')))[0].cuerpo.text;
  ok(t.includes('Proyectos atrasados') && t.includes('2 → 3'), 'tendencia de proyectos atrasados');
  const sin = envios(await ejecutar(msg('/tendencias'), crearConsulta({ historial: [] })))[0].cuerpo.text;
  ok(sin.includes('Todavía no hay'), 'sin historial lo dice');
  const roto = envios(await ejecutar(msg('/tendencias'), crearConsulta({ historial: new Error('x') })))[0].cuerpo.text;
  ok(roto.includes('Todavía no hay'), 'si el historial falla, no rompe');
}
{
  const a = envios(await ejecutar(msg('/resumen')))[0].cuerpo;
  ok(!a.parse_mode, 'el resumen va en texto plano (lleva nombres de proyectos)');
  ok(a.text.includes('Torre Miraflores'), 'el resumen incluye lo urgente');
}

// ── Mensajes sin comando, comandos raros y botones ───────────────────────────────────────
{
  const libre = envios(await ejecutar(msg('hola, ¿cómo van los proyectos?')))[0].cuerpo;
  ok(libre.text.includes('/ayuda'), 'texto libre: orienta hacia /ayuda');
  const raro = envios(await ejecutar(msg('/borrartodo')))[0].cuerpo.text;
  ok(raro.includes('No conozco') && raro.includes('/ayuda'), 'comando desconocido');
  ok(!envios(await ejecutar(msg('/<b>x')))[0]?.cuerpo?.parse_mode, 'el eco de un comando raro no va en HTML');
  const foto = envios(await ejecutar({ message: { chat: { id: 5878860971 }, photo: [{}] } }))[0].cuerpo.text;
  ok(foto.includes('texto'), 'mensajes que no son texto');

  const b = await ejecutar(boton('c:proyectos:atrasado'));
  igual(b[0].metodo, 'answerCallbackQuery', 'el botón se contesta primero (quita el relojito)');
  ok(b[1].cuerpo.text.includes('Proyectos'), 'y luego se envía la respuesta');
  const consulta = crearConsulta();
  await ejecutar(boton('c:proyectos:en curso'), consulta);
  igual(consulta.llamadas[0].filtros.estado, 'en curso', 'el botón de «En curso» filtra');
  igual(envios(await ejecutar(boton('x:raro'))).length, 0, 'datos de botón desconocidos se ignoran');
  igual(envios(await ejecutar(boton('c:' + 'a'.repeat(100)))).length, 0, 'datos de botón demasiado largos se ignoran');
  ok(envios(await ejecutar(boton('c:borrar')))[0].cuerpo.text.includes('No conozco'), 'botón con comando desconocido');
}

// ── Errores y límite de tamaño ───────────────────────────────────────────────────────────
{
  const falla = crearConsulta({ proyectos: new Error('connection to host-secreto.neon.tech refused password=abc') });
  const a = envios(await ejecutar(msg('/proyectos'), falla));
  igual(a.length, 1, 'si la base falla, se responde igual');
  ok(a[0].cuerpo.text.includes('No pude leer'), 'mensaje amable');
  ok(!/neon|password|secreto/i.test(JSON.stringify(a)), 'el detalle del error NUNCA llega al chat');

  const muchos = Array.from({ length: 200 }, (_, i) => ({ proyecto_id: `P${i}`, nombre: `Proyecto número ${i} con un nombre bastante largo para ocupar espacio`, responsable: 'Responsable con nombre largo', estado: 'en curso', avance_pct: '50', fin: '2027-02-01', tareas_atrasadas: 3 }));
  const grande = envios(await ejecutar(msg('/proyectos'), crearConsulta({ proyectos: muchos })))[0].cuerpo.text;
  ok(grande.length <= 4096, `con 200 proyectos el mensaje cabe en Telegram (${grande.length})`);
  const largo = Array.from({ length: 100 }, (_, i) => ({ material: `Material ${i} `.repeat(6), categoria: 'Categoría', cantidad: '1', minimo: '9', unidad: 'u', faltante: '8' }));
  const tm = envios(await ejecutar(msg('/materiales'), crearConsulta({ 'stock-bajo': largo })))[0].cuerpo.text;
  ok(tm.length <= 4096, `con 100 materiales largos cabe (${tm.length})`);
  ok(/y \d+ más/.test(tm), 'avisa cuántos faltaron');
}

// ── Teclado ──────────────────────────────────────────────────────────────────────────────
{
  const datos = tecladoMenu().inline_keyboard.flat().map((b) => b.callback_data);
  ok(datos.every((d) => /^c:[a-z]+(:[\w ]{1,30})?$/.test(d) && d.length <= 64), 'callback_data válidos y de ≤64 bytes');
  ok(datos.every((d) => NOMBRES_COMANDOS.includes(d.slice(2))), 'cada botón del menú corresponde a un comando');
}

// ── El manejador del webhook ─────────────────────────────────────────────────────────────
const SECRETO = 's'.repeat(40);
const TOKEN = '1234567890:AAExampleTokenQueNoEsReal_abcdefghijk';
const ENTORNO = { TELEGRAM_BOT_COMANDOS_TOKEN: TOKEN, TELEGRAM_WEBHOOK_SECRET: SECRETO, TELEGRAM_CHATS_PERMITIDOS: '5878860971' };
const resFalsa = () => { const r = { cabeceras: {}, codigo: 0, cuerpo: null, setHeader(k, v) { this.cabeceras[k] = v; }, status(c) { this.codigo = c; return this; }, json(c) { this.cuerpo = c; return this; } }; return r; };
const reqFalsa = (metodo, secreto, cuerpo) => ({ method: metodo, headers: secreto === undefined ? {} : { 'x-telegram-bot-api-secret-token': secreto }, body: cuerpo });

{
  const salidas = [];
  const fetchFalso = async (url, init) => { salidas.push({ url, cuerpo: JSON.parse(init.body) }); return { ok: true, status: 200 }; };
  const crear = (env = ENTORNO, extra = {}) => crearManejador({ env, consultar: crearConsulta(), fetchFn: fetchFalso, ...extra });

  let r = resFalsa(); await crear()(reqFalsa('GET', SECRETO, msg('/resumen')), r);
  igual(r.codigo, 405, 'GET → 405'); igual(r.cabeceras.Allow, 'POST', 'Allow: POST');
  igual(r.cabeceras['Cache-Control'], 'no-store', 'sin caché');

  r = resFalsa(); await crear({})(reqFalsa('POST', SECRETO, msg('/resumen')), r);
  igual(r.codigo, 503, 'sin configurar → 503');
  for (const faltante of Object.keys(ENTORNO)) {
    r = resFalsa(); const env = { ...ENTORNO }; delete env[faltante];
    await crear(env)(reqFalsa('POST', SECRETO, msg('/resumen')), r);
    igual(r.codigo, 503, `sin ${faltante} → 503`);
  }

  r = resFalsa(); await crear()(reqFalsa('POST', undefined, msg('/resumen')), r);
  igual(r.codigo, 401, 'sin secreto → 401');
  r = resFalsa(); await crear()(reqFalsa('POST', 'x'.repeat(40), msg('/resumen')), r);
  igual(r.codigo, 401, 'secreto equivocado → 401');
  igual(salidas.length, 0, 'sin secreto válido no se envía nada a Telegram');

  r = resFalsa(); await crear()(reqFalsa('POST', SECRETO, msg('/frescura')), r);
  igual(r.codigo, 200, 'con secreto → 200');
  igual(salidas.length, 1, 'una llamada a Telegram');
  ok(salidas[0].url === `https://api.telegram.org/bot${TOKEN}/sendMessage`, 'va a sendMessage de Telegram');
  igual(salidas[0].cuerpo.chat_id, 5878860971, 'al chat que escribió');
  ok(!JSON.stringify(r.cuerpo).includes(TOKEN), 'el token nunca vuelve en la respuesta');

  salidas.length = 0;
  r = resFalsa(); await crear()(reqFalsa('POST', SECRETO, JSON.stringify(msg('/frescura'))), r);
  igual(r.codigo, 200, 'cuerpo como texto JSON también sirve'); igual(salidas.length, 1, 'y responde');
  salidas.length = 0;
  r = resFalsa(); await crear()(reqFalsa('POST', SECRETO, '{no es json'), r);
  igual(r.codigo, 200, 'JSON inválido → 200 sin hacer nada (Telegram no debe reintentar)'); igual(salidas.length, 0, 'sin envíos');
  r = resFalsa(); await crear()(reqFalsa('POST', SECRETO, undefined), r);
  igual(r.codigo, 200, 'sin cuerpo → 200');

  // chat no autorizado a través del manejador
  salidas.length = 0;
  r = resFalsa(); await crear()(reqFalsa('POST', SECRETO, msg('/resumen', 111222333)), r);
  ok(salidas.length === 1 && salidas[0].cuerpo.text.includes('privado'), 'ajeno: solo el aviso de privado');

  // si Telegram falla, igual se responde 200 y no se filtra el token a los registros
  const registros = [];
  const original = console.error; console.error = (...a) => registros.push(a.join(' '));
  try {
    const falla = crearManejador({ env: ENTORNO, consultar: crearConsulta(), fetchFn: async () => { throw new Error(`fallo en https://api.telegram.org/bot${TOKEN}/sendMessage`); } });
    r = resFalsa(); await falla(reqFalsa('POST', SECRETO, msg('/frescura')), r);
    igual(r.codigo, 200, 'Telegram caído → 200 igualmente');
    const mala = crearManejador({ env: ENTORNO, consultar: crearConsulta(), fetchFn: async () => ({ ok: false, status: 500 }) });
    r = resFalsa(); await mala(reqFalsa('POST', SECRETO, msg('/frescura')), r);
    igual(r.codigo, 200, 'Telegram responde 500 → 200 igualmente');
  } finally { console.error = original; }
  ok(registros.length >= 2 && !registros.join('\n').includes(TOKEN) && !registros.join('\n').includes('AAExample'), 'los registros no contienen el token');

  // límite por chat
  salidas.length = 0;
  const limitado = crearManejador({ env: ENTORNO, consultar: crearConsulta(), fetchFn: fetchFalso, limitar: crearLimitador({ max: 2, ventanaMs: 60000 }) });
  for (let i = 0; i < 5; i++) { r = resFalsa(); await limitado(reqFalsa('POST', SECRETO, msg('/frescura')), r); igual(r.codigo, 200, `ráfaga ${i}: siempre 200`); }
  igual(salidas.length, 2, 'una ráfaga de 5 solo produce 2 respuestas');
}

// ── Estáticas: solo lectura y sin secretos ───────────────────────────────────────────────
{
  const lib = fs.readFileSync(path.join(aqui, '..', 'lib', 'telegram.js'), 'utf8');
  const api = fs.readFileSync(path.join(aqui, '..', 'api', 'telegram.js'), 'utf8');
  const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const codigo = sinComentarios(lib) + sinComentarios(api);
  ok(!/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT)\b/.test(codigo), 'el bot no contiene SQL de escritura');
  ok(!/DATABASE_URL(?!_READER)/.test(codigo), 'el webhook solo usa la cadena de solo lectura');
  ok(api.includes('DATABASE_URL_READER'), 'usa DATABASE_URL_READER');
  ok(!/\d{8,}:[A-Za-z0-9_-]{30,}/.test(lib + api), 'ningún token pegado en el código');
  ok(!/eval\(|new Function|child_process/.test(codigo), 'sin ejecución dinámica ni procesos');
  const mod = await import('../api/telegram.js');
  ok(typeof mod.default === 'function', 'api/telegram.js exporta el manejador');
  const r = resFalsa(); await mod.default(reqFalsa('GET'), r);
  igual(r.codigo, 405, 'el endpoint real responde 405 a un GET');
  const r2 = resFalsa(); const guardado = { ...process.env };
  delete process.env.TELEGRAM_BOT_COMANDOS_TOKEN;
  await mod.default(reqFalsa('POST', SECRETO, msg('/resumen')), r2);
  igual(r2.codigo, 503, 'el endpoint real sin variables → 503');
  Object.assign(process.env, guardado);
}

// ── Script que instala el webhook ────────────────────────────────────────────────────────
{
  const { URL_DEFECTO, borrar, comandosDelMenu, cuerpoWebhook, info, instalar, problemaConfiguracion } = await import('../scripts/telegram-webhook.mjs');
  igual(comandosDelMenu().map((c) => c.command), NOMBRES_COMANDOS, 'el menú de Telegram lista los mismos comandos');
  ok(comandosDelMenu().every((c) => /^[a-z_]{1,32}$/.test(c.command) && c.description.length >= 3 && c.description.length <= 256), 'comandos y descripciones válidos para Telegram');
  const cw = cuerpoWebhook(URL_DEFECTO, SECRETO);
  igual(cw.allowed_updates, ['message', 'callback_query'], 'solo mensajes y botones');
  ok(cw.secret_token === SECRETO && cw.drop_pending_updates === true, 'con secreto y sin pendientes viejos');
  ok(problemaConfiguracion({ token: TOKEN, secreto: SECRETO, url: URL_DEFECTO }) === null, 'configuración válida');
  ok(problemaConfiguracion({ token: 'x', secreto: SECRETO, url: URL_DEFECTO }), 'token inválido se detecta');
  ok(problemaConfiguracion({ token: TOKEN, secreto: 'corto', url: URL_DEFECTO }), 'secreto corto se detecta');
  ok(problemaConfiguracion({ token: TOKEN, secreto: SECRETO, url: 'http://v1k.test/api/telegram' }), 'una dirección sin https se detecta');
  ok(problemaConfiguracion({ token: TOKEN, secreto: SECRETO, url: 'https://otro.test/otra-ruta' }), 'una ruta distinta se detecta');

  const llamadas = [];
  const fetchFalso = async (url, init) => {
    const metodo = url.split('/').pop();
    llamadas.push({ metodo, cuerpo: JSON.parse(init.body) });
    const resultado = { getWebhookInfo: { url: URL_DEFECTO, pending_update_count: 2, last_error_message: 'Wrong response' }, getMe: { username: 'v1k_consultas_bot' } }[metodo] ?? true;
    return { ok: true, status: 200, json: async () => ({ ok: true, result: resultado }) };
  };
  ok((await instalar({ token: TOKEN, secreto: SECRETO, fetchFn: fetchFalso })).includes('instalado'), 'instalar responde');
  igual(llamadas.map((l) => l.metodo), ['setWebhook', 'setMyCommands'], 'instala el webhook y el menú');
  const texto = await info({ token: TOKEN, fetchFn: fetchFalso });
  ok(texto.includes('@v1k_consultas_bot') && texto.includes('pendientes: 2') && texto.includes('Wrong response'), 'info muestra bot, pendientes y último error');
  ok(!texto.includes(TOKEN) && !texto.includes(SECRETO), 'info nunca muestra el token ni el secreto');
  ok((await borrar({ token: TOKEN, fetchFn: fetchFalso })).includes('borrado'), 'borrar responde');
  let fallo = null;
  try { await instalar({ token: TOKEN, secreto: SECRETO, fetchFn: async () => ({ ok: false, status: 401, json: async () => ({ ok: false, description: 'Unauthorized' }) }) }); } catch (e) { fallo = e.message; }
  ok(fallo && fallo.includes('Unauthorized') && !fallo.includes(TOKEN), 'si Telegram rechaza, el error no incluye el token');
  let sinNada = null;
  try { await instalar({ token: undefined, secreto: undefined, fetchFn: fetchFalso }); } catch (e) { sinNada = e.message; }
  ok(sinNada, 'sin variables no se llama a Telegram');
  igual(llamadas.length, 5, 'solo hubo las 5 llamadas válidas (2 de instalar, 2 de info, 1 de borrar): la configuración inválida no llamó a Telegram');
}

console.log(`OK: bot de Telegram — ${n} comprobaciones (comandos, autorización, secreto del webhook, escape de datos, errores y script del webhook)`);
