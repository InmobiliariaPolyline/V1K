// Pruebas de la vigilancia (scripts/vigilancia.mjs) y de los flujos de GitHub Actions (.github/): lógica, reintentos, texto
// público de la incidencia y comprobaciones estáticas de seguridad de los flujos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { APPS, UMBRALES_H, evaluar, incidenciaMd, pedir, umbralesDeEntorno, vigilar } from '../scripts/vigilancia.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const igual = (a, b, m) => { n++; assert.deepEqual(a, b, m); };

// ── evaluar ──────────────────────────────────────────────────────────────────────────────
const api = (datos, extra = {}) => ({ estado: 200, ms: 300, cuerpo: { datos }, ...extra });
const fila = (app, hace_horas) => ({ app, hace_horas });
const bien = { api: api([fila('planner', 18), fila('mrp', 20), fila('scraper', 3)]), panel: { estado: 200 }, js: { estado: 200 } };
const cod = (r) => r.problemas.map((p) => `${p.nivel}:${p.codigo}`).sort();

igual(evaluar(bien).problemas, [], 'todo en orden: sin problemas');
igual(evaluar(bien).apps.map((a) => a.app), ['planner', 'mrp', 'scraper']);

// Frescura: error al llegar al límite de cada app; aviso al 75 %
igual(cod(evaluar({ ...bien, api: api([fila('planner', 96), fila('mrp', 20), fila('scraper', 3)]) })), ['error:sync-planner']);
igual(cod(evaluar({ ...bien, api: api([fila('planner', 95.9), fila('mrp', 20), fila('scraper', 3)]) })), ['aviso:sync-planner'], 'a punto de alarmar = aviso (72 h o más)');
igual(cod(evaluar({ ...bien, api: api([fila('planner', 71.9), fila('mrp', 20), fila('scraper', 3)]) })), [], 'un fin de semana sin guardar nada en el Planner no alarma');
igual(cod(evaluar({ ...bien, api: api([fila('planner', 18), fila('mrp', 20), fila('scraper', 30)]) })), ['error:sync-scraper'], 'el Scraper corre solo: 30 h ya es grave');
igual(cod(evaluar({ ...bien, api: api([fila('planner', 18), fila('mrp', 20), fila('scraper', 22.5)]) })), ['aviso:sync-scraper']);
igual(cod(evaluar({ ...bien, api: api([fila('mrp', 20), fila('scraper', 3)]) })), ['error:sync-planner'], 'una app que nunca sincronizó es un error');
igual(cod(evaluar({ ...bien, api: api([fila('planner', 500), fila('mrp', 500), fila('scraper', 500)]) })), ['error:sync-mrp', 'error:sync-planner', 'error:sync-scraper']);
igual(cod(evaluar({ ...bien, api: api([fila('planner', 'x'), fila('mrp', 20), fila('scraper', 3)]) })), ['aviso:sync-planner'], 'hora ilegible = aviso, no un falso error');
igual(cod(evaluar({ ...bien, api: api([fila('planner', 18), fila('mrp', 20), fila('scraper', 3), fila('otra', 999)]) })), [], 'una app desconocida se ignora');
// Umbrales a medida
igual(cod(evaluar({ ...bien, api: api([fila('planner', 10), fila('mrp', 20), fila('scraper', 3)]) }, { umbrales: { ...UMBRALES_H, planner: 8 } })), ['error:sync-planner']);

// API
igual(cod(evaluar({ ...bien, api: { estado: 0, ms: 20000, cuerpo: null, error: 'tiempo agotado' } })), ['error:api-caida']);
igual(cod(evaluar({ ...bien, api: { estado: 502, ms: 100, cuerpo: { error: 'x' } } })), ['error:api-caida']);
igual(cod(evaluar({ ...bien, api: { estado: 401, ms: 100, cuerpo: null } })), ['error:api-token']);
igual(cod(evaluar({ ...bien, api: { estado: 200, ms: 100, cuerpo: { otra: 1 } } })), ['error:api-respuesta']);
igual(cod(evaluar({ ...bien, api: api([fila('planner', 18), fila('mrp', 20), fila('scraper', 3)], { ms: 7000 }) })), ['aviso:api-lenta']);
ok(evaluar({ ...bien, api: { estado: 401 } }).problemas[0].texto.includes('API_TOKEN'), 'el mensaje del token explica qué secreto revisar');
// Panel
igual(cod(evaluar({ ...bien, panel: { estado: 404 } })), ['error:panel']);
igual(cod(evaluar({ ...bien, js: { estado: 0, error: 'sin conexión' } })), ['error:panel-js']);
// Cuando la API cae, no se inventan alarmas de frescura
ok(!cod(evaluar({ ...bien, api: { estado: 0, error: 'sin conexión' } })).some((c) => c.includes('sync-')), 'sin API no se evalúa la frescura');

