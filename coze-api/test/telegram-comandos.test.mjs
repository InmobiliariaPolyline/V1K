// Pruebas de los comandos y botones de los bots de Telegram: qué responde cada uno (tablas, tarjetas, contexto), la navegación con botones
// (páginas, filtros, detalle) y qué entiende cada bot. Todo con datos ficticios y sin red.
import assert from 'node:assert/strict';
import { VISTAS } from '../lib/vistas.js';
import { CATALOGO, COMANDOS_DEL_BOT, MENU_DE_COMANDOS, NOMBRES_COMANDOS, argSeguro, resolverComando, tecladoMenu } from '../lib/telegram-comandos.js';
import { procesarUpdate } from '../lib/telegram.js';
import { diaCorto, paginaDe, pieDatos, recortar, separarPagina, tablaPre } from '../lib/telegram-diseno.js';

let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const igual = (a, b, m) => { n++; assert.deepEqual(a, b, m); };

const HOY = '2026-11-19';
const CHAT = 424242424;
const PERMITIDOS = new Set([String(CHAT)]);

// ── Datos ficticios ──────────────────────────────────────────────────────────────────────
const proyectos = Array.from({ length: 23 }, (_, i) => ({
  proyecto_id: `P${i}`, nombre: i === 0 ? 'Torre <Miraflores> & Co' : `Proyecto ${i}`, responsable: i % 2 ? 'Ana' : 'Luis',
  estado: ['atrasado', 'en curso', 'por iniciar', 'terminado'][i % 4], avance_pct: String(i * 4), inicio: '2026-01-10', fin: i % 4 === 0 ? '2026-11-01' : '2027-02-15',
  tareas_total: 10 + i, tareas_atrasadas: i % 4 === 0 ? 3 : 0, proximo_hito: 'Entrega', proximo_hito_fecha: '2026-11-25', actualizado_en: '2026-11-18T10:00:00Z',
}));
const materiales = Array.from({ length: 11 }, (_, i) => ({ material: i === 0 ? 'Acero 1/2" <A>' : `Material ${i}`, categoria: i % 2 ? 'Cemento' : 'Acero', cantidad: String(i), minimo: '100', unidad: 'kg', faltante: String(100 - i) }));
const pedidos = [
  { pedido_id: 'OC-1', proveedor: 'Aceros del Sur', obra: 'Torre', estado: 'enviada', llegada_estimada: '2026-11-15', cantidad_pedida: '100', cantidad_recibida: '40' },
  { pedido_id: 'OC-2', proveedor: 'Cementos', obra: 'Casa', estado: 'pendiente', llegada_estimada: '2026-11-21', cantidad_pedida: '10', cantidad_recibida: '0' },
  { pedido_id: 'OC-3', proveedor: 'Ladrillos', obra: null, estado: 'parcial', llegada_estimada: null, cantidad_pedida: '0', cantidad_recibida: '0' },
  { pedido_id: 'OC-4', proveedor: 'Pinturas', obra: 'Torre', estado: 'pendiente', llegada_estimada: '2027-01-10', cantidad_pedida: '5', cantidad_recibida: '0' },
];
const hitos = [{ fecha: '2026-11-19T00:00:00.000Z', descripcion: 'Recepción de <acero>', proyecto: 'Torre' }, { fecha: '2026-11-21', descripcion: 'Entrega', proyecto: 'Casa' }, { fecha: '2026-12-05', descripcion: 'Cierre', proyecto: null }];
const propiedades = [
  { propiedad_id: 'X1', operacion: 'VENTA', titulo: '<b>Casa</b> en Miraflores', precio: '250000', moneda: 'USD', precio_usd: '250000', distrito: 'Miraflores', dormitorios: '3', area: '180', url: 'https://portal.test/1' },
  { propiedad_id: 'X2', operacion: 'VENTA', titulo: 'Departamento', precio: '150000', moneda: 'USD', precio_usd: '150000', distrito: 'Surco', dormitorios: '2', area: '90', url: 'javascript:alert(1)' },
  { propiedad_id: 'X3', operacion: 'ALQUILER', titulo: 'Oficina', precio: '25', moneda: 'USD', precio_usd: '25', distrito: 'San Isidro', dormitorios: null, area: '90', url: null },
  ...Array.from({ length: 8 }, (_, i) => ({ propiedad_id: `Y${i}`, operacion: 'ALQUILER', titulo: `Aviso ${i}`, precio: '1200', moneda: 'USD', precio_usd: '1200', distrito: 'Lince', dormitorios: '2', area: '60', url: null })),
];
const DATOS = {
  proyectos, 'stock-bajo': materiales, pedidos, hitos, propiedades,
  frescura: [{ app: 'planner', ultima_sync: '2026-11-19T10:00:00Z', hace_horas: '30' }, { app: 'mrp', ultima_sync: '2026-11-19T12:00:00Z', hace_horas: '5' }, { app: 'scraper', ultima_sync: '2026-11-19T11:00:00Z', hace_horas: '80' }],
  'stock-categorias': [{ categoria: 'Acero y hierro (varilla corrugada)', materiales: 19, en_stock_bajo: 19, sin_existencias: 18, faltante_total: 22600 }, { categoria: 'Cemento', materiales: 4, en_stock_bajo: 2, sin_existencias: 1, faltante_total: 300 }],
  'propiedades-distritos': [
    { distrito: 'Miraflores', operacion: 'VENTA', avisos: 12, precio_mediano_usd: 318700, precio_min_usd: 1, precio_max_usd: 9 }, { distrito: 'Santiago de Surco', operacion: 'ALQUILER', avisos: 36, precio_mediano_usd: 942, precio_min_usd: 1, precio_max_usd: 9 },
    { distrito: 'San Isidro', operacion: 'ALQUILER', avisos: 28, precio_mediano_usd: 2100, precio_min_usd: 1, precio_max_usd: 9 }],
  'propiedades-resumen': [{ portal: 'infocasas', operacion: 'VENTA', total: 2968, ultima_vista: '2026-11-16T00:00:00Z' }, { portal: 'urbania', operacion: 'ALQUILER', total: 25, ultima_vista: '2026-10-29T00:00:00Z' }],
  historial: [
    { dia: '2026-11-19', proyectos_atrasados: 3, tareas_atrasadas: 18, pedidos_vencidos: 1, materiales_sin_existencias: 499, propiedades_catalogo: 5224, precio_mediano_venta_usd: 260000, precio_mediano_alquiler_usd: 1300 },
    { dia: '2026-11-12', proyectos_atrasados: 2, tareas_atrasadas: 10, pedidos_vencidos: 0, materiales_sin_existencias: 499, propiedades_catalogo: 5000, precio_mediano_venta_usd: 250000, precio_mediano_alquiler_usd: 1300 }],
  'resumen-general': [{
    proyectos: { total: 23, atrasados: 6, en_curso: 6, por_iniciar: 6, terminados: 5, tareas_atrasadas: 18 },
    proyectos_atrasados: [{ nombre: 'V2K', responsable: 'Ana', avance_pct: 0, fin: '2026-10-31', tareas_atrasadas: 0 }],
    proximos_hitos: [{ fecha: '2026-11-21', descripcion: 'Recepción de acero', proyecto: 'Torre' }],
    stock: { materiales_con_minimo: 501, en_stock_bajo: 501, sin_existencias: 499 }, mayor_faltante: [{ material: 'Acero', categoria: 'Acero', unidad: 'kg', cantidad: 15, minimo: 4200, faltante: 4185 }],
    pedidos: { abiertos: 4 }, proximos_pedidos: [{ pedido_id: 'OC-1', proveedor: 'Aceros', obra: 'Torre', estado: 'enviada', llegada_estimada: '2026-11-15' }],
    propiedades: { total_catalogo: 5224, copiadas: 200 }, propiedades_por_portal: [],
    frescura: [{ app: 'planner', ultima_sync: 'x', hace_horas: 30 }, { app: 'mrp', ultima_sync: 'x', hace_horas: 5 }, { app: 'scraper', ultima_sync: 'x', hace_horas: 80 }],
  }],
};
const crearConsulta = (extra = {}) => {
  const llamadas = [];
  const fn = async (vista, filtros = {}) => { llamadas.push({ vista, filtros }); if (extra[vista] instanceof Error) throw extra[vista]; return extra[vista] ?? DATOS[vista] ?? []; };
  fn.llamadas = llamadas;
  return fn;
};
const msg = (texto, chat = CHAT) => ({ message: { message_id: 1, chat: { id: chat }, from: { first_name: 'Ana' }, text: texto } });
const boton = (data, extra = {}) => ({ callback_query: { id: 'cb', data, message: { chat: { id: CHAT }, message_id: 5, text: 'menú', ...extra } } });
const correr = async (update, { bot = 'consultas', consultar = crearConsulta() } = {}) => procesarUpdate(update, { consultar, permitidos: PERMITIDOS, hoy: HOY, panel: 'https://ejemplo.test', hora: 9, bot });
const respuesta = (acciones) => acciones.find((a) => a.metodo === 'sendMessage' || a.metodo === 'editMessageText')?.cuerpo;
const textoDe = async (cmd, opciones) => respuesta(await correr(msg(cmd), opciones)).text;

