// BATERÍA C (Planner) — el código REAL src/lib/vistaCentral.ts contra el Neon real como writer_planner.
// Todo dentro de una transacción con ROLLBACK. No imprime credenciales.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // raíz del repositorio V1K
import pg from 'pg';
const { sincronizar, sincronizarSeguro } = await import(pathToFileURL(path.join(RAIZ, 'apps', 'planner-backend', 'src', 'lib', 'vistaCentral.ts')).href);
type Fuente = any; type ProyectoOrigen = any; type HitoOrigen = any;

const texto = fs.readFileSync(path.join(RAIZ, 'db', 'conexiones.local.txt'), 'utf8');
const URL = texto.match(/^writer_planner = (\S+)$/m)![1];

let total = 0, ok = 0;
const fallos: string[] = [];
const check = (n: string, c: unknown, d = '') => { total++; if (c) ok++; else fallos.push(`${n} ${d}`); };
const limpio = (e: unknown) => String((e as Error)?.message ?? e).replace(/postgres(ql)?:\/\/\S+/gi, '[conexión]').split('\n')[0].slice(0, 150);

const client = new pg.Client({ connectionString: URL, connectionTimeoutMillis: 10000 });
await client.connect();
await client.query('BEGIN');
const central = { query: (t: string, p?: unknown[]) => client.query(t, p as any) };
const q = async (t: string, p?: unknown[]) => (await client.query(t, p as any)).rows;
let nsp = 0;

