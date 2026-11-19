// Lista CERRADA de consultas de solo lectura sobre el esquema `central`.
//
// Seguridad: el cliente nunca envía SQL. Cada vista declara los filtros que acepta (con tipo y, si aplica, los
// valores permitidos); el valor siempre viaja como parámetro ($1, $2…) y nunca se pega en el texto de la consulta.
// El límite (`limite`) se valida como entero dentro del rango de la vista antes de usarlo.
//
// Este archivo es también la fuente del contrato OpenAPI: `npm run openapi` regenera `openapi.yaml` desde aquí y una
// prueba falla si ambos se desincronizan.

/** Valor de un filtro no válido: la API responde 400 explicando qué se acepta. */
export class ErrorFiltro extends Error {
  constructor(filtro, detalle) {
    super(`Parámetro «${filtro}» no válido: ${detalle}`);
    this.filtro = filtro;
  }
}

// Caracteres de control salvo tabulador, salto de línea y retorno. Postgres rechaza el byte nulo en texto.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Texto de búsqueda seguro: sin caracteres de control, recortado, y con %, _ y \ tratados como texto literal. */
export function patronBusqueda(q) {
  if (typeof q !== 'string') return '';
  const limpio = q.replace(CONTROL, '').trim().slice(0, 60);
  return limpio ? `%${limpio.replace(/[\\%_]/g, '\\$&')}%` : '';
}

/** Solo vistas propias: `constructor`, `__proto__`, `toString`... no son vistas (antes daban 502 en vez de 404). */
export function buscarVista(nombre) {
  return typeof nombre === 'string' && Object.hasOwn(VISTAS, nombre) ? VISTAS[nombre] : undefined;
}

/**
 * Lee un filtro de la URL. Devuelve `undefined` si no viene (o no es texto: p. ej. `?q=a&q=b`), el valor listo para
 * usar como parámetro, o lanza ErrorFiltro si viene pero no es válido.
 */
