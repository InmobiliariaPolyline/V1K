// BATERÍA A — caja negra de la API en vivo. No imprime el token. No modifica nada (solo GET/errores).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // raíz del repositorio V1K
import YAML from 'yaml';

const BASE = 'https://v1k-coze-api.vercel.app';
const texto = fs.readFileSync(path.join(RAIZ, 'db', 'conexiones.local.txt'), 'utf8');
const TOKEN = texto.match(/^API_TOKEN = (\S+)/m)[1];
const spec = YAML.parse(fs.readFileSync(path.join(RAIZ, 'coze-api', 'openapi.yaml'), 'utf8'));

const RUTAS = ['frescura', 'proyectos', 'hitos', 'stock-bajo', 'pedidos', 'propiedades', 'propiedades-resumen', 'resumen-general'];
let total = 0, ok = 0;
const fallos = [];
const lat = [];

function chequea(nombre, condicion, detalle = '') {
  total++;
  if (condicion) ok++; else fallos.push(`${nombre} ${detalle}`);
}

async function llama(ruta, { metodo = 'GET', headers = {}, query = '', raw = false } = {}) {
  const url = raw ? `${BASE}${ruta}` : `${BASE}/api/${ruta}${query}`;
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method: metodo, headers, redirect: 'manual', signal: AbortSignal.timeout(30000) });
    const cuerpo = await r.text();
    lat.push(Date.now() - t0);
    return { status: r.status, cuerpo, headers: r.headers, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, cuerpo: String(e), headers: new Headers(), ms: Date.now() - t0 };
  }
}
const json = (c) => { try { return JSON.parse(c); } catch { return null; } };
const A = (t = TOKEN) => ({ Authorization: `Bearer ${t}` });

// Ejecuta tareas con concurrencia limitada
async function lote(tareas, n = 6) {
  const res = new Array(tareas.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < tareas.length) { const k = i++; res[k] = await tareas[k](); }
  }));
  return res;
}

// ── 1) Matriz de autenticación: 7 rutas × 13 variantes = 91 ─────────────────────────
const variantes = [
  ['sin cabecera', {}, 401],
  ['token correcto', A(), 200],
  ['token incorrecto', A('x'.repeat(40)), 401],
  ['token + 1 carácter', A(TOKEN + 'x'), 401],
  ['token truncado', A(TOKEN.slice(0, 39)), 401],
  ['token en minúsculas', A(TOKEN.toLowerCase()), 401],
  ['esquema "bearer" en minúscula', { Authorization: `bearer ${TOKEN}` }, 401],
  ['sin la palabra Bearer', { Authorization: TOKEN }, 401],
  ['Bearer vacío', { Authorization: 'Bearer ' }, 401],
  ['esquema Basic', { Authorization: `Basic ${Buffer.from('a:' + TOKEN).toString('base64')}` }, 401],
  ['token en x-api-key', { 'x-api-key': TOKEN }, 401],
  ['token en cookie', { Cookie: `token=${TOKEN}` }, 401],
  ['token con espacio final', { Authorization: `Bearer ${TOKEN} ` }, [200, 401]],
];
{
  const tareas = [];
  for (const ruta of RUTAS) for (const [nombre, headers, esperado] of variantes) {
    tareas.push(async () => {
      const r = await llama(ruta, { headers });
      const esp = Array.isArray(esperado) ? esperado : [esperado];
      chequea(`[auth] ${ruta} · ${nombre}`, esp.includes(r.status), `-> ${r.status}`);
    });
  }
  for (const ruta of RUTAS) tareas.push(async () => {
    const r = await llama(ruta, { query: `?token=${TOKEN}` });
    chequea(`[auth] ${ruta} · token por query string no sirve`, r.status === 401, `-> ${r.status}`);
  });
  await lote(tareas);
}

// ── 2) Métodos HTTP: 7 rutas × 6 = 42 ───────────────────────────────────────────────
{
  const tareas = [];
  for (const ruta of RUTAS) {
    for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) tareas.push(async () => {
      const r = await llama(ruta, { metodo: m, headers: A() });
      chequea(`[método] ${ruta} · ${m} rechazado`, r.status === 405, `-> ${r.status}`);
    });
    for (const m of ['HEAD', 'OPTIONS']) tareas.push(async () => {
      const r = await llama(ruta, { metodo: m, headers: A() });
      chequea(`[método] ${ruta} · ${m} sin error de servidor`, r.status > 0 && r.status < 500, `-> ${r.status}`);
    });
  }
  await lote(tareas);
}

