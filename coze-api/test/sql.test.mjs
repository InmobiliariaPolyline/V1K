// Ejecuta CADA consulta de la API (y sus filtros) contra el esquema real (db/01_schema.sql) en un Postgres de prueba
// (PGlite): si el esquema cambia y una consulta se rompe, esta prueba falla antes de desplegar.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { construirConsulta, ErrorFiltro, patronBusqueda, VISTAS } from '../lib/vistas.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pg = new PGlite();
await pg.exec(fs.readFileSync(path.join(raiz, 'db', '01_schema.sql'), 'utf8'));
await pg.exec(fs.readFileSync(path.join(raiz, 'db', '03_historial.sql'), 'utf8')); // la tabla del historial y su función (la vista «historial» la lee)

const ejecuta = async (nombre, query = {}) => {
  const { text, params } = construirConsulta(VISTAS[nombre], query);
  return (await pg.query(text, params)).rows;
};

// ── Datos mínimos en las 7 tablas ────────────────────────────────────────────────────
await pg.exec(`
  INSERT INTO central.planner_proyectos (proyecto_id, nombre, responsable, estado, avance_pct, inicio, fin, tareas_total, tareas_atrasadas)
    VALUES ('p1', 'Torre Norte', 'Ana', 'atrasado', 40, '2026-01-01', '2026-05-01', 3, 2),
           ('p2', 'Casa Sur', 'Luis', 'en curso', 10, '2026-01-01', '2026-12-01', 1, 0),
           ('p3', 'Edificio Centro', 'Ana', 'terminado', 100, '2025-01-01', '2025-06-01', 4, 0),
           ('p4', 'Almacén Este', 'Rosa', 'por iniciar', 0, '2027-01-01', '2027-06-01', 0, 0);
  INSERT INTO central.planner_hitos (hito_id, proyecto_id, descripcion, fecha)
    VALUES ('h1', 'p1', 'Vaciado de losa', '2026-07-10'), ('h2', 'p2', 'Entrega de planos', '2026-03-15'),
           ('h3', 'p2', 'Inspección final', '2099-01-01');
  INSERT INTO central.mrp_stock (material_id, categoria, material, unidad, cantidad, minimo)
    VALUES ('m1', 'Concreto', 'Cemento', 'saco', 8, 20), ('m2', 'Acero', 'Varilla', 'kg', 90, 50), ('m3', 'Acero', 'Perfil IPN', 'kg', 0, 30);
  INSERT INTO central.mrp_pedidos (pedido_id, proveedor, obra, estado, llegada_estimada, lineas, cantidad_pedida, cantidad_recibida)
    VALUES ('OC-1', 'Aceros del Sur', 'Torre Central', 'enviada', '2026-07-01', 1, 10, 4),
           ('OC-2', 'Cementos Lima', 'Casa Sur', 'pendiente', NULL, 2, 50, 0);
  INSERT INTO central.scraper_propiedades (propiedad_id, portal, operacion, inmueble, titulo, precio, moneda, precio_usd, distrito, url, encontrada_en)
    VALUES ('urbania:1', 'urbania', 'VENTA', 'Departamento', 'Depa luminoso', 100000, 'USD', 100000, 'Miraflores', 'https://x/1', now()),
           ('infocasas:2', 'infocasas', 'VENTA', 'Casa', 'Casa con jardín', 800000, 'PEN', 210000, 'Surco', 'https://x/2', now() - interval '1 hour'),
           ('infocasas:3', 'infocasas', 'ALQUILER', 'Departamento', 'Alquiler céntrico', 2500, 'PEN', 650, 'Miraflores', 'https://x/3', now() - interval '2 hours'),
           ('infocasas:4', 'infocasas', 'VENTA', 'Casa', 'Sin precio', 0, 'USD', 0, 'Surco', 'https://x/4', now() - interval '3 hours');
  INSERT INTO central.scraper_resumen (portal, operacion, total) VALUES ('urbania', 'VENTA', 1), ('infocasas', 'VENTA', 900), ('infocasas', 'ALQUILER', 300);
  INSERT INTO central.sync_estado (app) VALUES ('planner'), ('mrp'), ('scraper');
  SELECT * FROM central.tomar_foto_diaria();  -- una foto de hoy para la vista «historial»
`);

