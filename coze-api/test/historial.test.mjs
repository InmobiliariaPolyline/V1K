// Prueba db/03_historial.sql contra el esquema real en un Postgres de prueba (PGlite): la tabla, la función que toma la foto diaria
// (conteos, medianas sin precios dudosos, día de Lima, idempotencia) y los permisos del rol de escritura acotada.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { VISTAS, construirConsulta } from '../lib/vistas.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const leer = (f) => fs.readFileSync(path.join(raiz, 'db', f), 'utf8');
let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const igual = (a, b, m) => { n++; assert.deepEqual(a, b, m); };

const pg = new PGlite();
await pg.exec(leer('01_schema.sql'));
await pg.exec("CREATE ROLE coze_reader LOGIN PASSWORD 'x'; ALTER ROLE coze_reader SET default_transaction_read_only = on;"); // existe antes que 03, como en Neon
const sql03 = leer('03_historial.sql');
await pg.exec(sql03);
await pg.exec(sql03); // repetirlo no rompe nada
ok(true, '03_historial.sql se puede ejecutar dos veces');

// ── Datos de ejemplo ────────────────────────────────────────────────────────────────
await pg.exec(`
  INSERT INTO central.planner_proyectos (proyecto_id, nombre, estado, avance_pct, tareas_atrasadas)
    VALUES ('p1', 'A', 'atrasado', 40, 5), ('p2', 'B', 'atrasado', 20, 1), ('p3', 'C', 'en curso', 60, 0), ('p4', 'D', 'terminado', 100, 0);
  INSERT INTO central.mrp_stock (material_id, material, cantidad, minimo)
    VALUES ('m1', 'a', 0, 10), ('m2', 'b', 0, 10), ('m3', 'c', 5, 10), ('m4', 'd', 50, 10);
  INSERT INTO central.mrp_pedidos (pedido_id, estado, llegada_estimada)
    VALUES ('o1', 'enviada', '2000-01-01'), ('o2', 'pendiente', '2999-01-01'), ('o3', 'parcial', NULL);
  INSERT INTO central.scraper_resumen (portal, operacion, total) VALUES ('infocasas', 'VENTA', 900), ('infocasas', 'ALQUILER', 100);
  INSERT INTO central.scraper_propiedades (propiedad_id, portal, operacion, precio_usd, encontrada_en) VALUES
    ('v1', 'x', 'VENTA', 100000, now()), ('v2', 'x', 'VENTA', 200000, now()), ('v3', 'x', 'VENTA', 300000, now()),
    ('v4', 'x', 'VENTA', 2934, now()),                                 -- venta con precio dudoso
    ('v5', 'x', 'VENTA', 0, now()),                                    -- sin precio: no cuenta como dudoso ni entra en la mediana
    ('a1', 'x', 'ALQUILER', 12, now()),                                -- alquiler «por m²»: dudoso
    ('a2', 'x', 'ALQUILER', 800, now()), ('a3', 'x', 'ALQUILER', 1000, now()), ('a4', 'x', 'ALQUILER', 1200, now()),
    ('a5', 'x', 'ALQUILER', 250000, now());                            -- alquiler absurdo: dudoso
`);

// ── La foto ─────────────────────────────────────────────────────────────────────────
const foto = (await pg.query('SELECT * FROM central.tomar_foto_diaria()')).rows;
igual(foto.length, 1, 'la función devuelve una fila');
const f = foto[0];
const hoyLima = (await pg.query("SELECT (now() AT TIME ZONE 'America/Lima')::date::text AS d")).rows[0].d;
igual(new Date(f.dia).toISOString().slice(0, 10), hoyLima, 'el día es el de Lima, no el de UTC');
igual([f.proyectos_total, f.proyectos_en_curso, f.proyectos_atrasados, Number(f.tareas_atrasadas)], [4, 1, 2, 6], 'proyectos');
igual(Number(f.avance_medio_pct), 55, 'avance medio (40+20+60+100)/4');
igual([f.materiales_con_minimo, f.materiales_sin_existencias, f.materiales_en_stock_bajo], [4, 2, 3], 'materiales');
igual([f.pedidos_abiertos, f.pedidos_vencidos], [3, 1], 'pedidos: solo el de 2000 está vencido; el sin fecha no');
igual([Number(f.propiedades_catalogo), f.propiedades_copiadas, f.propiedades_dudosas], [1000, 10, 3], 'propiedades: catálogo, copiadas y dudosas');
igual(Number(f.precio_mediano_venta_usd), 200000, 'mediana de venta sin el dudoso (2,934) ni el aviso sin precio');
igual(Number(f.precio_mediano_alquiler_usd), 1000, 'mediana de alquiler sin el de US$ 12 ni el de 250,000');
ok(typeof f.actualizado_en !== 'undefined', 'registra cuándo se tomó');

