// Comandos y botones de los bots de Telegram de V1K: qué responde cada uno, con qué diseño y con qué contexto.
// Funciones PURAS (se prueban sin red): reciben `consultar(vista, filtros)` y devuelven { html, teclado }.
//
// Criterio de diseño (Telegram lo usará mucho más que Coze, que gasta créditos por pregunta):
//   · listas y comparaciones → TABLAS en monoespaciado (<pre>); detalle de un elemento → TARJETAS (<blockquote>)
//   · cada respuesta trae contexto: totales, una lectura («💡 …») y de cuándo son los datos («🕒 Datos: MRP ✅ hace 20 h»)
//   · botones que llevan al siguiente paso lógico (filtros, detalle, página siguiente, volver al menú)
//   · el bot de consultas lo sabe todo; el del resumen es un «briefing» con pocos comandos
//   · la guía (/guia) explica cuándo usar cada cosa: Coze, estos bots o el panel
import { NOMBRE_APP, compacto, diasEntre, dinero, estadoFrescura, fechaCorta, haceHoras, mediana, normalizar, numero, plural, relativoDias, soloFecha, sumarDias, urlSegura } from '../public/js/nucleo/formato.js';
import { generarAlertas, inventarioSinCargar, precioDudoso, saludGlobal } from '../public/js/nucleo/insights.js';
import { compararCon, serieDe } from '../public/js/nucleo/tendencias.js';
import { COLORES, graficoBarras, graficoMercado, graficoProyectos, graficoTendencias } from './graficos.js';
import { componerResumenHtml } from '../scripts/resumen-diario.mjs';
import { BOT_CONSULTAS, BOT_RESUMEN, barra, diaCorto, esc, lectura, paginaDe, pieDatos, recortar, separarPagina, tablaPre, tarjeta, titulo } from './telegram-diseno.js';

export const MAX_MENSAJE = 3800;      // el límite de Telegram es 4096 caracteres
export const MAX_ARGUMENTO = 60;
export const ESTADOS_PROYECTO = ['atrasado', 'en curso', 'por iniciar', 'terminado'];
const ESTADOS_PEDIDO = ['pendiente', 'enviada', 'parcial'];
const INMUEBLES = ['departamento', 'casa', 'terreno', 'oficina', 'local'];
const NOMBRE_INMUEBLE = { departamento: 'Departamento', casa: 'Casa', terreno: 'Terreno', oficina: 'Oficina', local: 'Local' };

// ── Catálogo de comandos ─────────────────────────────────────────────────────────────────
/** Cada comando: icono, título, grupo del /ayuda, descripción corta y ejemplo. `alias` son otros nombres que lo activan. */
export const CATALOGO = [
  { cmd: 'resumen', icono: '📋', titulo: 'Resumen', grupo: 'Hoy', desc: 'lo urgente y los cambios de la semana', alias: ['hoy', 'ahora'] },
  { cmd: 'alertas', icono: '🚨', titulo: 'Alertas', grupo: 'Hoy', desc: 'solo lo que requiere atención' },
  { cmd: 'agenda', icono: '📅', titulo: 'Agenda', grupo: 'Hoy', desc: 'hitos y llegadas de los próximos días', ejemplo: '/agenda 7' },
  { cmd: 'proyectos', icono: '📁', titulo: 'Proyectos', grupo: 'Operación', desc: 'estado y avance de todos', ejemplo: '/proyectos atrasado' },
  { cmd: 'proyecto', icono: '🔍', titulo: 'Proyecto', grupo: 'Operación', desc: 'la ficha de uno, con sus próximos hitos', ejemplo: '/proyecto V7K' },
  { cmd: 'materiales', icono: '📦', titulo: 'Materiales', grupo: 'Operación', desc: 'los que están bajo su mínimo', ejemplo: '/materiales cemento' },
  { cmd: 'stock', icono: '📊', titulo: 'Stock', grupo: 'Operación', desc: 'materiales por categoría', ejemplo: '/stock' },
  { cmd: 'pedidos', icono: '🚚', titulo: 'Pedidos', grupo: 'Operación', desc: 'órdenes de compra abiertas', ejemplo: '/pedidos vencidos' },
  { cmd: 'propiedades', icono: '🏠', titulo: 'Propiedades', grupo: 'Mercado', desc: 'avisos con tus filtros', ejemplo: '/propiedades venta miraflores hasta 300000' },
  { cmd: 'mercado', icono: '💰', titulo: 'Mercado', grupo: 'Mercado', desc: 'precio mediano por distrito', ejemplo: '/mercado alquiler' },
  { cmd: 'portales', icono: '🌐', titulo: 'Portales', grupo: 'Mercado', desc: 'avisos por portal', ejemplo: '/portales' },
  { cmd: 'buscar', icono: '🔎', titulo: 'Buscar', grupo: 'Herramientas', desc: 'busca en todo a la vez', ejemplo: '/buscar torre' },
  { cmd: 'frescura', icono: '🕒', titulo: 'Datos al día', grupo: 'Herramientas', desc: 'hace cuánto sincronizó cada app', alias: ['datos'] },
  { cmd: 'tendencias', icono: '📈', titulo: 'Tendencias', grupo: 'Herramientas', desc: 'cambios frente a hace 7 días', alias: ['semana'] },
  { cmd: 'guia', icono: '🧭', titulo: 'Guía', grupo: 'Ayuda', desc: 'qué usar para cada cosa', alias: ['guía'] },
  { cmd: 'ayuda', icono: '❓', titulo: 'Ayuda', grupo: 'Ayuda', desc: 'la lista de comandos', alias: ['help', 'menu'] },
];
const ALIAS = Object.fromEntries(CATALOGO.flatMap((c) => [[c.cmd, c.cmd], ...(c.alias ?? []).map((a) => [normalizar(a), c.cmd])]));
/** «Hoy», «ahora», «semana»… → el comando de verdad; undefined si no existe. */
export const resolverComando = (nombre) => ALIAS[normalizar(nombre)];

/** Qué comandos entiende cada bot. El del resumen es un «briefing»: pocos y sin filtros. */
export const COMANDOS_DEL_BOT = {
  consultas: CATALOGO.map((c) => c.cmd),
  resumen: ['resumen', 'alertas', 'agenda', 'tendencias', 'guia', 'ayuda'],
};
/** Nombres con los que cada bot publica su menú «/» (el del resumen usa /ahora y /semana). */
export const MENU_DE_COMANDOS = {
  consultas: CATALOGO.filter((c) => c.cmd !== 'ayuda' || true).map((c) => ({ command: c.cmd, description: `${c.desc[0].toUpperCase()}${c.desc.slice(1)}` })),
  resumen: [
    { command: 'ahora', description: 'El resumen de hoy, ahora mismo' }, { command: 'alertas', description: 'Solo lo que requiere atención' },
    { command: 'agenda', description: 'Hitos y llegadas de los próximos días' }, { command: 'semana', description: 'Cambios frente a hace 7 días' },
    { command: 'guia', description: 'Qué usar para cada cosa' }, { command: 'ayuda', description: 'La lista de comandos' },
  ],
};
export const NOMBRES_COMANDOS = MENU_DE_COMANDOS.consultas.map((c) => c.command);

