// Genera, desde lib/vistas.js (la única fuente de verdad):
//   · openapi.yaml        el contrato que se importa en Coze (SIN las vistas marcadas `panel: true`)
//   · public/vistas.json  los metadatos que usa el Explorador de API del panel (CON todas las vistas)
// Uso:  npm run openapi        (test/openapi.test.mjs verifica que ambos estén al día)
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

/** Vistas que forman parte del contrato de Coze (el agente): todas menos las exclusivas del panel. */
export const vistasDeCoze = () => Object.entries(VISTAS).filter(([, v]) => !v.panel);

export function construirOpenApi() {
  const paths = {};
  for (const [nombre, v] of vistasDeCoze()) {
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

/** Metadatos de TODAS las vistas para el Explorador del panel: filtros con su tipo y valores, límites y campos. */
export function construirVistasJson() {
  const vistas = Object.entries(VISTAS).map(([nombre, v]) => ({
    nombre,
    titulo: v.titulo,
    soloPanel: Boolean(v.panel),
    limite: v.select ? v.limite : null,
    limiteMax: v.select ? v.limiteMax : null,
    filtros: Object.entries(v.filtros ?? {}).map(([n, f]) => ({
      nombre: n, tipo: f.tipo, descripcion: f.descripcion,
      ...(f.valores ? { valores: f.valores } : {}),
      ...(f.min !== undefined ? { min: f.min, max: f.max } : {}),
    })),
    campos: Object.keys(v.campos),
  }));
  return { servidor: SERVIDOR, vistas };
}

export function textoVistasJson() {
  return `${JSON.stringify(construirVistasJson(), null, 2)}\n`;
}

// Solo escribe los archivos cuando se ejecuta directamente (no cuando lo importa una prueba)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  fs.writeFileSync(path.join(raiz, 'openapi.yaml'), textoOpenApi(), 'utf8');
  fs.mkdirSync(path.join(raiz, 'public'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'public', 'vistas.json'), textoVistasJson(), 'utf8');
  console.log(`openapi.yaml generado (${vistasDeCoze().length} herramientas de Coze) y public/vistas.json (${Object.keys(VISTAS).length} vistas)`);
}