// ── 1) Cada vista, sin filtros ───────────────────────────────────────────────────────
const esperadas = {
  proyectos: 4, hitos: 3, 'stock-bajo': 2, pedidos: 2, propiedades: 4, 'propiedades-resumen': 3, frescura: 3, 'resumen-general': 1,
  'stock-categorias': 2, 'propiedades-distritos': 3, historial: 1,
};
for (const nombre of Object.keys(VISTAS)) {
  assert.ok(nombre in esperadas, `la vista nueva «${nombre}» necesita su caso de prueba`);
  assert.equal((await ejecuta(nombre)).length, esperadas[nombre], `${nombre}: filas esperadas`);
}
assert.deepEqual(Object.keys(VISTAS).sort(), Object.keys(esperadas).sort());

// Orden: el atrasado primero; stock-bajo por faltante descendente; solo lo que está bajo el mínimo
assert.equal((await ejecuta('proyectos'))[0].proyecto_id, 'p1');
assert.deepEqual((await ejecuta('stock-bajo')).map((r) => r.material), ['Perfil IPN', 'Cemento'], 'solo los bajo el mínimo, el de mayor faltante primero (Varilla tiene 90 de 50)');

// Ninguna consulta escribe: todas son SELECT
for (const v of Object.values(VISTAS)) {
  const { text } = construirConsulta(v, {});
  assert.match(text.trim(), /^SELECT\b/i);
}

// ── 2) Filtros ───────────────────────────────────────────────────────────────────────
const ids = (filas, col) => filas.map((r) => r[col]).sort();
assert.deepEqual(ids(await ejecuta('proyectos', { estado: 'atrasado' }), 'proyecto_id'), ['p1'], 'proyectos por estado');
assert.deepEqual(ids(await ejecuta('proyectos', { estado: 'ATRASADO' }), 'proyecto_id'), ['p1'], 'el estado no distingue mayúsculas');
assert.deepEqual(ids(await ejecuta('proyectos', { q: 'ana' }), 'proyecto_id'), ['p1', 'p3'], 'proyectos por responsable');
assert.deepEqual(ids(await ejecuta('proyectos', { estado: 'en curso', q: 'casa' }), 'proyecto_id'), ['p2'], 'dos filtros se combinan con AND');
assert.equal((await ejecuta('proyectos', { limite: '2' })).length, 2, 'limite');

assert.deepEqual(ids(await ejecuta('hitos', { proyecto: 'casa' }), 'descripcion'), ['Entrega de planos', 'Inspección final']);
assert.deepEqual(ids(await ejecuta('hitos', { desde: '2026-06-01', hasta: '2026-12-31' }), 'descripcion'), ['Vaciado de losa']);

assert.deepEqual(ids(await ejecuta('stock-bajo', { categoria: 'acero' }), 'material'), ['Perfil IPN'], 'stock bajo por categoría (Varilla no está bajo su mínimo)');
assert.deepEqual(ids(await ejecuta('stock-bajo', { q: 'cem' }), 'material'), ['Cemento']);
assert.equal((await ejecuta('stock-bajo', { limite: '1' }))[0].material, 'Perfil IPN', 'limite respeta el orden por faltante');

assert.deepEqual(ids(await ejecuta('pedidos', { estado: 'pendiente' }), 'pedido_id'), ['OC-2']);
assert.deepEqual(ids(await ejecuta('pedidos', { q: 'cementos' }), 'pedido_id'), ['OC-2']);
assert.deepEqual(ids(await ejecuta('pedidos', { q: 'oc-1' }), 'pedido_id'), ['OC-1'], 'busca también por código');
assert.equal((await ejecuta('pedidos'))[0].pedido_id, 'OC-1', 'la llegada estimada más cercana primero y sin fecha al final');

