// El contrato openapi.yaml (el que se importa en Coze) debe coincidir EXACTAMENTE con lo que genera lib/vistas.js.
// Si cambias un filtro o un campo, ejecuta `npm run openapi` y vuelve a importar el contrato en Coze.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { textoOpenApi, construirOpenApi, textoVistasJson, vistasDeCoze } from '../scripts/generar-openapi.mjs';
import { VISTAS } from '../lib/vistas.js';

const archivo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'openapi.yaml');
const enDisco = fs.readFileSync(archivo, 'utf8').replace(/\r\n/g, '\n');
assert.equal(enDisco, textoOpenApi(), 'openapi.yaml está desactualizado: ejecuta `npm run openapi`');

const spec = YAML.parse(enDisco);
assert.equal(Object.keys(spec.paths).length, vistasDeCoze().length, 'una ruta por vista del agente');
for (const [nombre, v] of Object.entries(VISTAS)) {
  assert.equal(`/api/${nombre}` in spec.paths, !v.panel, `${nombre}: las vistas solo del panel NO van en el contrato de Coze`);
}

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

// public/vistas.json (metadatos del Explorador del panel) al día y con TODAS las vistas
const vj = fs.readFileSync(path.join(path.dirname(archivo), 'public', 'vistas.json'), 'utf8').replace(/\r\n/g, '\n');
assert.equal(vj, textoVistasJson(), 'public/vistas.json está desactualizado: ejecuta `npm run openapi`');
const meta = JSON.parse(vj);
assert.equal(meta.vistas.length, Object.keys(VISTAS).length);
assert.ok(meta.vistas.every((v) => Array.isArray(v.filtros) && Array.isArray(v.campos)));
assert.ok(!/postgres|neon\.tech|token/i.test(vj), 'los metadatos no contienen secretos');

console.log(`OK: openapi.yaml al día (${ops.length} herramientas) y vistas.json (${meta.vistas.length} vistas)`);
