// Pruebas del panel web (public/): funciones puras del núcleo, modo demostración y comprobaciones estáticas de la
// página (CSP, XSS, importaciones, iconos y clases de CSS). No necesita navegador ni base de datos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErrorFiltro, VISTAS, construirConsulta } from '../lib/vistas.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(raiz, 'public');
const nucleo = (f) => import(`../public/js/nucleo/${f}.js`);
const F = await nucleo('formato');
const R = await nucleo('rutas');
const G = await nucleo('graficos');
const I = await nucleo('insights');
const E = await nucleo('estado');
const D = await nucleo('demo');
const { ErrorApi } = await nucleo('api');

let comprobaciones = 0;
const ok = (cond, msg) => { comprobaciones++; assert.ok(cond, msg); };
const igual = (a, b, msg) => { comprobaciones++; assert.deepEqual(a, b, msg); };

// ══════════════ formato.js ══════════════
// Fechas de calendario: sin conversión de zona horaria
igual(F.fechaCorta('2026-11-07'), '07/11/2026');
igual(F.fechaCorta('2026-11-07T00:00:00.000Z'), '07/11/2026');
igual(F.fechaCorta('2026-12-31T23:59:59Z'), '31/12/2026');
for (const malo of [null, undefined, '', 'ayer', 12345, {}]) igual(F.fechaCorta(malo), '—', String(malo));
ok(/^\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/.test(F.fechaHora('2026-11-13T18:37:56.393Z')));
igual(F.fechaHora('no es fecha'), '—');
igual(F.soloFecha('2026-11-07T00:00:00.000Z'), '2026-11-07');
igual(F.soloFecha(null), null);
igual(F.diasEntre('2026-11-13', '2026-11-20'), 7);
igual(F.diasEntre('2026-11-13', '2026-11-12'), -1);
igual(F.diasEntre('2026-03-01', '2026-02-28'), -1, 'sin errores por febrero');
igual(F.diasEntre('2026-10-31', '2026-11-01'), 1, 'sin errores por cambio de hora');
igual(F.diasEntre('x', '2026-11-01'), null);
igual(F.sumarDias('2026-11-13', 20), '2026-12-03');
igual(F.sumarDias('2026-12-31', 1), '2027-01-01');
igual(F.sumarDias('2026-03-01', -1), '2026-02-28');
igual(F.relativoDias('2026-11-13', '2026-11-13'), 'hoy');
igual(F.relativoDias('2026-11-14', '2026-11-13'), 'mañana');
igual(F.relativoDias('2026-11-12', '2026-11-13'), 'ayer');
igual(F.relativoDias('2026-11-18', '2026-11-13'), 'en 5 días');
igual(F.relativoDias('2026-11-01', '2026-11-13'), 'hace 12 días');
igual(F.relativoDias('basura', '2026-11-13'), '—');

// «Hace X»
igual(F.haceHoras(0), 'hace 1 min');
igual(F.haceHoras(0.2), 'hace 12 min');
igual(F.haceHoras(0.99), 'hace 59 min');
igual(F.haceHoras(1.5), 'hace 1.5 h');
igual(F.haceHoras(1), 'hace 1 h');
igual(F.haceHoras(23.9), 'hace 23.9 h');
igual(F.haceHoras(24), 'hace 1 día');
igual(F.haceHoras(100), 'hace 4 días');
for (const malo of [-1, NaN, Infinity, '3', null, undefined]) igual(F.haceHoras(malo), '—', String(malo));

// Semáforo de frescura
igual(F.estadoFrescura(0.1), 'ok');
igual(F.estadoFrescura(23.9), 'ok');
igual(F.estadoFrescura(24), 'aviso');
igual(F.estadoFrescura(71.9), 'aviso');
igual(F.estadoFrescura(72), 'viejo');
igual(F.estadoFrescura(undefined), 'desconocido');
igual(F.estadoFrescura(NaN), 'desconocido');
igual(F.saludo(8), 'Buenos días'); igual(F.saludo(15), 'Buenas tardes'); igual(F.saludo(22), 'Buenas noches');