// ── Argumentos ───────────────────────────────────────────────────────────────────────────
/** «atrasados», «en curso», «por iniciar», «terminados»… → el estado exacto, o undefined. */
export function estadoProyecto(texto) {
  const t = normalizar(texto).replace(/\s+/g, ' ');
  return ESTADOS_PROYECTO.find((e) => t === e || t === `${e}s` || t === e.replace(/ /g, ''));
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
    else if (INMUEBLES.includes(p) || INMUEBLES.includes(p.replace(/s$/, ''))) filtros.inmueble = NOMBRE_INMUEBLE[INMUEBLES.includes(p) ? p : p.replace(/s$/, '')];
    else if (['hasta', 'max', 'maximo', 'menos'].includes(p) || ['desde', 'min', 'minimo'].includes(p)) {
      const j = palabras[i + 1] === 'de' ? i + 2 : i + 1;
      const n = monto(palabras[j]);
      if (n) { filtros[['hasta', 'max', 'maximo', 'menos'].includes(p) ? 'precio_max_usd' : 'precio_min_usd'] = n; i = j; }
    } else if (!['en', 'de', 'usd', 'dolares', 'us$', '$'].includes(p)) resto.push(p);
  }
  if (resto.length) filtros.distrito = resto.join(' ').slice(0, MAX_ARGUMENTO);
  return filtros;
}

/** Texto apto para el dato de un botón (solo letras, números, guion bajo y espacio; máx. 28). */
export const argSeguro = (t) => normalizar(t).replace(/[^\w ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28);

// ── Botones ──────────────────────────────────────────────────────────────────────────────
const boton = (texto, cmd, arg = '') => ({ text: texto, callback_data: arg ? `c:${cmd}:${arg}` : `c:${cmd}` });
const MENU = {
  consultas: [
    [['📋 Resumen', 'resumen'], ['🚨 Alertas', 'alertas']], [['📁 Proyectos', 'proyectos'], ['📅 Agenda', 'agenda']],
    [['📦 Materiales', 'materiales'], ['🚚 Pedidos', 'pedidos']], [['🏠 Propiedades', 'propiedades'], ['💰 Mercado', 'mercado']],
    [['🔎 Buscar', 'buscar'], ['📈 Tendencias', 'tendencias']], [['🕒 Datos al día', 'frescura'], ['🧭 Guía', 'guia']],
  ],
  resumen: [[['📋 Ahora', 'resumen'], ['🚨 Alertas', 'alertas']], [['📅 Agenda', 'agenda'], ['📈 Semana', 'tendencias']], [['🧭 Guía', 'guia'], ['❓ Ayuda', 'ayuda']]],
};
export const tecladoMenu = (bot = 'consultas') => ({ inline_keyboard: (MENU[bot] ?? MENU.consultas).map((fila) => fila.map(([t, c]) => boton(t, c))) });
const botonMenu = () => boton('🏠 Menú', 'ayuda');

/** Quita los botones que llevan a comandos que ese bot no tiene y arma el teclado (siempre termina con «Menú»). */
function teclado(bot, filas) {
  const ok = new Set(COMANDOS_DEL_BOT[bot] ?? COMANDOS_DEL_BOT.consultas);
  const limpias = filas.map((f) => f.filter((b) => ok.has(String(b.callback_data).split(':')[1]))).filter((f) => f.length);
  return { inline_keyboard: [...limpias, [botonMenu()]] };
}
/** Fila «‹ Anterior · Siguiente ›» para listas con páginas. */
function filaPaginas(cmd, base, info) {
  const b = String(base ?? '').slice(0, 20).trim();
  const arg = (n) => `${b} p${n}`.trim();
  const fila = [];
  if (info.pagina > 1) fila.push(boton('‹ Anterior', cmd, arg(info.pagina - 1)));
  if (info.pagina < info.paginas) fila.push(boton('Siguiente ›', cmd, arg(info.pagina + 1)));
  return fila;
}

// ── Piezas comunes ───────────────────────────────────────────────────────────────────────
const ICONO_ESTADO = { atrasado: '🔴', 'en curso': '🔵', terminado: '✅', 'por iniciar': '⚪' };
const CORTO_ESTADO = { atrasado: 'atras.', 'en curso': 'curso', terminado: 'termin', 'por iniciar': 'inicia' };
const ESTADO_SALUD = { ok: '✅ Todo en orden', aviso: '🟡 Hay puntos por revisar', peligro: '🔴 Requiere atención' };
const MARCA = { peligro: '🔴', aviso: '🟡', info: '🔹' };
const frescuraDe = async (consultar) => { try { return await consultar('frescura', {}); } catch { return []; } };
const pie = (fr, apps) => pieDatos(fr, apps, { estado: estadoFrescura, haceHoras });
const dia = (v) => String(v ?? '').slice(0, 10);
/** «Planner hace 1 día · MRP hace 5 h»: el pie de frescura para dentro de una imagen (sin emojis ni etiquetas). */
const pieSimple = (fr, apps, generado = '') => `${(fr ?? []).filter((f) => apps.includes(f.app)).map((f) => `${NOMBRE_APP[f.app] ?? f.app} ${haceHoras(Number(f.hace_horas))}`).join(' · ')}${generado ? ` · gráfico de las ${generado}` : ''}`;
const actualizar = (cmd, arg = '') => boton('🔄 Actualizar', cmd, arg);
/** Une partes en orden de importancia sin pasar del límite de un pie de foto de Telegram (1024); lo que no cabe se descarta. */
function captionSeguro(partes, max = 960) {
  const salida = [];
  let largo = 0;
  for (const p of partes.filter(Boolean)) { if (largo + p.length + 2 > max && salida.length) break; salida.push(p); largo += p.length + 2; }
  return salida.join('\n\n');
}
/** Añade un gráfico al resultado: se envía como foto con el pie de foto; el texto (`html`) queda de respaldo si no se puede dibujar. */
const conGrafico = (resultado, svg, caption) => ({ ...resultado, grafico: { svg, caption } });
const corto = (n) => compacto(n).replace(' ', '');   // 212.9 K → 212.9K (cabe mejor en una tabla)

/** Une partes (separadas por línea en blanco) sin pasar del límite de Telegram: si no caben, avisa cuántas tarjetas faltaron. */
function unir(cabecera, bloques, cierre = [], maximo = 99) {
  const cola = cierre.filter(Boolean);
  const partes = [cabecera];
  let largo = cabecera.length + cola.reduce((a, c) => a + c.length + 2, 0) + 90;
  let usadas = 0;
  for (const b of bloques.slice(0, maximo)) {
    if (largo + b.length + 2 > MAX_MENSAJE) break;
    partes.push(b); largo += b.length + 2; usadas++;
  }
  if (usadas < bloques.length) partes.push(`<i>… y ${numero(bloques.length - usadas, 0)} más. Afina la búsqueda para ver menos.</i>`);
  return [...partes, ...cola].join('\n\n');
}
const sinDatos = (cab, texto, bot, filas = []) => ({ html: `${cab}\n\n${texto}`, teclado: teclado(bot, filas) });

// ── Hoy: resumen, alertas, agenda ────────────────────────────────────────────────────────
async function cmdResumen({ consultar, hoy, panel, bot }) {
  const [resumen, historial] = await Promise.all([consultar('resumen-general'), consultar('historial', { limite: '15' }).catch(() => null)]);
  if (!resumen?.[0]) return sinDatos(titulo('📋', 'Resumen'), 'Todavía no hay datos para el resumen.', bot);
  return { html: componerResumenHtml(resumen[0], historial, { hoy, panel }), teclado: teclado(bot, [[boton('🚨 Alertas', 'alertas'), boton('📅 Agenda', 'agenda')]]) };
}

const IR_A = { proyectos: ['📁 Ver atrasados', 'proyectos', 'atrasado'], pedidos: ['🚚 Ver pedidos', 'pedidos'], materiales: ['📦 Ver materiales', 'materiales'], calendario: ['📅 Ver agenda', 'agenda'], sistema: ['🕒 Datos al día', 'frescura'] };

async function cmdAlertas({ consultar, hoy, bot }) {
  const [resumen, fr] = await Promise.all([consultar('resumen-general'), frescuraDe(consultar)]);
  const r = resumen?.[0];
  if (!r) return sinDatos(titulo('🚨', 'Alertas'), 'Todavía no hay datos para revisar.', bot);
  const todas = generarAlertas(r, hoy);
  const alertas = todas.filter((a) => a.tono !== 'ok');
  const cab = titulo('🚨', 'Alertas', ESTADO_SALUD[saludGlobal(todas)]);
  const bloques = alertas.map((a) => tarjeta(`${MARCA[a.tono] ?? '•'} <b>${esc(a.titulo)}</b>`, esc(a.texto)));
  const botones = [];
  for (const a of alertas) { const ir = IR_A[a.ir?.ruta]; if (ir && !botones.some((b) => b.callback_data === boton(...ir).callback_data)) botones.push(boton(...ir)); }
  const filas = []; for (let i = 0; i < botones.length; i += 2) filas.push(botones.slice(i, i + 2));
  const cierre = [alertas.length ? lectura(`${plural(alertas.filter((a) => a.tono === 'peligro').length, 'alerta urgente', 'alertas urgentes')} y ${plural(alertas.filter((a) => a.tono !== 'peligro').length, 'aviso', 'avisos')}. Toca un botón para ver el detalle.`) : '', pie(fr, ['planner', 'mrp', 'scraper'])];
  return { html: alertas.length ? unir(cab, bloques, cierre) : `${cab}\n\n✅ No hay nada que requiera atención ahora.\n\n${cierre.filter(Boolean).join('\n\n')}`, teclado: teclado(bot, filas) };
}

async function cmdAgenda({ args, consultar, hoy, bot }) {
  const pedidoDias = Number(separarPagina(args).texto);
  const dias = [7, 14, 30].includes(pedidoDias) ? pedidoDias : 14;
  const hasta = sumarDias(hoy, dias);
  const [hitos, pedidos, fr] = await Promise.all([consultar('hitos', { desde: hoy, hasta, limite: '80' }), consultar('pedidos', { limite: '200' }).catch(() => []), frescuraDe(consultar)]);
  const vencidos = pedidos.filter((p) => p.llegada_estimada && diasEntre(hoy, dia(p.llegada_estimada)) < 0);
  const eventos = [
    ...hitos.map((h) => ({ fecha: soloFecha(h.fecha), linea: `📌 ${esc(h.descripcion)}${h.proyecto ? ` · <i>${esc(h.proyecto)}</i>` : ''}` })),
    ...pedidos.filter((p) => p.llegada_estimada && diasEntre(hoy, dia(p.llegada_estimada)) >= 0 && diasEntre(dia(p.llegada_estimada), hasta) >= 0)
      .map((p) => ({ fecha: dia(p.llegada_estimada), linea: `🚚 Llega <b>${esc(p.pedido_id)}</b> de ${esc(p.proveedor ?? 'proveedor')}${p.obra ? ` · <i>${esc(p.obra)}</i>` : ''}` })),
  ].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const porDia = new Map();
  for (const e of eventos) porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e.linea]);
  const etiqueta = (f) => `${f === hoy ? 'Hoy' : f === sumarDias(hoy, 1) ? 'Mañana' : relativoDias(f, hoy)} · ${diaCorto(f)}`;
  const bloques = [...porDia].map(([f, lineas]) => `<b>${etiqueta(f)}</b>\n${tarjeta(...lineas)}`);
  const cab = titulo('📅', `Agenda · próximos ${dias} días`, `${plural(hitos.length, 'hito', 'hitos')} · ${plural(eventos.length - hitos.length, 'llegada de pedido', 'llegadas de pedidos')}`);
  const cierre = [
    vencidos.length ? `⏰ <b>${plural(vencidos.length, 'pedido ya debía', 'pedidos ya debían')} haber llegado.</b> Míralos con /pedidos vencidos.` : '',
    eventos.length ? '' : lectura('No hay fechas clave en este período: es un buen momento para adelantar tareas.'),
    pie(fr, ['planner', 'mrp']),
  ];
  return {
    html: bloques.length ? unir(cab, bloques, cierre) : `${cab}\n\nNo hay hitos ni llegadas en este período.\n\n${cierre.filter(Boolean).join('\n\n')}`,
    teclado: teclado(bot, [[boton('7 días', 'agenda', '7'), boton('14 días', 'agenda', '14'), boton('30 días', 'agenda', '30')], vencidos.length ? [boton('⏰ Pedidos vencidos', 'pedidos', 'vencidos')] : []]),
  };
}

