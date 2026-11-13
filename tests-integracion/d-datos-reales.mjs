// BATERÍA D — integridad de los datos REALES en la base central + la API devuelve exactamente lo que hay en la base.
// Solo lectura (rol coze_reader y la API pública). No imprime credenciales.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // raíz del repositorio V1K
import { neon } from '@neondatabase/serverless';

const texto = fs.readFileSync(path.join(RAIZ, 'db', 'conexiones.local.txt'), 'utf8');
const URL = texto.match(/^coze_reader = (\S+)$/m)[1];
const TOKEN = texto.match(/^API_TOKEN = (\S+)/m)[1];
const sql = neon(URL);
const q = (t, p = []) => sql.query(t, p);

let total = 0, ok = 0;
const fallos = [], info = [];
const check = (n, c, d = '') => { total++; if (c) ok++; else fallos.push(`${n} ${d}`); };
const nota = (t) => info.push(t);

// ── 1) sync_estado ───────────────────────────────────────────────────────────────
const est = await q('select app, ultima_sync from central.sync_estado order by app');
check('[estado] solo apps conocidas', est.every((r) => ['planner', 'mrp', 'scraper'].includes(r.app)), JSON.stringify(est.map((r) => r.app)));
check('[estado] sin apps repetidas', new Set(est.map((r) => r.app)).size === est.length);
for (const r of est) {
  const edad = (Date.now() - new Date(r.ultima_sync).getTime()) / 60000;
  check(`[estado] ${r.app}: la hora no está en el futuro`, edad > -2, `${edad.toFixed(1)} min`);
  nota(`${r.app}: última sincronización hace ${edad < 120 ? edad.toFixed(0) + ' min' : (edad / 60).toFixed(1) + ' h'} (${r.ultima_sync.toISOString?.() ?? r.ultima_sync})`);
}
nota(`apps SIN sincronizar todavía: ${['planner', 'mrp', 'scraper'].filter((a) => !est.some((r) => r.app === a)).join(', ') || 'ninguna'}`);

// ── 2) Planner ───────────────────────────────────────────────────────────────────
const pr = await q('select * from central.planner_proyectos');
const hi = await q('select * from central.planner_hitos');
check('[planner] ids de proyecto únicos', new Set(pr.map((r) => r.proyecto_id)).size === pr.length);
check('[planner] estado válido en todos', pr.every((r) => ['por iniciar', 'en curso', 'atrasado', 'terminado'].includes(r.estado)), JSON.stringify(pr.map((r) => r.estado)));
check('[planner] avance entre 0 y 100', pr.every((r) => r.avance_pct === null || (Number(r.avance_pct) >= 0 && Number(r.avance_pct) <= 100)));
check('[planner] tareas_atrasadas ≤ tareas_total', pr.every((r) => r.tareas_atrasadas <= r.tareas_total));
check('[planner] terminado ⇔ avance 100', pr.every((r) => (r.estado === 'terminado') === (Number(r.avance_pct) >= 100)));
check('[planner] nombre no vacío', pr.every((r) => r.nombre && r.nombre.trim().length > 0));
check('[planner] inicio ≤ fin', pr.every((r) => !r.inicio || !r.fin || new Date(r.inicio) <= new Date(r.fin)));
const ids = new Set(pr.map((r) => r.proyecto_id));
check('[planner] todo hito pertenece a un proyecto copiado', hi.every((h) => ids.has(h.proyecto_id)));
check('[planner] hito_id único', new Set(hi.map((h) => h.hito_id)).size === hi.length);
for (const p of pr) {
  const suyos = hi.filter((h) => h.proyecto_id === p.proyecto_id).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const futuros = suyos.filter((h) => new Date(h.fecha) >= new Date(new Date(p.actualizado_en).toISOString().slice(0, 10)));
  const esperado = futuros[0]?.descripcion ?? null;
  check(`[planner] ${p.nombre}: próximo_hito coincide con la tabla de hitos`, (p.proximo_hito ?? null) === esperado, `${p.proximo_hito} vs ${esperado}`);
}
nota(`planner: ${pr.length} proyectos (${[...new Set(pr.map((r) => r.estado))].join(', ')}), ${hi.length} hitos`);