/** Todas las etiquetas HTML que Telegram acepta deben abrirse y cerrarse por igual. */
const equilibrado = (html) => ['b', 'i', 'code', 'pre', 'blockquote', 'a'].every((t) => (html.match(new RegExp(`<${t}[ >]`, 'g')) ?? []).length === (html.match(new RegExp(`</${t}>`, 'g')) ?? []).length);
const botonesDe = (cuerpo) => (cuerpo.reply_markup?.inline_keyboard ?? []).flat();

// ── Catálogo ─────────────────────────────────────────────────────────────────────────────
igual(NOMBRES_COMANDOS.length, CATALOGO.length, 'cada comando del catálogo está en el menú');
ok(CATALOGO.length >= 16, `hay ${CATALOGO.length} comandos`);
for (const nuevo of ['alertas', 'agenda', 'proyecto', 'stock', 'mercado', 'portales', 'buscar', 'guia']) ok(NOMBRES_COMANDOS.includes(nuevo), `existe /${nuevo}`);
igual([resolverComando('ahora'), resolverComando('HOY'), resolverComando('semana'), resolverComando('datos'), resolverComando('menu'), resolverComando('guía'), resolverComando('nada')], ['resumen', 'resumen', 'tendencias', 'frescura', 'ayuda', 'guia', undefined], 'alias de los comandos');
for (const bot of Object.keys(MENU_DE_COMANDOS)) {
  ok(MENU_DE_COMANDOS[bot].every((c) => /^[a-z_]{1,32}$/.test(c.command) && c.description.length >= 3 && c.description.length <= 256), `menú «/» válido para Telegram (${bot})`);
  ok(new Set(MENU_DE_COMANDOS[bot].map((c) => c.command)).size === MENU_DE_COMANDOS[bot].length, `sin comandos repetidos (${bot})`);
}
igual(MENU_DE_COMANDOS.resumen.map((c) => c.command), ['ahora', 'alertas', 'agenda', 'semana', 'guia', 'ayuda'], 'el bot del resumen tiene un briefing de seis comandos');
ok(COMANDOS_DEL_BOT.resumen.every((c) => COMANDOS_DEL_BOT.consultas.includes(c)), 'lo del resumen es un subconjunto de lo de consultas');
ok(CATALOGO.every((c) => c.icono && c.titulo && c.grupo && c.desc), 'cada comando tiene icono, título, grupo y descripción');

