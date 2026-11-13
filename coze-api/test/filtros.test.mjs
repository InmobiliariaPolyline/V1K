// Pruebas del handler con filtros (sin base de datos): validación, 400 con mensaje y que un filtro inválido no llegue al SQL.
import assert from 'node:assert/strict';
import handler from '../api/[vista].js';

process.env.API_TOKEN = 'token-de-prueba-largo-1234567890abcdef';
delete process.env.DATABASE_URL_READER;
const bueno = `Bearer ${process.env.API_TOKEN}`;

function llama(vista, query = {}, autorizacion = bueno) {
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.code = c; return this; },
      json(body) { resolve({ code: this.code, body }); return this; },
    };
    handler({ method: 'GET', headers: { authorization: autorizacion }, query: { vista, ...query } }, res);
  });
}

// Un filtro inválido responde 400 con una explicación, ANTES de tocar la base de datos
let r = await llama('propiedades', { operacion: 'REGALO' });
assert.equal(r.code, 400);
assert.match(r.body.error, /operacion/);
assert.match(r.body.error, /VENTA, ALQUILER/);

r = await llama('proyectos', { estado: "'; DROP TABLE x; --" });
assert.equal(r.code, 400);

r = await llama('propiedades', { precio_max_usd: 'caro' });
assert.equal(r.code, 400);
assert.match(r.body.error, /número/);

r = await llama('hitos', { desde: 'ayer' });
assert.equal(r.code, 400);
assert.match(r.body.error, /AAAA-MM-DD/);

r = await llama('stock-bajo', { limite: '5000' });
assert.equal(r.code, 400);
assert.match(r.body.error, /100/);

// Sin token sigue siendo 401 (la validación no se adelanta a la autenticación)
r = await llama('propiedades', { operacion: 'REGALO' }, '');
assert.equal(r.code, 401);

// Un filtro válido pasa la validación y llega a la base (que aquí no está configurada => 502 genérico, sin detalles)
const log = console.error; console.error = () => {};
try {
  r = await llama('propiedades', { operacion: 'venta', precio_max_usd: '200000', limite: '5' });
} finally { console.error = log; }
assert.equal(r.code, 502);
assert.ok(!JSON.stringify(r.body).includes('neon'), 'no filtra detalles internos');

// resumen-general existe y no acepta filtros (los ignora)
r = await llama('resumen-general', { estado: 'x' });
assert.equal(r.code, 502, 'llega a la base sin 400: este resumen no tiene filtros');

console.log('OK: filtros (400 con mensaje, orden de validación y vista de resumen)');