// ── pedir (reintentos) ───────────────────────────────────────────────────────────────────
const respuesta = (estado, cuerpo) => ({ status: estado, text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) });
const secuencia = (...r) => { let i = 0; const f = async () => { const x = r[Math.min(i++, r.length - 1)]; if (x instanceof Error) throw x; return x; }; f.llamadas = () => i; return f; };
{
  const f = secuencia(respuesta(502, {}), respuesta(502, {}), respuesta(200, { datos: [] }));
  const r = await pedir('http://x', { fetchFn: f, espera: 0 });
  igual([r.estado, f.llamadas()], [200, 3], 'reintenta los errores del servidor y se recupera');
  const f2 = secuencia(respuesta(401, {}));
  igual([(await pedir('http://x', { fetchFn: f2, espera: 0 })).estado, f2.llamadas()], [401, 1], 'un 401 no se reintenta');
  const f3 = secuencia(new Error('red'));
  const r3 = await pedir('http://x', { fetchFn: f3, espera: 0, reintentos: 2 });
  igual([r3.estado, r3.error, f3.llamadas()], [0, 'sin conexión', 2]);
  const lento = Object.assign(new Error('t'), { name: 'TimeoutError' });
  igual((await pedir('http://x', { fetchFn: secuencia(lento), espera: 0, reintentos: 1 })).error, 'tiempo agotado');
  const html = await pedir('http://x', { fetchFn: secuencia(respuesta(200, '<html>panel</html>')), espera: 0 });
  igual([html.estado, html.cuerpo], [200, null], 'el HTML del panel no rompe el análisis');
  // El token viaja solo en la cabecera y solo si se pide
  let cab; await pedir('http://x', { token: 'T'.repeat(30), fetchFn: async (u, o) => { cab = o.headers; return respuesta(200, {}); }, espera: 0 });
  igual(cab.Authorization, `Bearer ${'T'.repeat(30)}`);
  await pedir('http://x', { fetchFn: async (u, o) => { cab = o.headers; return respuesta(200, {}); }, espera: 0 });
  igual(cab, {}, 'sin token no se envía Authorization (el panel y sus archivos son públicos)');
}

// ── vigilar (de punta a punta con una API simulada) ──────────────────────────────────────
{
  const llamadas = [];
  const falsa = async (url) => {
    llamadas.push(url);
    if (url.endsWith('/api/frescura')) return respuesta(200, { datos: [fila('planner', 5), fila('mrp', 6), fila('scraper', 1)] });
    return respuesta(200, '<html></html>');
  };
  const r = await vigilar({ base: 'https://ejemplo.test', token: 'x'.repeat(30), fetchFn: falsa, espera: 0 });
  igual(r.problemas, [], 'vigilar: todo en orden');
  igual(llamadas.sort(), ['https://ejemplo.test/', 'https://ejemplo.test/api/frescura', 'https://ejemplo.test/js/app.js'], 'comprueba la API, el panel y su JavaScript');
}

// ── texto de la incidencia (el repositorio es público) ───────────────────────────────────
{
  const res = evaluar({ ...bien, api: api([fila('planner', 120), fila('mrp', 20), fila('scraper', 3)]) });
  const md = incidenciaMd(res, { fecha: new Date('2026-11-19T17:28:00Z'), enlace: 'https://github.com/x/y/actions/runs/1', repo: 'https://github.com/x/y' });
  ok(md.includes('2026-11-19 17:28 UTC') && md.includes('🔴 planner: lleva 120 h sin sincronizar'), 'fecha y problema');
  ok(md.includes('planner 120 h · mrp 20 h · scraper 3 h'), 'resumen de frescura');
  ok(md.includes('https://github.com/x/y/blob/main/docs/OPERACION.md') && md.includes('actions/runs/1'), 'enlaces absolutos al manual y a la ejecución');
  ok(!/proyecto|material|propiedad|precio|token|Bearer/i.test(md.replace('docs/OPERACION.md', '')), 'sin datos del negocio ni el token');
  ok(md.endsWith('\n') && !/\n\n\n/.test(md), 'Markdown limpio');
  ok(incidenciaMd({ problemas: [{ nivel: 'aviso', codigo: 'a', texto: 'x' }], apps: [] }).includes('nada urgente'), 'solo avisos = sin alarma');
}

// ── umbrales desde el entorno ────────────────────────────────────────────────────────────
igual(umbralesDeEntorno({}), UMBRALES_H);
igual(umbralesDeEntorno({ UMBRAL_PLANNER_H: '48', UMBRAL_SCRAPER_H: 'abc', UMBRAL_MRP_H: '-3' }), { ...UMBRALES_H, planner: 48 }, 'los valores no válidos se ignoran');
ok(APPS.every((a) => UMBRALES_H[a] > 0), 'umbrales positivos para cada app');

// ── flujos de GitHub Actions: comprobaciones estáticas ───────────────────────────────────
const flujo = (f) => YAML.parse(fs.readFileSync(path.join(raiz, '.github', 'workflows', f), 'utf8'));
const crudo = (f) => fs.readFileSync(path.join(raiz, '.github', 'workflows', f), 'utf8');
const archivos = fs.readdirSync(path.join(raiz, '.github', 'workflows')).filter((f) => f.endsWith('.yml'));
igual(archivos.sort(), ['ci.yml', 'vigilancia.yml'], 'los dos flujos esperados');

