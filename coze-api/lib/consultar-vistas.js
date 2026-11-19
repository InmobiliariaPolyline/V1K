// Lee una vista cerrada de lib/vistas.js con el rol de solo lectura (DATABASE_URL_READER). La usan los dos bots de Telegram.
// Los filtros llegan como texto, igual que en la URL de la API, y se validan con la misma definición de la vista.
import { neon } from '@neondatabase/serverless';
import { buscarVista, construirConsulta } from './vistas.js';

export async function consultarVista(nombre, filtros = {}) {
  const vista = buscarVista(nombre);
  if (!vista) throw new Error('vista desconocida');
  const query = Object.fromEntries(Object.entries(filtros).map(([k, v]) => [k, String(v)]));
  const { text, params } = construirConsulta(vista, query);
  return neon(process.env.DATABASE_URL_READER).query(text, params);
}

/** SQL fijo de solo lectura (las listas de números de chat). */
export const leerSql = (texto) => neon(process.env.DATABASE_URL_READER).query(texto);
