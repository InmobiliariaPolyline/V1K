// Pruebas del flujo diario: la foto del historial (scripts/foto-diaria.mjs), el resumen por Telegram (scripts/resumen-diario.mjs)
// y el flujo de GitHub Actions que los ejecuta. Se cuida sobre todo la PRIVACIDAD: el repositorio y su registro son públicos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { mensajeSeguro, tomarFoto } from '../scripts/foto-diaria.mjs';
import { MAX_TELEGRAM, buscarChats, componerResumen, enviarAVarios, chatsDeLaBase, enviarTelegram, hoyEnLima, leerApi, listaDeChats, prepararMensaje } from '../scripts/resumen-diario.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const igual = (a, b, m) => { n++; assert.deepEqual(a, b, m); };

// ── Datos de ejemplo (ficticios) ─────────────────────────────────────────────────────────
const resumen = () => ({
  proyectos: { total: 10, atrasados: 3, en_curso: 4, por_iniciar: 1, terminados: 2, tareas_atrasadas: 18 },
  proyectos_atrasados: [{ nombre: 'Torre Miraflores', responsable: 'Ana', avance_pct: 62, fin: '2026-11-01', tareas_atrasadas: 6 }],
  proximos_hitos: [{ fecha: '2026-11-21', descripcion: 'Recepción de acero', proyecto: 'Edificio San Isidro' }, { fecha: '2026-12-30', descripcion: 'Entrega', proyecto: 'Hotel Costa Azul' }],
  stock: { materiales_con_minimo: 501, en_stock_bajo: 501, sin_existencias: 499 },
  mayor_faltante: [{ material: 'Acero', categoria: 'Acero', unidad: 'kg', cantidad: 15, minimo: 4200, faltante: 4185 }],
  pedidos: { abiertos: 2 },
  proximos_pedidos: [{ pedido_id: 'OC-1040', proveedor: 'Aceros del Sur', obra: 'Torre', estado: 'enviada', llegada_estimada: '2026-11-17' }, { pedido_id: 'OC-1041', proveedor: 'Cementos Andinos', obra: 'Casa', estado: 'pendiente', llegada_estimada: null }],
  propiedades: { total_catalogo: 5224, copiadas: 200 }, propiedades_por_portal: [],
  frescura: [{ app: 'mrp', ultima_sync: 'x', hace_horas: 20.8 }, { app: 'planner', ultima_sync: 'x', hace_horas: 18.3 }, { app: 'scraper', ultima_sync: 'x', hace_horas: 3.5 }],
});
const dia = (d, extra = {}) => ({ dia: `2026-11-${String(d).padStart(2, '0')}`, proyectos_atrasados: 2, tareas_atrasadas: 10, pedidos_vencidos: 0, materiales_sin_existencias: 499, propiedades_catalogo: 5000, precio_mediano_venta_usd: 260000, precio_mediano_alquiler_usd: 1300, ...extra });
const HISTORIAL = [dia(19, { proyectos_atrasados: 3, tareas_atrasadas: 18, propiedades_catalogo: 5224 }), dia(18), dia(15), dia(12)];

// ── hoy en Lima ──────────────────────────────────────────────────────────────────────────
igual(hoyEnLima(new Date('2026-11-19T13:07:00Z')), '2026-11-19', 'a las 08:07 de Lima ya es 19');
igual(hoyEnLima(new Date('2026-11-19T03:00:00Z')), '2026-11-18', 'a las 22:00 de Lima todavía es 18');