// ── Piezas del diseño ────────────────────────────────────────────────────────────────────
igual(recortar('Acero y hierro (varilla)', 12), 'Acero y hie…', 'recorta con puntos suspensivos');
igual(recortar('  a   b  ', 10), 'a b', 'junta espacios');
{
  const t = tablaPre([{ titulo: 'Nombre', ancho: 8 }, { titulo: 'N', ancho: 3, alinea: 'der' }], [['Ana <1>', '5'], ['Un nombre muy largo', '123']]);
  const lineas = t.replace('<pre>', '').replace('</pre>', '').split('\n');
  ok(lineas.every((l) => l.replace(/&lt;|&gt;|&amp;/g, '.').length === lineas[0].replace(/&lt;|&gt;|&amp;/g, '.').length), 'todas las filas de la tabla miden lo mismo');
  ok(t.includes('Ana &lt;1&gt;') && !t.includes('<1>'), 'la tabla escapa los datos');
  ok(t.includes('Un nomb…'), 'y recorta lo que no cabe');
}
igual(paginaDe([1, 2, 3, 4, 5], 2, 2), { filas: [3, 4], pagina: 2, paginas: 3, total: 5, desde: 3, hasta: 4 }, 'página 2 de 3');
igual(paginaDe([1, 2, 3], 99, 2).pagina, 2, 'una página que no existe se acota');
igual(paginaDe([], 1, 5), { filas: [], pagina: 1, paginas: 1, total: 0, desde: 0, hasta: 0 }, 'lista vacía');
igual([separarPagina('atrasado p2'), separarPagina('p3'), separarPagina('hospital'), separarPagina('')], [{ texto: 'atrasado', pagina: 2 }, { texto: '', pagina: 3 }, { texto: 'hospital', pagina: 1 }, { texto: '', pagina: 1 }], 'separa el texto y la página');
igual(argSeguro('Torre <San-Isidro> Ñandú & Co.'), 'torre san isidro nandu co', 'el dato de un botón solo lleva letras, números y espacios');
ok(argSeguro('x'.repeat(100)).length <= 28, 'y no pasa de 28 caracteres');
igual(diaCorto('2026-11-20'), 'vie 20/11', 'día corto');
ok(pieDatos([{ app: 'mrp', hace_horas: '30' }], ['mrp'], { estado: () => 'aviso', haceHoras: (h) => `hace ${h} h` }).includes('pueden estar desactualizados'), 'el pie avisa si hay datos de más de un día');
igual(pieDatos([], ['mrp'], { estado: () => 'ok', haceHoras: () => '' }), '', 'sin datos de frescura no hay pie');