assert.deepEqual(ids(await ejecuta('propiedades', { operacion: 'VENTA' }), 'propiedad_id'), ['infocasas:2', 'infocasas:4', 'urbania:1']);
assert.deepEqual(ids(await ejecuta('propiedades', { operacion: 'alquiler' }), 'propiedad_id'), ['infocasas:3'], 'operación sin distinguir mayúsculas');
assert.deepEqual(ids(await ejecuta('propiedades', { distrito: 'miraflores' }), 'propiedad_id'), ['infocasas:3', 'urbania:1']);
assert.deepEqual(ids(await ejecuta('propiedades', { inmueble: 'casa' }), 'propiedad_id'), ['infocasas:2', 'infocasas:4']);
assert.deepEqual(ids(await ejecuta('propiedades', { portal: 'urbania' }), 'propiedad_id'), ['urbania:1']);
assert.deepEqual(ids(await ejecuta('propiedades', { operacion: 'VENTA', precio_max_usd: '150000' }), 'propiedad_id'), ['urbania:1'], 'precio máximo excluye los avisos sin precio (0)');
assert.deepEqual(ids(await ejecuta('propiedades', { precio_min_usd: '200000' }), 'propiedad_id'), ['infocasas:2']);
assert.deepEqual(ids(await ejecuta('propiedades', { operacion: 'VENTA', distrito: 'surco', precio_max_usd: '300000', limite: '1' }), 'propiedad_id'), ['infocasas:2'], 'combinación de filtros y límite');
assert.equal((await ejecuta('propiedades', { q: 'jardín' })).length, 1, 'la búsqueda de texto sigue funcionando (con acentos)');

assert.deepEqual(ids(await ejecuta('propiedades-resumen', { portal: 'infocasas', operacion: 'venta' }), 'total'), [900]);

// ── 2b) Vistas solo para el panel (gráficos) ─────────────────────────────────────────
{
  const cats = await ejecuta('stock-categorias');
  assert.deepEqual(cats.map((c) => c.categoria), ['Acero', 'Concreto'], 'ordenadas por faltante total descendente');
  assert.deepEqual(cats[0], { categoria: 'Acero', materiales: 2, en_stock_bajo: 1, sin_existencias: 1, faltante_total: 30 });
  assert.deepEqual(cats[1], { categoria: 'Concreto', materiales: 1, en_stock_bajo: 1, sin_existencias: 0, faltante_total: 12 });
  assert.equal(typeof cats[0].faltante_total, 'number', 'números como números');

  const dist = await ejecuta('propiedades-distritos');
  const surco = dist.find((d) => d.distrito === 'Surco' && d.operacion === 'VENTA');
  assert.equal(surco.avisos, 2);
  assert.equal(surco.precio_mediano_usd, 210000, 'la mediana ignora los avisos sin precio (0)');
  assert.equal(surco.precio_min_usd, 210000);
  assert.equal(surco.precio_max_usd, 210000);
  const mira = dist.find((d) => d.distrito === 'Miraflores' && d.operacion === 'ALQUILER');
  assert.deepEqual([mira.avisos, mira.precio_mediano_usd], [1, 650]);
  assert.ok(VISTAS['stock-categorias'].panel && VISTAS['propiedades-distritos'].panel, 'son vistas solo del panel');
  // Sin filas con precio el promedio es null, no un error
  await pg.exec(`INSERT INTO central.scraper_propiedades (propiedad_id, portal, operacion, distrito, precio_usd, encontrada_en) VALUES ('z1','x','VENTA','Lince',0,now())`);
  assert.equal((await ejecuta('propiedades-distritos')).find((d) => d.distrito === 'Lince').precio_mediano_usd, null);
  await pg.exec(`DELETE FROM central.scraper_propiedades WHERE propiedad_id = 'z1'`);
  // La mediana resiste a un precio mal publicado (un alquiler de US$ 12 por m² y otro absurdo): el promedio habría dado 33,670
  await pg.exec(`INSERT INTO central.scraper_propiedades (propiedad_id, portal, operacion, distrito, precio_usd, encontrada_en) VALUES ('m1','x','ALQUILER','Barranco',12,now()),('m2','x','ALQUILER','Barranco',1000,now()),('m3','x','ALQUILER','Barranco',101000,now()),('m4','x','ALQUILER','Barranco',0,now())`);
  const barr = (await ejecuta('propiedades-distritos')).find((d) => d.distrito === 'Barranco');
  assert.deepEqual([barr.avisos, barr.precio_mediano_usd, barr.precio_min_usd, barr.precio_max_usd], [4, 1000, 12, 101000], 'mediana robusta; el aviso sin precio cuenta pero no entra en la mediana');
  await pg.exec(`DELETE FROM central.scraper_propiedades WHERE propiedad_id IN ('m1','m2','m3','m4')`);
}

