// Lista cerrada de consultas de solo lectura sobre el esquema `central`.
// Nada de SQL que venga del cliente: solo el parámetro `q` (texto de búsqueda) y siempre parametrizado.
// `sqlBusqueda` usa $1 = '%texto%'.

/** Solo vistas propias: `constructor`, `__proto__`, `toString`... no son vistas (antes daban 502 en vez de 404). */
export function buscarVista(nombre) {
  return typeof nombre === 'string' && Object.hasOwn(VISTAS, nombre) ? VISTAS[nombre] : undefined;
}

// Caracteres de control salvo tabulador, salto de línea y retorno. Postgres rechaza el byte nulo en texto.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Texto de búsqueda seguro: sin caracteres de control, recortado, y con %, _ y \ tratados como texto literal. */
export function patronBusqueda(q) {
  if (typeof q !== 'string') return '';
  const limpio = q.replace(CONTROL, '').trim().slice(0, 60);
  return limpio ? `%${limpio.replace(/[\\%_]/g, '\\$&')}%` : '';
}

export const VISTAS = {
  proyectos: {
    sql: `SELECT proyecto_id, nombre, responsable, estado, avance_pct, inicio, fin, tareas_total, tareas_atrasadas,
                 proximo_hito, proximo_hito_fecha, actualizado_en
            FROM central.planner_proyectos
           ORDER BY (estado = 'atrasado') DESC, nombre
           LIMIT 200`,
  },
  hitos: {
    sql: `SELECT h.fecha, h.descripcion, p.nombre AS proyecto
            FROM central.planner_hitos h
            LEFT JOIN central.planner_proyectos p USING (proyecto_id)
           ORDER BY h.fecha
           LIMIT 200`,
  },
  'stock-bajo': {
    // Los 25 con mayor faltante (la vista ya viene ordenada): casi todo el catálogo está bajo su mínimo y 200 filas no ayudan al agente.
    sql: 'SELECT * FROM central.v_stock_bajo LIMIT 25',
  },
  pedidos: {
    sql: `SELECT pedido_id, proveedor, obra, estado, llegada_estimada, lineas, cantidad_pedida, cantidad_recibida, creado_en
            FROM central.mrp_pedidos
           ORDER BY llegada_estimada NULLS LAST, pedido_id
           LIMIT 200`,
  },
  propiedades: {
    sql: `SELECT propiedad_id, portal, operacion, inmueble, titulo, precio, moneda, precio_usd, distrito,
                 dormitorios, banios, area, url, encontrada_en
            FROM central.scraper_propiedades
           ORDER BY encontrada_en DESC
           LIMIT 50`,
    sqlBusqueda: `SELECT propiedad_id, portal, operacion, inmueble, titulo, precio, moneda, precio_usd, distrito,
                          dormitorios, banios, area, url, encontrada_en
                    FROM central.scraper_propiedades
                   WHERE titulo ILIKE $1 OR distrito ILIKE $1 OR inmueble ILIKE $1
                   ORDER BY encontrada_en DESC
                   LIMIT 50`,
  },
  'propiedades-resumen': {
    sql: 'SELECT portal, operacion, total, ultima_vista FROM central.scraper_resumen ORDER BY portal, operacion',
  },
  frescura: {
    sql: 'SELECT app, ultima_sync FROM central.sync_estado ORDER BY app',
  },
};