function leerFiltro(nombre, f, crudo) {
  if (typeof crudo !== 'string') return undefined;
  const v = crudo.replace(CONTROL, '').trim();
  if (v === '') return undefined;
  switch (f.tipo) {
    case 'texto': {
      const patron = patronBusqueda(v);
      return patron || undefined;
    }
    case 'enum': {
      const valido = f.valores.find((x) => x.toLowerCase() === v.toLowerCase());
      if (!valido) throw new ErrorFiltro(nombre, `valores permitidos: ${f.valores.join(', ')}`);
      return valido;
    }
    case 'numero': {
      const n = Number(v);
      if (!Number.isFinite(n) || n < f.min || n > f.max) throw new ErrorFiltro(nombre, `debe ser un número entre ${f.min} y ${f.max}`);
      return n;
    }
    case 'fecha': {
      const d = new Date(`${v}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
        throw new ErrorFiltro(nombre, 'use una fecha AAAA-MM-DD válida');
      }
      return v;
    }
    default:
      throw new Error(`tipo de filtro desconocido: ${f.tipo}`);
  }
}

/** Lee `limite`: entero entre 1 y `max`; si no viene, el valor por defecto de la vista. */
function leerLimite(vista, crudo) {
  if (typeof crudo !== 'string' || crudo.trim() === '') return vista.limite;
  const n = Number(crudo.trim());
  if (!Number.isInteger(n) || n < 1 || n > vista.limiteMax) {
    throw new ErrorFiltro('limite', `debe ser un entero entre 1 y ${vista.limiteMax}`);
  }
  return n;
}

/**
 * Arma la consulta de una vista a partir de la URL. Devuelve `{ text, params }`.
 * Lanza ErrorFiltro si algún filtro no es válido.
 */
export function construirConsulta(vista, query = {}) {
  if (vista.sql) return { text: vista.sql, params: [] }; // consultas sin filtros (p. ej. el resumen general)
  const params = [];
  const condiciones = [];
  for (const [nombre, f] of Object.entries(vista.filtros ?? {})) {
    const valor = leerFiltro(nombre, f, query[nombre]);
    if (valor === undefined) continue;
    params.push(valor);
    // `?` se sustituye por el mismo parámetro posicional en todas sus apariciones: `a ILIKE ? OR b ILIKE ?`
    condiciones.push(`(${f.sql.replaceAll('?', `$${params.length}`)})`);
  }
  const limite = leerLimite(vista, query.limite);
  const donde = condiciones.length ? ` WHERE ${condiciones.join(' AND ')}` : '';
  return { text: `${vista.select}${donde} ORDER BY ${vista.orden} LIMIT ${limite}`, params };
}

// ── Valores permitidos ────────────────────────────────────────────────────────────────
const ESTADOS_PROYECTO = ['por iniciar', 'en curso', 'atrasado', 'terminado'];
const ESTADOS_PEDIDO = ['pendiente', 'enviada', 'parcial'];
const OPERACIONES = ['VENTA', 'ALQUILER'];
const PORTALES = ['infocasas', 'urbania', 'adondevivir', 'properati', 'babilonia'];

const S = 'string', I = 'integer', N = 'number';

export const VISTAS = {
  proyectos: {
    operationId: 'proyectos',
    titulo: 'Proyectos del Planner con estado, avance, tareas atrasadas y próximo hito (los atrasados primero)',
    select: `SELECT proyecto_id, nombre, responsable, estado, avance_pct, inicio, fin, tareas_total, tareas_atrasadas,
                    proximo_hito, proximo_hito_fecha, actualizado_en
               FROM central.planner_proyectos`,
    orden: `(estado = 'atrasado') DESC, nombre`,
    limite: 200, limiteMax: 200,
    filtros: {
      estado: { tipo: 'enum', valores: ESTADOS_PROYECTO, sql: 'estado = ?', descripcion: 'Solo los proyectos en ese estado' },
      q: { tipo: 'texto', sql: 'nombre ILIKE ? OR responsable ILIKE ?', descripcion: 'Texto a buscar en el nombre o el responsable' },
    },
    campos: { proyecto_id: S, nombre: S, responsable: S, estado: S, avance_pct: S, inicio: S, fin: S, tareas_total: I, tareas_atrasadas: I, proximo_hito: S, proximo_hito_fecha: S, actualizado_en: S },
  },

  hitos: {
    operationId: 'hitos_proyectos',
    titulo: 'Próximas fechas clave (hitos) de los proyectos, con el nombre del proyecto',
    select: `SELECT h.fecha, h.descripcion, p.nombre AS proyecto
               FROM central.planner_hitos h
               LEFT JOIN central.planner_proyectos p USING (proyecto_id)`,
    orden: 'h.fecha',
    limite: 200, limiteMax: 200,
    filtros: {
      proyecto: { tipo: 'texto', sql: 'p.nombre ILIKE ?', descripcion: 'Texto a buscar en el nombre del proyecto' },
      desde: { tipo: 'fecha', sql: 'h.fecha >= ?::date', descripcion: 'Solo hitos desde esta fecha (AAAA-MM-DD)' },
      hasta: { tipo: 'fecha', sql: 'h.fecha <= ?::date', descripcion: 'Solo hitos hasta esta fecha (AAAA-MM-DD)' },
    },
    campos: { fecha: S, descripcion: S, proyecto: S },
  },

  'stock-bajo': {
    operationId: 'stock_bajo',
    titulo: 'Materiales del MRP con stock igual o menor al mínimo, ordenados por cuánto falta (por defecto los 25 con mayor faltante)',
    select: 'SELECT material, categoria, cantidad, unidad, minimo, faltante FROM central.v_stock_bajo',
    orden: 'faltante DESC, material',
    limite: 25, limiteMax: 100,
    filtros: {
      categoria: { tipo: 'texto', sql: 'categoria ILIKE ?', descripcion: 'Texto a buscar en la categoría (por ejemplo «Acero»)' },
      q: { tipo: 'texto', sql: 'material ILIKE ?', descripcion: 'Texto a buscar en el nombre del material' },
    },
    campos: { material: S, categoria: S, cantidad: S, unidad: S, minimo: S, faltante: S },
  },

  pedidos: {
    operationId: 'pedidos_pendientes',
    titulo: 'Órdenes de compra abiertas del MRP (pendiente, enviada o parcial) con fecha estimada de llegada',
    select: `SELECT pedido_id, proveedor, obra, estado, llegada_estimada, lineas, cantidad_pedida, cantidad_recibida, creado_en
               FROM central.mrp_pedidos`,
    orden: 'llegada_estimada NULLS LAST, pedido_id',
    limite: 200, limiteMax: 200,
    filtros: {
      estado: { tipo: 'enum', valores: ESTADOS_PEDIDO, sql: 'estado = ?', descripcion: 'Solo las órdenes en ese estado' },
      q: { tipo: 'texto', sql: 'proveedor ILIKE ? OR obra ILIKE ? OR pedido_id ILIKE ?', descripcion: 'Texto a buscar en el proveedor, la obra o el código de la orden' },
    },
    campos: { pedido_id: S, proveedor: S, obra: S, estado: S, llegada_estimada: S, lineas: I, cantidad_pedida: S, cantidad_recibida: S, creado_en: S },
  },

  propiedades: {
    operationId: 'propiedades',
    titulo: 'Propiedades recientes del scraper (por defecto las 50 más nuevas), con filtros por operación, distrito, tipo, portal y precio',
    select: `SELECT propiedad_id, portal, operacion, inmueble, titulo, precio, moneda, precio_usd, distrito,
                    dormitorios, banios, area, url, encontrada_en
               FROM central.scraper_propiedades`,
    orden: 'encontrada_en DESC',
    limite: 50, limiteMax: 100,
    filtros: {
      q: { tipo: 'texto', sql: 'titulo ILIKE ? OR distrito ILIKE ? OR inmueble ILIKE ?', descripcion: 'Texto a buscar en el título, el distrito o el tipo de inmueble' },
      operacion: { tipo: 'enum', valores: OPERACIONES, sql: 'operacion = ?', descripcion: 'VENTA o ALQUILER' },
      inmueble: { tipo: 'texto', sql: 'inmueble ILIKE ?', descripcion: 'Tipo de inmueble (por ejemplo «Casa» o «Departamento»)' },
      distrito: { tipo: 'texto', sql: 'distrito ILIKE ?', descripcion: 'Texto a buscar en el distrito' },
      portal: { tipo: 'enum', valores: PORTALES, sql: 'portal = ?', descripcion: 'Portal de origen' },
      precio_min_usd: { tipo: 'numero', min: 0, max: 1e9, sql: 'precio_usd >= ?', descripcion: 'Precio mínimo en dólares' },
      precio_max_usd: { tipo: 'numero', min: 0, max: 1e9, sql: 'precio_usd > 0 AND precio_usd <= ?', descripcion: 'Precio máximo en dólares (excluye avisos sin precio)' },
    },
    campos: { propiedad_id: S, portal: S, operacion: S, inmueble: S, titulo: S, precio: S, moneda: S, precio_usd: S, distrito: S, dormitorios: S, banios: S, area: S, url: S, encontrada_en: S },
  },

  'propiedades-resumen': {
    operationId: 'propiedades_resumen',
    titulo: 'Total de propiedades del catálogo por portal y operación (venta o alquiler)',
    select: 'SELECT portal, operacion, total, ultima_vista FROM central.scraper_resumen',
    orden: 'portal, operacion',
    limite: 50, limiteMax: 50,
    filtros: {
      portal: { tipo: 'enum', valores: PORTALES, sql: 'portal = ?', descripcion: 'Solo ese portal' },
      operacion: { tipo: 'enum', valores: OPERACIONES, sql: 'operacion = ?', descripcion: 'VENTA o ALQUILER' },
    },
    campos: { portal: S, operacion: S, total: I, ultima_vista: S },
  },

  frescura: {
    operationId: 'frescura_datos',
    titulo: 'Cuándo se sincronizó por última vez cada app (planner, mrp, scraper) y hace cuántas horas',
    select: `SELECT app, ultima_sync,
                    round((extract(epoch FROM (now() - ultima_sync)) / 3600)::numeric, 1)::float8 AS hace_horas
               FROM central.sync_estado`,
    orden: 'app',
    limite: 10, limiteMax: 10,
    filtros: {},
    campos: { app: S, ultima_sync: S, hace_horas: N },
  },

  // Todo el panorama en UNA llamada: el agente y el panel web evitan pedir 5 o 6 herramientas por separado.
  'resumen-general': {
    operationId: 'resumen_general',
    titulo: 'Panorama completo en una sola llamada: proyectos, hitos, stock, pedidos, propiedades y frescura de los datos',
    sql: `SELECT
      (SELECT json_build_object(
          'total', count(*),
          'atrasados', count(*) FILTER (WHERE estado = 'atrasado'),
          'en_curso', count(*) FILTER (WHERE estado = 'en curso'),
          'por_iniciar', count(*) FILTER (WHERE estado = 'por iniciar'),
          'terminados', count(*) FILTER (WHERE estado = 'terminado'),
          'tareas_atrasadas', coalesce(sum(tareas_atrasadas), 0))
         FROM central.planner_proyectos) AS proyectos,
      (SELECT coalesce(json_agg(x), '[]'::json) FROM (
          SELECT nombre, responsable, avance_pct::float8 AS avance_pct, fin, tareas_atrasadas
            FROM central.planner_proyectos WHERE estado = 'atrasado' ORDER BY fin LIMIT 5) x) AS proyectos_atrasados,
      (SELECT coalesce(json_agg(x), '[]'::json) FROM (
          SELECT h.fecha, h.descripcion, p.nombre AS proyecto
            FROM central.planner_hitos h LEFT JOIN central.planner_proyectos p USING (proyecto_id)
           WHERE h.fecha >= current_date ORDER BY h.fecha LIMIT 5) x) AS proximos_hitos,
      (SELECT json_build_object(
          'materiales_con_minimo', count(*),
          'en_stock_bajo', count(*) FILTER (WHERE stock_bajo),
          'sin_existencias', count(*) FILTER (WHERE cantidad = 0))
         FROM central.mrp_stock) AS stock,
      (SELECT coalesce(json_agg(x), '[]'::json) FROM (
          SELECT material, categoria, unidad, cantidad::float8 AS cantidad, minimo::float8 AS minimo, faltante::float8 AS faltante
            FROM central.v_stock_bajo LIMIT 5) x) AS mayor_faltante,
      (SELECT json_build_object('abiertos', count(*)) FROM central.mrp_pedidos) AS pedidos,
      (SELECT coalesce(json_agg(x), '[]'::json) FROM (
          SELECT pedido_id, proveedor, obra, estado, llegada_estimada
            FROM central.mrp_pedidos ORDER BY llegada_estimada NULLS LAST, pedido_id LIMIT 5) x) AS proximos_pedidos,
      (SELECT json_build_object(
          'total_catalogo', coalesce(sum(total), 0),
          'copiadas', (SELECT count(*) FROM central.scraper_propiedades))
         FROM central.scraper_resumen) AS propiedades,
      (SELECT coalesce(json_agg(x), '[]'::json) FROM (
          SELECT portal, operacion, total FROM central.scraper_resumen ORDER BY total DESC, portal) x) AS propiedades_por_portal,
      (SELECT coalesce(json_agg(x), '[]'::json) FROM (
          SELECT app, ultima_sync,
                 round((extract(epoch FROM (now() - ultima_sync)) / 3600)::numeric, 1)::float8 AS hace_horas
            FROM central.sync_estado ORDER BY app) x) AS frescura`,
    filtros: {},
    campos: {
      proyectos: { type: 'object', description: 'Conteo de proyectos por estado y total de tareas atrasadas', properties: { total: { type: I }, atrasados: { type: I }, en_curso: { type: I }, por_iniciar: { type: I }, terminados: { type: I }, tareas_atrasadas: { type: I } } },
      proyectos_atrasados: { type: 'array', description: 'Hasta 5 proyectos atrasados (los de fecha de fin más antigua primero)', items: { type: 'object', properties: { nombre: { type: S }, responsable: { type: S }, avance_pct: { type: N }, fin: { type: S }, tareas_atrasadas: { type: I } } } },
      proximos_hitos: { type: 'array', description: 'Hasta 5 próximas fechas clave', items: { type: 'object', properties: { fecha: { type: S }, descripcion: { type: S }, proyecto: { type: S } } } },
      stock: { type: 'object', description: 'Materiales del MRP con stock mínimo definido', properties: { materiales_con_minimo: { type: I }, en_stock_bajo: { type: I }, sin_existencias: { type: I } } },
      mayor_faltante: { type: 'array', description: 'Los 5 materiales con mayor faltante respecto a su mínimo', items: { type: 'object', properties: { material: { type: S }, categoria: { type: S }, unidad: { type: S }, cantidad: { type: N }, minimo: { type: N }, faltante: { type: N } } } },
      pedidos: { type: 'object', description: 'Órdenes de compra abiertas', properties: { abiertos: { type: I } } },
      proximos_pedidos: { type: 'array', description: 'Hasta 5 órdenes abiertas, las de llegada más cercana primero', items: { type: 'object', properties: { pedido_id: { type: S }, proveedor: { type: S }, obra: { type: S }, estado: { type: S }, llegada_estimada: { type: S } } } },
      propiedades: { type: 'object', description: 'Propiedades del catálogo del scraper', properties: { total_catalogo: { type: I }, copiadas: { type: I } } },
      propiedades_por_portal: { type: 'array', description: 'Total de propiedades por portal y operación', items: { type: 'object', properties: { portal: { type: S }, operacion: { type: S }, total: { type: I } } } },
      frescura: { type: 'array', description: 'Última sincronización de cada app y hace cuántas horas', items: { type: 'object', properties: { app: { type: S }, ultima_sync: { type: S }, hace_horas: { type: N } } } },
    },
  },

  // ── Vistas SOLO para el panel web (gráficos). No van en el contrato de Coze: el agente no las necesita y cada
  //    herramienta de más se envía en cada pregunta (créditos). `panel: true` las excluye de openapi.yaml.
  'stock-categorias': {
    panel: true,
    operationId: 'stock_categorias',
    titulo: 'Materiales del MRP agrupados por categoría: cuántos hay, cuántos están bajo su mínimo y el faltante total',
    sql: `SELECT coalesce(categoria, 'Sin categoría') AS categoria,
                 count(*)::int AS materiales,
                 count(*) FILTER (WHERE stock_bajo)::int AS en_stock_bajo,
                 count(*) FILTER (WHERE cantidad = 0)::int AS sin_existencias,
                 round(coalesce(sum(faltante), 0))::float8 AS faltante_total
            FROM central.mrp_stock
           GROUP BY 1
           ORDER BY faltante_total DESC, categoria
           LIMIT 100`,
    filtros: {},
    campos: { categoria: S, materiales: I, en_stock_bajo: I, sin_existencias: I, faltante_total: N },
  },

  'propiedades-distritos': {
    panel: true,
    operationId: 'propiedades_distritos',
    titulo: 'Avisos y precio mediano en dólares por distrito y operación, sobre las propiedades más recientes copiadas (la mediana no se deja engañar por precios mal publicados)',
    sql: `SELECT distrito, operacion,
                 count(*)::int AS avisos,
                 round((percentile_cont(0.5) WITHIN GROUP (ORDER BY precio_usd) FILTER (WHERE precio_usd > 0))::numeric)::float8 AS precio_mediano_usd,
                 min(precio_usd) FILTER (WHERE precio_usd > 0)::float8 AS precio_min_usd,
                 max(precio_usd)::float8 AS precio_max_usd
            FROM central.scraper_propiedades
           WHERE distrito IS NOT NULL AND distrito <> ''
           GROUP BY distrito, operacion
           ORDER BY avisos DESC, distrito
           LIMIT 40`,
    filtros: {},
    campos: { distrito: S, operacion: S, avisos: I, precio_mediano_usd: N, precio_min_usd: N, precio_max_usd: N },
  },
};
