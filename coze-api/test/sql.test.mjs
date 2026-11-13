// Comprueba CADA consulta de la API contra el esquema real (db/01_schema.sql) en un Postgres de prueba (PGlite):
// si el esquema cambia y una consulta se rompe, esta prueba falla antes de desplegar.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { patronBusqueda, VISTAS } from '../lib/vistas.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pg = new PGlite();
await pg.exec(fs.readFileSync(path.join(raiz, 'db', '01_schema.sql'), 'utf8'));

// Datos mínimos en las 7 tablas
await pg.exec(`
  INSERT INTO central.planner_proyectos (proyecto_id, nombre, responsable, estado, avance_pct, inicio, fin, tareas_total, tareas_atrasadas)
    VALUES ('p1', 'Torre Norte', 'Ana', 'atrasado', 40, '2026-01-01', '2026-05-01', 3, 2),
           ('p2', 'Casa Sur', 'Luis', 'en curso', 10, '2026-01-01', '2026-12-01', 1, 0);
  INSERT INTO central.planner_hitos (hito_id, proyecto_id, descripcion, fecha) VALUES ('h1', 'p1', 'Vaciado de losa', '2026-07-10');
  INSERT INTO central.mrp_stock (material_id, categoria, material, unidad, cantidad, minimo)
    VALUES ('m1', 'Concreto', 'Cemento', 'saco', 8, 20), ('m2', 'Acero', 'Varilla', 'kg', 90, 50);
  INSERT INTO central.mrp_pedidos (pedido_id, proveedor, obra, estado, llegada_estimada, lineas, cantidad_pedida, cantidad_recibida)
    VALUES ('OC-1', 'Aceros', 'Torre Central', 'enviada', '2026-07-01', 1, 10, 4);
  INSERT INTO central.scraper_propiedades (propiedad_id, portal, operacion, inmueble, titulo, precio, moneda, precio_usd, distrito, url, encontrada_en)
    VALUES ('urbania:1', 'urbania', 'VENTA', 'Departamento', 'Depa luminoso', 100000, 'USD', 100000, 'Miraflores', 'https://x', now());
  INSERT INTO central.scraper_resumen (portal, operacion, total) VALUES ('urbania', 'VENTA', 1);
  INSERT INTO central.sync_estado (app) VALUES ('planner'), ('mrp'), ('scraper');
`);

const esperadas = {
  proyectos: 2, hitos: 1, 'stock-bajo': 1, pedidos: 1, propiedades: 1, 'propiedades-resumen': 1, frescura: 3,
};

for (const [nombre, vista] of Object.entries(VISTAS)) {
  const r = await pg.query(vista.sql);
  assert.equal(r.rows.length, esperadas[nombre], `${nombre}: filas esperadas`);
  if (vista.sqlBusqueda) {
    const hit = await pg.query(vista.sqlBusqueda, ['%miraflores%']);
    assert.equal(hit.rows.length, 1, `${nombre}: la búsqueda encuentra`);
    const miss = await pg.query(vista.sqlBusqueda, ['%no-existe%']);
    assert.equal(miss.rows.length, 0, `${nombre}: la búsqueda no inventa`);
  }
}
assert.deepEqual(Object.keys(VISTAS).sort(), Object.keys(esperadas).sort(), 'toda vista nueva necesita su caso de prueba');

// El atrasado va primero, y el stock bajo solo trae lo que está bajo el mínimo
assert.equal((await pg.query(VISTAS.proyectos.sql)).rows[0].proyecto_id, 'p1');
assert.equal((await pg.query(VISTAS['stock-bajo'].sql)).rows[0].material, 'Cemento');

// Ninguna consulta escribe: son todas SELECT
for (const v of Object.values(VISTAS)) {
  for (const sql of [v.sql, v.sqlBusqueda].filter(Boolean)) assert.match(sql.trim(), /^SELECT\b/i);
}

// stock-bajo devuelve como máximo 25, los de mayor faltante primero
await pg.exec(`
  INSERT INTO central.mrp_stock (material_id, material, cantidad, minimo)
  SELECT 'x' || g, 'Material ' || g, 0, g FROM generate_series(1, 40) g;
`);
const bajos = (await pg.query(VISTAS['stock-bajo'].sql)).rows;
assert.equal(bajos.length, 25, 'stock-bajo se limita a 25 filas');
assert.equal(bajos[0].material, 'Material 40', 'el de mayor faltante va primero');
const faltantes = bajos.map((r) => Number(r.faltante));
assert.deepEqual(faltantes, [...faltantes].sort((a, b) => b - a), 'orden descendente por faltante');

// Búsqueda: %, _ y \ son texto literal; el byte nulo y otros caracteres de control se eliminan
await pg.exec(`
  INSERT INTO central.scraper_propiedades (propiedad_id, portal, titulo, distrito, inmueble, encontrada_en)
  VALUES ('b1', 'urbania', 'Oferta 100% garantizada', 'Surco', 'Casa', now()),
         ('b2', 'urbania', 'Local en zona_comercial', 'Surco', 'Local', now()),
         ('b3', 'urbania', 'Departamento normal', 'Surco', 'Departamento', now());
`);
const busca = async (q) => (await pg.query(VISTAS.propiedades.sqlBusqueda, [patronBusqueda(q)])).rows.map((r) => r.propiedad_id).sort();
assert.deepEqual(await busca('%'), ['b1'], '% solo encuentra el que tiene % literal');
assert.deepEqual(await busca('_'), ['b2'], '_ solo encuentra el que tiene _ literal');
assert.deepEqual(await busca('100%'), ['b1']);
assert.deepEqual(await busca('norma\u0000l'), ['b3'], 'el byte nulo se elimina y la búsqueda funciona');
assert.deepEqual(await busca('\\'), [], 'la barra invertida no rompe la consulta');
assert.deepEqual(await busca("' OR 1=1 --"), [], 'una inyección es solo texto');
assert.equal(patronBusqueda('   '), '', 'texto vacío => sin búsqueda');
assert.equal(patronBusqueda(['a', 'b']), '', 'un arreglo no es texto');
assert.equal(patronBusqueda('x'.repeat(500)).length, 62, 'se recorta a 60 caracteres');
await pg.exec(`DELETE FROM central.scraper_propiedades WHERE propiedad_id IN ('b1','b2','b3')`);

console.log(`OK: ${Object.keys(VISTAS).length} consultas verificadas contra el esquema real`);
