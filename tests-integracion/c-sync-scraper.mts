// BATERÍA C (Scraper) — el código REAL api/vistaCentral.ts contra el Neon real como writer_scraper.
// Origen: Postgres de prueba (PGlite) con el esquema REAL del Scraper. Central: Neon real en una transacción con ROLLBACK.
// Además prueba el controlador HTTP de Neon (el que usa Netlify) con sentencias que no escriben.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // raíz del repositorio V1K
import { createRequire } from 'node:module';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const texto = fs.readFileSync(path.join(RAIZ, 'db', 'conexiones.local.txt'), 'utf8');
const URL = texto.match(/^writer_scraper = (\S+)$/m)![1];
const RAIZ_APP = path.join(RAIZ, 'apps', 'REAL_ESTATE_SCRAPER');
const { sincronizarVistaCentral, sincronizarSiConfigurado, reiniciarLimitador, MAX_PROPIEDADES_VISTA } = await import(pathToFileURL(path.join(RAIZ_APP, 'api', 'vistaCentral.ts')).href);

let total = 0, ok = 0;
const fallos: string[] = [];
const check = (n: string, c: unknown, d = '') => { total++; if (c) ok++; else fallos.push(`${n} ${d}`); };
const limpio = (e: unknown) => String((e as Error)?.message ?? e).replace(/postgres(ql)?:\/\/\S+/gi, '[conexión]').split('\n')[0].slice(0, 150);

// Origen (esquema real del Scraper)
const origen = new PGlite({ extensions: { pgcrypto } });
await origen.exec(fs.readFileSync(`${RAIZ_APP}/db/001_schema.sql`, 'utf8'));
const dbOrigen = { query: async (t: string, p: unknown[] = []) => (await origen.query(t, p)).rows as never[] };