async function escenario(nombre: string, fn: () => Promise<void>) {
  const sp = `esc${++nsp}`;
  await client.query(`SAVEPOINT ${sp}`);
  try { await fn(); } catch (e) {
    if (nombre === 'byte nulo' || nombre === 'sustituto suelto') { console.log(`  (info, imposible con datos reales) ${nombre}: ${limpio(e)}`); }
    else check(`[${nombre}] no lanza excepción`, false, limpio(e));
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
}

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const hoy = new Date('2026-06-15T12:00:00Z');
const proy = (i: number | string, o: Partial<ProyectoOrigen> = {}): ProyectoOrigen => ({
  id: `p${i}`, name: `Proyecto ${i}`, ownerName: 'Ana', startDate: d('2026-01-01'), endDate: d('2026-12-31'), progress: 40, tasks: [], ...o,
});
const hito = (id: string, pid: string, fecha: string, desc = 'Hito'): HitoOrigen => ({ id, projectId: pid, description: desc, date: d(fecha) });
const fuente = (proyectos: ProyectoOrigen[], hitos: HitoOrigen[] = []): Fuente => ({ leer: async () => ({ proyectos, hitos }) });
const sync = (p: ProyectoOrigen[], h: HitoOrigen[] = []) => sincronizar(fuente(p, h), central, hoy);

// 1) Vacío
await escenario('vacío', async () => {
  const r = await sync([], []);
  check('[vacío] devuelve 0 y 0', r.proyectos === 0 && r.hitos === 0);
  check('[vacío] borra lo anterior (foto vacía)', (await q('select count(*)::int n from central.planner_proyectos'))[0].n === 0);
  check('[vacío] marca sync_estado.planner', (await q("select count(*)::int n from central.sync_estado where app='planner'"))[0].n === 1);
});

// 2) Estados
await escenario('estados', async () => {
  await sync([
    proy('a', { progress: 100, endDate: d('2026-01-02') }),                       // terminado
    proy('b', { endDate: d('2026-06-01') }),                                       // atrasado
    proy('c', { startDate: d('2026-07-01') }),                                     // por iniciar
    proy('d'),                                                                     // en curso
    proy('e', { endDate: d('2026-06-15') }),                                       // termina hoy => en curso
    proy('f', { startDate: d('2026-06-15') }),                                     // empieza hoy => en curso
    proy('g', { progress: 99, endDate: d('2026-06-14') }),                         // ayer, 99 % => atrasado
    proy('h', { progress: 100, startDate: d('2026-07-01') }),                      // 100 % aunque no empezó => terminado
  ]);
  const f = Object.fromEntries((await q('select proyecto_id, estado from central.planner_proyectos')).map((r: any) => [r.proyecto_id, r.estado]));
  const esperado = { pa: 'terminado', pb: 'atrasado', pc: 'por iniciar', pd: 'en curso', pe: 'en curso', pf: 'en curso', pg: 'atrasado', ph: 'terminado' };
  for (const [k, v] of Object.entries(esperado)) check(`[estado] ${k} => ${v}`, f[k] === v, `-> ${f[k]}`);
});

// 3) Avance fuera de rango
await escenario('avance', async () => {
  await sync([proy('a', { progress: -5 }), proy('b', { progress: 150 }), proy('c', { progress: 0 }), proy('d', { progress: 100 })]);
  const f = Object.fromEntries((await q('select proyecto_id, avance_pct::float a from central.planner_proyectos')).map((r: any) => [r.proyecto_id, r.a]));
  check('[avance] -5 => 0', f.pa === 0); check('[avance] 150 => 100', f.pb === 100); check('[avance] 0 y 100 se respetan', f.pc === 0 && f.pd === 100);
  await sync([proy('n', { progress: NaN as any })]);
  check('[avance] NaN no rompe', true);
});

// 4) Tareas atrasadas
await escenario('tareas', async () => {
  const t = (fin: string, p: number) => ({ endDate: d(fin), progress: p });
  await sync([proy('a', { tasks: [t('2026-06-01', 50), t('2026-06-01', 100), t('2026-09-01', 0), t('2026-06-14', 99), t('2026-06-15', 0)] })]);
  const r = (await q('select tareas_total, tareas_atrasadas from central.planner_proyectos'))[0];
  check('[tareas] total 5, atrasadas 2 (vencidas e incompletas)', r.tareas_total === 5 && r.tareas_atrasadas === 2, JSON.stringify(r));
});

// 5) Hitos
await escenario('hitos', async () => {
  await sync([proy('a'), proy('b')], [
    hito('h1', 'pa', '2026-07-10', 'Vaciado'), hito('h2', 'pa', '2026-06-20', 'Planos'), hito('h3', 'pa', '2026-05-01', 'Muy viejo'),
    hito('h4', 'pa', '2026-06-10', 'Hace 5 días'), hito('h5', 'pa', '2026-06-08', 'Hace 7 días'), hito('h6', 'pa', '2026-06-07', 'Hace 8 días'),
    hito('h7', 'pz', '2026-07-01', 'Proyecto inexistente'), hito('h8', 'pb', '2026-06-15', 'Hoy'),
  ]);
  const ids = (await q('select hito_id from central.planner_hitos order by fecha')).map((r: any) => r.hito_id);
  check('[hitos] ventana de 7 días hacia atrás; sin proyecto inexistente; en orden', JSON.stringify(ids) === JSON.stringify(['h5', 'h4', 'h8', 'h2', 'h1']), JSON.stringify(ids));
  const pa = (await q("select proximo_hito, proximo_hito_fecha::text f from central.planner_proyectos where proyecto_id='pa'"))[0];
  check('[hitos] próximo hito de pa = Planos (20/06)', pa.proximo_hito === 'Planos' && pa.f === '2026-06-20', JSON.stringify(pa));
  const pb = (await q("select proximo_hito from central.planner_proyectos where proyecto_id='pb'"))[0];
  check('[hitos] un hito de hoy cuenta como próximo', pb.proximo_hito === 'Hoy');
  await sync([proy('a')], [hito('h1', 'pa', '2026-05-01', 'solo viejo')]);
  check('[hitos] sin hitos vigentes => próximo NULL', (await q('select proximo_hito from central.planner_proyectos'))[0].proximo_hito === null);
});

// 6) 400 hitos: tope de 300
await escenario('muchos hitos', async () => {
  const h = Array.from({ length: 400 }, (_, i) => hito(`h${i}`, 'pa', new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10)));
  const r = await sync([proy('a')], h);
  check('[400 hitos] se copian 300 como máximo', r.hitos === 300 && (await q('select count(*)::int n from central.planner_hitos'))[0].n === 300, JSON.stringify(r));
});

// 7) 300 proyectos × 20 tareas y tiempo
await escenario('masivo', async () => {
  const p = Array.from({ length: 300 }, (_, i) => proy(i, { tasks: Array.from({ length: 20 }, (_, j) => ({ endDate: d('2026-06-01'), progress: j * 5 })) }));
  const t0 = Date.now();
  const r = await sync(p);
  const dt = Date.now() - t0;
  check('[300 proyectos] copia los 300', r.proyectos === 300 && (await q('select count(*)::int n from central.planner_proyectos'))[0].n === 300);
  check(`[300 proyectos] tarda menos de 8 s (${(dt / 1000).toFixed(1)}s)`, dt < 8000);
  check('[300 proyectos] tareas_total = 20 en todos', (await q('select count(*)::int n from central.planner_proyectos where tareas_total = 20'))[0].n === 300);
});

