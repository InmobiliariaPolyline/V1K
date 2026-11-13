// El contrato openapi.yaml (el que se importa en Coze) debe coincidir EXACTAMENTE con lo que genera lib/vistas.js.
// Si cambias un filtro o un campo, ejecuta `npm run openapi` y vuelve a importar el contrato en Coze.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { textoOpenApi, construirOpenApi } from '../scripts/generar-openapi.mjs';
import { VISTAS } from '../lib/vistas.js';

const archivo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'openapi.yaml');
const enDisco = fs.readFileSync(archivo, 'utf8').replace(/\r\n/g, '\n');
assert.equal(enDisco, textoOpenApi(), 'openapi.yaml está desactualizado: ejecuta `npm run openapi`');

const spec = YAML.parse(enDisco);
assert.equal(Object.keys(spec.paths).length, Object.keys(VISTAS).length, 'una ruta por vista');

for (const [ruta, def] of Object.entries(spec.paths)) {
  const get = def.get;
  assert.ok(get.operationId && /^[a-z_]+$/.test(get.operationId), `${ruta}: operationId`);
  const respuesta = get.responses['200'].content['application/json'].schema;
  assert.equal(respuesta.type, 'object', `${ruta}: Coze exige que la respuesta sea un objeto`);
  assert.equal(respuesta.properties.datos.type, 'array');
  for (const p of get.parameters ?? []) {
    assert.equal(p.in, 'query');
    assert.ok(p.description, `${ruta}?${p.name}: descripción para que el agente sepa usarlo`);
  }
}

// operationId únicos (Coze los usa como nombre de la herramienta)
const ops = Object.values(spec.paths).map((d) => d.get.operationId);
assert.equal(new Set(ops).size, ops.length, 'operationId únicos');
assert.ok(ops.includes('resumen_general'));

// Los valores permitidos de cada enum del contrato son los mismos que valida la API
const enums = construirOpenApi().paths['/api/propiedades'].get.parameters.find((p) => p.name === 'operacion').schema.enum;
assert.deepEqual(enums, ['VENTA', 'ALQUILER']);

console.log(`OK: openapi.yaml al día (${ops.length} herramientas)`);