// ── Idempotente: un día, una fila ──────────────────────────────────────────────────
await pg.exec("UPDATE central.planner_proyectos SET estado = 'atrasado' WHERE proyecto_id = 'p3'");
const segunda = (await pg.query('SELECT * FROM central.tomar_foto_diaria()')).rows[0];
igual((await pg.query('SELECT count(*)::int AS n FROM central.historial_diario')).rows[0].n, 1, 'repetir la foto el mismo día no duplica');
igual(segunda.proyectos_atrasados, 3, 'repetirla actualiza los números de hoy');
// Un día anterior se conserva
await pg.exec(`INSERT INTO central.historial_diario (dia, proyectos_total, proyectos_atrasados) VALUES ('2026-01-01', 9, 7)`);
await pg.query('SELECT * FROM central.tomar_foto_diaria()');
igual((await pg.query('SELECT dia::text, proyectos_atrasados FROM central.historial_diario ORDER BY dia')).rows.map((r) => r.proyectos_atrasados), [7, 3], 'los días anteriores no se tocan');

// ── La vista «historial» de la API (solo para el panel) ──────────────────────────────
{
  await pg.exec(`INSERT INTO central.historial_diario (dia, proyectos_total, proyectos_atrasados, precio_mediano_venta_usd, propiedades_catalogo)
                 VALUES ('2026-01-02', 5, 2, 250000.50, 1200), ('2026-01-03', 5, 3, NULL, 1300)`);
  const consulta = async (q = {}) => { const { text, params } = construirConsulta(VISTAS.historial, q); return (await pg.query(text, params)).rows; };
  ok(VISTAS.historial.panel === true && VISTAS.historial.limite === 90 && VISTAS.historial.limiteMax === 400, 'es una vista solo del panel (el agente no la ve)');
  const todas = await consulta();
  igual(Object.keys(todas[0]).sort(), Object.keys(VISTAS.historial.campos).sort(), 'las columnas son exactamente las declaradas');
  igual(todas.map((r) => r.dia), [hoyLima, '2026-01-03', '2026-01-02', '2026-01-01'], 'más reciente primero y el día como texto AAAA-MM-DD');
  const d2 = todas.find((r) => r.dia === '2026-01-02');
  ok(typeof d2.precio_mediano_venta_usd === 'number' && d2.precio_mediano_venta_usd === 250000.5 && typeof d2.propiedades_catalogo === 'number', 'numéricos como números (no texto)');
  igual(todas.find((r) => r.dia === '2026-01-03').precio_mediano_venta_usd, null, 'un dato ausente es null');
  igual((await consulta({ desde: '2026-01-03', hasta: '2026-01-03' })).map((r) => r.dia), ['2026-01-03'], 'filtros desde y hasta');
  igual((await consulta({ limite: '1' })).length, 1, 'límite');
  assert.throws(() => construirConsulta(VISTAS.historial, { limite: '401' }), /entero entre 1 y 400/); n++;
  assert.throws(() => construirConsulta(VISTAS.historial, { desde: '2026-02-30' }), /AAAA-MM-DD/); n++;
}

// ── Con tablas vacías no falla y deja medianas nulas ───────────────────────────────
{
  const vacio = new PGlite();
  await vacio.exec(leer('01_schema.sql'));
  await vacio.exec(sql03);
  const v = (await vacio.query('SELECT * FROM central.tomar_foto_diaria()')).rows[0];
  igual([v.proyectos_total, v.materiales_con_minimo, Number(v.propiedades_catalogo), v.propiedades_dudosas], [0, 0, 0, 0], 'todo en cero');
  igual([v.avance_medio_pct, v.precio_mediano_venta_usd, v.precio_mediano_alquiler_usd], [null, null, null], 'promedios y medianas nulos, no un error');
  await vacio.close();
}