// 8) Textos hostiles
const TEXTOS: Record<string, string> = {
  comillas: `O'Brien "x"`, barra: 'a\\b\\\\c', salto: 'línea1\nlínea2', tab: 'a\tb', emoji: 'Torre 🏗️ Norte', eñe: 'Ñandú ñ á é í ó ú ü', sql: `'; DROP TABLE central.planner_proyectos; --`,
  json: '{"a":[1,2],"b":"x"}', largo: 'x'.repeat(5000), cjk: '大厦 ビル 빌딩', rtl: 'برج', espacios: '   ', percent: '100% %s {0}', dolar: '$1 $$ ${x}', html: '<b>x</b>',
};
await escenario('textos', async () => {
  for (const [k, t] of Object.entries(TEXTOS)) {
    await sync([proy(1, { name: t, ownerName: t })], [hito('h1', 'p1', '2026-07-01', t)]);
    const r = (await q("select nombre, responsable, proximo_hito from central.planner_proyectos where proyecto_id='p1'"))[0];
    check(`[texto:${k}] se guarda idéntico`, r && r.nombre === t && r.responsable === t && r.proximo_hito === t, JSON.stringify(r)?.slice(0, 100));
  }
  check('[texto] la tabla sigue existiendo tras la inyección', (await q("select count(*)::int n from central.planner_proyectos"))[0].n === 1);
});
await escenario('byte nulo', async () => { await sync([proy(1, { name: 'Torre\u0000Norte' })]); check('[NUL] un nombre con byte nulo no rompe la sincronización', (await q('select 1 from central.planner_proyectos')).length === 1); });
await escenario('sustituto suelto', async () => { await sync([proy(1, { name: 'a\ud800b' })]); check('[surrogate] un texto con sustituto suelto no rompe la sincronización', (await q('select 1 from central.planner_proyectos')).length === 1); });

// 9) Idempotencia y reemplazo
await escenario('idempotencia', async () => {
  const p = Array.from({ length: 30 }, (_, i) => proy(i, { progress: i * 3 })); const h = [hito('h1', 'p1', '2026-07-01')];
  await sync(p, h);
  const a = JSON.stringify(await q('select proyecto_id, estado, avance_pct::text, tareas_total from central.planner_proyectos order by 1'));
  await sync(p, h); await sync(p, h);
  check('[idempotencia] repetir 3 veces no cambia nada', JSON.stringify(await q('select proyecto_id, estado, avance_pct::text, tareas_total from central.planner_proyectos order by 1')) === a);
  check('[idempotencia] sync_estado: una sola fila', (await q("select count(*)::int n from central.sync_estado where app='planner'"))[0].n === 1);
  await sync(p.slice(0, 10), []);
  check('[reemplazo] la foto quita los proyectos borrados y los hitos', (await q('select count(*)::int n from central.planner_proyectos'))[0].n === 10 && (await q('select count(*)::int n from central.planner_hitos'))[0].n === 0);
});

// 10) Fallos del origen: sincronizarSeguro nunca lanza y no toca nada
await escenario('fallo de origen', async () => {
  const antes = (await q('select count(*)::int n from central.planner_proyectos'))[0].n;
  const rota: Fuente = { leer: async () => { throw new Error('Prisma caído postgres://u:secreto@h/d'); } };
  const aviso = console.warn; const lineas: string[] = []; console.warn = (...a: unknown[]) => { lineas.push(a.join(' ')); };
  let r: boolean; try { r = await sincronizarSeguro(rota, central, hoy); } finally { console.warn = aviso; }
  check('[fallo de origen] sincronizarSeguro devuelve false sin lanzar', r === false);
  check('[fallo de origen] el registro no filtra la conexión', lineas.length === 1 && !lineas[0].includes('secreto'), lineas.join('|'));
  check('[fallo de origen] no cambió nada', (await q('select count(*)::int n from central.planner_proyectos'))[0].n === antes);
});

await client.query('ROLLBACK');
await client.end();
console.log(`\nBATERÍA C (Planner): ${ok}/${total} comprobaciones correctas`);
if (fallos.length) { console.log(`FALLOS (${fallos.length}):`); for (const f of fallos.slice(0, 40)) console.log('  ✘', f); }
