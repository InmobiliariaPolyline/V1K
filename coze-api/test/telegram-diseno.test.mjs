// Pruebas del diseño de los bots de Telegram: tarjetas y barras, la bienvenida animada al pulsar «Iniciar» (con el número de chat), la edición
// de los mensajes al navegar con botones, el bot del resumen diario, el resumen con diseño y los videos de bienvenida. Sin red.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearLectorDeChats, crearLectorDeRevocados } from '../lib/chats-activos.js';
import { chatsPermitidos, crearLimitador, crearManejador, procesarUpdate, procesarUpdateResumen, textoBienvenida, textoBienvenidaResumen, textoPrivado, textoRevocado } from '../lib/telegram.js';
import { barra, codigo, esc, horaEnLima, nombreCorto, pasosDeAcceso, saludoDe, tarjeta, titulo } from '../lib/telegram-diseno.js';
import { componerResumenHtml, enviarAVarios, enviarTelegram } from '../scripts/resumen-diario.mjs';
import { PERIODO, FPS, VARIANTES, tiempos } from '../scripts/generar-banners.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const igual = (a, b, m) => { n++; assert.deepEqual(a, b, m); };

const HOY = '2026-11-19';
const PERMITIDOS = chatsPermitidos('424242424');
const sin = async () => [];
const ejecutar = (update, extra = {}) => procesarUpdate(update, { consultar: sin, permitidos: PERMITIDOS, hoy: HOY, panel: 'https://ejemplo.test/', hora: 9, ...extra });
const msg = (texto, chat = 424242424, de = { first_name: 'Ana' }) => ({ message: { message_id: 1, chat: { id: chat }, from: de, text: texto } });

// ── Piezas del diseño ────────────────────────────────────────────────────────────────────
igual(barra(0), '▱▱▱▱▱▱▱▱▱▱', 'barra vacía');
igual(barra(40), '▰▰▰▰▱▱▱▱▱▱', 'barra al 40 %');
igual(barra(100), '▰▰▰▰▰▰▰▰▰▰', 'barra llena');
igual(barra(250), '▰▰▰▰▰▰▰▰▰▰', 'más de 100 se acota');
igual(barra(-5), '▱▱▱▱▱▱▱▱▱▱', 'negativo se acota');
igual(barra('abc'), '▱▱▱▱▱▱▱▱▱▱', 'un texto no rompe la barra');
igual(barra(50, 4), '▰▰▱▱', 'otro ancho');
igual(tarjeta('a', null, '', 'b', false, undefined, ['c']), '<blockquote>a\nb\nc</blockquote>', 'la tarjeta ignora líneas vacías');
igual(titulo('📁', 'Proyectos', '2 proyectos'), '📁 <b>Proyectos</b>\n<i>2 proyectos</i>', 'título con subtítulo');
igual(codigo('123456789'), '<code>123456789</code>', 'el número de chat se copia al tocarlo');
igual(codigo('<b>'), '<code>&lt;b&gt;</code>', 'el código también escapa');
igual([saludoDe(6), saludoDe(14), saludoDe(21)], ['Buenos días', 'Buenas tardes', 'Buenas noches'], 'saludo según la hora');
igual(horaEnLima(new Date('2026-11-19T13:07:00Z')), 8, '13:07 UTC son las 8 en Lima');
igual(horaEnLima(new Date('2026-11-19T03:00:00Z')), 22, 'cruza la medianoche hacia atrás');
igual([nombreCorto('Ana María'), nombreCorto("  D'Arcy "), nombreCorto('<script>'), nombreCorto(''), nombreCorto(null), nombreCorto('x'.repeat(40))], ['Ana', "D'Arcy", '', '', '', ''], 'solo se saluda con un nombre limpio');
ok(pasosDeAcceso('123456789').includes('<code>123456789</code>') && pasosDeAcceso('1').includes('administrador'), 'los pasos incluyen el número copiable y al administrador');