// ── 3) MRP ───────────────────────────────────────────────────────────────────────
const st = await q('select * from central.mrp_stock');
const pe = await q('select * from central.mrp_pedidos');
check('[mrp] material_id único', new Set(st.map((r) => r.material_id)).size === st.length);
check('[mrp] mínimo > 0 en todos (solo se copian los que tienen mínimo)', st.every((r) => Number(r.minimo) > 0));
check('[mrp] cantidad ≥ 0', st.every((r) => Number(r.cantidad) >= 0), `negativos: ${st.filter((r) => Number(r.cantidad) < 0).length}`);
check('[mrp] stock_bajo ⇔ cantidad ≤ mínimo', st.every((r) => r.stock_bajo === (Number(r.cantidad) <= Number(r.minimo))));
check('[mrp] faltante = max(mínimo − cantidad, 0)', st.every((r) => Math.abs(Number(r.faltante) - Math.max(Number(r.minimo) - Number(r.cantidad), 0)) < 0.005));
check('[mrp] material con nombre', st.every((r) => r.material && r.material.trim()));
check('[mrp] todos con unidad', st.every((r) => r.unidad), `sin unidad: ${st.filter((r) => !r.unidad).length}`);
check('[mrp] pedidos: estados abiertos', pe.every((r) => ['pendiente', 'enviada', 'parcial'].includes(r.estado)));
check('[mrp] pedidos: recibido ≤ pedido', pe.every((r) => Number(r.cantidad_recibida) <= Number(r.cantidad_pedida)));
check('[mrp] pedido_id único', new Set(pe.map((r) => r.pedido_id)).size === pe.length);
const mojibake = st.filter((r) => /Ã.|Â.|â€|�/.test(`${r.material}${r.categoria}${r.unidad}`));
check('[mrp] sin caracteres corruptos (Ã¡, â€, �) en textos', mojibake.length === 0, mojibake.slice(0, 3).map((r) => r.material).join(' | '));
const acentos = st.filter((r) => /[áéíóúñÁÉÍÓÚÑ²³]/.test(`${r.material}${r.categoria}${r.unidad}`)).length;
check('[mrp] los acentos y símbolos (², ñ) llegaron bien', acentos > 0, `con acento: ${acentos}`);
const bajos = st.filter((r) => r.stock_bajo).length;
nota(`mrp: ${st.length} materiales con mínimo, ${bajos} en stock bajo (${((bajos / Math.max(st.length, 1)) * 100).toFixed(0)} %), ${st.filter((r) => Number(r.cantidad) > 0).length} con existencias, ${pe.length} pedidos abiertos`);
const vista = await q('select * from central.v_stock_bajo');
check('[mrp] la vista v_stock_bajo tiene tantas filas como materiales bajos', vista.length === bajos, `${vista.length} vs ${bajos}`);

// ── 4) Scraper ───────────────────────────────────────────────────────────────────
const sp = await q('select * from central.scraper_propiedades');
const sr = await q('select * from central.scraper_resumen');
check('[scraper] propiedad_id único', new Set(sp.map((r) => r.propiedad_id)).size === sp.length);
check('[scraper] ≤ 200 propiedades', sp.length <= 200);
check('[scraper] resumen ≥ propiedades copiadas', sr.reduce((a, r) => a + r.total, 0) >= sp.length);
check('[scraper] cada propiedad tiene portal y url con http', sp.every((r) => r.portal && (!r.url || /^https?:\/\//.test(r.url))));
nota(`scraper: ${sp.length} propiedades copiadas, ${sr.reduce((a, r) => a + r.total, 0)} en el resumen (0 = todavía no ha corrido una ingesta con la sincronización)`);

// ── 5) La API devuelve exactamente lo que hay en la base ───────────────────────────
const api = async (ruta) => (await (await fetch(`https://v1k-coze-api.vercel.app/api/${ruta}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json());
const norm = (v) => JSON.stringify(v, (k, x) => (x instanceof Date ? x.toISOString() : x));
const comparaciones = {
  proyectos: `SELECT proyecto_id, nombre, responsable, estado, avance_pct, inicio, fin, tareas_total, tareas_atrasadas, proximo_hito, proximo_hito_fecha, actualizado_en FROM central.planner_proyectos ORDER BY (estado = 'atrasado') DESC, nombre LIMIT 200`,
  hitos: `SELECT h.fecha, h.descripcion, p.nombre AS proyecto FROM central.planner_hitos h LEFT JOIN central.planner_proyectos p USING (proyecto_id) ORDER BY h.fecha LIMIT 200`,
  'stock-bajo': 'SELECT * FROM central.v_stock_bajo LIMIT 25',
  pedidos: `SELECT pedido_id, proveedor, obra, estado, llegada_estimada, lineas, cantidad_pedida, cantidad_recibida, creado_en FROM central.mrp_pedidos ORDER BY llegada_estimada NULLS LAST, pedido_id LIMIT 200`,
  frescura: 'SELECT app, ultima_sync FROM central.sync_estado ORDER BY app',
  'propiedades-resumen': 'SELECT portal, operacion, total, ultima_vista FROM central.scraper_resumen ORDER BY portal, operacion',
};
for (const [ruta, consulta] of Object.entries(comparaciones)) {
  const [r, filas] = await Promise.all([api(ruta), q(consulta)]);
  check(`[API↔base] ${ruta}: mismo número de filas`, r.total === filas.length, `${r.total} vs ${filas.length}`);
  const iguales = r.datos.length === filas.length && r.datos.every((f, i) => norm(f) === norm(filas[i]));
  check(`[API↔base] ${ruta}: filas idénticas y en el mismo orden`, iguales, iguales ? '' : `1ª API=${norm(r.datos[0]).slice(0, 90)} | base=${norm(filas[0]).slice(0, 90)}`);
}

console.log('--- Resumen de lo que hay ahora mismo en la base central ---');
for (const t of info) console.log('  •', t);
console.log(`\nBATERÍA D: ${ok}/${total} comprobaciones correctas`);
if (fallos.length) { console.log(`FALLOS (${fallos.length}):`); for (const f of fallos.slice(0, 40)) console.log('  ✘', f); }