// Números y dinero (es-PE: coma para miles, punto para decimales)
igual(F.numero(1234567.5), '1,234,567.5');
igual(F.numero('4185.00'), '4,185');
igual(F.numero('abc'), '—');
igual(F.compacto(950), '950'); igual(F.compacto(1234), '1.2 K'); igual(F.compacto(2_500_000), '2.5 M'); igual(F.compacto('x'), '—');
igual(F.dinero('268000.00', 'USD'), 'US$ 268,000');
igual(F.dinero('3800000', 'PEN'), 'S/ 3,800,000');
igual(F.dinero('1500', 'EUR'), 'EUR 1,500');
for (const nulo of ['0', null, '-5', 'abc']) igual(F.dinero(nulo, 'USD'), 'Sin precio', String(nulo));
igual(F.plural(1, 'tarea', 'tareas'), '1 tarea'); igual(F.plural(3, 'tarea', 'tareas'), '3 tareas');

// Solo enlaces http(s): nada de javascript:, data: ni esquemas raros
igual(F.urlSegura('https://www.infocasas.com.pe/aviso/1'), 'https://www.infocasas.com.pe/aviso/1');
igual(F.urlSegura('http://x.com/a'), 'http://x.com/a');
for (const malo of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///c:/x', '//x.com', 'x.com', '', null, undefined, 42]) igual(F.urlSegura(malo), null, String(malo));

// Barras de progreso acotadas
igual(F.porcentaje(40), 40); igual(F.porcentaje(-5), 0); igual(F.porcentaje(150), 100); igual(F.porcentaje('abc'), 0); igual(F.porcentaje(null), 0);

// Texto
igual(F.normalizar('  ÁRBOL Ñandú '), 'arbol nandu');
ok(F.contiene('Santiago de Surco', 'surco')); ok(F.contiene('Jesús María', 'jesus')); ok(!F.contiene('Lince', 'barranco'));
igual(F.iniciales('Ana Torres'), 'AT'); igual(F.iniciales(''), '·'); igual(F.iniciales('Luis'), 'L');

// Orden, páginas y CSV
const filas = [{ n: 'b', v: '10' }, { n: 'a', v: '9' }, { n: 'c', v: null }, { n: 'd', v: '100' }];
igual(F.ordenarPor(filas, 'v', 'asc').map((x) => x.n), ['a', 'b', 'd', 'c'], 'números como números y vacíos al final');
igual(F.ordenarPor(filas, 'v', 'desc').map((x) => x.n), ['d', 'b', 'a', 'c']);
igual(F.ordenarPor(filas, 'n', 'desc').map((x) => x.n), ['d', 'c', 'b', 'a']);
igual(filas.map((x) => x.n), ['b', 'a', 'c', 'd'], 'ordenarPor no modifica el original');
igual(F.ordenarPor([{ n: 'Ñu' }, { n: 'Zorro' }, { n: 'Oso' }], 'n').map((x) => x.n), ['Ñu', 'Oso', 'Zorro'], 'orden en español');
const pag = F.paginar(Array.from({ length: 53 }, (_, i) => i), 3, 25);
igual([pag.pagina, pag.paginas, pag.desde, pag.hasta, pag.filas.length], [3, 3, 51, 53, 3]);
igual(F.paginar([], 5, 25).pagina, 1); igual(F.paginar([1, 2, 3], 99, 2).pagina, 2); igual(F.paginar([1], -4, 2).pagina, 1);
igual(F.celdaCsv('hola, mundo'), '"hola, mundo"');
igual(F.celdaCsv('di "hola"'), '"di ""hola"""');
igual(F.celdaCsv('=CMD|\' /C calc\'!A0'), '\'=CMD|\' /C calc\'!A0', 'protege contra inyección de fórmulas');
for (const f of ['=1+1', '+1', '@SUMA(A1)', '-2+3']) ok(F.celdaCsv(f).startsWith('\''), `fórmula ${f}`);
igual(F.celdaCsv('-5'), '-5', 'un número negativo no se altera'); igual(F.celdaCsv(null), ''); igual(F.celdaCsv(0), '0');
const csv = F.aCsv([{ clave: 'a', titulo: 'A' }, { clave: 'b', titulo: 'B' }], [{ a: 1, b: 'x,y' }]);
ok(csv.startsWith('﻿A,B\r\n1,"x,y"\r\n'), 'CSV con BOM y saltos CRLF');
igual(F.sumar([{ x: '2' }, { x: 3 }, { x: null }, {}], 'x'), 5);
igual(F.promedio([2, 4, NaN]), 3); igual(F.promedio([]), null);
igual(F.mediana([5, 1, 3]), 3); igual(F.mediana([1, 2, 3, 4]), 2.5);

// ══════════════ rutas.js ══════════════
igual(R.parsearHash('#/propiedades?operacion=VENTA&q=casa%20grande'), { ruta: 'propiedades', params: { operacion: 'VENTA', q: 'casa grande' } });
igual(R.parsearHash('#/desconocida').ruta, 'inicio'); igual(R.parsearHash('').ruta, 'inicio'); igual(R.parsearHash('#/').ruta, 'inicio');
igual(R.parsearHash('#/proyectos?estado=&x').params, {}, 'vacíos fuera');
igual(R.parsearHash('#/proyectos?q=%E0%A4%A').params, { q: '%E0%A4%A' }, 'codificación rota no lanza');
igual(R.parsearHash('#/__proto__?a=1').ruta, 'inicio');
igual(R.armarHash('propiedades', { q: 'a b', operacion: 'VENTA', vacio: '', nulo: null }), '#/propiedades?operacion=VENTA&q=a%20b');
igual(R.armarHash('nada'), '#/inicio');
igual(R.parsearHash(R.armarHash('materiales', { q: 'ñ & =?' })).params, { q: 'ñ & =?' }, 'ida y vuelta');
igual(R.combinarParams({ a: '1', b: '2' }, { b: '', c: 3, a: null }), { c: '3' });

// ══════════════ graficos.js (matemática) ══════════════
const cerca = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
{
  const [x, y] = G.punto(100, 100, 50, 0); ok(cerca(x, 100) && cerca(y, 50), 'ángulo 0 = las 12');
  const [x2, y2] = G.punto(100, 100, 50, Math.PI / 2); ok(cerca(x2, 150) && cerca(y2, 100), 'ángulo 90° = las 3');
  const arcos = G.calcularArcos([{ etiqueta: 'a', valor: 3 }, { etiqueta: 'b', valor: 1 }, { etiqueta: 'c', valor: 0 }]);
  igual(arcos.map((a) => a.etiqueta), ['a', 'b'], 'omite los de valor cero'); ok(cerca(arcos[0].pct, 75) && cerca(arcos[1].pct, 25));
  ok(arcos[0].a1 < arcos[1].a0 + 1e-9, 'los arcos no se superponen'); ok(arcos[1].a1 <= 2 * Math.PI);
  igual(G.calcularArcos([{ valor: 0 }, { valor: -4 }, { valor: 'x' }]), [], 'sin datos');
  const uno = G.calcularArcos([{ etiqueta: 'solo', valor: 5 }]); ok(uno[0].a1 - uno[0].a0 > 2 * Math.PI - 0.001, 'un solo segmento cierra el círculo');
  ok(/^M[\d. -]+A.*Z$/.test(G.arcoPath(50, 50, 40, 20, 0, 1)), 'camino de arco válido');
  ok(!/NaN/.test(G.arcoPath(50, 50, 40, 20, 0, 2 * Math.PI - 0.0001)));
  const sem = G.matrizMes(2026, 10); // noviembre de 2026 empieza en domingo
  ok(sem.every((s) => s.length === 7), 'semanas de 7 días'); igual(sem[0].findIndex(Boolean), 6, 'el 1 de noviembre cae en domingo (lunes primero)');
  igual(sem.flat().filter(Boolean).length, 30); igual(sem.flat().filter(Boolean)[29], '2026-11-30');
  igual(G.matrizMes(2024, 1).flat().filter(Boolean).length, 29, 'febrero bisiesto');
  igual(G.matrizMes(2026, 1)[0].findIndex(Boolean), 6, 'el 1 de febrero de 2026 cae en domingo');
  const esc = G.escalaGantt([{ inicio: '2026-09-01T00:00:00.000Z', fin: '2026-12-01T00:00:00.000Z' }], '2026-11-13');
  ok(esc.min < '2026-09-01' && esc.max > '2026-12-01' && esc.dias > 90, 'escala con holgura');
  ok(G.fraccion(esc, '2000-01-01') === 0 && G.fraccion(esc, '2100-01-01') === 1, 'fracción acotada a 0..1');
  const f1 = G.fraccion(esc, '2026-10-01'), f2 = G.fraccion(esc, '2026-11-01'); ok(f1 < f2, 'fracción creciente');
  const marcas = G.marcasMes(esc); ok(marcas.length >= 3 && marcas.every((m) => m.fecha.endsWith('-01')), 'marcas en el día 1 de cada mes');
  ok(G.escalaGantt([], '2026-11-13').dias >= 1, 'escala sin proyectos');
  ok(G.escalaGantt([{ inicio: null, fin: 'basura' }], '2026-11-13').dias >= 1, 'escala con fechas rotas');
}

// ══════════════ insights.js ══════════════
const HOY = '2026-11-13';
const base = () => ({
  proyectos: { total: 4, atrasados: 0, en_curso: 3, por_iniciar: 0, terminados: 1, tareas_atrasadas: 0 }, proyectos_atrasados: [], proximos_hitos: [],
  stock: { materiales_con_minimo: 100, en_stock_bajo: 0, sin_existencias: 0 }, mayor_faltante: [], pedidos: { abiertos: 2 }, proximos_pedidos: [],
  propiedades: { total_catalogo: 500, copiadas: 100 }, propiedades_por_portal: [],
  frescura: [{ app: 'planner', ultima_sync: 'x', hace_horas: 1 }, { app: 'mrp', ultima_sync: 'x', hace_horas: 2 }, { app: 'scraper', ultima_sync: 'x', hace_horas: 0.5 }],
});
{
  const sano = I.generarAlertas(base(), HOY);
  igual(I.saludGlobal(sano), 'ok'); ok(sano.every((a) => a.tono === 'ok' || a.tono === 'info'), 'todo en orden: solo avisos informativos');
  const mal = base();
  mal.proyectos.atrasados = 2; mal.proyectos.tareas_atrasadas = 7; mal.proyectos_atrasados = [{ nombre: 'Torre X' }];
  mal.stock.en_stock_bajo = 80; mal.stock.sin_existencias = 20; mal.mayor_faltante = [{ material: 'Acero' }];
  mal.proximos_pedidos = [{ pedido_id: 'OC-1', llegada_estimada: '2026-11-10' }, { pedido_id: 'OC-2', llegada_estimada: '2026-11-20' }, { pedido_id: 'OC-3', llegada_estimada: null }];
  mal.frescura = [{ app: 'planner', hace_horas: 80 }, { app: 'mrp', hace_horas: 30 }];
  const al = I.generarAlertas(mal, HOY);
  igual(I.saludGlobal(al), 'peligro');
  const orden = { peligro: 0, aviso: 1, info: 2, ok: 3 };
  ok(al.every((a, i) => i === 0 || orden[al[i - 1].tono] <= orden[a.tono]), 'ordenadas por gravedad');
  ok(al.some((a) => /2 proyectos atrasados/.test(a.titulo)), 'proyectos atrasados');
  ok(al.some((a) => /1 pedido con llegada vencida/.test(a.titulo) && /OC-1/.test(a.texto)), 'solo el pedido vencido (no el futuro ni el sin fecha)');
  ok(al.some((a) => /80 de 100 materiales/.test(a.titulo) && a.tono === 'peligro'), 'stock ≥50 % es grave');
  ok(al.some((a) => /Planner sin sincronizar/.test(a.titulo) && a.tono === 'peligro'), 'más de 72 h = grave');
  ok(al.some((a) => /MRP: última sincronización/.test(a.titulo) && a.tono === 'aviso'), 'más de 24 h = aviso');
  ok(al.some((a) => /Scraper todavía no ha sincronizado/.test(a.titulo)), 'app que falta');
  ok(al.every((a) => a.ir && typeof a.ir.ruta === 'string' && R.RUTAS.includes(a.ir.ruta)), 'cada alerta lleva a una sección real');
  const leve = base(); leve.stock.en_stock_bajo = 10;
  igual(I.saludGlobal(I.generarAlertas(leve, HOY)), 'aviso', '10 % bajo mínimo = aviso');
  const hito = base(); hito.proximos_hitos = [{ fecha: '2026-11-16', descripcion: 'Entrega', proyecto: 'P' }, { fecha: '2026-12-30', descripcion: 'Lejano', proyecto: 'P' }];
  ok(I.generarAlertas(hito, HOY).some((a) => /1 hito en los próximos 7 días/.test(a.titulo)), 'hitos cercanos');
  const vacio = base(); vacio.proyectos.total = 0; vacio.stock.materiales_con_minimo = 0; vacio.pedidos.abiertos = 0; vacio.frescura = [];
  ok(Array.isArray(I.generarAlertas(vacio, HOY)), 'sin datos no lanza');
  igual(I.horasCorto(0.5), '30 min'); igual(I.horasCorto(5), '5 h'); igual(I.horasCorto(49), '2 d'); igual(I.horasCorto(null), '—');
  igual(I.pctFrescura(0), 100); igual(I.pctFrescura(36), 50); igual(I.pctFrescura(500), 0); igual(I.pctFrescura(-3), 100); igual(I.pctFrescura(undefined), 0);
}

// ══════════════ estado.js ══════════════
igual(E.sanear('tema', 'oscuro'), 'oscuro'); igual(E.sanear('tema', 'rojo'), 'auto'); igual(E.sanear('auto', 5), 5); igual(E.sanear('auto', '5'), 0);
igual(E.sanear('proyVista', 'linea'), 'linea'); igual(E.sanear('propVista', 'linea'), 'tarjetas'); igual(E.sanear('inexistente', 'x'), undefined);
igual(E.leerPrefs(), { ...E.PREFS_DEFECTO }, 'sin almacenamiento: valores por defecto');
ok(!E.haySesion(), 'sin token ni demo no hay sesión');
E.guardarToken('a'.repeat(10)); ok(!E.haySesion(), 'un token muy corto no cuenta'); E.guardarToken('b'.repeat(40)); ok(E.haySesion());
E.cerrarSesion(); ok(!E.haySesion() && E.token() === '', 'cerrar sesión borra el token');
E.activarDemo(); ok(E.haySesion() && E.esDemo()); E.cerrarSesion(); ok(!E.esDemo());

// ══════════════ Modo demostración: mismas reglas que la API ══════════════
const meta = JSON.parse(fs.readFileSync(path.join(pub, 'vistas.json'), 'utf8'));
const AHORA = new Date('2026-11-13T15:00:00');
const demo = (vista, params = {}) => D.consultar(vista, params, meta, AHORA);
igual(meta.vistas.map((v) => v.nombre).sort(), Object.keys(VISTAS).sort(), 'vistas.json tiene todas las vistas');

for (const [nombre, v] of Object.entries(VISTAS)) {
  const r = await demo(nombre);
  ok(r.vista === nombre && Array.isArray(r.datos) && r.total === r.datos.length, `${nombre}: forma de la respuesta`);
  ok(r.datos.length > 0, `${nombre}: la demostración trae datos`);
  igual(Object.keys(r.datos[0]).sort(), Object.keys(v.campos).sort(), `${nombre}: mismas columnas que la API real`);
  if (v.limiteMax) ok(r.datos.length <= v.limite, `${nombre}: respeta el límite por defecto (${v.limite})`);
}
// Paridad de validación: el mismo valor malo da el mismo mensaje en la API real y en la demostración
const malos = { enum: ['zzz', '1'], numero: ['-1', 'abc', '1e12', 'Infinity'], fecha: ['2026-02-30', '13/11/2026', 'ayer'] };
let paridad = 0;
for (const [nombre, v] of Object.entries(VISTAS)) {
  if (v.sql) continue;
  const casos = Object.entries(v.filtros).flatMap(([n, f]) => (malos[f.tipo] ?? []).map((valor) => ({ [n]: valor })));
  casos.push({ limite: '0' }, { limite: String(v.limiteMax + 1) }, { limite: 'abc' }, { limite: '1.5' });
  for (const params of casos) {
    let real = null; try { construirConsulta(v, params); } catch (e) { if (e instanceof ErrorFiltro) real = e.message; else throw e; }
    let sim = null; try { await demo(nombre, params); } catch (e) { if (e instanceof ErrorApi && e.estado === 400) sim = e.message; else throw e; }
    igual(sim, real, `${nombre} ${JSON.stringify(params)}: mismo mensaje de error`); paridad++;
  }
}
ok(paridad > 40, `se compararon ${paridad} casos de validación`);
await assert.rejects(() => demo('no-existe'), (e) => e instanceof ErrorApi && e.estado === 404); comprobaciones++;

// Semántica de filtros y orden
{
  const ventas = (await demo('propiedades', { operacion: 'venta', limite: '100' })).datos; ok(ventas.length > 0 && ventas.every((p) => p.operacion === 'VENTA'), 'operacion sin distinguir mayúsculas');
  const tope = (await demo('propiedades', { precio_max_usd: '150000', limite: '100' })).datos; ok(tope.length > 0 && tope.every((p) => Number(p.precio_usd) > 0 && Number(p.precio_usd) <= 150000), 'precio máximo excluye avisos sin precio');
  const piso = (await demo('propiedades', { precio_min_usd: '400000', limite: '100' })).datos; ok(piso.every((p) => Number(p.precio_usd) >= 400000));
  const dist = (await demo('propiedades', { distrito: 'miraflores', limite: '100' })).datos; ok(dist.length > 0 && dist.every((p) => p.distrito === 'Miraflores'), 'distrito sin acentos ni mayúsculas');
  const orden = (await demo('propiedades', { limite: '100' })).datos; ok(orden.every((p, i) => i === 0 || orden[i - 1].encontrada_en >= p.encontrada_en), 'propiedades: más recientes primero');
  igual((await demo('propiedades', { limite: '7' })).datos.length, 7, 'limite');
  igual((await demo('propiedades', { portal: 'urbania', operacion: 'ALQUILER', limite: '100' })).datos.every((p) => p.portal === 'urbania' && p.operacion === 'ALQUILER'), true);
  const q = (await demo('propiedades', { q: 'dorm', limite: '100' })).datos; ok(q.every((p) => /dorm/i.test(`${p.titulo} ${p.distrito} ${p.inmueble}`)), 'q busca en título, distrito y tipo');
  const proys = (await demo('proyectos')).datos;
  ok(proys.slice(0, proys.filter((p) => p.estado === 'atrasado').length).every((p) => p.estado === 'atrasado'), 'proyectos: atrasados primero');
  igual((await demo('proyectos', { estado: 'terminado' })).datos.every((p) => p.estado === 'terminado'), true);
  const stock = (await demo('stock-bajo')).datos; ok(stock.length <= 25 && stock.every((x, i) => i === 0 || Number(stock[i - 1].faltante) >= Number(x.faltante)), 'stock-bajo: mayor faltante primero, tope 25');
  ok(stock.every((x) => Number(x.cantidad) <= Number(x.minimo)), 'solo materiales en o bajo su mínimo');
  const peds = (await demo('pedidos')).datos; ok(peds.every((p, i) => i === 0 || p.llegada_estimada === null || peds[i - 1].llegada_estimada !== null && peds[i - 1].llegada_estimada <= p.llegada_estimada), 'pedidos: llegada más cercana primero, sin fecha al final');
  const h1 = (await demo('hitos', { desde: '2026-11-14', hasta: '2026-12-14' })).datos; ok(h1.every((x) => x.fecha.slice(0, 10) >= '2026-11-14' && x.fecha.slice(0, 10) <= '2026-12-14'), 'hitos entre fechas');
  const res = (await demo('resumen-general')).datos[0];
  igual(res.proyectos.total, res.proyectos.atrasados + res.proyectos.en_curso + res.proyectos.por_iniciar + res.proyectos.terminados, 'resumen: los estados suman el total');
  ok(res.proximos_hitos.every((x) => x.fecha >= '2026-11-13'), 'resumen: solo hitos desde hoy');
  igual(res.frescura.length, 3);
  // El panel necesita escenas con alertas: la demostración las produce
  const alertas = I.generarAlertas(res, '2026-11-13'); ok(alertas.some((a) => a.tono === 'peligro'), 'la demostración muestra alertas'); ok(alertas.some((a) => a.ir.params.estado === 'atrasado'));
  // Fechas relativas a hoy: el día siguiente sigue teniendo hitos futuros y proyectos atrasados
  const manana = await D.consultar('resumen-general', {}, meta, new Date('2027-03-01T10:00:00'));
  ok(manana.datos[0].proyectos.total === res.proyectos.total, 'misma cantidad de proyectos en otra fecha');
  // Todo texto de la demostración es ficticio: enlaces de ejemplo, nunca dominios reales de portales
  const urls = (await demo('propiedades', { limite: '100' })).datos.map((p) => p.url); ok(urls.every((u) => u.startsWith('https://example.com/')), 'enlaces de ejemplo');
}

// ══════════════ Comprobaciones estáticas de la página ══════════════
const leer = (...p) => fs.readFileSync(path.join(pub, ...p), 'utf8');
const listar = (dir, ext) => fs.readdirSync(path.join(pub, dir), { recursive: true }).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f).replaceAll('\\', '/'));
const archivosJs = ['js/app.js', 'js/tema.js', ...listar('js/nucleo', '.js'), ...listar('js/vistas', '.js')];
const archivosCss = listar('css', '.css');
const html = leer('index.html');
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// CSP: sin scripts ni estilos en línea, ni manejadores onclick=
ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'ningún <script> en línea');
ok(!/<style[\s>]/i.test(html), 'ningún <style> en línea');
ok(!/\sstyle\s*=/i.test(html), 'ningún atributo style= en el HTML');
ok(!/\son[a-z]+\s*=/i.test(html), 'ningún manejador on…= en el HTML');
ok(!/(https?:)?\/\/(cdn|unpkg|fonts)\./i.test(html + archivosJs.map((f) => leer(f)).join('')), 'sin recursos externos');
ok(/<title>[^<]{3,}<\/title>/.test(html) && /name="viewport"/.test(html) && /<html[^>]*lang="es"/.test(html), 'título, viewport e idioma');
const csp = JSON.parse(fs.readFileSync(path.join(raiz, 'vercel.json'), 'utf8')).headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy').value;
ok(/script-src 'self'(;|$)/.test(csp) && /style-src 'self'(;|$)/.test(csp) && !/unsafe-/.test(csp), 'la CSP no permite código en línea');