// Central (Neon real, rol writer_scraper)
const client = new pg.Client({ connectionString: URL, connectionTimeoutMillis: 10000 });
await client.connect();
await client.query('BEGIN');
const dbCentral = { query: async (t: string, p: unknown[] = []) => (await client.query(t, p as any)).rows as never[] };
const q = async (t: string, p?: unknown[]) => (await client.query(t, p as any)).rows;
let nsp = 0;
async function escenario(nombre: string, fn: () => Promise<void>) {
  const sp = `esc${++nsp}`;
  await client.query(`SAVEPOINT ${sp}`);
  try { await fn(); } catch (e) { check(`[${nombre}] no lanza excepción`, false, limpio(e)); }
  await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
}
const limpiarOrigen = () => origen.exec('DELETE FROM public.propiedades');
async function ins(id: string, portal: string, operacion: string | null, creado: string, extra: Record<string, unknown> = {}) {
  const c = { inmueble: 'Departamento', titulo: `Aviso ${id}`, precio: 100000, precio_usd: 100000, moneda: 'USD', distrito: 'Miraflores', dormitorios: '3', banios: '2', area: '80 m2', url: `https://x/${id}`, ...extra };
  await origen.query(
    `INSERT INTO public.propiedades (id, portal, operacion, inmueble, titulo, precio, precio_usd, moneda, distrito, dormitorios, banios, area, url, creado_en)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [id, portal, operacion, c.inmueble, c.titulo, c.precio, c.precio_usd, c.moneda, c.distrito, c.dormitorios, c.banios, c.area, c.url, creado]);
}
const sync = () => sincronizarVistaCentral(dbOrigen, dbCentral);

// 1) Vacío
await escenario('vacío', async () => {
  await limpiarOrigen(); const r = await sync();
  check('[vacío] devuelve 0 y 0', r.propiedades === 0 && r.resumenes === 0, JSON.stringify(r));
  check('[vacío] sync_estado.scraper marcada', (await q("select count(*)::int n from central.sync_estado where app='scraper'"))[0].n === 1);
});

// 2) Una fila con todos los campos
await escenario('una fila', async () => {
  await limpiarOrigen(); await ins('urbania:1', 'urbania', 'VENTA', '2026-01-01T10:00:00Z');
  await sync();
  const f = (await q("select propiedad_id, portal, operacion, inmueble, titulo, precio::float p, moneda, precio_usd::float u, distrito, dormitorios, banios, area, url from central.scraper_propiedades"))[0];
  check('[1 fila] campos copiados', f.propiedad_id === 'urbania:1' && f.portal === 'urbania' && f.operacion === 'VENTA' && f.p === 100000 && f.u === 100000 && f.moneda === 'USD' && f.distrito === 'Miraflores' && f.dormitorios === '3' && f.area === '80 m2', JSON.stringify(f));
  const r = (await q('select portal, operacion, total from central.scraper_resumen'))[0];
  check('[1 fila] resumen por portal y operación', r.portal === 'urbania' && r.operacion === 'VENTA' && r.total === 1);
});

// 3) 250 filas: tope de 200, las más nuevas
await escenario('250 filas', async () => {
  await limpiarOrigen();
  await origen.exec(`INSERT INTO public.propiedades (id, portal, operacion, precio, precio_usd, moneda, creado_en)
    SELECT 'p:' || g, CASE WHEN g % 3 = 0 THEN 'urbania' WHEN g % 3 = 1 THEN 'infocasas' ELSE 'properati' END, CASE WHEN g % 2 = 0 THEN 'VENTA' ELSE 'ALQUILER' END,
           1000 + g, 1000 + g, 'USD', now() - (g || ' minutes')::interval FROM generate_series(1, 250) g`);
  const t0 = Date.now(); await sync(); const dt = Date.now() - t0;
  check('[250] copia exactamente 200', (await q('select count(*)::int n from central.scraper_propiedades'))[0].n === MAX_PROPIEDADES_VISTA);
  const masNueva = (await q("select 1 from central.scraper_propiedades where propiedad_id = 'p:1'")).length;
  const masVieja = (await q("select 1 from central.scraper_propiedades where propiedad_id = 'p:250'")).length;
  check('[250] incluye la más nueva y excluye la más vieja', masNueva === 1 && masVieja === 0);
  const tot = (await q('select sum(total)::int s from central.scraper_resumen'))[0].s;
  check('[250] el resumen cuenta las 250 (no solo las 200)', tot === 250, `-> ${tot}`);
  check('[250] el resumen tiene 6 combinaciones portal × operación', (await q('select count(*)::int n from central.scraper_resumen'))[0].n === 6);
  check(`[250] tarda menos de 8 s (${(dt / 1000).toFixed(1)}s)`, dt < 8000);
});

// 4) 10.000 filas
await escenario('10000 filas', async () => {
  await limpiarOrigen();
  await origen.exec(`INSERT INTO public.propiedades (id, portal, operacion, precio, precio_usd, moneda, creado_en)
    SELECT 'q:' || g, 'urbania', 'VENTA', g, g, 'USD', now() - (g || ' seconds')::interval FROM generate_series(1, 10000) g`);
  const t0 = Date.now(); await sync(); const dt = Date.now() - t0;
  check('[10000] copia 200 y cuenta 10000', (await q('select count(*)::int n from central.scraper_propiedades'))[0].n === 200 && (await q('select total from central.scraper_resumen'))[0].total === 10000);
  check(`[10000] tarda menos de 8 s (${(dt / 1000).toFixed(1)}s)`, dt < 8000);
});

// 5) Textos hostiles
const TEXTOS: Record<string, string> = {
  comillas: `O'Brien "x"`, barra: 'a\\b\\\\c', salto: 'línea1\nlínea2', tab: 'a\tb', emoji: 'Depa 🏠 con vista', eñe: 'Ñandú ñ á é í ó ú ü', sql: `'; DROP TABLE central.scraper_propiedades; --`,
  json: '{"a":[1,2],"b":"x"}', largo: 'x'.repeat(5000), cjk: '公寓 マンション 아파트', rtl: 'شقة', percent: '100% %s {0}', dolar: '$1 $$ ${x}', html: '<b>x</b><script>1</script>',
};
await escenario('textos', async () => {
  for (const [k, t] of Object.entries(TEXTOS)) {
    await limpiarOrigen(); await ins('urbania:1', 'urbania', 'VENTA', '2026-01-01T10:00:00Z', { titulo: t, distrito: t, area: t });
    await sync();
    const r = (await q('select titulo, distrito, area from central.scraper_propiedades'))[0];
    check(`[texto:${k}] se guarda idéntico`, r && r.titulo === t && r.distrito === t && r.area === t, JSON.stringify(r)?.slice(0, 100));
  }
  check('[texto] la tabla sigue existiendo tras la inyección', (await q('select count(*)::int n from central.scraper_propiedades'))[0].n === 1);
});
await escenario('byte nulo', async () => {
  await limpiarOrigen();
  try { await ins('urbania:1', 'urbania', 'VENTA', '2026-01-01T10:00:00Z', { titulo: 'a\u0000b' }); } catch { check('[NUL] (el origen real tampoco admite byte nulo: Postgres lo rechaza al guardar)', true); return; }
  await sync(); check('[NUL] sincroniza', true);
});
await escenario('sustituto suelto', async () => {
  await limpiarOrigen(); await ins('urbania:1', 'urbania', 'VENTA', '2026-01-01T10:00:00Z', { titulo: 'a\ud800b' });
  await sync(); check('[surrogate] un título con sustituto suelto no rompe la sincronización', (await q('select 1 from central.scraper_propiedades')).length === 1);
});

// 6) Nulos y números
await escenario('nulos', async () => {
  await limpiarOrigen();
  await ins('urbania:1', 'urbania', null, '2026-01-01T10:00:00Z', { titulo: null, distrito: null, dormitorios: null, banios: null, area: null, url: null, inmueble: null });
  await ins('urbania:2', 'infocasas', 'VENTA', '2026-01-02T10:00:00Z', { moneda: 'PEN', precio: 0, precio_usd: 0 });
  await sync();
  check('[nulos] ambas filas se copian', (await q('select count(*)::int n from central.scraper_propiedades'))[0].n === 2);
  check('[nulos] operación NULL => resumen con operación vacía', (await q("select count(*)::int n from central.scraper_resumen where portal='urbania' and operacion=''"))[0].n === 1);
});
for (const [nombre, valor] of [['1e12', 1e12], ['1e15', 1e15], ['9999999999999', 9999999999999]] as const) {
  await escenario(`desborde ${nombre}`, async () => {
    await limpiarOrigen(); await ins('urbania:1', 'urbania', 'VENTA', '2026-01-01T10:00:00Z', { precio: valor, precio_usd: valor });
    await sync(); check(`[desborde:${nombre}] un precio enorme no rompe la sincronización`, (await q('select 1 from central.scraper_propiedades')).length === 1);
  });
}

// 7) Reemplazo e idempotencia
await escenario('reemplazo', async () => {
  await limpiarOrigen(); await ins('a:1', 'urbania', 'VENTA', '2026-01-01T10:00:00Z'); await ins('a:2', 'infocasas', 'VENTA', '2026-01-02T10:00:00Z');
  await sync();
  const a = JSON.stringify(await q('select * from central.scraper_propiedades order by 1'));
  await sync(); await sync();
  check('[idempotencia] repetir 3 veces no cambia nada', JSON.stringify(await q('select * from central.scraper_propiedades order by 1')) === a);
  await origen.exec(`DELETE FROM public.propiedades WHERE id = 'a:1'; UPDATE public.propiedades SET precio = 555, precio_usd = 555 WHERE id = 'a:2'`);
  await sync();
  const f = await q('select propiedad_id, precio::float p from central.scraper_propiedades');
  check('[reemplazo] quita lo borrado y actualiza el precio', f.length === 1 && f[0].propiedad_id === 'a:2' && f[0].p === 555, JSON.stringify(f));
  const r = await q('select portal from central.scraper_resumen');
  check('[reemplazo] el resumen del portal que desapareció se elimina', r.length === 1 && r[0].portal === 'infocasas', JSON.stringify(r));
  check('[idempotencia] sync_estado: una sola fila', (await q("select count(*)::int n from central.sync_estado where app='scraper'"))[0].n === 1);
});

// 8) sincronizarSiConfigurado: apagado, limitado y a prueba de fallos
await escenario('apagado', async () => {
  reiniciarLimitador(); await limpiarOrigen(); await ins('a:1', 'urbania', 'VENTA', '2026-01-01T10:00:00Z');
  const antes = (await q('select count(*)::int n from central.scraper_propiedades'))[0].n;
  check('[config] sin CENTRAL_DATABASE_URL devuelve false', (await sincronizarSiConfigurado(dbOrigen, {})) === false);
  check('[config] y no escribió nada (la tabla queda igual)', (await q('select count(*)::int n from central.scraper_propiedades'))[0].n === antes);
  let reloj = 5_000_000; const op = { central: dbCentral, ahora: () => reloj };
  check('[config] con central: sincroniza', (await sincronizarSiConfigurado(dbOrigen, {}, op)) === true);
  reloj += 1000; check('[config] una segunda llamada seguida se limita', (await sincronizarSiConfigurado(dbOrigen, {}, op)) === false);
  reloj += 61_000; check('[config] pasado el minuto sincroniza otra vez', (await sincronizarSiConfigurado(dbOrigen, {}, op)) === true);
  const aviso = console.warn; const l: string[] = []; console.warn = (...a: unknown[]) => { l.push(a.join(' ')); };
  let r: boolean; try { r = await sincronizarSiConfigurado(dbOrigen, {}, { central: { query: async () => { throw new Error('caído postgres://u:secreto@h/d'); } } as never, ahora: () => reloj + 200_000 }); } finally { console.warn = aviso; }
  check('[config] si la central falla devuelve false sin lanzar y sin filtrar la conexión', r === false && l.length === 1 && !l[0].includes('secreto'), l.join('|'));
});

await client.query('ROLLBACK');
await client.end();

// 9) Controlador HTTP de Neon (el de Netlify): solo sentencias que no escriben
{
  const req = createRequire(`${RAIZ_APP}/package.json`);
  const { neon } = req('@neondatabase/serverless');
  const sql = neon(URL);
  try {
    const u = await sql.query('select current_user as u');
    check('[HTTP] el controlador de Netlify conecta como writer_scraper', u[0].u === 'writer_scraper', JSON.stringify(u));
    const fila = { id: 'x:1', precio: 1234.5, creado_en: '2026-01-01T10:00:00Z', titulo: "Ñandú 😀 \"q\" 'a' \\ \n tab\t" };
    const r = await sql.query(
      `SELECT t.id, t.precio::text p, t.creado_en::text c, t.titulo FROM jsonb_to_recordset($1::jsonb) AS t(id text, precio numeric, creado_en timestamptz, titulo text)`, [JSON.stringify([fila])]);
    check('[HTTP] un JSON como parámetro viaja intacto (unicode, comillas, saltos)', r.length === 1 && r[0].titulo === fila.titulo && r[0].p === '1234.5', JSON.stringify(r).slice(0, 120));
    const w = await sql.query(`INSERT INTO central.scraper_resumen (portal, operacion, total, ultima_vista) SELECT t.portal, t.operacion, t.total, t.uv FROM jsonb_to_recordset($1::jsonb) AS t(portal text, operacion text, total int, uv timestamptz)`, ['[]']);
    check('[HTTP] un INSERT con lista vacía se acepta (permisos y sintaxis) sin escribir', Array.isArray(w) && w.length === 0);
    const d = await sql.query('DELETE FROM central.scraper_propiedades WHERE false');
    check('[HTTP] DELETE sobre su propia tabla permitido', Array.isArray(d));
    let bloqueado = false; try { await sql.query('DELETE FROM central.mrp_stock WHERE false'); } catch (e) { bloqueado = /permission denied/i.test(String((e as Error).message)); }
    check('[HTTP] tabla ajena (mrp_stock) bloqueada también por HTTP', bloqueado);
    let nulo = false; try { await sql.query('select $1::text', ['a\u0000b']); } catch { nulo = true; }
    check('[HTTP] (informativo) Postgres rechaza el byte nulo también por HTTP', nulo);
  } catch (e) { check('[HTTP] controlador de Netlify', false, limpio(e)); }
}

console.log(`\nBATERÍA C (Scraper): ${ok}/${total} comprobaciones correctas`);
if (fallos.length) { console.log(`FALLOS (${fallos.length}):`); for (const f of fallos.slice(0, 40)) console.log('  ✘', f); }
process.exit(0);