// ── Cada comando, en los dos bots ────────────────────────────────────────────────────────
const casos = ['/resumen', '/alertas', '/agenda', '/agenda 30', '/proyectos', '/proyectos atrasado', '/proyectos p2', '/proyecto Proyecto 3', '/proyecto torre', '/proyecto zzz', '/proyecto',
  '/materiales', '/materiales p2', '/stock', '/pedidos', '/pedidos vencidos', '/pedidos parcial', '/propiedades', '/propiedades venta miraflores', '/propiedades p2', '/mercado', '/mercado venta', '/mercado alquiler',
  '/portales', '/buscar torre', '/buscar zz', '/buscar', '/frescura', '/tendencias', '/guia', '/ayuda'];
const permitidosPorBot = { consultas: casos, resumen: ['/ahora', '/alertas', '/agenda', '/semana', '/guia', '/ayuda'] };
for (const [bot, lista] of Object.entries(permitidosPorBot)) {
  for (const c of lista) {
    const consulta = crearConsulta();
    const cuerpo = respuesta(await correr(msg(c), { bot, consultar: consulta }));
    ok(cuerpo && cuerpo.parse_mode === 'HTML', `${bot} ${c}: responde en HTML`);
    ok(cuerpo.text.length <= 4096, `${bot} ${c}: cabe en un mensaje (${cuerpo.text.length})`);
    ok(equilibrado(cuerpo.text), `${bot} ${c}: etiquetas HTML equilibradas`);
    ok(!/undefined|NaN|\[object|null/.test(cuerpo.text), `${bot} ${c}: sin undefined/NaN/null`);
    ok(consulta.llamadas.every((l) => Object.hasOwn(VISTAS, l.vista)), `${bot} ${c}: solo pide vistas que existen`);
    const botones = botonesDe(cuerpo);
    ok(botones.length >= 1 && (botones.at(-1).text === '🏠 Menú' || c === '/ayuda'), `${bot} ${c}: termina con el botón «Menú» (o es el propio menú)`);
    const permitidos = new Set(COMANDOS_DEL_BOT[bot]);
    ok(botones.every((b) => /^c:[a-z]{1,20}(:[\w ]{1,30})?$/.test(b.callback_data) && Buffer.byteLength(b.callback_data) <= 64 && permitidos.has(b.callback_data.split(':')[1]) === true || b.callback_data === 'c:ayuda'), `${bot} ${c}: botones válidos y solo hacia comandos de ese bot`);
    ok(botones.every((b) => b.text.length >= 2 && b.text.length <= 40), `${bot} ${c}: textos de botón razonables`);
  }
}

// ── Detalle de cada comando ──────────────────────────────────────────────────────────────
{
  const t = await textoDe('/alertas');
  ok(t.includes('🚨 <b>Alertas</b>') && t.includes('<blockquote>') && /💡/.test(t) && t.includes('🕒'), '/alertas: tarjetas, lectura y datos');
  ok(t.includes('Planner 🟡') && t.includes('desactualizados'), '/alertas: avisa que los datos son de hace más de un día');
  const b = botonesDe(respuesta(await correr(msg('/alertas')))).map((x) => x.callback_data);
  ok(b.includes('c:proyectos:atrasado'), '/alertas: botón para ver los proyectos atrasados');
}
{
  const t = await textoDe('/agenda');
  ok(t.includes('próximos 14 días') && t.includes('Hoy · jue 19/11') && t.includes('Recepción de &lt;acero&gt;') && !t.includes('<acero>'), '/agenda: agrupa por día, escapa y marca «Hoy»');
  ok(t.includes('Mañana') === false && t.includes('Llega <b>OC-2</b>'), '/agenda: incluye la llegada de pedidos');
  ok(/⏰ <b>1 pedido ya debía/.test(t) && t.includes('/pedidos vencidos'), '/agenda: avisa de los pedidos vencidos');
  const c7 = crearConsulta(); await correr(msg('/agenda 7'), { consultar: c7 });
  igual(c7.llamadas.find((l) => l.vista === 'hitos').filtros, { desde: HOY, hasta: '2026-11-26', limite: '80' }, '/agenda 7: pide 7 días');
  const c30 = crearConsulta(); await correr(msg('/agenda 30'), { consultar: c30 });
  igual(c30.llamadas.find((l) => l.vista === 'hitos').filtros.hasta, '2026-12-19', '/agenda 30: pide 30 días');
  const c99 = crearConsulta(); await correr(msg('/agenda 99'), { consultar: c99 });
  igual(c99.llamadas.find((l) => l.vista === 'hitos').filtros.hasta, '2026-12-03', 'un número raro vuelve a 14 días');
  const botones = botonesDe(respuesta(await correr(msg('/agenda')))).map((x) => x.callback_data);
  ok(['c:agenda:7', 'c:agenda:14', 'c:agenda:30'].every((x) => botones.includes(x)), '/agenda: botones de 7, 14 y 30 días');
  const vacia = await textoDe('/agenda', { consultar: crearConsulta({ hitos: [], pedidos: [] }) });
  ok(vacia.includes('No hay hitos ni llegadas'), '/agenda: sin eventos lo dice');
}
{
  const t = await textoDe('/proyectos');
  ok(t.includes('<pre>') && t.includes('23 proyectos') && /avance medio \d+ %/.test(t) && /🔴 6 atrasados/.test(t), '/proyectos: tabla, total, avance medio y conteo por estado');
  ok(t.includes('página 1 de 3') && t.includes('toca un proyecto'), '/proyectos: con 23 proyectos pagina de a 10');
  const bs = botonesDe(respuesta(await correr(msg('/proyectos')))).map((x) => x.callback_data);
  ok(bs.includes('c:proyectos:p2') || bs.includes('c:proyectos:p 2') || bs.some((x) => /c:proyectos:p2/.test(x)), '/proyectos: botón «Siguiente»');
  ok(bs.some((x) => /^c:proyecto:/.test(x)), '/proyectos: botones para abrir la ficha de un proyecto');
  const p2 = respuesta(await correr(boton('c:proyectos:p2')));
  ok(p2.text.includes('página 2 de 3') && botonesDe(p2).some((x) => x.text === '‹ Anterior'), 'página 2: con «Anterior»');
  const filtrado = crearConsulta(); await correr(msg('/proyectos atrasado'), { consultar: filtrado });
  igual(filtrado.llamadas.find((l) => l.vista === 'proyectos').filtros.estado, 'atrasado', 'el estado va como filtro');
  const vacio = await textoDe('/proyectos zzz', { consultar: crearConsulta({ proyectos: [] }) });
  ok(vacio.includes('No hay proyectos con ese filtro'), 'sin resultados lo dice');
}
{
  const uno = crearConsulta({ proyectos: [proyectos[0]] });
  const ficha = respuesta(await correr(msg('/proyecto torre'), { consultar: uno }));
  ok(ficha.text.includes('Torre &lt;Miraflores&gt; &amp; Co') && ficha.text.includes('▱') && ficha.text.includes('Próximos hitos'), '/proyecto: ficha con barra de avance y próximos hitos');
  ok(uno.llamadas.some((l) => l.vista === 'hitos' && l.filtros.desde === HOY), '/proyecto: pide sus próximos hitos');
  const varios = respuesta(await correr(msg('/proyecto proyecto'), { consultar: crearConsulta({ proyectos: proyectos.slice(1, 5) }) }));
  ok(varios.text.includes('coincidencias') && botonesDe(varios).filter((x) => /^c:proyecto:/.test(x.callback_data)).length === 4, '/proyecto: con varias coincidencias ofrece elegir');
  ok((await textoDe('/proyecto zzz', { consultar: crearConsulta({ proyectos: [] }) })).includes('No encontré'), '/proyecto: sin coincidencias lo dice');
  ok((await textoDe('/proyecto')).includes('/proyecto V7K'), '/proyecto sin nombre explica cómo usarlo');
}
{
  const t = await textoDe('/materiales');
  ok(t.includes('Inventario casi sin cargar') && t.includes('Acero 1/2" &lt;A&gt;') && t.includes('▱'), '/materiales: aviso de inventario, nombre escapado y barra');
  ok(t.includes('página 1 de 3') && /💡/.test(t) && t.includes('MRP ✅'), '/materiales: páginas de 4, lectura y datos del MRP');
  ok(botonesDe(respuesta(await correr(msg('/materiales')))).some((x) => x.callback_data === 'c:stock'), '/materiales: botón «Por categoría»');
  const sin = await textoDe('/materiales', { consultar: crearConsulta({ 'stock-bajo': [] }) });
  ok(sin.includes('Ningún material está bajo su mínimo'), '/materiales: sin faltantes lo dice');
}
{
  const t = await textoDe('/stock');
  ok(t.includes('<pre>') && t.includes('Acero y hierro') === false && t.includes('Acero y hierr') && t.includes('Cemento') && t.includes('22.6K'), '/stock: tabla por categoría con cifras compactas');
  ok(/💡/.test(t) && t.includes('Baj = bajo el mínimo'), '/stock: leyenda y lectura');
}
{
  const t = await textoDe('/pedidos');
  ok(t.includes('4 abiertos') && t.includes('1 vencido') && /llega/.test(t) && t.includes('⏰'), '/pedidos: resumen (abiertos, vencidos) y tarjetas');
  const v = await textoDe('/pedidos vencidos');
  ok(v.includes('OC-1') && !v.includes('OC-2') && v.includes('vencidos'), '/pedidos vencidos: solo los que ya debían haber llegado');
  const bs = botonesDe(respuesta(await correr(msg('/pedidos')))).map((x) => x.callback_data);
  ok(['c:pedidos:vencidos', 'c:pedidos:pendiente', 'c:pedidos:enviada', 'c:pedidos:parcial'].every((x) => bs.includes(x)), '/pedidos: botones de filtro');
  const c = crearConsulta(); await correr(msg('/pedidos parcial'), { consultar: c });
  igual(c.llamadas.find((l) => l.vista === 'pedidos').filtros.estado, 'parcial', 'el estado va como filtro');
  const ninguno = await textoDe('/pedidos vencidos', { consultar: crearConsulta({ pedidos: [pedidos[1]] }) });
  ok(ninguno.includes('No hay pedidos vencidos'), 'sin vencidos lo celebra');
}
{
  const t = await textoDe('/propiedades');
  ok(t.includes('11 avisos') && /mediana US\$/.test(t), '/propiedades: total y mediana');
  ok(t.includes('&lt;b&gt;Casa&lt;/b&gt; en Miraflores') && !t.includes('<b>Casa</b>') && !t.includes('javascript:'), '/propiedades: títulos escapados y enlaces inseguros descartados');
  ok(t.includes('href="https://portal.test/1"') && t.includes('precio dudoso') && /1 aviso tiene precio dudoso/.test(t), '/propiedades: enlace seguro y aviso de precio dudoso');
  const bs = botonesDe(respuesta(await correr(msg('/propiedades')))).map((x) => x.callback_data);
  ok(['c:propiedades:venta', 'c:propiedades:alquiler', 'c:propiedades:casa', 'c:propiedades:departamento', 'c:propiedades:oficina', 'c:mercado'].every((x) => bs.includes(x)), '/propiedades: botones de venta, alquiler, tipo y mercado');
  const c = crearConsulta(); await correr(msg('/propiedades venta miraflores hasta 300000'), { consultar: c });
  igual(c.llamadas.find((l) => l.vista === 'propiedades').filtros, { operacion: 'VENTA', distrito: 'miraflores', precio_max_usd: '300000', limite: '100' }, 'los filtros se entienden');
  const c2 = crearConsulta(); await correr(msg('/propiedades casas'), { consultar: c2 });
  igual(c2.llamadas.find((l) => l.vista === 'propiedades').filtros.inmueble, 'Casa', '«casas» en plural también');
  ok((await textoDe('/propiedades', { consultar: crearConsulta({ propiedades: [] }) })).includes('Ningún aviso coincide'), 'sin resultados lo dice');
}
{
  const t = await textoDe('/mercado');
  ok(t.includes('Venta (US$)') && t.includes('Alquiler (US$ por mes)') && t.includes('318.7K') && t.includes('Santiago de S…') === false, '/mercado: venta y alquiler con medianas compactas');
  const v = await textoDe('/mercado venta');
  ok(v.includes('Venta') && !v.includes('Alquiler (US$'), '/mercado venta: solo venta');
  ok(t.includes('5,224 avisos') && /💡/.test(t) && t.includes('Scraper'), '/mercado: total del catálogo, lectura y datos del Scraper');
}
{
  const t = await textoDe('/portales');
  ok(t.includes('<pre>') && t.includes('infocasas') && t.includes('2,968') && t.includes('16/11') && /2,993 avisos/.test(t), '/portales: tabla por portal y total');
}
{
  const t = await textoDe('/buscar torre');
  ok(t.includes('Buscar «torre»') && t.includes('📁 <b>Proyectos</b>') && t.includes('📦') && t.includes('🚚') && t.includes('🏠'), '/buscar: una sección por tipo');
  const bs = botonesDe(respuesta(await correr(msg('/buscar torre')))).map((x) => x.callback_data);
  ok(['c:proyectos:torre', 'c:materiales:torre', 'c:pedidos:torre', 'c:propiedades:torre'].every((x) => bs.includes(x)), '/buscar: un botón por sección con el texto buscado');
  ok((await textoDe('/buscar zz', { consultar: crearConsulta({ proyectos: [], 'stock-bajo': [], pedidos: [], propiedades: [] }) })).includes('No encontré nada'), '/buscar: sin resultados lo dice');
  ok((await textoDe('/buscar')).includes('/buscar torre'), '/buscar sin texto explica cómo usarlo');
  const rota = await textoDe('/buscar torre', { consultar: crearConsulta({ pedidos: new Error('x'), propiedades: new Error('y') }) });
  ok(rota.includes('Proyectos') && !rota.includes('Pedidos abiertos'), '/buscar: si una sección falla, las demás se muestran');
  const larga = respuesta(await correr(msg('/buscar ' + 'ñandú <b> '.repeat(10))));
  ok(botonesDe(larga).every((b) => /^[\w: ]+$/.test(b.callback_data)), '/buscar: un texto raro no rompe los botones');
}
{
  const t = await textoDe('/frescura');
  ok(t.includes('Planner') && t.includes('Scraper') && /💡/.test(t) && t.includes('desactualizadas') === false && t.includes('Planner y Scraper'), '/frescura: tarjetas y lectura de qué apps están viejas');
  const t2 = await textoDe('/tendencias');
  ok(t2.includes('<pre>') && t2.includes('Proy. atrasados') && /2\s+3\s+\+1/.test(t2) && t2.includes('🔴 Empeoró'), '/tendencias: tabla antes/ahora/diferencia y lectura');
}
{
  const g = await textoDe('/guia');
  ok(g.includes('Coze') && g.includes('Gasta créditos') && g.includes('@v1k_consultas_bot') && g.includes('@v1k_asistente_bot') && g.includes('Panel web') && g.includes('<pre>'), '/guia: explica cuándo usar Coze, los bots y el panel, con una tabla de decisión');
  const a = await textoDe('/ayuda');
  for (const c of CATALOGO.filter((x) => x.cmd !== 'ayuda')) ok(a.includes(`/${c.cmd}`), `/ayuda lista /${c.cmd}`);
  ok(['Hoy', 'Operación', 'Mercado', 'Herramientas'].every((g2) => a.includes(`<b>${g2}</b>`)), '/ayuda agrupa los comandos');
}

// ── El bot del resumen ───────────────────────────────────────────────────────────────────
{
  const a = await textoDe('/ayuda', { bot: 'resumen' });
  ok(a.includes('/ahora') && a.includes('/semana') && !a.includes('/proyectos') && a.includes('@v1k_consultas_bot'), 'el bot del resumen lista su briefing y manda a explorar al otro bot');
  const rechazo = respuesta(await correr(msg('/proyectos'), { bot: 'resumen' }));
  ok(rechazo.text.includes('@v1k_consultas_bot') && !rechazo.text.includes('Planner'), 'un comando del otro bot se redirige (sin consultar nada)');
  const c = crearConsulta(); await correr(msg('/mercado'), { bot: 'resumen', consultar: c });
  igual(c.llamadas.length, 0, 'y no consulta la base');
  const menu = tecladoMenu('resumen').inline_keyboard.flat().map((b) => b.callback_data);
  ok(menu.every((d) => COMANDOS_DEL_BOT.resumen.includes(d.split(':')[1])), 'el menú del resumen solo lleva a sus comandos');
  const ahora = await textoDe('/ahora', { bot: 'resumen' });
  ok(ahora.startsWith('☀️ <b>V1K ·'), '/ahora: el resumen de hoy');
  const alertas = botonesDe(respuesta(await correr(msg('/alertas'), { bot: 'resumen' }))).map((b) => b.callback_data);
  ok(!alertas.includes('c:proyectos:atrasado') && !alertas.includes('c:materiales'), '/alertas en el bot del resumen no ofrece botones de comandos que no tiene');
}

// ── Botones: editar el mensaje y valores límite ──────────────────────────────────────────
{
  const a = await correr(boton('c:proyectos:atrasado p2'));
  ok(a.some((x) => x.metodo === 'editMessageText'), 'los botones editan el mensaje');
  const largo = await correr(boton('c:' + 'a'.repeat(30)));
  ok(!respuesta(largo)?.text?.includes('Planner'), 'un comando que no existe no consulta');
  const sinAcento = await correr(boton('c:buscar:ñandú'));
  igual(sinAcento.filter((x) => x.metodo === 'editMessageText').length, 0, 'un dato de botón con caracteres raros se ignora');
  const ok1 = await correr(boton('c:buscar'));
  ok(respuesta(ok1).text.includes('/buscar torre'), 'el botón «Buscar» sin texto explica cómo usarlo');
}

console.log(`OK: comandos y botones — ${n} comprobaciones (16 comandos, tablas, páginas, filtros, detalle, guía y los dos bots)`);
