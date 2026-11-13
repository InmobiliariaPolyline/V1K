// Genera openapi.yaml a partir de lib/vistas.js, para que el contrato que se importa en Coze no pueda desincronizarse
// de las consultas reales.   Uso:  npm run openapi        (la prueba test/openapi.test.mjs verifica que esté al día)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { VISTAS } from '../lib/vistas.js';

export const SERVIDOR = 'https://v1k-coze-api.vercel.app';

const propiedad = (def) => (typeof def === 'string' ? { type: def } : def);

function parametro(nombre, f) {
  const s = { type: 'string' };
  if (f.tipo === 'enum') s.enum = f.valores;
  if (f.tipo === 'numero') { s.type = 'number'; s.minimum = f.min; s.maximum = f.max; }
  if (f.tipo === 'fecha') s.format = 'date';
  return { name: nombre, in: 'query', required: false, description: f.descripcion, schema: s };
}

export function construirOpenApi() {
  const paths = {};
  for (const [nombre, v] of Object.entries(VISTAS)) {
    const parametros = Object.entries(v.filtros ?? {}).map(([n, f]) => parametro(n, f));
    if (v.select) {
      parametros.push({
        name: 'limite', in: 'query', required: false,
        description: `Máximo de filas a devolver (1 a ${v.limiteMax}; por defecto ${v.limite})`,
        schema: { type: 'integer', minimum: 1, maximum: v.limiteMax },
      });
    }
    const campos = Object.fromEntries(Object.entries(v.campos).map(([c, d]) => [c, propiedad(d)]));
    const items = { type: 'object', properties: campos };
    const get = { operationId: v.operationId, summary: v.titulo };
    if (parametros.length) get.parameters = parametros;
    get.responses = {
      '200': {
        description: 'OK',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                vista: { type: 'string' },
                generado_en: { type: 'string', description: 'Hora de la consulta. NO indica qué tan actuales son los datos: para eso está frescura.' },
                total: { type: 'integer' },
                datos: { type: 'array', items },
              },
            },
          },
        },
      },
      '400': { description: 'Un parámetro no es válido; el mensaje explica qué se acepta' },
    };
    paths[`/api/${nombre}`] = { get };
  }
  return {
    openapi: '3.0.1',
    info: { title: 'Vista Central (solo lectura)', description: 'Resúmenes de proyectos, materiales, órdenes de compra y propiedades. Solo consulta.', version: '1.1.0' },
    servers: [{ url: SERVIDOR }],
    paths,
  };
}

export function textoOpenApi() {
  return YAML.stringify(construirOpenApi(), { lineWidth: 0 });
}

// Solo escribe el archivo cuando se ejecuta directamente (no cuando lo importa una prueba)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destino = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'openapi.yaml');
  fs.writeFileSync(destino, textoOpenApi(), 'utf8');
  console.log(`openapi.yaml generado: ${Object.keys(VISTAS).length} herramientas`);
}