// ── Textos de bienvenida ─────────────────────────────────────────────────────────────────
{
  const t = textoBienvenida({ nombre: 'Ana', hora: 9 });
  ok(t.startsWith('👋 <b>Buenos días, Ana</b>') && t.includes('/resumen') && t.includes('Solo leo'), 'bienvenida con saludo, nombre y comandos');
  ok(t.length <= 1000, `cabe como pie de la animación (≤ 1024): ${t.length}`);
  ok(!textoBienvenida({ nombre: '<b>X</b>', hora: 20 }).includes('<b>X</b>') && textoBienvenida({ nombre: '', hora: 20 }).includes('Buenas noches</b>'), 'sin nombre válido saluda sin nombre');
  const p = textoPrivado('123456789');
  ok(p.includes('🔒') && p.includes('🆔 Número de chat: <code>123456789</code>') && p.includes('Sin acceso todavía') && p.includes('administrador') && p.includes('teléfono'), 'privado: candado, tarjeta de usuario con número copiable y qué hacer');
  ok(textoPrivado('123456789', { nombre: 'Ana Pérez', usuario: 'ana_p' }).includes('<b>Ana Pérez</b> · @ana_p'), 'privado: con nombre y @usuario si Telegram los da');
  ok(p.length <= 1000, `privado cabe como pie de la animación: ${p.length}`);
  ok(textoPrivado('123456789', { corto: true }).includes('Este bot es privado'), 'versión corta');
  const r = textoBienvenidaResumen({ autorizado: true, chatId: '424242424', nombre: 'Luis', hora: 8 });
  ok(r.includes('08:07') && r.includes('/cuenta') && r.includes('@v1k_consultas_bot'), 'resumen: autorizado, hora del envío y dónde ver tu cuenta');
  ok(textoBienvenidaResumen({ autorizado: false, chatId: '555', hora: 8 }).includes('Acceso privado'), 'resumen: sin acceso explica cómo pedirlo');
  ok(r.length <= 1000, `resumen cabe como pie de la animación: ${r.length}`);
}

// ── «Iniciar» en el bot de consultas ─────────────────────────────────────────────────────
{
  const a = await ejecutar(msg('/start'));
  igual(a.length, 2, 'la animación de bienvenida y el panel de inicio');
  igual(a[0].metodo, 'sendAnimation', 'la bienvenida es una animación');
  igual(a[0].cuerpo.animation, 'https://ejemplo.test/bot/bienvenida.mp4', 'el video de bienvenida (sin barras repetidas)');
  ok(a[0].cuerpo.caption.includes('Ana') && a[0].cuerpo.parse_mode === 'HTML', 'con el nombre y en HTML');
  ok(a[0].cuerpo.reply_markup?.keyboard?.length === 4 && a[0].cuerpo.reply_markup.is_persistent === true && a[0].cuerpo.reply_markup.resize_keyboard === true, 'con el teclado fijo de atajos (persistente), que queda abajo desde el primer mensaje');
  ok(a[1].metodo === 'sendMessage' && a[1].cuerpo.parse_mode === 'HTML' && a[1].cuerpo.text.includes('🏠 <b>Inicio</b>') && a[1].cuerpo.text.includes('<code>424242424</code>') && a[1].cuerpo.text.includes('🆔 Número de chat') && a[1].cuerpo.text.includes('Ana'), 'y enseguida el panel de INICIO con su nombre y su número de chat');
  ok(a[1].cuerpo.reply_markup.inline_keyboard.length === 7 && a[1].cuerpo.reply_markup.inline_keyboard.at(-1).some((b) => b.callback_data === 'c:cuenta'), 'el panel trae el menú de botones y «Mi cuenta»');
  igual(a[0].alternativa.metodo, 'sendMessage', 'si el video falla, el mismo texto sale como mensaje');
  ok(a[0].alternativa.cuerpo.text === a[0].cuerpo.caption && a[0].alternativa.cuerpo.parse_mode === 'HTML', 'la alternativa lleva el mismo texto');
  const sinNombre = await ejecutar(msg('/start', 424242424, {}));
  ok(!/undefined|null/.test(sinNombre[0].cuerpo.caption), 'sin nombre no escribe undefined');
  const peligroso = await ejecutar(msg('/start', 424242424, { first_name: '<img src=x onerror=1>' }));
  ok(!peligroso[0].cuerpo.caption.includes('<img'), 'un nombre con HTML no se cuela');

  // Sin acceso: su número de chat con animación «privado»
  const b = await ejecutar(msg('/start', 777888999));
  igual([b.length, b[0].metodo, b[0].cuerpo.animation], [1, 'sendAnimation', 'https://ejemplo.test/bot/privado.mp4'], 'sin acceso: animación de acceso privado (y nada más: ni panel ni atajos)');
  ok(b[0].cuerpo.caption.includes('<code>777888999</code>') && b[0].cuerpo.caption.includes('administrador'), 'con su número de chat (se copia al tocarlo) y los pasos');
  ok(!b[0].cuerpo.reply_markup, 'sin botones de datos para quien no tiene acceso');
  const c = await ejecutar(msg('hola', 777888999));
  igual([c.length, c[0].metodo], [1, 'sendMessage'], 'cualquier otro mensaje de un extraño: texto corto, sin animación');
  ok(c[0].cuerpo.text.includes('<code>777888999</code>') && c[0].cuerpo.parse_mode === 'HTML', 'también con su número copiable');
  ok(!JSON.stringify([a, b, c]).includes('Torre'), 'ningún dato del negocio en la bienvenida');
}