// ── Operación: proyectos, materiales, stock, pedidos ─────────────────────────────────────
async function cmdProyectos({ args, consultar, hoy, bot, generado }) {
  const { texto, pagina } = separarPagina(args);
  const estado = estadoProyecto(texto);
  const [filas, fr] = await Promise.all([consultar('proyectos', { ...(estado ? { estado } : {}), ...(!estado && texto ? { q: texto } : {}), limite: '200' }), frescuraDe(consultar)]);
  const lista = filas.filter(Boolean);
  const filtro = estado ? ` · ${estado}` : texto ? ` · «${esc(texto)}»` : '';
  const avance = lista.length ? lista.reduce((a, p) => a + (Number(p.avance_pct) || 0), 0) / lista.length : 0;
  const cab = titulo('📁', `Proyectos${filtro}`, `${plural(lista.length, 'proyecto', 'proyectos')} · avance medio ${numero(avance, 0)} %`);
  if (!lista.length) return sinDatos(cab, 'No hay proyectos con ese filtro.', bot, [[boton('📁 Ver todos', 'proyectos')]]);
  const cuenta = (e) => lista.filter((p) => p.estado === e).length;
  const resumen = ESTADOS_PROYECTO.filter((e) => cuenta(e)).map((e) => `${ICONO_ESTADO[e]} ${cuenta(e)} ${e === 'atrasado' ? (cuenta(e) === 1 ? 'atrasado' : 'atrasados') : e === 'terminado' ? (cuenta(e) === 1 ? 'terminado' : 'terminados') : e}`).join(' · ');
  const info = paginaDe(lista, pagina, 8);
  const tabla = tablaPre(
    [{ titulo: 'Proyecto', ancho: 13 }, { titulo: 'Estado', ancho: 6 }, { titulo: 'Av.', ancho: 4, alinea: 'der' }, { titulo: 'Fin', ancho: 5 }, { titulo: 'Tar', ancho: 3, alinea: 'der' }],
    info.filas.map((p) => [p.nombre, CORTO_ESTADO[p.estado] ?? p.estado, `${numero(Number(p.avance_pct) || 0, 0)}%`, fechaCorta(dia(p.fin)).slice(0, 5), String(p.tareas_atrasadas ?? 0)]));
  const atrasados = lista.filter((p) => p.estado === 'atrasado').length;
  const cierre = [
    `${tabla}\n<i>Tar = tareas atrasadas · ${info.paginas > 1 ? `página ${info.pagina} de ${info.paginas} · ` : ''}toca un proyecto para ver su ficha</i>`,
    atrasados ? lectura(`${plural(atrasados, 'proyecto está atrasado', 'proyectos están atrasados')} (${numero((atrasados / lista.length) * 100, 0)} % de los mostrados).`) : '',
    pie(fr, ['planner']),
  ];
  const detalle = info.filas.slice(0, 4).map((p) => boton(`🔍 ${recortar(p.nombre, 14)}`, 'proyecto', argSeguro(p.nombre))).filter((b) => b.callback_data.length > 12);
  const resultado = {
    html: `${cab}\n${resumen}\n\n${cierre.filter(Boolean).join('\n\n')}`,
    teclado: teclado(bot, [
      detalle.slice(0, 2), detalle.slice(2, 4),
      [boton('🔴 Atrasados', 'proyectos', 'atrasado'), boton('🔵 En curso', 'proyectos', 'en curso')], [boton('⚪ Por iniciar', 'proyectos', 'por iniciar'), boton('✅ Terminados', 'proyectos', 'terminado')],
      filaPaginas('proyectos', texto, info),
      [actualizar('proyectos', `${String(texto).slice(0, 20)} p${info.pagina}`.trim())],
    ]),
  };
  const filtroPlano = estado ? ` · ${estado}` : texto ? ` · «${texto}»` : '';
  const grafico = graficoProyectos({
    titulo: `Proyectos${filtroPlano}`, sub: `${plural(lista.length, 'proyecto', 'proyectos')} · avance medio ${numero(avance, 0)} %${info.paginas > 1 ? ` · página ${info.pagina} de ${info.paginas}` : ''}`, pie: `Datos: ${pieSimple(fr, ['planner'], generado)}`,
    filas: info.filas.map((p) => ({ nombre: p.nombre, estado: p.estado, avance: Number(p.avance_pct) || 0, finTexto: p.fin ? `fin ${fechaCorta(dia(p.fin)).slice(0, 5)} · ${relativoDias(dia(p.fin), hoy)}` : '', tareas: Number(p.tareas_atrasadas) || 0 })),
  });
  return conGrafico(resultado, grafico, captionSeguro([`${cab}\n${resumen}`, atrasados ? lectura(`${plural(atrasados, 'proyecto está atrasado', 'proyectos están atrasados')} (${numero((atrasados / lista.length) * 100, 0)} % de los mostrados).`) : '', '<i>Toca un proyecto para ver su ficha.</i>', pie(fr, ['planner'])]));
}

