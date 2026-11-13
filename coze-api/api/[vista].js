// API de SOLO LECTURA para el agente de Coze.
//   GET /api/<vista>            Authorization: Bearer <API_TOKEN>
//   GET /api/propiedades?q=norte  (búsqueda opcional por título o zona)
//
// Variables de entorno (en Vercel, nunca en el código):
//   DATABASE_URL_READER  cadena de conexión de Neon del rol coze_reader
//   API_TOKEN            token largo y aleatorio que usará Coze en la cabecera

import { createHash, timingSafeEqual } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { VISTAS } from '../lib/vistas.js';

function hash(valor) {
  return createHash('sha256').update(valor).digest();
}

function tokenValido(cabecera, esperado) {
  if (!esperado || esperado.length < 24) return false; // token débil o sin configurar
  const m = /^Bearer (.+)$/.exec(cabecera || '');
  if (!m) return false;
  return timingSafeEqual(hash(m[1]), hash(esperado)); // tiempo constante
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Solo GET' });
  }

  if (!tokenValido(req.headers.authorization, process.env.API_TOKEN)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const vista = VISTAS[req.query.vista];
  if (!vista) {
    return res
      .status(404)
      .json({ error: 'Vista desconocida', disponibles: Object.keys(VISTAS) });
  }

  try {
    const sql = neon(process.env.DATABASE_URL_READER);
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    const filas =
      q && vista.sqlBusqueda
        ? await sql.query(vista.sqlBusqueda, [`%${q}%`])
        : await sql.query(vista.sql);

    return res.status(200).json({
      vista: req.query.vista,
      generado_en: new Date().toISOString(),
      total: filas.length,
      datos: filas,
    });
  } catch (err) {
    console.error('Error consultando', req.query.vista, err?.message);
    // No filtramos detalles internos al cliente
    return res.status(502).json({ error: 'No se pudo leer la base de datos. Intenta de nuevo.' });
  }
}