// ── 3) Valores no válidos: ErrorFiltro (la API responde 400 explicando qué se acepta) ──
const rechaza = (nombre, query, texto) => assert.throws(() => construirConsulta(VISTAS[nombre], query), (e) => e instanceof ErrorFiltro && e.message.includes(texto), `${nombre} ${JSON.stringify(query)}`);
rechaza('proyectos', { estado: 'inventado' }, 'valores permitidos: por iniciar, en curso, atrasado, terminado');
rechaza('proyectos', { estado: "x'; DROP TABLE central.planner_proyectos; --" }, 'valores permitidos');
rechaza('propiedades', { operacion: 'REGALO' }, 'VENTA, ALQUILER');
rechaza('propiedades', { portal: 'otro' }, 'valores permitidos');
rechaza('propiedades', { precio_max_usd: 'mucho' }, 'número');
rechaza('propiedades', { precio_max_usd: '-5' }, 'número');
rechaza('propiedades', { precio_min_usd: '1e309' }, 'número');
rechaza('hitos', { desde: '15/03/2026' }, 'AAAA-MM-DD');
rechaza('hitos', { hasta: '2026-02-31' }, 'AAAA-MM-DD');
rechaza('proyectos', { limite: '0' }, 'entre 1 y 200');
rechaza('proyectos', { limite: '201' }, 'entre 1 y 200');
rechaza('stock-bajo', { limite: '101' }, 'entre 1 y 100');
rechaza('propiedades', { limite: '2.5' }, 'entero');
rechaza('propiedades', { limite: 'abc' }, 'entero');
// Lo que no es texto, o viene vacío, simplemente se ignora (no es un error)
assert.equal(construirConsulta(VISTAS.propiedades, { operacion: ['VENTA', 'ALQUILER'], q: ['a', 'b'] }).params.length, 0);
assert.equal(construirConsulta(VISTAS.propiedades, { operacion: '   ', q: '' }).params.length, 0);
// Los filtros desconocidos se ignoran: nunca llegan al SQL
const { text: t, params: p } = construirConsulta(VISTAS.proyectos, { evil: "1; DROP TABLE x", 'estado) OR (1=1': 'x' });
assert.ok(!t.includes('DROP') && !t.includes('1=1') && p.length === 0);

// ── 4) Los valores van como parámetros, nunca pegados en el SQL ──────────────────────
{
  const { text, params } = construirConsulta(VISTAS.propiedades, { q: 'Mira', operacion: 'VENTA', precio_max_usd: '123456', limite: '7' });
  assert.ok(!text.includes('Mira') && !text.includes('123456') && !text.includes('VENTA'), 'ningún valor del usuario aparece en el texto SQL');
  assert.match(text, /LIMIT 7$/);
  assert.deepEqual(params, ['%Mira%', 'VENTA', 123456]);
}

// ── 5) stock-bajo: tope por defecto y orden ──────────────────────────────────────────
await pg.exec(`INSERT INTO central.mrp_stock (material_id, material, cantidad, minimo) SELECT 'x' || g, 'Material ' || g, 0, g + 100 FROM generate_series(1, 140) g;`);
const bajos = await ejecuta('stock-bajo');
assert.equal(bajos.length, 25, 'stock-bajo devuelve 25 por defecto');
assert.equal(bajos[0].material, 'Material 140', 'el de mayor faltante va primero');
const faltantes = bajos.map((r) => Number(r.faltante));
assert.deepEqual(faltantes, [...faltantes].sort((a, b) => b - a), 'orden descendente por faltante');
assert.equal((await ejecuta('stock-bajo', { limite: '100' })).length, 100, 'el máximo es 100');
await pg.exec(`DELETE FROM central.mrp_stock WHERE material_id LIKE 'x%'`);