// ── Navegar con botones edita el mensaje ─────────────────────────────────────────────────
{
  const boton = (data, mensaje) => ({ callback_query: { id: 'cb', data, message: { chat: { id: 424242424 }, message_id: 77, ...mensaje } } });
  const datos = async (vista) => (vista === 'frescura' ? [{ app: 'planner', ultima_sync: '2026-11-19T10:00:00Z', hace_horas: '5' }] : []);
  const a = await ejecutar(boton('c:frescura', { text: 'menú anterior' }), { consultar: datos });
  const e = a.find((x) => x.metodo === 'editMessageText');
  ok(e && e.cuerpo.message_id === 77 && e.cuerpo.chat_id === 424242424 && e.cuerpo.parse_mode === 'HTML', 'sobre un mensaje de texto se edita el mismo mensaje');
  ok(e.cuerpo.reply_markup?.inline_keyboard && e.cuerpo.text.includes('Planner'), 'con los botones y la respuesta nueva');
  igual(e.alternativa.metodo, 'sendMessage', 'si no se puede editar, se envía uno nuevo');
  ok(!a.some((x) => x.metodo === 'sendMessage'), 'no se llena el chat con mensajes extra');
  const b = await ejecutar(boton('c:frescura', { animation: {}, caption: 'bienvenida' }), { consultar: datos });
  ok(b.some((x) => x.metodo === 'sendMessage') && !b.some((x) => x.metodo === 'editMessageText'), 'desde la animación de bienvenida se envía un mensaje nuevo (no se puede editar el texto de un video)');
  igual(a[0].metodo, 'answerCallbackQuery', 'el botón se contesta primero');
  const c = await ejecutar(msg('/frescura'), { consultar: datos });
  ok(c[0].metodo === 'sendChatAction' && c[0].cuerpo.action === 'typing', 'al escribir un comando se muestra «escribiendo…»');
  const d = await ejecutar(msg('/ayuda'));
  ok(!d.some((x) => x.metodo === 'sendChatAction'), '/ayuda responde sin «escribiendo…»');
}

// ── El bot del resumen diario ────────────────────────────────────────────────────────────
{
  const a = await procesarUpdateResumen(msg('/start'), { permitidos: PERMITIDOS, panel: 'https://ejemplo.test', hora: 8 });
  igual([a.length, a[0].metodo, a[0].cuerpo.animation], [2, 'sendAnimation', 'https://ejemplo.test/bot/resumen.mp4'], 'autorizado: animación del resumen diario y panel de inicio');
  ok(a[0].cuerpo.caption.includes('08:07') && a[0].cuerpo.reply_markup?.keyboard?.length === 3, 'con la hora del envío y el teclado fijo del bot del resumen (3 filas)');
  ok(a[1].cuerpo.text.includes('<code>424242424</code>') && a[1].cuerpo.text.includes('@v1k_asistente_bot'), 'y el panel de inicio con su número de chat, también en este bot');
  const b = await procesarUpdateResumen(msg('/start', 999111222), { permitidos: PERMITIDOS, panel: 'https://ejemplo.test' });
  igual(b[0].cuerpo.animation, 'https://ejemplo.test/bot/privado.mp4', 'sin acceso: animación de acceso privado');
  ok(b[0].cuerpo.caption.includes('<code>999111222</code>'), 'con su número de chat para pedir acceso');
  const c = await procesarUpdateResumen(msg('buenas', 999111222), { permitidos: PERMITIDOS });
  igual(c[0].metodo, 'sendMessage', 'otros mensajes: texto corto');
  ok(c[0].cuerpo.text.includes('privado'), 'sin acceso: dice que es privado');
  igual(await procesarUpdateResumen({}, { permitidos: PERMITIDOS }), [], 'sin chat no hace nada');
  igual(await procesarUpdateResumen({ callback_query: { id: 'x' } }, { permitidos: PERMITIDOS }), [], 'no atiende botones: no consulta nada');
}