// ── el mensaje ───────────────────────────────────────────────────────────────────────────
{
  const t = componerResumen(resumen(), HISTORIAL, { hoy: '2026-11-19', panel: 'https://ejemplo.test' });
  ok(t.startsWith('V1K · jueves 19/11/2026'), 'título con el día de la semana y la fecha');
  ok(t.includes('🔴 Requiere atención'), 'estado general');
  ok(t.includes('Qué mirar primero') && t.includes('3 proyectos atrasados') && t.includes('Torre Miraflores'), 'alertas con el proyecto más antiguo');
  ok(t.includes('Inventario casi sin cargar: 499 de 501'), 'el inventario sin cargar se explica, no se presenta como 501 faltantes');
  ok(!/501 materiales bajo su mínimo/.test(t), 'sin la cifra engañosa');
  ok(t.includes('Recepción de acero (Edificio San Isidro) — en 2 días'), 'próximos hitos con días restantes');
  ok(t.includes('Llega OC-1040 de Aceros del Sur — hace 2 días'), 'un pedido con llegada vencida se nota');
  ok(!t.includes('OC-1041'), 'un pedido sin fecha no se lista como «llega»');
  ok(t.includes('Cambios en 7 días (desde el 12/11/2026)') && t.includes('Proyectos atrasados: 2 → 3 (+1)') && t.includes('Tareas atrasadas: 10 → 18 (+8)'), 'cambios de la semana');
  ok(t.includes('🔴 Proyectos atrasados') && t.includes('Propiedades en el catálogo: 5,000 → 5,224 (+224)'), 'lo peor en rojo, lo neutro sin juicio');
  ok(!t.includes('Materiales sin existencias:'), 'lo que no cambió no se repite');
  ok(t.includes('Datos al día: mrp 21 h · planner 18 h · scraper 4 h') && t.endsWith('Panel: https://ejemplo.test'), 'frescura y enlace al panel');
  ok(t.length <= MAX_TELEGRAM && !/\n{3,}/.test(t), 'cabe en Telegram y sin saltos de más');
  ok(!/token|Bearer|postgres/i.test(t), 'el mensaje nunca lleva credenciales');
}
{
  const sano = resumen(); sano.proyectos = { total: 4, atrasados: 0, en_curso: 3, por_iniciar: 0, terminados: 1, tareas_atrasadas: 0 }; sano.proyectos_atrasados = []; sano.stock = { materiales_con_minimo: 100, en_stock_bajo: 0, sin_existencias: 0 }; sano.proximos_pedidos = []; sano.proximos_hitos = [];
  const t = componerResumen(sano, null, { hoy: '2026-11-19' });
  ok(t.includes('✅ Todo en orden'), 'todo en orden');
  ok(t.includes('Historial: se guarda una foto por día'), 'sin historial se explica en vez de inventar cambios');
  ok(!t.includes('Qué mirar primero'), 'sin alertas no hay sección vacía');
  const sinCambios = componerResumen(sano, [dia(19), dia(18)], { hoy: '2026-11-19' });
  ok(sinCambios.includes('Sin cambios en lo que se sigue.'), 'sin cambios se dice');
  const mejora = componerResumen(sano, [dia(19, { proyectos_atrasados: 0 }), dia(10, { proyectos_atrasados: 2 })], { hoy: '2026-11-19' });
  ok(mejora.includes('🟢 Proyectos atrasados: 2 → 0 (−2)'), 'una mejora va en verde');
  ok(componerResumen(sano, [dia(19)], { hoy: '2026-11-19' }).includes('Historial: se guarda'), 'un solo día de historial aún no permite comparar');
  const largo = resumen(); largo.proximos_hitos = Array.from({ length: 3 }, () => ({ fecha: '2026-11-21', descripcion: 'x'.repeat(2000), proyecto: 'p' }));
  const cortado = componerResumen(largo, HISTORIAL, { hoy: '2026-11-19' });
  ok(cortado.length <= MAX_TELEGRAM && cortado.endsWith('…'), 'un mensaje enorme se corta con «…»');
}

