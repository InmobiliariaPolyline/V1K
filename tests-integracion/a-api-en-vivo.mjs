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

const RUTAS = ['frescura', 'proyectos', 'hitos', 'stock-bajo', 'pedidos', 'propiedades', 'propiedades-resumen'];
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
    chequea(`[ruta hostil] "${n.slice(0, 30)}"`, [404, 400, 401, 405].includes(r.status) && r.status < 500, `-> ${r.status} ${String(r.cuerpo).slice(0, 80)}`);
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
chequea('[límite] stock-bajo ≤ 25 filas', (datosVivos['stock-bajo']?.datos?.length ?? 99) <= 25);
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