// ── 6) Búsqueda de texto: %, _ y \ son literales; el byte nulo se elimina ────────────
await pg.exec(`
  INSERT INTO central.scraper_propiedades (propiedad_id, portal, titulo, distrito, inmueble, encontrada_en)
  VALUES ('b1', 'urbania', 'Oferta 100% garantizada', 'Zz', 'Casa', now()),
         ('b2', 'urbania', 'Local en zona_comercial', 'Zz', 'Local', now()),
         ('b3', 'urbania', 'Departamento normal', 'Zz', 'Departamento', now());
`);
const busca = async (q) => ids(await ejecuta('propiedades', { q, distrito: 'zz' }), 'propiedad_id');
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

// ── 7) frescura y resumen-general ─────────────────────────────────────────────────────
const fr = await ejecuta('frescura');
assert.ok(fr.every((r) => typeof r.hace_horas === 'number' && r.hace_horas >= 0 && r.hace_horas < 1), 'hace_horas es un número');

const [res] = await ejecuta('resumen-general');
assert.deepEqual(res.proyectos, { total: 4, atrasados: 1, en_curso: 1, por_iniciar: 1, terminados: 1, tareas_atrasadas: 2 });
assert.deepEqual(res.proyectos_atrasados.map((x) => x.nombre), ['Torre Norte']);
assert.equal(res.proyectos_atrasados[0].avance_pct, 40, 'avance como número');
assert.deepEqual(res.proximos_hitos.map((x) => x.descripcion), ['Inspección final'], 'solo hitos de hoy en adelante');
assert.equal(res.proximos_hitos[0].fecha, '2099-01-01', 'las fechas dentro del resumen son AAAA-MM-DD');
assert.deepEqual(res.stock, { materiales_con_minimo: 3, en_stock_bajo: 2, sin_existencias: 1 });
assert.deepEqual(res.mayor_faltante.map((x) => x.material), ['Perfil IPN', 'Cemento']);
assert.equal(typeof res.mayor_faltante[0].faltante, 'number');
assert.deepEqual(res.pedidos, { abiertos: 2 });
assert.deepEqual(res.proximos_pedidos.map((x) => x.pedido_id), ['OC-1', 'OC-2']);
assert.deepEqual(res.propiedades, { total_catalogo: 1201, copiadas: 4 });
assert.equal(res.propiedades_por_portal[0].total, 900, 'portales por total descendente');
assert.deepEqual(res.frescura.map((x) => x.app), ['mrp', 'planner', 'scraper']);

// Con todo vacío tampoco falla ni devuelve nulos donde se esperan listas
await pg.exec(`DELETE FROM central.planner_hitos; DELETE FROM central.planner_proyectos; DELETE FROM central.mrp_stock; DELETE FROM central.mrp_pedidos; DELETE FROM central.scraper_propiedades; DELETE FROM central.scraper_resumen; DELETE FROM central.sync_estado;`);
const [vacio] = await ejecuta('resumen-general');
assert.deepEqual(vacio.proyectos, { total: 0, atrasados: 0, en_curso: 0, por_iniciar: 0, terminados: 0, tareas_atrasadas: 0 });
assert.deepEqual([vacio.proyectos_atrasados, vacio.proximos_hitos, vacio.mayor_faltante, vacio.proximos_pedidos, vacio.propiedades_por_portal, vacio.frescura], [[], [], [], [], [], []]);
assert.deepEqual(vacio.propiedades, { total_catalogo: 0, copiadas: 0 });

console.log(`OK: ${Object.keys(VISTAS).length} vistas, sus filtros y los casos no válidos verificados contra el esquema real`);