async function cmdProyecto({ args, consultar, hoy, bot }) {
  const { texto } = separarPagina(args);
  if (texto.length < 2) return sinDatos(titulo('🔍', 'Ficha de un proyecto'), `Escribe el nombre (o parte): <code>/proyecto V7K</code>\nO elige uno desde /proyectos.`, bot, [[boton('📁 Ver proyectos', 'proyectos')]]);
  const encontrados = (await consultar('proyectos', { q: texto, limite: '6' })).filter(Boolean);
  if (!encontrados.length) return sinDatos(titulo('🔍', 'Ficha de un proyecto'), `No encontré proyectos con «${esc(texto)}». Prueba con otra parte del nombre.`, bot, [[boton('📁 Ver proyectos', 'proyectos')]]);
  const exacto = encontrados.find((p) => normalizar(p.nombre) === normalizar(texto));
  if (encontrados.length > 1 && !exacto) {
    const lista = encontrados.slice(0, 5);
    return { html: `${titulo('🔍', 'Ficha de un proyecto', `${plural(encontrados.length, 'coincidencia', 'coincidencias')} con «${esc(texto)}»`)}\n\n${tarjeta(...lista.map((p) => `${ICONO_ESTADO[p.estado] ?? '•'} <b>${esc(p.nombre)}</b> · ${esc(p.estado)}`))}\n\n<i>Elige uno:</i>`, teclado: teclado(bot, lista.map((p) => [boton(`🔍 ${recortar(p.nombre, 28)}`, 'proyecto', argSeguro(p.nombre))])) };
  }
  const p = exacto ?? encontrados[0];
  const hitos = await consultar('hitos', { proyecto: p.nombre, desde: hoy, limite: '5' }).catch(() => []);
  const fin = dia(p.fin), inicio = dia(p.inicio);
  const avance = Number(p.avance_pct) || 0;
  const diasFin = fin ? diasEntre(hoy, fin) : null;
  const ficha = tarjeta(
    `${ICONO_ESTADO[p.estado] ?? '•'} <b>${esc(p.nombre)}</b> · ${esc(p.estado)}`,
    `${barra(avance)} ${numero(avance, 0)} %`,
    inicio || fin ? `📅 ${inicio ? fechaCorta(inicio) : '—'} → ${fin ? fechaCorta(fin) : '—'}${fin ? ` · ${relativoDias(fin, hoy)}` : ''}` : '',
    p.responsable ? `👤 ${esc(p.responsable)}` : '',
    `✔️ ${plural(p.tareas_total ?? 0, 'tarea', 'tareas')} · ${p.tareas_atrasadas > 0 ? `⚠️ ${plural(p.tareas_atrasadas, 'atrasada', 'atrasadas')}` : 'ninguna atrasada'}`,
  );
  const proximos = hitos.length ? `<b>Próximos hitos</b>\n${tarjeta(...hitos.map((h) => `📌 ${esc(fechaCorta(soloFecha(h.fecha)))} · ${esc(h.descripcion)} <i>(${relativoDias(soloFecha(h.fecha), hoy)})</i>`))}` : '<i>Sin hitos próximos registrados.</i>';
  const nota = p.estado === 'atrasado' && diasFin !== null && diasFin < 0 ? lectura(`Pasó su fecha de fin hace ${plural(-diasFin, 'día', 'días')} y va en ${numero(avance, 0)} % de avance.`) : p.estado === 'terminado' ? lectura('Proyecto terminado.') : '';
  const actualizado = p.actualizado_en ? fechaCorta(dia(p.actualizado_en)) : '—';
  const html = [titulo('🔍', 'Ficha del proyecto'), ficha, proximos, nota, `🕒 <i>Actualizado: ${esc(actualizado)}</i>`].filter(Boolean).join('\n\n');
  return { html, teclado: teclado(bot, [[boton('📁 Todos los proyectos', 'proyectos'), boton('📅 Agenda', 'agenda')]]) };
}

