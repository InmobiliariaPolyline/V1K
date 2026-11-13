// Pruebas sin base de datos: autenticación, método y rutas.
import assert from 'node:assert/strict';
import handler from '../api/[vista].js';

process.env.API_TOKEN = 'token-de-prueba-largo-1234567890abcdef';
delete process.env.DATABASE_URL_READER;

function ejecutar({ method = 'GET', authorization, vista = 'stock-bajo', q }) {
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.code = c; return this; },
      json(body) { resolve({ code: this.code, body, headers: this.headers }); return this; },
    };
    handler({ method, headers: { authorization }, query: { vista, q } }, res);
  });
}

const buen = `Bearer ${process.env.API_TOKEN}`;

let r = await ejecutar({ method: 'POST', authorization: buen });
assert.equal(r.code, 405, 'POST debe rechazarse');

r = await ejecutar({});
assert.equal(r.code, 401, 'sin token => 401');

r = await ejecutar({ authorization: 'Bearer otro-token' });
assert.equal(r.code, 401, 'token incorrecto => 401');

r = await ejecutar({ authorization: buen, vista: 'tabla_que_no_existe' });
assert.equal(r.code, 404, 'vista desconocida => 404');
assert.ok(r.body.disponibles.includes('stock-bajo'));

r = await ejecutar({ authorization: buen, vista: 'proyectos; DROP TABLE x' });
assert.equal(r.code, 404, 'nombre con SQL => 404, no se ejecuta nada');

// Token válido y vista válida, pero sin BD configurada => 502 genérico (sin detalles internos)
r = await ejecutar({ authorization: buen });
assert.equal(r.code, 502);
assert.ok(!JSON.stringify(r.body).includes('neon'), 'no filtra detalles internos');

// Nombres heredados de JavaScript no son vistas: 404 (antes daban 502)
for (const nombre of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
  r = await ejecutar({ authorization: buen, vista: nombre });
  assert.equal(r.code, 404, `${nombre} => 404`);
}

process.env.API_TOKEN = 'corto';
r = await ejecutar({ authorization: 'Bearer corto' });
assert.equal(r.code, 401, 'token débil configurado => siempre 401');

console.log('OK: pruebas de humo (autenticación, métodos, rutas y nombres heredados) pasaron');