for (const f of archivos) {
  const w = flujo(f), texto = crudo(f);
  ok(w.name && w.on && w.jobs, `${f}: nombre, disparadores y trabajos`);
  ok(w.permissions && Object.values(w.permissions).every((p) => ['read', 'write'].includes(p)), `${f}: permisos explícitos (mínimo privilegio)`);
  ok(!/pull_request_target|workflow_run/.test(texto), `${f}: sin disparadores peligrosos que dan secretos a código de terceros`);
  ok(!/\$\{\{\s*github\.(event|head_ref)[^}]*\}\}/.test(texto), `${f}: no interpola datos del evento (títulos, ramas…) dentro de comandos`);
  for (const m of texto.matchAll(/uses:\s*([\w./-]+)@([\w.-]+)/g)) ok(/^v\d+$/.test(m[2]), `${f}: la acción ${m[1]} fija una versión mayor (@${m[2]})`);
  for (const job of Object.values(w.jobs)) ok(job['timeout-minutes'] > 0 && job['timeout-minutes'] <= 20, `${f}: tiempo límite razonable`);
}
{
  const ci = flujo('ci.yml');
  ok(ci.on.push.branches.includes('main') && ci.on.pull_request.branches.includes('main'), 'CI: corre en cada push a main y en cada PR');
  igual(ci.permissions, { contents: 'read' }, 'CI: solo lectura');
  igual(ci.jobs.pruebas.strategy.matrix.node, [20, 22], 'CI: Node 20 (mínimo del proyecto) y 22');
  ok(crudo('ci.yml').includes('npm ci') && crudo('ci.yml').includes('npm test'), 'CI: instalación limpia y npm test');
  ok(!/secrets\./.test(crudo('ci.yml')), 'CI: no usa secretos (los PR de terceros no deben poder leerlos)');
  igual(ci.jobs.pruebas.defaults.run['working-directory'], 'coze-api');
  const eng = JSON.parse(fs.readFileSync(path.join(raiz, 'coze-api', 'package.json'), 'utf8')).engines.node;
  ok(eng === '>=20', 'package.json exige Node 20 o más, igual que la matriz');
  ok(fs.existsSync(path.join(raiz, 'coze-api', 'package-lock.json')), 'hay package-lock.json para npm ci y la caché');
}
{
  const v = flujo('vigilancia.yml');
  ok(Array.isArray(v.on.schedule) && /^\d+ \*\/6 \* \* \*$/.test(v.on.schedule[0].cron), 'vigilancia: cada 6 horas (a un minuto que no sea la hora en punto)');
  ok('workflow_dispatch' in v.on, 'vigilancia: se puede lanzar a mano');
  igual(v.permissions, { contents: 'read', issues: 'write' }, 'vigilancia: solo lee el código y escribe incidencias');
  const t = crudo('vigilancia.yml');
  ok(/API_TOKEN:\s*\$\{\{\s*secrets\.API_TOKEN\s*\}\}/.test(t), 'vigilancia: el token sale del secreto API_TOKEN');
  ok(!/echo[^\n]*API_TOKEN|set -x/.test(t), 'vigilancia: no imprime el token');
  ok(t.includes('node scripts/vigilancia.mjs') && fs.existsSync(path.join(raiz, 'coze-api', 'scripts', 'vigilancia.mjs')), 'vigilancia: ejecuta un script que existe');
  ok(t.includes('incidencia.md') && t.includes('--label vigilancia'), 'vigilancia: abre la incidencia con su etiqueta');
  ok(/gh issue close/.test(t) && /gh issue edit/.test(t), 'vigilancia: actualiza y cierra la incidencia sola');
  ok(/exit 1/.test(t), 'vigilancia: la ejecución falla si hay errores (así GitHub avisa por correo)');
  igual(v.concurrency['cancel-in-progress'], false, 'vigilancia: no se cancela a medias');
}
{
  const d = YAML.parse(fs.readFileSync(path.join(raiz, '.github', 'dependabot.yml'), 'utf8'));
  igual(d.updates.map((u) => u['package-ecosystem']).sort(), ['github-actions', 'npm'], 'Dependabot: npm y acciones');
  ok(d.updates.find((u) => u['package-ecosystem'] === 'npm').directory === '/coze-api', 'Dependabot mira coze-api');
}
// El script de vigilancia nunca escribe el token y los archivos que genera no se versionan
const fuente = fs.readFileSync(path.join(raiz, 'coze-api', 'scripts', 'vigilancia.mjs'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
ok(!/console\.\w+\([^)]*\btoken\b/.test(fuente) && !/writeFileSync\([^)]*\btoken\b/.test(fuente), 'el script no imprime ni guarda la variable token');
const ign = fs.readFileSync(path.join(raiz, '.gitignore'), 'utf8');
ok(ign.includes('/coze-api/incidencia.md') && ign.includes('/coze-api/vigilancia.json'), 'los resultados de la vigilancia están en .gitignore');

console.log(`OK: vigilancia y flujos de GitHub Actions — ${n} comprobaciones`);