async function cmdMateriales({ args, consultar, bot }) {
  const { texto, pagina } = separarPagina(args);
  const [filas, resumen, fr] = await Promise.all([
    consultar('stock-bajo', { ...(texto ? { q: texto } : {}), limite: '100' }),
    consultar('resumen-general').then((r) => r?.[0]).catch(() => null),
    frescuraDe(consultar),
  ]);
  const sinCargar = resumen && inventarioSinCargar(resumen.stock);
  const info = paginaDe(filas, pagina, 4);
  const cab = titulo('📦', `Materiales bajo su mínimo${texto ? ` · «${esc(texto)}»` : ''}`, `${plural(info.total, 'material', 'materiales')}${info.paginas > 1 ? ` · página ${info.pagina} de ${info.paginas}` : ''} · los de mayor faltante primero`);
  const aviso = sinCargar && info.pagina === 1 ? tarjeta('⚠️ <b>Inventario casi sin cargar</b>', `${numero(resumen.stock.sin_existencias, 0)} de ${numero(resumen.stock.materiales_con_minimo, 0)} materiales figuran sin existencias.`, 'Los mínimos son de partida: no es una falta real.') : '';
  const bloques = info.filas.map((m) => {
    const minimo = Number(m.minimo) || 0, cantidad = Number(m.cantidad) || 0;
    const pct = minimo > 0 ? Math.min(100, (cantidad / minimo) * 100) : 0;
    return tarjeta(`📦 <b>${esc(m.material)}</b>${m.categoria ? ` · ${esc(m.categoria)}` : ''}`, `${barra(pct)} ${numero(pct, 0)} % del mínimo`, `hay ${numero(m.cantidad, 2)} · mínimo ${numero(m.minimo, 2)} · faltan <b>${numero(m.faltante, 2)}</b>`, m.unidad ? `unidad: ${esc(m.unidad)}` : '');
  });
  const cierre = [sinCargar ? lectura('Mientras no se cargue el inventario real en el MRP, esta lista no refleja lo que falta en almacén.') : lectura('Conviene pedir primero lo de mayor faltante.'), pie(fr, ['mrp'])];
  const filasBotones = [[boton('📊 Por categoría', 'stock'), boton('🚚 Pedidos', 'pedidos')], filaPaginas('materiales', texto, info)];
  if (!info.total) return { html: `${cab}\n\n${texto ? 'Ningún material coincide.' : 'Ningún material está bajo su mínimo.'}\n\n${cierre[1]}`, teclado: teclado(bot, filasBotones) };
  return { html: unir(cab, [aviso, ...bloques].filter(Boolean), cierre), teclado: teclado(bot, filasBotones) };
}

async function cmdStock({ consultar, bot, generado }) {
  const [filas, fr] = await Promise.all([consultar('stock-categorias', {}), frescuraDe(consultar)]);
  const cab = titulo('📊', 'Stock por categoría', 'ordenadas por faltante total');
  if (!filas.length) return sinDatos(cab, 'Todavía no hay materiales cargados.', bot);
  const total = filas.reduce((a, f) => a + (Number(f.materiales) || 0), 0), bajos = filas.reduce((a, f) => a + (Number(f.en_stock_bajo) || 0), 0), sin = filas.reduce((a, f) => a + (Number(f.sin_existencias) || 0), 0);
  const tabla = tablaPre(
    [{ titulo: 'Categoría', ancho: 14 }, { titulo: 'Mat', ancho: 3, alinea: 'der' }, { titulo: 'Baj', ancho: 3, alinea: 'der' }, { titulo: 'Sin', ancho: 3, alinea: 'der' }, { titulo: 'Falta', ancho: 6, alinea: 'der' }],
    filas.slice(0, 12).map((f) => [f.categoria, String(f.materiales), String(f.en_stock_bajo), String(f.sin_existencias), corto(Number(f.faltante_total) || 0)]));
  const mensaje = [cab, tabla, '<i>Mat = materiales · Baj = bajo el mínimo · Sin = sin existencias · Falta = unidades faltantes</i>',
    lectura(total && sin / total >= 0.9 ? `${numero(sin, 0)} de ${numero(total, 0)} materiales figuran sin existencias: el inventario real no se ha cargado, así que los faltantes son mínimos de partida.` : `${numero(bajos, 0)} de ${numero(total, 0)} materiales están bajo su mínimo.`),
    pie(fr, ['mrp'])].filter(Boolean).join('\n\n');
  const lecturaTexto = total && sin / total >= 0.9 ? `${numero(sin, 0)} de ${numero(total, 0)} materiales figuran sin existencias: el inventario real no se ha cargado, así que los faltantes son mínimos de partida.` : `${numero(bajos, 0)} de ${numero(total, 0)} materiales están bajo su mínimo.`;
  const grafico = graficoBarras({ titulo: 'Stock por categoría', sub: `${plural(total, 'material', 'materiales')} · ${numero(bajos, 0)} bajo el mínimo · faltante total`, color: COLORES.ambar, pie: `Datos: ${pieSimple(fr, ['mrp'], generado)}`,
    filas: filas.slice(0, 8).map((f) => ({ etiqueta: f.categoria, valor: Number(f.faltante_total) || 0, textoValor: corto(Number(f.faltante_total) || 0), sub: `${plural(f.materiales, 'material', 'materiales')} · ${numero(f.sin_existencias, 0)} sin existencias` })) });
  return conGrafico({ html: mensaje, teclado: teclado(bot, [[boton('📦 Ver materiales', 'materiales'), boton('🚚 Pedidos', 'pedidos')], [actualizar('stock')]]) }, grafico, captionSeguro([cab, lectura(lecturaTexto), pie(fr, ['mrp'])]));
}

async function cmdPedidos({ args, consultar, hoy, bot }) {
  const { texto, pagina } = separarPagina(args);
  const norm = normalizar(texto);
  const estado = ESTADOS_PEDIDO.find((e) => e === norm);
  const soloVencidos = norm === 'vencidos' || norm === 'vencido';
  const [todos, fr] = await Promise.all([consultar('pedidos', { ...(estado ? { estado } : {}), ...(!estado && !soloVencidos && texto ? { q: texto } : {}), limite: '200' }), frescuraDe(consultar)]);
  const vence = (p) => p.llegada_estimada && diasEntre(hoy, dia(p.llegada_estimada)) < 0;
  const semana = todos.filter((p) => p.llegada_estimada && !vence(p) && diasEntre(hoy, dia(p.llegada_estimada)) <= 7).length;
  const lista = soloVencidos ? todos.filter(vence) : todos;
  const nVencidos = todos.filter(vence).length;
  const info = paginaDe(lista, pagina, 4);
  const filtro = soloVencidos ? ' · vencidos' : estado ? ` · ${estado}` : texto ? ` · «${esc(texto)}»` : '';
  const cab = titulo('🚚', `Pedidos abiertos${filtro}`, `${plural(lista.length, 'orden', 'órdenes')}${info.paginas > 1 ? ` · página ${info.pagina} de ${info.paginas}` : ''} · las que llegan antes, primero`);
  const botones = [[boton('⏰ Vencidos', 'pedidos', 'vencidos'), boton('🕓 Pendientes', 'pedidos', 'pendiente')], [boton('📤 Enviadas', 'pedidos', 'enviada'), boton('🧩 Parciales', 'pedidos', 'parcial')], filaPaginas('pedidos', texto, info), [boton('📅 Agenda', 'agenda')]];
  if (!lista.length) return { html: `${cab}\n\n${soloVencidos ? '✅ No hay pedidos vencidos.' : 'No hay pedidos abiertos con ese filtro.'}\n\n${pie(fr, ['mrp'])}`, teclado: teclado(bot, botones) };
  const bloques = info.filas.map((p) => {
    const llegada = p.llegada_estimada ? dia(p.llegada_estimada) : null;
    const pedida = Number(p.cantidad_pedida) || 0, recibida = Number(p.cantidad_recibida) || 0;
    const pct = pedida > 0 ? (recibida / pedida) * 100 : null;
    return tarjeta(`${vence(p) ? '⏰' : '🚚'} <b>${esc(p.pedido_id)}</b> · ${esc(p.proveedor ?? '')}`, [p.obra ? `🏗 ${esc(p.obra)}` : null, `📌 ${esc(p.estado)}`].filter(Boolean).join(' · '), `📅 ${llegada ? `llega ${fechaCorta(llegada)} · ${relativoDias(llegada, hoy)}` : 'sin fecha'}`, pct !== null ? `${barra(pct)} ${numero(pct, 0)} % recibido` : '');
  });
  const resumen = `${plural(todos.length, 'abierto', 'abiertos')} · ${nVencidos ? `⏰ ${plural(nVencidos, 'vencido', 'vencidos')}` : '✅ ninguno vencido'} · ${plural(semana, 'llega esta semana', 'llegan esta semana')}`;
  const cierre = [nVencidos ? lectura(`${plural(nVencidos, 'orden ya debía', 'órdenes ya debían')} haber llegado: conviene llamar al proveedor.`) : '', pie(fr, ['mrp'])];
  return { html: unir(`${cab}\n${resumen}`, bloques, cierre), teclado: teclado(bot, botones) };
}