// ── 3) Nombres de vista hostiles (con token válido) ─────────────────────────────────
const nombresHostiles = [
  'constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'prototype', '__defineGetter__', 'isPrototypeOf',
  'FRESCURA', 'Frescura', 'frescura.json', 'frescura%20', ' frescura', 'frescura%00', 'frescura;', 'frescura%27',
  "proyectos';--", 'proyectos%27%20OR%201=1--', '..%2f..%2fetc%2fpasswd', '%2e%2e', '..', '.', 'api', 'undefined', 'null',
  'inexistente', 'x'.repeat(2000), 'ñandú', '%F0%9F%98%80', '<script>alert(1)</script>', '${7*7}', '{{7*7}}',
];
{
  const tareas = nombresHostiles.map((n) => async () => {
    const r = await llama(n.includes('%') || /[\s;'<>${}]/.test(n) ? n : encodeURIComponent(n), { headers: A() });
    const c = json(r.cuerpo);
    // Aceptable: 404 (o 200 solo si es una ruta real). Jamás 5xx ni 200 con datos de otra cosa.
    // `/api/..` lo normaliza el cliente a `/`, que sirve el panel (HTML, sin datos): es lo único que puede dar 200
    const esRaiz = ['..', '%2e%2e', '.'].includes(n);
    const ok = esRaiz ? (r.status === 200 && /^<!doctype html>/i.test(r.cuerpo) && !/proyecto_id|material_id/.test(r.cuerpo)) || [404, 400].includes(r.status) : [404, 400, 401, 405].includes(r.status);
    chequea(`[ruta hostil] "${n.slice(0, 30)}"`, ok && r.status < 500, `-> ${r.status} ${String(r.cuerpo).slice(0, 80)}`);
  });
  await lote(tareas);
}
// rutas extra con prefijo distinto
for (const p of ['/api/frescura/extra', '/api/', '/api', '/', '/admin', '/.env', '/api/%5Bvista%5D', '/api/proyectos/../hitos']) {
  const r = await llama(p, { raw: true, headers: A() });
  chequea(`[ruta extra] ${p}`, r.status < 500, `-> ${r.status}`);
}

// ── 4) Parámetro q (propiedades y rutas que lo ignoran) ─────────────────────────────
const qs = [
  '', ' ', '%', '_', '%%', '__', '\\', "'", '"', "' OR 1=1 --", "'; DROP TABLE central.sync_estado; --", "%' OR '1'='1",
  "') UNION SELECT usename FROM pg_user --", 'Miraflores', 'miraflores', 'MIRAFLORES', 'Ñandú', '日本語', '😀', 'a\nb', 'a\tb', '\u0000',
  '%00', '..', '<script>', '{"a":1}', '[]', '(.*)', '^$', '.*', 'x'.repeat(61), 'x'.repeat(10000), '%25', '%27', 'null', 'undefined', 'true', '0', '-1', '1e309', 'a&b=c',
];
{
  const tareas = [];
  for (const q of qs) tareas.push(async () => {
    const r = await llama('propiedades', { headers: A(), query: `?q=${encodeURIComponent(q)}` });
    const c = json(r.cuerpo);
    chequea(`[q] propiedades q=${JSON.stringify(q).slice(0, 25)}`, r.status === 200 && c && Array.isArray(c.datos), `-> ${r.status} ${String(r.cuerpo).slice(0, 80)}`);
  });
  for (const ruta of RUTAS.filter((x) => x !== 'propiedades')) for (const q of ["' OR 1=1 --", 'x'.repeat(500), '%']) tareas.push(async () => {
    const r = await llama(ruta, { headers: A(), query: `?q=${encodeURIComponent(q)}` });
    chequea(`[q ignorado] ${ruta} q=${q.slice(0, 10)}`, r.status === 200, `-> ${r.status}`);
  });
  // q repetido y como arreglo
  for (const extra of ['?q=a&q=b', '?q[]=a', '?q[a]=b', '?q=a&q=', '?Q=a', '?q', '?q=&q=&q=']) tareas.push(async () => {
    const r = await llama('propiedades', { headers: A(), query: extra });
    chequea(`[q raro] ${extra}`, r.status === 200 && Array.isArray(json(r.cuerpo)?.datos), `-> ${r.status}`);
  });
  await lote(tareas);
}

// ── 5) Forma de la respuesta contra el OpenAPI ──────────────────────────────────────
function tipoOk(valor, tipo) {
  if (valor === null) return true; // columnas opcionales
  if (tipo === 'string') return typeof valor === 'string';
  if (tipo === 'integer') return Number.isInteger(valor);
  if (tipo === 'number') return typeof valor === 'number';
  return true;
}
const datosVivos = {};
for (const ruta of RUTAS) {
  const r = await llama(ruta, { headers: A() });
  const c = json(r.cuerpo);
  datosVivos[ruta] = c;
  chequea(`[forma] ${ruta} 200 y JSON`, r.status === 200 && c !== null, `-> ${r.status}`);
  if (!c) continue;
  chequea(`[forma] ${ruta} content-type JSON`, /application\/json/.test(r.headers.get('content-type') || ''));
  chequea(`[forma] ${ruta} Cache-Control no-store`, /no-store/.test(r.headers.get('cache-control') || ''), r.headers.get('cache-control'));
  chequea(`[forma] ${ruta} vista=${ruta}`, c.vista === ruta);
  chequea(`[forma] ${ruta} generado_en ISO`, !Number.isNaN(Date.parse(c.generado_en)));
  chequea(`[forma] ${ruta} total == datos.length`, c.total === c.datos.length, `${c.total} vs ${c.datos.length}`);
  const campos = spec.paths[`/api/${ruta}`].get.responses['200'].content['application/json'].schema.properties.datos.items.properties;
  for (const fila of c.datos.slice(0, 50)) {
    for (const [campo, def] of Object.entries(campos)) {
      if (!(campo in fila)) { chequea(`[forma] ${ruta}.${campo} presente`, false, 'falta'); break; }
      if (!tipoOk(fila[campo], def.type)) { chequea(`[forma] ${ruta}.${campo} tipo ${def.type}`, false, `valor ${JSON.stringify(fila[campo])}`); break; }
    }
    const extras = Object.keys(fila).filter((k) => !(k in campos));
    if (extras.length) { chequea(`[forma] ${ruta} sin campos extra`, false, extras.join(',')); break; }
  }
  chequea(`[forma] ${ruta} cuerpo < 1 MB`, r.cuerpo.length < 1_000_000);
}
chequea('[límite] stock-bajo ≤ 25 filas por defecto', (datosVivos['stock-bajo']?.datos?.length ?? 99) <= 25);
chequea('[límite] propiedades ≤ 50 filas', (datosVivos['propiedades']?.datos?.length ?? 99) <= 50);

// ── 6) Ráfaga concurrente y latencia ────────────────────────────────────────────────
{
  const t0 = Date.now();
  const tareas = Array.from({ length: 60 }, (_, i) => async () => {
    const ruta = RUTAS[i % RUTAS.length];
    const r = await llama(ruta, { headers: A() });
    chequea(`[ráfaga] ${ruta} #${i}`, r.status === 200, `-> ${r.status}`);
    return r.ms;
  });
  const tiempos = (await lote(tareas, 10)).sort((a, b) => a - b);
  console.log(`ráfaga: 60 peticiones en ${Date.now() - t0} ms | p50=${tiempos[30]} ms p95=${tiempos[57]} ms max=${tiempos[59]} ms`);
  chequea('[ráfaga] p95 < 5 s', tiempos[57] < 5000, `p95=${tiempos[57]}`);
}

// ── 6b) Filtros nuevos: valores válidos filtran de verdad; los no válidos dan 400 con explicación ──
{
  const datos = async (ruta, query) => { const r = await llama(ruta, { headers: A(), query }); return { r, c: json(r.cuerpo) }; };
  const todos = (c, fn) => Array.isArray(c?.datos) && c.datos.every(fn);

  let x = await datos('propiedades', '?operacion=VENTA&limite=20');
  chequea('[filtro] propiedades operacion=VENTA => 200 y todas VENTA', x.r.status === 200 && x.c.total > 0 && todos(x.c, (f) => f.operacion === 'VENTA'), `-> ${x.r.status}`);
  x = await datos('propiedades', '?operacion=alquiler&limite=20');
  chequea('[filtro] operacion sin distinguir mayúsculas', x.r.status === 200 && todos(x.c, (f) => f.operacion === 'ALQUILER'));
  x = await datos('propiedades', '?operacion=VENTA&distrito=arequipa&precio_max_usd=200000&limite=3');
  chequea('[filtro] propiedades combinando 4 filtros respeta limite y precio', x.r.status === 200 && x.c.total <= 3 && todos(x.c, (f) => f.operacion === 'VENTA' && Number(f.precio_usd) > 0 && Number(f.precio_usd) <= 200000), `-> ${x.r.status}`);
  x = await datos('propiedades', '?precio_min_usd=150000&precio_max_usd=160000&limite=30');
  chequea('[filtro] rango de precio mínimo y máximo', x.r.status === 200 && todos(x.c, (f) => Number(f.precio_usd) >= 150000 && Number(f.precio_usd) <= 160000));
  x = await datos('propiedades', '?portal=infocasas&limite=10');
  chequea('[filtro] portal=infocasas', x.r.status === 200 && todos(x.c, (f) => f.portal === 'infocasas'));
  x = await datos('propiedades', '?limite=7');
  chequea('[filtro] limite=7 devuelve como máximo 7', x.r.status === 200 && x.c.total <= 7);
  x = await datos('propiedades', '?limite=100');
  chequea('[filtro] limite=100 (máximo permitido) funciona', x.r.status === 200 && x.c.total <= 100);
  x = await datos('proyectos', '?estado=atrasado');
  chequea('[filtro] proyectos estado=atrasado', x.r.status === 200 && todos(x.c, (f) => f.estado === 'atrasado'));
  x = await datos('proyectos', '?estado=terminado');
  chequea('[filtro] proyectos estado=terminado => 200 (puede estar vacío)', x.r.status === 200 && todos(x.c, (f) => f.estado === 'terminado'));
  x = await datos('stock-bajo', '?limite=3');
  chequea('[filtro] stock-bajo limite=3', x.r.status === 200 && x.c.total <= 3);
  x = await datos('stock-bajo', '?categoria=acero&limite=10');
  chequea('[filtro] stock-bajo categoria=acero', x.r.status === 200 && todos(x.c, (f) => /acero/i.test(f.categoria ?? '')));
  x = await datos('hitos', '?desde=2099-01-01');
  chequea('[filtro] hitos desde 2099 => 200 y vacío', x.r.status === 200 && x.c.total === 0);
  x = await datos('hitos', '?desde=2000-01-01&hasta=2099-12-31');
  chequea('[filtro] hitos con rango de fechas', x.r.status === 200);
  x = await datos('pedidos', '?estado=pendiente');
  chequea('[filtro] pedidos estado=pendiente', x.r.status === 200 && todos(x.c, (f) => f.estado === 'pendiente'));
  x = await datos('propiedades-resumen', '?portal=infocasas&operacion=VENTA');
  chequea('[filtro] propiedades-resumen portal y operacion', x.r.status === 200 && todos(x.c, (f) => f.portal === 'infocasas' && f.operacion === 'VENTA'));

  // No válidos => 400 con un mensaje que explica qué se acepta
  const malos = [
    ['propiedades', '?operacion=REGALO', /VENTA, ALQUILER/],
    ['propiedades', '?portal=otro', /valores permitidos/],
    ['propiedades', '?precio_max_usd=caro', /número/],
    ['propiedades', '?precio_min_usd=-1', /número/],
    ['propiedades', '?precio_max_usd=1e309', /número/],
    ['propiedades', '?limite=0', /entre 1 y 100/],
    ['propiedades', '?limite=101', /entre 1 y 100/],
    ['propiedades', '?limite=2.5', /entero/],
    ['proyectos', '?estado=inventado', /por iniciar, en curso, atrasado, terminado/],
    ['proyectos', "?estado=%27%3B%20DROP%20TABLE%20central.planner_proyectos%3B%20--", /valores permitidos/],
    ['pedidos', '?estado=cerrado', /pendiente, enviada, parcial/],
    ['hitos', '?desde=ayer', /AAAA-MM-DD/],
    ['hitos', '?hasta=2026-02-31', /AAAA-MM-DD/],
    ['stock-bajo', '?limite=101', /entre 1 y 100/],
    ['proyectos', '?limite=201', /entre 1 y 200/],
  ];
  for (const [ruta, query, patron] of malos) {
    const { r, c } = await datos(ruta, query);
    chequea(`[400] ${ruta}${query.slice(0, 40)}`, r.status === 400 && typeof c?.error === 'string' && patron.test(c.error), `-> ${r.status} ${String(r.cuerpo).slice(0, 90)}`);
  }
  // Un valor no válido nunca llega a la base: tampoco como inyección en un enum
  x = await datos('proyectos', '');
  chequea('[400] tras los intentos de inyección la tabla sigue intacta', x.r.status === 200 && x.c.total >= 0 && datosVivos.proyectos.total === x.c.total);
  // Los filtros de texto aceptan cualquier cosa sin romper
  x = await datos('propiedades', `?distrito=${encodeURIComponent("' OR 1=1 --")}&inmueble=${encodeURIComponent('%')}`);
  chequea('[filtro] texto hostil en distrito/inmueble => 200', x.r.status === 200);
  // Filtros desconocidos se ignoran
  x = await datos('propiedades', '?evil=1&estado=x&limite=2');
  chequea('[filtro] parámetros desconocidos se ignoran', x.r.status === 200 && x.c.total <= 2);
}

// ── 6c) resumen-general: forma y coherencia con las demás vistas ────────────────────────
{
  const r = await llama('resumen-general', { headers: A() });
  const c = json(r.cuerpo);
  const f = c?.datos?.[0];
  chequea('[resumen] 200, una sola fila', r.status === 200 && c.total === 1 && f);
  if (f) {
    const claves = ['proyectos', 'proyectos_atrasados', 'proximos_hitos', 'stock', 'mayor_faltante', 'pedidos', 'proximos_pedidos', 'propiedades', 'propiedades_por_portal', 'frescura'];
    chequea('[resumen] trae las 10 secciones', claves.every((k) => k in f), claves.filter((k) => !(k in f)).join(','));
    chequea('[resumen] proyectos: total = suma de estados', f.proyectos.total === f.proyectos.atrasados + f.proyectos.en_curso + f.proyectos.por_iniciar + f.proyectos.terminados, JSON.stringify(f.proyectos));
    const pr = datosVivos.proyectos?.datos ?? [];
    chequea('[resumen] coincide con la vista proyectos (total y atrasados)', f.proyectos.total === pr.length && f.proyectos.atrasados === pr.filter((p) => p.estado === 'atrasado').length);
    chequea('[resumen] la lista de atrasados es de proyectos atrasados (máx. 5)', f.proyectos_atrasados.length <= 5 && f.proyectos_atrasados.length === Math.min(5, f.proyectos.atrasados));
    chequea('[resumen] stock: en_stock_bajo ≤ materiales_con_minimo', f.stock.en_stock_bajo <= f.stock.materiales_con_minimo && f.stock.sin_existencias <= f.stock.materiales_con_minimo);
    chequea('[resumen] mayor_faltante en orden descendente y ≤ 5', f.mayor_faltante.length <= 5 && f.mayor_faltante.every((m, i, a) => i === 0 || a[i - 1].faltante >= m.faltante));
    chequea('[resumen] mayor_faltante coincide con stock-bajo (mismo primer material)', !f.mayor_faltante.length || f.mayor_faltante[0].material === datosVivos['stock-bajo']?.datos?.[0]?.material);
    chequea('[resumen] pedidos: abiertos coincide con la vista pedidos', f.pedidos.abiertos === (datosVivos.pedidos?.total ?? -1));
    const sumaPortales = f.propiedades_por_portal.reduce((a, p) => a + p.total, 0);
    chequea('[resumen] propiedades: total_catalogo = suma por portal', f.propiedades.total_catalogo === sumaPortales, `${f.propiedades.total_catalogo} vs ${sumaPortales}`);
    chequea('[resumen] frescura con hace_horas numérico y las apps conocidas', f.frescura.every((x) => typeof x.hace_horas === 'number' && ['planner', 'mrp', 'scraper'].includes(x.app)));
    chequea('[resumen] números como números (no texto) dentro de las secciones', typeof f.proyectos.total === 'number' && f.mayor_faltante.every((m) => typeof m.faltante === 'number') && f.proyectos_atrasados.every((p) => typeof p.avance_pct === 'number'));
    chequea('[resumen] fechas dentro del resumen en formato AAAA-MM-DD', [...f.proximos_hitos.map((h) => h.fecha), ...f.proyectos_atrasados.map((p) => p.fin)].every((d) => /^\d{4}-\d{2}-\d{2}/.test(d)));
  }
}

// ── 6d) Panel web (raíz) y cabeceras de seguridad ───────────────────────────────────────
{
  const raiz = await llama('/', { raw: true });
  chequea('[panel] GET / => 200 HTML', raiz.status === 200 && /text\/html/.test(raiz.headers.get('content-type') || ''), `-> ${raiz.status}`);
  chequea('[panel] la página es el panel V1K', /<title>V1K · Panel<\/title>/.test(raiz.cuerpo));
  chequea('[panel] sin scripts ni estilos en línea', !/<script(?![^>]*\bsrc=)[^>]*>/i.test(raiz.cuerpo) && !/<style[\s>]/i.test(raiz.cuerpo) && !/\sstyle\s*=/i.test(raiz.cuerpo));
  chequea('[panel] la página no contiene el token ni datos de negocio', !raiz.cuerpo.includes(TOKEN) && !/proyecto_id|material_id/.test(raiz.cuerpo));
  const csp = raiz.headers.get('content-security-policy') || '';
  chequea('[panel] CSP estricta (default-src none, script/style/connect solo self)', /default-src 'none'/.test(csp) && /script-src 'self'/.test(csp) && /style-src 'self'/.test(csp) && /connect-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp), csp);
  chequea('[panel] X-Frame-Options DENY', raiz.headers.get('x-frame-options') === 'DENY');
  chequea('[panel] X-Content-Type-Options nosniff', raiz.headers.get('x-content-type-options') === 'nosniff');
  chequea('[panel] Referrer-Policy no-referrer', raiz.headers.get('referrer-policy') === 'no-referrer');
  chequea('[panel] Permissions-Policy restringe cámara, micrófono y ubicación', /camera=\(\)/.test(raiz.headers.get('permissions-policy') || ''));
  // Todos los archivos de public/ (módulos JS, hojas de estilo, imágenes y vistas.json) se sirven con el tipo correcto
  const PUB = path.join(RAIZ, 'coze-api', 'public');
  const TIPOS = { '.js': /javascript/, '.css': /text\/css/, '.svg': /image\/svg\+xml/, '.json': /application\/json/ };
  const archivos = fs.readdirSync(PUB, { recursive: true }).map((f) => f.replaceAll('\\', '/')).filter((f) => TIPOS[path.extname(f)]);
  chequea('[panel] public/ tiene módulos, estilos e imágenes', archivos.filter((f) => f.endsWith('.js')).length >= 18 && archivos.filter((f) => f.endsWith('.css')).length === 4, `${archivos.length} archivos`);
  const cuerpos = [];
  for (const f of archivos) {
    const a = await llama(`/${f}`, { raw: true });
    chequea(`[panel] /${f} => 200 y tipo correcto`, a.status === 200 && TIPOS[path.extname(f)].test(a.headers.get('content-type') || ''), `-> ${a.status} ${a.headers.get('content-type')}`);
    chequea(`[panel] /${f} idéntico al del repositorio`, a.cuerpo.replace(/\r\n/g, '\n') === fs.readFileSync(path.join(PUB, f), 'utf8').replace(/\r\n/g, '\n'), 'despliegue desactualizado');
    chequea(`[panel] /${f} sin nosniff ni CSP ausentes`, a.headers.get('x-content-type-options') === 'nosniff' && /default-src 'none'/.test(a.headers.get('content-security-policy') || ''));
    if (f.endsWith('.js')) cuerpos.push(a.cuerpo);
  }
  for (const ruta of ['/panel.js', '/panel.css', '/formato.js']) {
    const a = await llama(ruta, { raw: true });
    chequea(`[panel] ${ruta} (panel antiguo) ya no se publica`, a.status === 404, `-> ${a.status}`);
  }
  for (const ruta of ['/.env', '/package.json', '/lib/vistas.js', '/api/../lib/vistas.js', '/test/smoke.mjs', '/vercel.json', '/openapi.yaml', '/node_modules/yaml/package.json']) {
    const a = await llama(ruta, { raw: true });
    chequea(`[panel] ${ruta} NO se publica`, a.status === 404 || a.status === 401 || a.status === 400, `-> ${a.status}`);
  }
  const js = cuerpos.join('\n');
  chequea('[panel] el JS publicado no usa APIs que interpreten HTML', !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
  chequea('[panel] ningún recurso externo (CDN, fuentes)', !/(https?:)?\/\/(cdn|unpkg|fonts|cdnjs)\./i.test(raiz.cuerpo + js));
  chequea('[panel] el JS publicado no contiene el token', !js.includes(TOKEN) && !raiz.cuerpo.includes(TOKEN));
  const vj = json((await llama('/vistas.json', { raw: true })).cuerpo);
  chequea('[panel] vistas.json describe 11 vistas (3 solo del panel) y no contiene secretos', vj?.vistas?.length === 11 && vj.vistas.filter((v) => v.soloPanel).length === 3 && !JSON.stringify(vj).includes(TOKEN));
  // Las vistas solo del panel exigen token y no están en el contrato de Coze
  for (const v of ['stock-categorias', 'propiedades-distritos', 'historial']) {
    const sin = await llama(v), con = await llama(v, { headers: A() });
    chequea(`[panel] /api/${v} sin token => 401`, sin.status === 401, `-> ${sin.status}`);
    const c = json(con.cuerpo);
    chequea(`[panel] /api/${v} con token => 200 y filas`, con.status === 200 && Array.isArray(c?.datos), `-> ${con.status}`);
    chequea(`[panel] /api/${v} no está en openapi.yaml (el agente no la ve)`, !spec.paths[`/api/${v}`]);
  }
}

// ── 6e) Webhook del bot de Telegram (/api/telegram): cerrado para cualquiera que no sea Telegram ──
{
  const ruta = '/api/telegram';
  for (const m of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const r = await llama(ruta, { raw: true, metodo: m });
    chequea(`[telegram] ${m} rechazado`, r.status === 405, `-> ${r.status}`);
    chequea(`[telegram] ${m} no filtra datos`, !/proyecto|material|propiedad/i.test(r.cuerpo));
  }
  const variantes = [
    ['sin cabecera', {}],
    ['secreto vacío', { 'X-Telegram-Bot-Api-Secret-Token': '' }],
    ['secreto adivinado', { 'X-Telegram-Bot-Api-Secret-Token': 'secreto-que-no-es' }],
    ['con el token de la API (no sirve aquí)', { 'X-Telegram-Bot-Api-Secret-Token': TOKEN }],
    ['Authorization de la API (no sirve aquí)', { Authorization: `Bearer ${TOKEN}` }],
  ];
  for (const [nombre, headers] of variantes) {
    const r = await llama(ruta, { raw: true, metodo: 'POST', headers });
    chequea(`[telegram] POST ${nombre} → 401`, r.status === 401, `-> ${r.status}`);
    chequea(`[telegram] POST ${nombre} no filtra datos ni errores`, r.cuerpo.length < 200 && !/neon|postgres|stack|at /i.test(r.cuerpo), r.cuerpo.slice(0, 120));
  }
  const r = await llama(ruta, { raw: true, metodo: 'GET' });
  chequea('[telegram] sin caché', /no-store/.test(r.headers.get('cache-control') ?? ''), r.headers.get('cache-control') ?? '');
}

// ── 7) La base sigue intacta tras todos los intentos hostiles ───────────────────────
{
  const r = await llama('frescura', { headers: A() });
  const c = json(r.cuerpo);
  chequea('[integridad tras ataques] frescura responde', r.status === 200 && c);
  chequea('[integridad tras ataques] sync_estado conserva planner y mrp', ['planner', 'mrp'].every((a) => c?.datos?.some((f) => f.app === a)), JSON.stringify(c?.datos?.map((f) => f.app)));
}

lat.sort((a, b) => a - b);
console.log(`\nBATERÍA A: ${ok}/${total} comprobaciones correctas | peticiones: ${lat.length} | latencia p50=${lat[Math.floor(lat.length / 2)]} ms p95=${lat[Math.floor(lat.length * 0.95)]} ms`);
if (fallos.length) { console.log(`FALLOS (${fallos.length}):`); for (const f of fallos.slice(0, 40)) console.log('  ✘', f); }