// ── El manejador: modo resumen, alternativa y «no modificado» ────────────────────────────
{
  const SECRETO = 's'.repeat(40);
  const TOKEN = '1234567890:AAExampleTokenQueNoEsReal_abcdefghijk';
  const env = { TELEGRAM_BOT_RESUMEN_TOKEN: TOKEN, TELEGRAM_RESUMEN_WEBHOOK_SECRET: SECRETO, TELEGRAM_CHATS_PERMITIDOS: '424242424' };
  const res = () => ({ codigo: 0, cuerpo: null, setHeader() {}, status(c) { this.codigo = c; return this; }, json(c) { this.cuerpo = c; return this; } });
  const req = (secreto, cuerpo) => ({ method: 'POST', headers: secreto ? { 'x-telegram-bot-api-secret-token': secreto } : {}, body: cuerpo });
  const llamadas = [];
  const fetchFalso = (respuestas = {}) => async (url, init) => {
    const metodo = url.split('/').pop();
    llamadas.push({ metodo, cuerpo: JSON.parse(init.body) });
    const r = respuestas[metodo];
    return r ? { ok: false, status: r.status, json: async () => ({ ok: false, description: r.descripcion }) } : { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  let r = res(); await crearManejador({ modo: 'resumen', env: {}, fetchFn: fetchFalso() })(req(SECRETO, msg('/start')), r);
  igual(r.codigo, 503, 'resumen sin variables → 503');
  r = res(); await crearManejador({ modo: 'resumen', env: { TELEGRAM_BOT_COMANDOS_TOKEN: TOKEN, TELEGRAM_WEBHOOK_SECRET: SECRETO }, fetchFn: fetchFalso() })(req(SECRETO, msg('/start')), r);
  igual(r.codigo, 503, 'las variables del bot de consultas no sirven para el del resumen');
  r = res(); await crearManejador({ modo: 'resumen', env, fetchFn: fetchFalso() })(req('x'.repeat(40), msg('/start')), r);
  igual(r.codigo, 401, 'secreto equivocado → 401');
  r = res(); await crearManejador({ modo: 'resumen', env, fetchFn: fetchFalso() })(req(null, msg('/start')), r);
  igual(r.codigo, 401, 'sin secreto → 401');

  llamadas.length = 0;
  r = res(); await crearManejador({ modo: 'resumen', env, fetchFn: fetchFalso() })(req(SECRETO, msg('/start')), r);
  igual([r.codigo, llamadas.map((l) => l.metodo)], [200, ['sendAnimation', 'sendMessage']], 'resumen: «Iniciar» → la animación y el panel de inicio');

  llamadas.length = 0;
  r = res(); await crearManejador({ modo: 'resumen', env, chatsExtra: async () => ['999000111'], fetchFn: fetchFalso() })(req(SECRETO, msg('/start', 999000111)), r);
  ok(llamadas[0].cuerpo.animation.endsWith('/bot/resumen.mp4'), 'una persona dada de alta en «Accesos» ya aparece como autorizada en el bot del resumen');

  // Si Telegram no puede cargar el video, se envía el texto
  llamadas.length = 0;
  r = res(); await crearManejador({ modo: 'resumen', env, fetchFn: fetchFalso({ sendAnimation: { status: 400, descripcion: 'Bad Request: wrong file identifier/HTTP URL specified' } }) })(req(SECRETO, msg('/start')), r);
  igual([r.codigo, llamadas.map((l) => l.metodo)], [200, ['sendAnimation', 'sendMessage', 'sendMessage']], 'si el video falla, se envía el mismo texto como mensaje (y luego el panel de inicio)');
  ok(llamadas[1].cuerpo.text.includes('08:07') || llamadas[1].cuerpo.text.includes('resumen diario'), 'y es el texto de la bienvenida');

  // «message is not modified»: no se envía un mensaje nuevo
  const envC = { TELEGRAM_BOT_COMANDOS_TOKEN: TOKEN, TELEGRAM_WEBHOOK_SECRET: SECRETO, TELEGRAM_CHATS_PERMITIDOS: '424242424' };
  const cb = { callback_query: { id: 'c', data: 'c:ayuda', message: { chat: { id: 424242424 }, message_id: 5, text: 'x' } } };
  llamadas.length = 0;
  r = res(); await crearManejador({ env: envC, consultar: sin, fetchFn: fetchFalso({ editMessageText: { status: 400, descripcion: 'Bad Request: message is not modified: specified new message content and reply markup are exactly the same' } }) })(req(SECRETO, cb), r);
  ok(!llamadas.some((l) => l.metodo === 'sendMessage'), 'si el mensaje ya era igual no se envía otro (nada de duplicados al pulsar dos veces)');
  llamadas.length = 0;
  r = res(); await crearManejador({ env: envC, consultar: sin, fetchFn: fetchFalso({ editMessageText: { status: 400, descripcion: 'Bad Request: message to edit not found' } }) })(req(SECRETO, cb), r);
  ok(llamadas.some((l) => l.metodo === 'sendMessage'), 'si el mensaje ya no se puede editar, se envía uno nuevo');
  ok(r.codigo === 200, 'siempre 200 para que Telegram no reintente');
}

// ── Lista de chats con acceso (bot y resumen): caché y falla cerrado ─────────────────────
{
  let t = 0, consultas = 0;
  const lector = crearLectorDeChats(async (texto) => { consultas++; ok(/v_telegram_chats_activos/.test(texto) && !/nombre|telefono/.test(texto), 'solo la vista de números de chat'); return [{ chat_id: 111111111 }, { chat_id: '222222222' }]; }, { ttlMs: 1000, ahora: () => t });
  igual(await lector(), ['111111111', '222222222'], 'números de chat como texto');
  await lector(); await lector();
  igual(consultas, 1, 'se guarda en memoria: no se consulta la base en cada mensaje');
  t = 1500; await lector();
  igual(consultas, 2, 'pasado el tiempo, se vuelve a leer (un acceso revocado deja de valer en segundos)');
  const rota = crearLectorDeChats(async () => { throw new Error('base caída con secretos'); }, { ahora: () => 0 });
  igual(await rota(), [], 'si la base falla, devuelve vacío (falla cerrado)');
}

// ── El resumen diario con diseño ─────────────────────────────────────────────────────────
{
  const resumen = {
    proyectos: { total: 10, atrasados: 3, en_curso: 4, por_iniciar: 1, terminados: 2, tareas_atrasadas: 18 },
    proyectos_atrasados: [{ nombre: 'Torre <Miraflores> & Co', responsable: 'Ana', avance_pct: 62, fin: '2026-11-01', tareas_atrasadas: 6 }],
    proximos_hitos: [{ fecha: '2026-11-21', descripcion: 'Recepción de <acero>', proyecto: 'Edificio San Isidro' }],
    stock: { materiales_con_minimo: 501, en_stock_bajo: 501, sin_existencias: 499 }, mayor_faltante: [],
    pedidos: { abiertos: 2 }, proximos_pedidos: [{ pedido_id: 'OC-1040', proveedor: 'Aceros & Sur', obra: 'Torre', estado: 'enviada', llegada_estimada: '2026-11-17' }],
    propiedades: { total_catalogo: 5224, copiadas: 200 }, propiedades_por_portal: [],
    frescura: [{ app: 'mrp', ultima_sync: 'x', hace_horas: 20.8 }, { app: 'planner', ultima_sync: 'x', hace_horas: 18.3 }],
  };
  const historial = [{ dia: '2026-11-19', proyectos_atrasados: 3, tareas_atrasadas: 18 }, { dia: '2026-11-12', proyectos_atrasados: 2, tareas_atrasadas: 10 }];
  const h = componerResumenHtml(resumen, historial, { hoy: HOY, panel: 'https://ejemplo.test' });
  ok(h.startsWith('☀️ <b>V1K · jueves 19/11/2026</b>'), 'título con el día');
  ok(h.includes('🔴 Requiere atención') && h.includes('<b>Qué mirar primero</b>') && h.includes('<b>Próximos días</b>') && /<b>Cambios en 7 días<\/b>/.test(h), 'estado y secciones');
  ok((h.match(/<blockquote>/g) ?? []).length >= 3, 'cada sección es una tarjeta');
  ok(h.includes('Recepción de &lt;acero&gt;') && h.includes('Aceros &amp; Sur') && !h.includes('<acero>'), 'los datos van escapados');
  ok(h.includes('<a href="https://ejemplo.test">Abrir el panel</a>'), 'enlace al panel');
  ok(h.length <= 3900, `cabe en un mensaje (${h.length})`);
  ok(!/undefined|NaN|\[object/.test(h), 'sin undefined/NaN');
  const sinHist = componerResumenHtml(resumen, null, { hoy: HOY });
  ok(sinHist.includes('Historial: se guarda una foto por día'), 'sin historial lo explica');
  // Etiquetas de HTML equilibradas (Telegram rechaza HTML mal formado)
  const abre = (t) => (h.match(new RegExp(`<${t}[ >]`, 'g')) ?? []).length, cierra = (t) => (h.match(new RegExp(`</${t}>`, 'g')) ?? []).length;
  for (const t of ['b', 'i', 'blockquote', 'a']) igual(abre(t), cierra(t), `etiquetas <${t}> equilibradas`);

  // Envío: HTML, y si Telegram lo rechaza (400), texto plano
  const cuerpos = [];
  const fetchFalso = (estados) => async (url, init) => { const c = JSON.parse(init.body); cuerpos.push(c); const e = estados.shift() ?? 200; return { ok: e < 300, status: e }; };
  await enviarTelegram({ token: '1:AB', chatId: '5', texto: 'plano', html: '<b>html</b>', fetchFn: fetchFalso([200]) });
  igual([cuerpos[0].text, cuerpos[0].parse_mode], ['<b>html</b>', 'HTML'], 'se envía con el diseño');
  cuerpos.length = 0;
  await enviarTelegram({ token: '1:AB', chatId: '5', texto: 'plano', html: '<b>html</b>', fetchFn: fetchFalso([400, 200]) });
  igual(cuerpos.map((c) => [c.text, c.parse_mode ?? null]), [['<b>html</b>', 'HTML'], ['plano', null]], 'si Telegram no entiende el HTML, el resumen sale igual, en texto plano');
  await assert.rejects(() => enviarTelegram({ token: '1:AB', chatId: '5', texto: 'x', html: '<b>x</b>', fetchFn: fetchFalso([401]) }), /HTTP 401/); n++;
  cuerpos.length = 0;
  const r = await enviarAVarios({ token: '1:AB', chats: ['111', '222'], texto: 'plano', html: '<b>h</b>', fetchFn: fetchFalso([200, 200]) });
  igual([r, cuerpos.every((c) => c.parse_mode === 'HTML')], [{ enviados: 2, fallidos: 0 }, true], 'a varios chats, con diseño');
}

// ── Los videos de bienvenida ─────────────────────────────────────────────────────────────
{
  igual(VARIANTES, ['bienvenida', 'privado', 'resumen', 'revocado'], 'cuatro variantes');
  igual(tiempos().length, Math.round(PERIODO * FPS), 'un ciclo completo de fotogramas');
  ok(tiempos().every((t, i) => t === i / FPS), 'tiempos uniformes');
  for (const v of VARIANTES) {
    const ruta = path.join(aqui, '..', 'public', 'bot', `${v}.mp4`);
    ok(fs.existsSync(ruta), `existe public/bot/${v}.mp4`);
    const b = fs.readFileSync(ruta);
    ok(b.subarray(4, 8).toString() === 'ftyp', `${v}.mp4 es un MP4 válido`);
    ok(b.length > 20_000 && b.length < 2_000_000, `${v}.mp4 pesa lo razonable para Telegram (${Math.round(b.length / 1024)} KB)`);
    ok(b.includes(Buffer.from('avc1')), `${v}.mp4 usa H.264 (lo que Telegram reproduce)`);
  }
  const html = fs.readFileSync(path.join(aqui, '..', 'scripts', 'banner', 'banner.html'), 'utf8');
  ok(!/https?:\/\/(?!www\.w3\.org)/.test(html), 'la plantilla del banner no carga nada de fuera');
  ok(/bienvenida/.test(html) && /privado/.test(html) && /resumen/.test(html), 'la plantilla tiene las tres variantes');
  const vercel = JSON.parse(fs.readFileSync(path.join(aqui, '..', 'vercel.json'), 'utf8'));
  ok(vercel.outputDirectory === 'public', 'los videos se publican con el panel (public/bot/)');
}

// ── Endpoints y variables ────────────────────────────────────────────────────────────────
{
  const lib = fs.readFileSync(path.join(aqui, '..', 'lib', 'chats-activos.js'), 'utf8');
  ok(/v_telegram_chats_activos/.test(lib), 'la lectura de accesos usa la vista de números de chat');
  for (const f of ['telegram.js', 'telegram-resumen.js']) {
    const api = fs.readFileSync(path.join(aqui, '..', 'api', f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    ok(/crearLectorDeChats/.test(api) && /consultar-vistas/.test(api) && !/telegram_accesos\b/.test(api) && !/DATABASE_URL_ACCESOS/.test(api), `api/${f}: lee solo con la lectura de solo lectura y la vista de chats`);
  }
  const mod = await import('../api/telegram-resumen.js');
  ok(typeof mod.default === 'function', 'api/telegram-resumen.js exporta el manejador');
  const r = { codigo: 0, setHeader() {}, status(c) { this.codigo = c; return this; }, json() { return this; } };
  await mod.default({ method: 'GET', headers: {} }, r);
  igual(r.codigo, 405, 'GET → 405');
  const guardado = { ...process.env }; delete process.env.TELEGRAM_BOT_RESUMEN_TOKEN;
  await mod.default({ method: 'POST', headers: {}, body: {} }, r);
  igual(r.codigo, 503, 'sin variables → 503');
  Object.assign(process.env, guardado);
}

// ── Acceso REVOCADO: se le dice claro (no el «bot privado» de quien nunca tuvo acceso) ─────
{
  const REVOCADOS = new Set(['777888999']);
  const rev = (update, extra = {}) => procesarUpdate(update, { consultar: sin, permitidos: PERMITIDOS, revocados: REVOCADOS, hoy: HOY, panel: 'https://ejemplo.test', hora: 9, ...extra });
  const t = textoRevocado('777888999');
  const tAna = textoRevocado('777888999', { nombre: 'Ana' }); // lo que ve quien escribe: con su nombre (Telegram lo da en los mensajes)
  ok(tAna.includes('<b>Ana</b>') && tAna.includes('🆔 Número de chat: <code>777888999</code>') && tAna.includes('Acceso revocado'), 'el aviso lleva su tarjeta de usuario: nombre, número de chat y «Acceso revocado»');
  ok(t.startsWith('🚫 <b>Tu acceso fue revocado</b>') && t.includes('<code>777888999</code>') && t.includes('administrador') && t.includes('error'), 'el texto dice que fue revocado, da su número y qué hacer');
  ok(t.length <= 1000, `cabe como pie de la animación: ${t.length}`);
  ok(!/privado/i.test(t), 'no se confunde con el «bot privado» de quien nunca tuvo acceso');

  // Comandos
  const a = await rev(msg('/proyectos', 777888999));
  igual([a.length, a[0].metodo], [1, 'sendMessage'], 'un comando de un revocado: un solo mensaje');
  ok(a[0].cuerpo.text === tAna && a[0].cuerpo.parse_mode === 'HTML' && !a[0].cuerpo.reply_markup.inline_keyboard && a[0].cuerpo.reply_markup.remove_keyboard === true, 'con el aviso de revocación, sin menú de botones y se le QUITA el teclado de atajos');
  ok(!a.some((x) => x.metodo === 'sendChatAction'), 'sin «escribiendo…» ni consultas a la base');
  let consultas = 0;
  await rev(msg('/resumen', 777888999), { consultar: async () => { consultas++; return []; } });
  igual(consultas, 0, 'un revocado nunca provoca una consulta a la base');
  const b = await rev(msg('/start', 777888999));
  igual([b[0].metodo, b[0].cuerpo.animation], ['sendAnimation', 'https://ejemplo.test/bot/revocado.mp4'], '«Iniciar» de un revocado: animación de acceso revocado');
  ok(b[0].cuerpo.caption === tAna && b[0].cuerpo.reply_markup.remove_keyboard === true && b[0].alternativa.metodo === 'sendMessage', 'con el mismo texto, quitándole los atajos y, si el video falla, como mensaje');
  const c = await rev(msg('hola', 777888999));
  ok(c[0].cuerpo.text === tAna, 'cualquier mensaje de un revocado (también tocar un atajo) recibe el aviso');

  // Botones del menú: aviso emergente, el menú desaparece y queda el mensaje
  const boton = (mensaje) => ({ callback_query: { id: 'cb9', data: 'c:proyectos', message: { chat: { id: 777888999 }, message_id: 31, ...mensaje } } });
  const d = await rev(boton({ text: 'menú' }));
  igual(d[0].metodo, 'answerCallbackQuery', 'el botón se contesta primero');
  ok(d[0].cuerpo.show_alert === true && d[0].cuerpo.text.includes('revocado'), 'con un aviso emergente («Tu acceso fue revocado»)');
  const e = d.find((x) => x.metodo === 'editMessageText');
  ok(e && e.cuerpo.message_id === 31 && e.cuerpo.text === t && e.cuerpo.reply_markup.inline_keyboard.length === 0, 'el mensaje del menú se reemplaza por el aviso y se quitan los botones');
  ok(e.alternativa.metodo === 'sendMessage', 'si no se puede editar, se envía el aviso');
  const f = await rev(boton({ animation: {}, caption: 'bienvenida' }));
  ok(f.some((x) => x.metodo === 'editMessageReplyMarkup' && x.cuerpo.reply_markup.inline_keyboard.length === 0) && f.some((x) => x.metodo === 'sendMessage' && x.cuerpo.text === t), 'en la animación de bienvenida se quitan los botones y se envía el aviso');
  const g = await procesarUpdate(boton({ text: 'menú' }), { consultar: sin, permitidos: PERMITIDOS, revocados: new Set(), hoy: HOY });
  ok(g.length === 1 && g[0].cuerpo.show_alert === undefined && /privado/.test(g[0].cuerpo.text), 'quien nunca tuvo acceso sigue viendo «Este bot es privado», sin aviso de revocación');
  const h = await ejecutar(msg('/proyectos', 555000111));
  ok(/privado/.test(h[0].cuerpo.text) && !h[0].cuerpo.text.includes('revocado'), 'un extraño (nunca tuvo acceso) no ve el mensaje de revocación');

  // Un administrador fijo nunca se trata como revocado, aunque su perfil del módulo esté revocado
  const adm = await procesarUpdate(msg('/ayuda'), { consultar: sin, permitidos: PERMITIDOS, revocados: new Set(['424242424']), hoy: HOY });
  ok(adm.some((x) => x.metodo === 'sendMessage' && /Asistente V1K/.test(x.cuerpo.text)), 'un administrador fijo sigue atendido aunque su perfil del módulo esté revocado');

  // Bot del resumen
  const r1 = await procesarUpdateResumen(msg('/start', 777888999), { permitidos: PERMITIDOS, revocados: REVOCADOS, panel: 'https://ejemplo.test' });
  igual([r1[0].cuerpo.animation, r1[0].cuerpo.caption === tAna], ['https://ejemplo.test/bot/revocado.mp4', true], 'bot del resumen: «Iniciar» de un revocado → animación y aviso');
  const r2 = await procesarUpdateResumen(msg('buenas', 777888999), { permitidos: PERMITIDOS, revocados: REVOCADOS });
  ok(r2[0].metodo === 'sendMessage' && r2[0].cuerpo.text === tAna, 'bot del resumen: otros mensajes de un revocado reciben el aviso');
  const r3 = await procesarUpdateResumen(msg('/start', 555000111), { permitidos: PERMITIDOS, revocados: REVOCADOS });
  ok(r3[0].cuerpo.animation.endsWith('/privado.mp4'), 'bot del resumen: quien nunca tuvo acceso sigue viendo «acceso privado»');

  // El manejador lee la lista de revocados
  const SECRETO = 's'.repeat(40);
  const envC = { TELEGRAM_BOT_COMANDOS_TOKEN: '1234567890:AAExampleTokenQueNoEsReal_abcdefghijk', TELEGRAM_WEBHOOK_SECRET: SECRETO, TELEGRAM_CHATS_PERMITIDOS: '424242424' };
  const enviados = [];
  const fetchFalso = async (url, init) => { if (!url.endsWith('/sendChatAction')) enviados.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  const res = () => ({ codigo: 0, setHeader() {}, status(c) { this.codigo = c; return this; }, json() { return this; } });
  const llamar = async (extra, update) => { const r = res(); enviados.length = 0; await crearManejador({ env: envC, consultar: sin, fetchFn: fetchFalso, ...extra })({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': SECRETO }, body: update }, r); return r; };
  let r = await llamar({ chatsRevocados: async () => ['777888999'] }, msg('/proyectos', 777888999));
  ok(r.codigo === 200 && enviados[0].text === tAna, 'el manejador: un chat de la lista de revocados recibe el aviso');
  r = await llamar({ chatsRevocados: async () => { throw new Error('base caída'); } }, msg('/proyectos', 777888999));
  ok(r.codigo === 200 && /privado/.test(enviados[0].text), 'si la lista de revocados falla, se trata como «bot privado» (nunca da acceso)');
  r = await llamar({ chatsExtra: async () => ['777888999'], chatsRevocados: async () => ['777888999'] }, msg('/ayuda', 777888999));
  ok(/Asistente V1K/.test(enviados[0].text), 'si alguien aparece como activo, manda el acceso (no el aviso de revocación)');

  // Lector de revocados
  const lector = crearLectorDeRevocados(async (texto) => { ok(/v_telegram_chats_revocados/.test(texto) && !/nombre|telefono/.test(texto), 'solo la vista de números de chat revocados'); return [{ chat_id: 777888999 }]; });
  igual(await lector(), ['777888999'], 'el lector de revocados devuelve números de chat como texto');
  igual(await crearLectorDeRevocados(async () => { throw new Error('x'); })(), [], 'si la base falla, devuelve vacío');
  const anim = fs.readFileSync(path.join(aqui, '..', 'public', 'bot', 'revocado.mp4'));
  ok(anim.subarray(4, 8).toString() === 'ftyp' && anim.length > 20_000 && anim.length < 2_000_000 && anim.includes(Buffer.from('avc1')), 'existe revocado.mp4 (H.264, tamaño razonable)');
}

// ── Documentación del diseño ─────────────────────────────────────────────────────────────
{
  const raiz = path.join(aqui, '..', '..');
  const leer = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8');
  const readme = leer('README.md'), guia = leer('docs', 'TELEGRAM_PASO_A_PASO.md'), admin = leer('docs', 'BOT_TELEGRAM.md');
  for (const v of ['bienvenida', 'privado', 'resumen']) ok(readme.includes(`docs/assets/bot-${v}.jpg`) && fs.existsSync(path.join(raiz, 'docs', 'assets', `bot-${v}.jpg`)), `el README muestra bot-${v}.jpg y existe`);
  ok(/El número de chat, en una frase/.test(guia) && /No tienes que buscarlo/.test(guia) && /paso 7/.test(guia), 'la guía explica en una frase qué es el número de chat y cómo se consigue');
  const reg = leer('docs', 'assets', 'telegram-registro.svg');
  ok(/ocho pasos/i.test(reg) && /módulo Accesos de Telegram/.test(reg) && /Copiado/.test(reg) && /Ya tienes acceso/.test(reg), 'la animación de registro llega hasta el módulo del administrador y el aviso «Ya tienes acceso»');
  ok(/Ocho pasos/.test(guia) && /Ocho pasos/.test(readme), 'la guía y el README describen los ocho pasos');
  ok(/Tu acceso fue revocado/.test(guia) && /v_telegram_chats_revocados/.test(admin) && /acceso fue revocado/.test(admin), 'las guías explican el aviso de acceso revocado');
  ok(/recuadro/.test(guia) && /Toca el número/.test(guia) && /Hazlo en los dos bots/.test(guia), 'la guía explica la bienvenida y que el número se copia al tocarlo');
  ok(guia.includes('assets/bot-privado.jpg') && fs.existsSync(path.join(raiz, 'docs', 'assets', 'bot-privado.jpg')), 'la guía muestra la animación de acceso privado');
  for (const dato of ['TELEGRAM_BOT_RESUMEN_TOKEN', 'TELEGRAM_RESUMEN_WEBHOOK_SECRET', '--bot resumen', 'generar-banners.mjs', '/setdescriptionpic']) ok(admin.includes(dato), `la guía del administrador menciona ${dato}`);
}

igual(esc('<&>'), '&lt;&amp;&gt;', 'esc');
igual(typeof crearLimitador, 'function', 'el limitador sigue disponible');
console.log(`OK: diseño de los bots — ${n} comprobaciones (tarjetas y barras, bienvenida animada con número de chat, edición de mensajes, bot del resumen, resumen con diseño y videos)`);