// ── Mercado: propiedades, mercado, portales ──────────────────────────────────────────────
async function cmdPropiedades({ args, consultar, bot }) {
  const { texto, pagina } = separarPagina(args);
  const filtros = parsearPropiedades(texto);
  const [filas, fr] = await Promise.all([consultar('propiedades', { ...filtros, limite: '100' }), frescuraDe(consultar)]);
  const validas = filas.filter((p) => Number(p.precio_usd) > 0 && !precioDudoso(p));
  const dudosas = filas.filter((p) => precioDudoso(p)).length;
  const med = validas.length ? mediana(validas.map((p) => Number(p.precio_usd))) : null;
  const etiqueta = [filtros.operacion?.toLowerCase(), filtros.inmueble?.toLowerCase(), filtros.distrito, filtros.precio_min_usd ? `desde US$ ${numero(Number(filtros.precio_min_usd), 0)}` : null, filtros.precio_max_usd ? `hasta US$ ${numero(Number(filtros.precio_max_usd), 0)}` : null].filter(Boolean).map(esc).join(' · ');
  const info = paginaDe(filas, pagina, 4);
  const cab = titulo('🏠', `Propiedades${etiqueta ? ` (${etiqueta})` : ' recientes'}`, `${plural(info.total, 'aviso', 'avisos')}${med ? ` · mediana ${dinero(med, 'USD')}` : ''}${info.paginas > 1 ? ` · página ${info.pagina} de ${info.paginas}` : ''}`);
  const botones = [[boton('🟢 Venta', 'propiedades', 'venta'), boton('🔵 Alquiler', 'propiedades', 'alquiler')], [boton('🏠 Casas', 'propiedades', 'casa'), boton('🏢 Deptos', 'propiedades', 'departamento'), boton('🏬 Oficinas', 'propiedades', 'oficina')], filaPaginas('propiedades', texto, info), [boton('💰 Mercado', 'mercado')]];
  const ayuda = 'Ejemplos: /propiedades venta miraflores hasta 300000 · /propiedades alquiler casa';
  if (!filas.length) return { html: `${cab}\n\nNingún aviso coincide.\n<i>${ayuda}</i>\n\n${pie(fr, ['scraper'])}`, teclado: teclado(bot, botones) };
  const bloques = info.filas.map((p) => {
    const area = parseFloat(p.area);
    const enlace = urlSegura(p.url);
    const nombre = esc(p.titulo ?? 'Sin título');
    return tarjeta(`${p.operacion === 'VENTA' ? '🟢' : '🔵'} <b>${esc(p.operacion ?? '')}</b>${p.distrito ? ` · ${esc(p.distrito)}` : ''}`, enlace ? `<a href="${esc(enlace)}">${nombre}</a>` : nombre,
      [`💵 ${dinero(p.precio, p.moneda)}`, area > 0 ? `📐 ${numero(area, 0)} m²` : null, p.dormitorios ? `🛏 ${numero(parseFloat(p.dormitorios), 0)} dorm.` : null].filter(Boolean).join(' · '), precioDudoso(p) ? '⚠️ precio dudoso (parece por m²)' : '');
  });
  const cierre = [dudosas ? lectura(`${plural(dudosas, 'aviso tiene', 'avisos tienen')} precio dudoso (parece por m²) y no cuentan en la mediana.`) : '', `<i>${ayuda}</i>`, pie(fr, ['scraper'])];
  return { html: unir(cab, bloques, cierre), teclado: teclado(bot, botones) };
}

async function cmdMercado({ args, consultar, bot, generado }) {
  const norm = normalizar(separarPagina(args).texto);
  const operacion = ['venta', 'ventas'].includes(norm) ? 'VENTA' : ['alquiler', 'alquileres'].includes(norm) ? 'ALQUILER' : null;
  const [distritos, resumen, fr] = await Promise.all([consultar('propiedades-distritos', {}), consultar('resumen-general').then((r) => r?.[0]).catch(() => null), frescuraDe(consultar)]);
  const cab = titulo('💰', 'Mercado', `precio mediano por distrito${resumen ? ` · ${numero(resumen.propiedades?.total_catalogo ?? 0, 0)} avisos en el catálogo` : ''}`);
  const bloque = (op, icono, etiqueta, sufijo) => {
    const filas = distritos.filter((d) => d.operacion === op).slice(0, operacion ? 15 : 8);
    if (!filas.length) return '';
    return `${icono} <b>${etiqueta}</b>\n${tablaPre([{ titulo: 'Distrito', ancho: 15 }, { titulo: 'Avisos', ancho: 6, alinea: 'der' }, { titulo: `Mediana${sufijo}`, ancho: 8, alinea: 'der' }], filas.map((d) => [d.distrito, String(d.avisos), d.precio_mediano_usd ? corto(Number(d.precio_mediano_usd)) : '—']))}`;
  };
  const partes = [!operacion || operacion === 'VENTA' ? bloque('VENTA', '🟢', 'Venta (US$)', '') : '', !operacion || operacion === 'ALQUILER' ? bloque('ALQUILER', '🔵', 'Alquiler (US$ por mes)', '') : ''].filter(Boolean);
  if (!partes.length) return sinDatos(cab, 'Todavía no hay avisos suficientes para comparar distritos.', bot);
  const mensaje = [cab, ...partes, lectura('La mediana no se deja engañar por avisos con precio mal publicado. Los distritos con menos de 5 avisos son solo orientativos.'), pie(fr, ['scraper'])].join('\n\n');
  const filasDe = (op) => distritos.filter((d) => d.operacion === op).slice(0, operacion ? 10 : 5).map((d) => ({ etiqueta: d.distrito, valor: Number(d.precio_mediano_usd) || 0, textoValor: d.precio_mediano_usd ? corto(Number(d.precio_mediano_usd)) : '—', sub: plural(d.avisos, 'aviso', 'avisos') }));
  const grafico = graficoMercado({ titulo: 'Mercado', sub: `precio mediano por distrito${resumen ? ` · ${numero(resumen.propiedades?.total_catalogo ?? 0, 0)} avisos en el catálogo` : ''}`, pie: `Datos: ${pieSimple(fr, ['scraper'], generado)}`,
    venta: !operacion || operacion === 'VENTA' ? filasDe('VENTA') : [], alquiler: !operacion || operacion === 'ALQUILER' ? filasDe('ALQUILER') : [] });
  return conGrafico({ html: mensaje, teclado: teclado(bot, [[boton('🟢 Venta', 'mercado', 'venta'), boton('🔵 Alquiler', 'mercado', 'alquiler')], [boton('🌐 Portales', 'portales'), boton('🏠 Propiedades', 'propiedades')], [actualizar('mercado', operacion === 'VENTA' ? 'venta' : operacion === 'ALQUILER' ? 'alquiler' : '')]]) }, grafico,
    captionSeguro([cab, lectura('La mediana no se deja engañar por avisos con precio mal publicado. Los distritos con menos de 5 avisos son solo orientativos.'), pie(fr, ['scraper'])]));
}