// XSS: el panel nunca inserta datos de la API como HTML
for (const f of archivosJs) {
  const codigo = sinComentarios(leer(f));
  ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|setTimeout\(\s*['"`]/.test(codigo), `${f}: no usa APIs que interpreten HTML o código`);
  ok(!/setAttribute\(\s*['"]style/.test(codigo) && !/['"]style['"]\s*:/.test(codigo.replace(/estilo/g, '')), `${f}: no fija style como atributo (bloqueado por la CSP)`);
  ok(!/https?:\/\/(?!www\.w3\.org|localhost|example\.com|github\.com\/InmobiliariaPolyline)/.test(codigo.replace(/'https?:'|"https?:"|https:'|http:'/g, '')), `${f}: sin URLs externas`);
}
// Nunca se muestra ni se registra el token: ninguna vista lo importa; solo api.js lo usa para la cabecera
for (const f of archivosJs.filter((x) => x.startsWith('js/vistas/'))) ok(!/\btoken\b\s*\(\s*\)/.test(sinComentarios(leer(f))), `${f}: no lee el token`);
for (const f of archivosJs) ok(!/console\.(log|debug|info)/.test(sinComentarios(leer(f))), `${f}: sin console.log`);

// Las importaciones relativas existen y exportan lo que se pide
const exportes = (codigo) => {
  const set = new Set();
  for (const m of codigo.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) set.add(m[1]);
  for (const m of codigo.matchAll(/export\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) { const nombre = n.trim().split(/\s+as\s+/).pop(); if (nombre) set.add(nombre); }
  if (/export\s+default/.test(codigo)) set.add('default');
  return set;
};
for (const f of archivosJs) {
  const codigo = sinComentarios(leer(f));
  for (const m of codigo.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'/g)) {
    const destino = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[2]));
    ok(fs.existsSync(path.join(pub, destino)), `${f}: no existe ${m[2]}`);
    const ex = exportes(sinComentarios(leer(destino)));
    for (const n of m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) ok(ex.has(n), `${f}: ${destino} no exporta «${n}»`);
  }
}
// Cada sección del enrutador tiene su módulo, y cada módulo cumple el contrato { montar }
const rutasApp = [...leer('js/app.js').matchAll(/import\('\.\/vistas\/([a-z]+)\.js'\)/g)].map((m) => m[1]).sort();
igual(rutasApp, [...R.RUTAS].sort(), 'app.js carga un módulo por cada ruta');
for (const id of R.RUTAS) {
  if (id === 'sistema') { ok(/export default\s*\{\s*async montar|export default\s*\{\s*montar/.test(leer('js/vistas/sistema.js')), 'sistema: contrato'); continue; } // importa app.js (necesita DOM)
  const m = await import(`../public/js/vistas/${id}.js`);
  ok(typeof m.default?.montar === 'function', `${id}: export default { montar }`);
}
// Todo id que busca el JS con $('#...') existe en el HTML o lo crea el propio JS
const todoJs = archivosJs.map((f) => sinComentarios(leer(f))).join('\n');
for (const id of new Set([...todoJs.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]))) {
  ok(html.includes(`id="${id}"`) || new RegExp(`[#]${id}['"\`.]|id:\\s*['"]${id}['"]`).test(todoJs.replace(/\$\('#[\w-]+'\)/g, '')), `el id «${id}» no existe`);
}
// Iconos: todo icono que pide el JS está en el sprite
const sprite = new Set([...html.matchAll(/<symbol id="i-([\w-]+)"/g)].map((m) => m[1]));
ok(sprite.size >= 40, `sprite con ${sprite.size} iconos`);
const pedidos = new Set([...todoJs.matchAll(/\bicono\(\s*'([\w-]+)'/g)].map((m) => m[1]));
for (const m of todoJs.matchAll(/\b(?:icono|ic):\s*'([\w-]+)'/g)) pedidos.add(m[1]);
for (const n of pedidos) ok(sprite.has(n), `falta el icono «${n}» en el sprite de index.html`);
// Cada ruta tiene su icono (el menú usa el nombre de la sección o el del módulo)
for (const m of leer('js/app.js').matchAll(/id:\s*'([a-z]+)'[^}]*?icono:\s*'([\w-]+)'/g)) ok(sprite.has(m[2]), `icono de sección «${m[2]}»`);
// Clases de CSS: toda clase fija que el JS pone con h('div.clase') está definida en algún .css
const css = archivosCss.map((f) => leer(f)).join('\n');
const definidas = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const sinCss = new Set();
for (const m of todoJs.matchAll(/\bh\(\s*[`'"]([a-zA-Z0-9]*(?:\.[\w-]+|#[\w-]+)+)/g)) {
  // «x--» es el comienzo de una clase que se completa con una variable (p. ej. insignia--${tono})
  for (const c of m[1].match(/\.[\w-]+/g) ?? []) if (!c.endsWith('--') && !definidas.has(c.slice(1))) sinCss.add(c.slice(1));
}
for (const m of todoJs.matchAll(/class(?:e)?:\s*'([\w -]+)'/g)) for (const c of m[1].split(/\s+/)) if (c && !definidas.has(c)) sinCss.add(c);
igual([...sinCss].sort(), [], `clases usadas en JS sin estilo en CSS: ${[...sinCss].join(', ')}`);
// Los archivos que referencia la página existen y los viejos ya no
for (const m of html.matchAll(/(?:src|href)="((?!#|https?:|data:)[^"]+)"/g)) ok(fs.existsSync(path.join(pub, m[1])), `index.html referencia ${m[1]}`);
for (const f of ['panel.js', 'panel.css', 'formato.js']) ok(!fs.existsSync(path.join(pub, f)), `${f} (panel antiguo) ya no existe`);
for (const f of ['favicon.svg', 'hero.svg', 'arquitectura.svg', 'vistas.json']) ok(fs.existsSync(path.join(pub, f)), f);
// Accesibilidad básica de la página de entrada
ok(/class="saltar"/.test(html) && /id="entrada"/.test(html) && /<label[^>]*for="token"/.test(html), 'enlace «saltar», entrada y etiqueta del campo del token');
ok(/<input[^>]*id="token"[^>]*type="password"|<input[^>]*type="password"[^>]*id="token"/.test(html) && /autocomplete="off"/.test(html), 'el token se escribe como contraseña y sin autocompletar');

console.log(`OK: panel web — ${comprobaciones} comprobaciones (formato, rutas, gráficos, alertas, demostración, CSP/XSS, importaciones, iconos y CSS)`);