// ── Permisos (mínimo privilegio) ────────────────────────────────────────────────────
const puede = async (rol, objeto, privilegio, tipo = 'table') =>
  (await pg.query(`SELECT has_${tipo}_privilege($1, $2, $3) AS p`, [rol, objeto, privilegio])).rows[0].p;
ok((await pg.query("SELECT 1 FROM pg_roles WHERE rolname = 'writer_historial'")).rows.length === 1, 'existe el rol writer_historial');
const rolHist = (await pg.query("SELECT rolconnlimit, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = 'writer_historial'")).rows[0];
igual([rolHist.rolcanlogin, rolHist.rolsuper, rolHist.rolcreatedb, rolHist.rolcreaterole, rolHist.rolconnlimit], [true, false, false, false, 2], 'puede conectarse y no es superusuario; máximo 2 conexiones');
ok((await pg.query("SELECT rolconfig FROM pg_roles WHERE rolname = 'writer_historial'")).rows[0].rolconfig.some((c) => c.startsWith('statement_timeout')), 'tiene límite de tiempo por consulta');
for (const t of ['planner_proyectos', 'mrp_stock', 'mrp_pedidos', 'scraper_propiedades', 'scraper_resumen']) {
  ok(await puede('writer_historial', `central.${t}`, 'SELECT'), `writer_historial lee ${t}`);
  for (const p of ['INSERT', 'UPDATE', 'DELETE']) ok(!(await puede('writer_historial', `central.${t}`, p)), `writer_historial NO puede ${p} en ${t}`);
}
ok(!(await puede('writer_historial', 'central.sync_estado', 'SELECT')) && !(await puede('writer_historial', 'central.planner_hitos', 'SELECT')), 'no lee tablas que no necesita');
ok(!(await puede('writer_historial', 'central.sync_estado', 'INSERT')), 'no toca sync_estado');
for (const p of ['SELECT', 'INSERT', 'UPDATE']) ok(await puede('writer_historial', 'central.historial_diario', p), `writer_historial puede ${p} en el historial`);
ok(!(await puede('writer_historial', 'central.historial_diario', 'DELETE')) && !(await puede('writer_historial', 'central.historial_diario', 'TRUNCATE')), 'writer_historial NO puede borrar el historial');
ok(await puede('writer_historial', 'central.tomar_foto_diaria()', 'EXECUTE', 'function'), 'writer_historial ejecuta la función');
ok(!(await puede('coze_reader', 'central.tomar_foto_diaria()', 'EXECUTE', 'function')), 'coze_reader NO ejecuta la función (no escribe)');
ok(await puede('coze_reader', 'central.historial_diario', 'SELECT'), 'coze_reader lee el historial');
for (const p of ['INSERT', 'UPDATE', 'DELETE']) ok(!(await puede('coze_reader', 'central.historial_diario', p)), `coze_reader NO puede ${p} en el historial`);
// Las demás apps no pueden alterar el historial (no existen aquí, pero el script no les concede nada)
ok(!/GRANT[^;]*historial_diario[^;]*(writer_planner|writer_mrp|writer_scraper|PUBLIC)/i.test(sql03), '03 no concede el historial a las apps ni a PUBLIC');
ok(!/CREATE ROLE[^;]*SUPERUSER|BYPASSRLS/i.test(sql03), 'el rol no es superusuario ni evita la seguridad por fila');

// ── Texto del script ────────────────────────────────────────────────────────────────
ok(/CAMBIAR_POR_CONTRASENA/.test(sql03) && !/PASSWORD '(?!CAMBIAR)[^']{8,}'/.test(sql03), 'el repositorio solo lleva un marcador de contraseña, nunca una real');
ok(/America\/Lima/.test(sql03), 'usa la hora de Lima');

console.log(`OK: historial diario — ${n} comprobaciones (foto, medianas sin precios dudosos, idempotencia y permisos)`);