async function cmdPortales({ consultar, bot, generado }) {
  const [filas, fr] = await Promise.all([consultar('propiedades-resumen', {}), frescuraDe(consultar)]);
  const cab = titulo('🌐', 'Avisos por portal', 'el catálogo completo, no solo los recientes');
  if (!filas.length) return sinDatos(cab, 'Todavía no hay avisos en el catálogo.', bot);
  const total = filas.reduce((a, f) => a + (Number(f.total) || 0), 0);
  const tabla = tablaPre([{ titulo: 'Portal', ancho: 11 }, { titulo: 'Operación', ancho: 9 }, { titulo: 'Total', ancho: 7, alinea: 'der' }, { titulo: 'Visto', ancho: 5 }],
    filas.map((f) => [f.portal, String(f.operacion ?? '').toLowerCase(), numero(Number(f.total) || 0, 0), fechaCorta(dia(f.ultima_vista)).slice(0, 5)]));
  const grafico = graficoBarras({ titulo: 'Avisos por portal', sub: `${numero(total, 0)} avisos en el catálogo completo`, color: COLORES.violeta, pie: `Datos: ${pieSimple(fr, ['scraper'], generado)}`,
    filas: [...filas].sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0)).slice(0, 10).map((f) => ({ etiqueta: `${f.portal} · ${String(f.operacion ?? '').toLowerCase()}`, valor: Number(f.total) || 0, textoValor: numero(Number(f.total) || 0, 0), sub: `visto por última vez el ${fechaCorta(dia(f.ultima_vista)).slice(0, 5)}` })) });
  return conGrafico({ html: [cab, tabla, '<i>Visto = última vez que el Scraper vio avisos de ese portal</i>', lectura(`${numero(total, 0)} avisos en total entre venta y alquiler.`), pie(fr, ['scraper'])].join('\n\n'), teclado: teclado(bot, [[boton('💰 Mercado', 'mercado'), boton('🏠 Propiedades', 'propiedades')], [actualizar('portales')]]) }, grafico,
    captionSeguro([cab, lectura(`${numero(total, 0)} avisos en total entre venta y alquiler.`), pie(fr, ['scraper'])]));
}

// ── Herramientas: buscar, frescura, tendencias ───────────────────────────────────────────
async function cmdBuscar({ args, consultar, bot }) {
  const q = separarPagina(args).texto.slice(0, 40);
  if (q.length < 2) {
    return sinDatos(titulo('🔎', 'Buscar en todo a la vez'), `Escribe qué buscas y miro en proyectos, materiales, pedidos y propiedades:\n${tarjeta('<code>/buscar torre</code>', '<code>/buscar cemento</code>', '<code>/buscar miraflores</code>', '<code>/buscar OC-1040</code>')}`, bot);
  }
  const seguro = (p) => p.catch(() => []);
  const [pr, ma, pe, pp] = await Promise.all([seguro(consultar('proyectos', { q, limite: '50' })), seguro(consultar('stock-bajo', { q, limite: '100' })), seguro(consultar('pedidos', { q, limite: '50' })), seguro(consultar('propiedades', { q, limite: '50' }))]);
  const arg = argSeguro(q);
  const seccion = (icono, nombre, lista, linea) => (lista.length ? `${icono} <b>${nombre}</b> (${lista.length})\n${tarjeta(...lista.slice(0, 3).map(linea))}` : '');
  const bloques = [
    seccion('📁', 'Proyectos', pr, (p) => `${ICONO_ESTADO[p.estado] ?? '•'} <b>${esc(p.nombre)}</b> · ${esc(p.estado)} · ${numero(Number(p.avance_pct) || 0, 0)} %`),
    seccion('📦', 'Materiales bajo su mínimo', ma, (m) => `<b>${esc(m.material)}</b> · faltan ${numero(m.faltante, 2)}`),
    seccion('🚚', 'Pedidos abiertos', pe, (p) => `<b>${esc(p.pedido_id)}</b> · ${esc(p.proveedor ?? '')} · ${esc(p.estado)}`),
    seccion('🏠', 'Propiedades', pp, (p) => `${p.operacion === 'VENTA' ? '🟢' : '🔵'} ${esc(recortar(p.titulo ?? 'Sin título', 40))} · ${esc(p.distrito ?? '')}`),
  ].filter(Boolean);
  const cab = titulo('🔎', `Buscar «${esc(q)}»`, bloques.length ? `${plural(pr.length + ma.length + pe.length + pp.length, 'resultado', 'resultados')} en ${plural(bloques.length, 'sección', 'secciones')}` : 'sin resultados');
  if (!bloques.length) return sinDatos(cab, 'No encontré nada con ese texto. Prueba con una sola palabra o sin tildes.', bot);
  const botones = [pr.length ? boton(`📁 Proyectos (${pr.length})`, 'proyectos', arg) : null, ma.length ? boton(`📦 Materiales (${ma.length})`, 'materiales', arg) : null, pe.length ? boton(`🚚 Pedidos (${pe.length})`, 'pedidos', arg) : null, pp.length ? boton(`🏠 Propiedades (${pp.length})`, 'propiedades', arg) : null].filter(Boolean);
  const filas = []; for (let i = 0; i < botones.length; i += 2) filas.push(botones.slice(i, i + 2));
  return { html: unir(cab, bloques, [lectura('Muestro hasta 3 por sección. Toca un botón para ver todos los resultados.')]), teclado: teclado(bot, filas) };
}

async function cmdFrescura({ consultar, bot }) {
  const filas = await consultar('frescura', {});
  const nombre = { planner: 'Planner', mrp: 'MRP', scraper: 'Scraper' };
  const cab = titulo('🕒', 'Datos al día', 'hora de Lima · ✅ menos de 24 h, 🟡 hasta 72 h, 🔴 más');
  const bloques = filas.map((f) => {
    const h = Number(f.hace_horas);
    const icono = { ok: '✅', aviso: '🟡', viejo: '🔴', desconocido: '⚪' }[estadoFrescura(h)];
    return tarjeta(`${icono} <b>${esc(nombre[f.app] ?? f.app)}</b> · ${haceHoras(h)}`, `${barra(Number.isFinite(h) ? 100 - Math.min(100, (h / 72) * 100) : 0)} frescura`, `🗓 ${esc(fechaHoraLima(f.ultima_sync))}`);
  });
  const viejas = filas.filter((f) => Number(f.hace_horas) >= 24).map((f) => nombre[f.app] ?? f.app);
  return { html: bloques.length ? `${cab}\n\n${bloques.join('\n\n')}\n\n${lectura(viejas.length ? `${esc(viejas.join(' y '))} lleva más de un día sin sincronizar: sus respuestas pueden no reflejar lo último.` : 'Todo está sincronizado hace menos de un día: puedes confiar en las respuestas.')}` : `${cab}\n\nTodavía no hay datos de sincronización.`, teclado: teclado(bot, [[boton('🚨 Alertas', 'alertas')]]) };
}