// ── Telegram ─────────────────────────────────────────────────────────────────────────────
const respuesta = (estado, cuerpo = {}) => ({ ok: estado >= 200 && estado < 300, status: estado, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
{
  let visto;
  const r = await enviarTelegram({ token: '123:ABC-def', chatId: '555', texto: 'hola', fetchFn: async (url, opc) => { visto = { url, opc }; return respuesta(200); } });
  igual(r, { estado: 200 });
  ok(visto.url === 'https://api.telegram.org/bot123:ABC-def/sendMessage' && visto.opc.method === 'POST', 'URL de la API de Telegram');
  igual(JSON.parse(visto.opc.body), { chat_id: '555', text: 'hola', disable_web_page_preview: true });
  ok(!visto.opc.body.includes('123:ABC-def'), 'el token no viaja en el cuerpo');
  await assert.rejects(() => enviarTelegram({ token: '123:ABC-def', chatId: '1', texto: 'x', fetchFn: async () => respuesta(401, { description: 'Unauthorized 123:ABC-def' }) }),
    (e) => e.message === 'Telegram respondió HTTP 401' && !e.message.includes('123:ABC-def')); n++;
  const chats = await buscarChats('t', async () => respuesta(200, { result: [{ message: { chat: { id: 7, type: 'private', first_name: 'Ana' } } }, { message: { chat: { id: 7, type: 'private', first_name: 'Ana' } } }, { channel_post: { chat: { id: -100, type: 'channel', title: 'Canal' } } }, { edited: 1 }] }));
  igual(chats, [{ id: 7, tipo: 'private', nombre: 'Ana' }, { id: -100, tipo: 'channel', nombre: 'Canal' }], 'chats únicos que le escribieron al bot');
  igual(await buscarChats('t', async () => respuesta(200, {})), [], 'sin mensajes todavía');
}

// ── varios destinatarios ─────────────────────────────────────────────────────────
{
  igual(listaDeChats('123456, -100987 ,abc,12;123456'), ['123456', '-100987'], 'lista de chats: solo números válidos y sin repetir');
  igual(listaDeChats(undefined), [], 'sin secreto no hay chats');
  igual(listaDeChats('123456789'), ['123456789'], 'un solo chat sigue funcionando como antes');
  const vistos = [];
  const falso = async (url, opc) => { const c = JSON.parse(opc.body).chat_id; vistos.push(c); return respuesta(c === '222' ? 400 : 200); };
  const r = await enviarAVarios({ token: '123:ABC-def', chats: ['111', '222', '333'], texto: 'hola', fetchFn: falso });
  igual(vistos, ['111', '222', '333'], 'se intenta con cada chat aunque uno falle');
  igual(r, { enviados: 2, fallidos: 1 }, 'cuenta los enviados y los fallidos');
  ok(!JSON.stringify(r).includes('222'), 'el resultado nunca incluye números de chat');
  igual(await enviarAVarios({ token: 't', chats: [], texto: 'x', fetchFn: falso }), { enviados: 0, fallidos: 0 }, 'sin chats no envía');
}

// ── lista de accesos de la base ───────────────────────────────────────────────────
{
  const pedidas = [];
  const lista = await chatsDeLaBase(async (q) => { pedidas.push(q); return [{ chat_id: '111111111' }, { chat_id: '222222222' }, { chat_id: 'x' }, { chat_id: '111111111' }]; });
  igual(lista, ['111111111', '222222222'], 'chats de la base: válidos y sin repetir');
  ok(pedidas.length === 1 && pedidas[0].includes('v_telegram_chats_activos') && !/nombre|telefono/.test(pedidas[0]), 'consulta solo la vista de números de chat');
  igual(await chatsDeLaBase(async () => []), [], 'sin personas, lista vacía');
}

// ── API ──────────────────────────────────────────────────────────────────────────────────
{
  const enrutada = (mapa) => async (url) => { const k = Object.keys(mapa).find((x) => url.includes(x)); if (!k) throw new Error('red'); const m = mapa[k]; return m instanceof Error ? (() => { throw m; })() : respuesta(m.estado, m.cuerpo); };
  igual(await leerApi('http://x', '/api/a', 'T'.repeat(30), async () => { throw new Error('caída'); }), { estado: 0, cuerpo: null }, 'una caída no lanza');
  let cab; await leerApi('http://x', '/api/a', 'T'.repeat(30), async (u, o) => { cab = o.headers; return respuesta(200, {}); });
  igual(cab.Authorization, `Bearer ${'T'.repeat(30)}`);

  const buena = enrutada({ '/api/resumen-general': { estado: 200, cuerpo: { datos: [resumen()] } }, '/api/historial': { estado: 200, cuerpo: { datos: HISTORIAL } } });
  const a = await prepararMensaje({ base: 'https://ejemplo.test', token: 'x'.repeat(30), fetchFn: buena, ahora: new Date('2026-11-19T13:07:00Z') });
  ok(a.texto.includes('Cambios en 7 días') && a.texto.includes('Panel: https://ejemplo.test'), 'lee el resumen y el historial');
  const sinTabla = enrutada({ '/api/resumen-general': { estado: 200, cuerpo: { datos: [resumen()] } }, '/api/historial': { estado: 502, cuerpo: { error: 'x' } } });
  const b = await prepararMensaje({ base: 'https://ejemplo.test', token: 'x'.repeat(30), fetchFn: sinTabla });
  ok(b.texto.includes('Historial: se guarda una foto por día') && !b.error, 'si el historial aún no existe (502), el resumen sale igual');
  const sinAcceso = enrutada({ '/api/resumen-general': { estado: 401, cuerpo: { error: 'no' } }, '/api/historial': { estado: 401, cuerpo: {} } });
  const c = await prepararMensaje({ base: 'https://ejemplo.test', token: 'x'.repeat(30), fetchFn: sinAcceso });
  ok(c.error === 'no se pudo leer la API (HTTP 401)' && !c.texto, 'si no hay acceso devuelve un error corto, sin el cuerpo de la respuesta');
  const vacia = enrutada({ '/api/resumen-general': { estado: 200, cuerpo: { datos: [] } }, '/api/historial': { estado: 200, cuerpo: { datos: [] } } });
  ok((await prepararMensaje({ base: 'https://ejemplo.test', token: 'x'.repeat(30), fetchFn: vacia })).error, 'una respuesta sin datos es un error, no un mensaje vacío');
}

// ── foto diaria ──────────────────────────────────────────────────────────────────────────
igual(await tomarFoto({ query: async (t) => { ok(/tomar_foto_diaria/.test(t), 'llama a la función'); return [{ dia: new Date('2026-11-19T00:00:00Z'), proyectos_total: 4 }]; } }), { dia: '2026-11-19' }, 'día como fecha');
igual(await tomarFoto({ query: async () => [{ dia: '2026-11-19' }] }), { dia: '2026-11-19' }, 'día como texto');
await assert.rejects(() => tomarFoto({ query: async () => [] }), /ninguna fila/); n++;
igual(mensajeSeguro(new Error('connection refused postgresql://u:secreto@host/db y más')), 'connection refused [conexión] y más', 'sin cadenas de conexión');
ok(mensajeSeguro(new Error('x'.repeat(1000))).length === 200, 'mensaje acotado');

// ── privacidad del registro (repositorio público) ────────────────────────────────────────
const fuente = (f) => fs.readFileSync(path.join(raiz, 'coze-api', 'scripts', f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
{
  const foto = fuente('foto-diaria.mjs');
  const logs = [...foto.matchAll(/console\.(log|error)\(([^;]*)\)/g)].map((m) => m[2]);
  ok(logs.every((l) => !/filas|f\.|resultado|proyectos/.test(l)), 'la foto diaria no escribe números en el registro: solo el día');
  ok(!/process\.env\.HISTORIAL_DATABASE_URL[^;]*console/.test(foto), 'no imprime la cadena de conexión');
  const res = fuente('resumen-diario.mjs');
  const conTexto = [...res.matchAll(/console\.log\([^;]*texto[^;]*\)/g)].map((m) => m[0]);
  ok(conTexto.length === 2 && conTexto.every((l) => /--mostrar|caracteres/.test(l) || /texto\.length/.test(l) || /error \?/.test(l)), 'el contenido del resumen solo se imprime con --mostrar; en el registro solo su largo');
  ok(/arg\.includes\('--mostrar'\)\) \{ console\.log/.test(res), '--mostrar es explícito');
  ok(!/console\.\w+\([^)]*(tokenTg|apiToken|chatId)/.test(res), 'ni los tokens ni el chat se imprimen');
  ok(/replace\(\/bot\[\\w:-\]\+\/g/.test(res), 'un error inesperado oculta el token del bot');
}

// ── flujo de GitHub Actions ──────────────────────────────────────────────────────────────
{
  const ruta = path.join(raiz, '.github', 'workflows', 'diario.yml');
  const t = fs.readFileSync(ruta, 'utf8');
  const w = YAML.parse(t);
  ok(/^7 13 \* \* \*$/.test(w.on.schedule[0].cron), '08:07 de Lima (13:07 UTC), a un minuto que no sea en punto');
  ok('workflow_dispatch' in w.on, 'se puede lanzar a mano');
  igual(w.permissions, { contents: 'read' }, 'solo lectura del código');
  const pasos = w.jobs.diario.steps;
  const por = (frag) => pasos.find((p) => (p.run ?? '').includes(frag));
  ok(por('npm ci') && por('node scripts/foto-diaria.mjs') && por('node scripts/resumen-diario.mjs'), 'instala, toma la foto y envía el resumen');
  igual(por('foto-diaria').env, { HISTORIAL_DATABASE_URL: '${{ secrets.HISTORIAL_DATABASE_URL }}' }, 'la foto solo ve su propio secreto');
  igual(Object.keys(por('resumen-diario').env).sort(), ['API_TOKEN', 'HISTORIAL_DATABASE_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'], 'el resumen ve la API, Telegram y la base solo para leer la lista de accesos');
  const res = fs.readFileSync(path.join(raiz, 'coze-api', 'scripts', 'resumen-diario.mjs'), 'utf8');
  ok(/central\.v_telegram_chats_activos/.test(res) && !/telegram_accesos\b/.test(res.replace(/v_telegram_chats_activos/g, '')), 'el resumen lee solo la vista de números de chat, nunca la tabla con nombres y teléfonos');
  ok(por('resumen-diario')['if'] === '${{ !cancelled() }}', 'el resumen sale aunque la foto falle');
  ok(pasos.indexOf(por('foto-diaria')) < pasos.indexOf(por('resumen-diario')), 'primero la foto, luego el resumen (así incluye el día de hoy)');
  ok(!/echo|cat |set -x|--mostrar|upload-artifact/.test(t.replace(/^\s*#.*$/gm, '')), 'el flujo no imprime, no sube archivos ni usa --mostrar: el registro es público');
  ok(/PRIVADO|públic/i.test(t), 'el flujo recuerda que el registro es público');
}

console.log(`OK: flujo diario — ${n} comprobaciones (mensaje, Telegram, foto del historial y privacidad del registro)`);