/** «2026-11-18T20:43:00Z» → «18/11/2026 15:43» en hora de Lima, sea cual sea la zona del servidor (en Vercel es UTC). */
export function fechaHoraLima(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

const CORTAS = {
  proyectos_atrasados: 'Proy. atrasados', tareas_atrasadas: 'Tareas atras.', pedidos_vencidos: 'Ped. vencidos', materiales_sin_existencias: 'Mat. sin stock',
  propiedades_catalogo: 'Catálogo', precio_mediano_venta_usd: 'Venta mediana', precio_mediano_alquiler_usd: 'Alq. mediano',
};
async function cmdTendencias({ consultar, bot, generado }) {
  const historial = await consultar('historial', { limite: '15' }).catch(() => null);
  const cmp = historial ? compararCon(historial, 7) : null;
  if (!cmp) return sinDatos(titulo('📈', 'Tendencias'), 'Todavía no hay al menos dos días de historial: se guarda una foto por día.', bot);
  const num = (v, f) => (v === null ? '—' : f === 'usd' ? corto(v) : numero(v, 0));
  const tabla = tablaPre([{ titulo: 'Métrica', ancho: 14 }, { titulo: 'Antes', ancho: 6, alinea: 'der' }, { titulo: 'Ahora', ancho: 6, alinea: 'der' }, { titulo: 'Dif.', ancho: 6, alinea: 'der' }],
    cmp.filas.map((f) => [CORTAS[f.clave] ?? f.etiqueta, num(f.antes, f.formato), num(f.ahora, f.formato), f.delta === null || f.delta === 0 ? '=' : `${f.delta > 0 ? '+' : '−'}${num(Math.abs(f.delta), f.formato)}`]));
  const mejor = cmp.filas.filter((f) => f.tono === 'mejor').map((f) => CORTAS[f.clave] ?? f.etiqueta), peor = cmp.filas.filter((f) => f.tono === 'peor').map((f) => CORTAS[f.clave] ?? f.etiqueta);
  const lect = [mejor.length ? `🟢 Mejoró: ${esc(mejor.join(', '))}.` : '', peor.length ? `🔴 Empeoró: ${esc(peor.join(', '))}.` : '', !mejor.length && !peor.length ? 'Sin cambios relevantes en lo que se sigue.' : ''].filter(Boolean).join(' ');
  const subTitulo = `${plural(cmp.dias, 'día', 'días')} · desde el ${fechaCorta(cmp.desde)}`;
  const grafico = graficoTendencias({ titulo: 'Tendencias', sub: subTitulo, pie: `Verde: mejoró · rojo: empeoró · gráfico de las ${generado ?? ''}`.replace(/ · gráfico de las $/, ''),
    tarjetas: cmp.filas.map((f) => ({ nombre: CORTAS[f.clave] ?? f.etiqueta, valorTexto: num(f.ahora, f.formato), deltaTexto: f.delta === null || f.delta === 0 ? '=' : `${f.delta > 0 ? '+' : '−'}${num(Math.abs(f.delta), f.formato)}`, tono: f.tono, serie: serieDe(historial, f.clave).map((p) => p.valor).slice(-10) })) });
  return conGrafico({ html: [titulo('📈', 'Tendencias', subTitulo), tabla, lectura(lect)].join('\n\n'), teclado: teclado(bot, [[boton('🚨 Alertas', 'alertas'), boton('📋 Resumen', 'resumen')], [actualizar('tendencias')]]) }, grafico, captionSeguro([titulo('📈', 'Tendencias', subTitulo), lectura(lect)]));
}

// ── Ayuda y guía ─────────────────────────────────────────────────────────────────────────
function cmdAyuda({ bot }) {
  const comandos = CATALOGO.filter((c) => COMANDOS_DEL_BOT[bot]?.includes(c.cmd) && c.cmd !== 'ayuda');
  const nombreEn = (c) => (bot === 'resumen' ? ({ resumen: 'ahora', tendencias: 'semana' }[c.cmd] ?? c.cmd) : c.cmd);
  const grupos = [...new Set(comandos.map((c) => c.grupo))];
  const secciones = grupos.map((g) => `<b>${g}</b>\n${tarjeta(...comandos.filter((c) => c.grupo === g).map((c) => `${c.icono} /${nombreEn(c)} — ${c.desc}`))}`);
  const cab = titulo('🤖', bot === 'resumen' ? 'Resumen diario V1K' : 'Asistente V1K', bot === 'resumen' ? 'tu briefing de la mañana, y bajo demanda' : 'consultas de solo lectura · instantáneo · sin costo');
  const pista = bot === 'resumen' ? `Para explorar con filtros (proyectos, materiales, propiedades…) usa @${BOT_CONSULTAS}.` : 'Toca un botón o escribe un comando. Solo leo: no modifico nada. ¿Dudas de cuál usar? /guia';
  return { html: [cab, ...secciones, `<i>${pista}</i>`].join('\n\n'), teclado: tecladoMenu(bot) };
}

function cmdGuia({ bot }) {
  const decide = tablaPre([{ titulo: 'Quiero…', ancho: 16 }, { titulo: 'Uso', ancho: 17 }], [
    ['Ver lo urgente', '/alertas'], ['Agenda semanal', '/agenda 7'], ['Ficha proyecto', '/proyecto V7K'], ['Qué falta', '/materiales'], ['Pedidos vencidos', '/pedidos vencidos'],
    ['Precios distrito', '/mercado'], ['Buscar un nombre', '/buscar torre'], ['Pregunta libre', 'Coze'], ['Gráficos', 'Panel web'],
  ]);
  return {
    html: [
      titulo('🧭', 'Guía: ¿qué uso para cada cosa?', 'elige según lo que necesites'),
      tarjeta(`⚡ <b>@${BOT_CONSULTAS}</b>`, 'Datos exactos al instante y sin costo. Para consultas frecuentes: usa los botones.'),
      tarjeta(`☀️ <b>@${BOT_RESUMEN}</b>`, 'Te escribe solo a las 08:07 y responde /ahora, /alertas, /agenda y /semana.'),
      tarjeta('🤖 <b>Coze (agente con IA)</b>', 'Para preguntas libres, en tus palabras. <b>Gasta créditos</b>: úsalo cuando los comandos no alcancen.'),
      tarjeta('🖥 <b>Panel web</b>', 'Gráficos, calendario, tendencias y exportar a archivo.'),
      decide,
      lectura('Primero prueba un comando: es gratis y más rápido. Guarda a Coze para lo que no tenga botón.'),
    ].join('\n\n'),
    teclado: teclado(bot, [[boton('🚨 Alertas', 'alertas'), boton('📋 Resumen', 'resumen')]]),
  };
}

export const COMANDOS = {
  resumen: cmdResumen, alertas: cmdAlertas, agenda: cmdAgenda, proyectos: cmdProyectos, proyecto: cmdProyecto, materiales: cmdMateriales, stock: cmdStock,
  pedidos: cmdPedidos, propiedades: cmdPropiedades, mercado: cmdMercado, portales: cmdPortales, buscar: cmdBuscar, frescura: cmdFrescura, tendencias: cmdTendencias,
  guia: cmdGuia, ayuda: cmdAyuda,
};

export { BOT_RESUMEN };
