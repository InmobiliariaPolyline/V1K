-- ============================================================
-- VISTA CENTRAL (Neon / Postgres) - versión 3 apps: Planner, MRP, Scraper
-- Solo resúmenes. Nada confidencial. Cada app escribe su parte;
-- el Agente de Coze solo lee.
-- Ejecutar una vez en el SQL Editor de Neon, con el rol dueño.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS central;

-- ---------- PROJECT PLANNER ----------
-- Un resumen por expediente. Sin presupuesto ni datos de equipo.
CREATE TABLE IF NOT EXISTS central.planner_proyectos (
  proyecto_id   text PRIMARY KEY,              -- id del expediente en el Planner
  nombre        text NOT NULL,
  responsable   text,
  estado        text NOT NULL,                 -- 'por iniciar' | 'en curso' | 'atrasado' | 'terminado'
  avance_pct    numeric(5,2) CHECK (avance_pct BETWEEN 0 AND 100),
  inicio        date,
  fin           date,
  tareas_total  integer NOT NULL DEFAULT 0,
  tareas_atrasadas integer NOT NULL DEFAULT 0, -- vencidas y por debajo de 100 %
  proximo_hito  text,
  proximo_hito_fecha date,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- Próximas fechas clave de cada proyecto (hitos)
CREATE TABLE IF NOT EXISTS central.planner_hitos (
  hito_id       text PRIMARY KEY,
  proyecto_id   text NOT NULL,
  descripcion   text NOT NULL,
  fecha         date NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- ---------- MRP ----------
-- El almacén es único: el stock es por material (no por obra).
-- Solo materiales con stock mínimo definido (> 0); el resto no genera alertas.
CREATE TABLE IF NOT EXISTS central.mrp_stock (
  material_id   text PRIMARY KEY,
  categoria     text,
  material      text NOT NULL,
  unidad        text,
  cantidad      numeric(14,2) NOT NULL,
  minimo        numeric(14,2) NOT NULL,
  faltante      numeric(14,2) GENERATED ALWAYS AS (GREATEST(minimo - cantidad, 0)) STORED,
  stock_bajo    boolean GENERATED ALWAYS AS (cantidad <= minimo) STORED,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- Órdenes de compra abiertas (pendiente, enviada o parcial)
CREATE TABLE IF NOT EXISTS central.mrp_pedidos (
  pedido_id     text PRIMARY KEY,              -- código de la orden
  proveedor     text,
  obra          text,
  estado        text NOT NULL,                 -- 'pendiente' | 'enviada' | 'parcial'
  llegada_estimada date,
  lineas        integer NOT NULL DEFAULT 0,
  cantidad_pedida   numeric(14,2) NOT NULL DEFAULT 0,
  cantidad_recibida numeric(14,2) NOT NULL DEFAULT 0,
  creado_en     timestamptz,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- ---------- SCRAPER ----------
-- Foto reciente: las 200 propiedades más nuevas (reemplazada en cada sincronización).
CREATE TABLE IF NOT EXISTS central.scraper_propiedades (
  propiedad_id  text PRIMARY KEY,              -- id de public.propiedades (portal:codigo)
  portal        text NOT NULL,
  operacion     text,                          -- 'VENTA' | 'ALQUILER'
  inmueble      text,                          -- 'Departamento' | 'Casa' | ...
  titulo        text,
  precio        numeric(14,2),
  moneda        text,
  precio_usd    numeric(14,2),
  distrito      text,
  dormitorios   text,
  banios        text,
  area          text,
  url           text,
  encontrada_en timestamptz NOT NULL,
  ultima_vista_en timestamptz
);

-- Conteos por portal y operación sobre TODO el catálogo (no solo las 200 recientes).
CREATE TABLE IF NOT EXISTS central.scraper_resumen (
  portal        text NOT NULL,
  operacion     text NOT NULL DEFAULT '',
  total         integer NOT NULL,
  ultima_vista  timestamptz,
  PRIMARY KEY (portal, operacion)
);

-- ---------- CONTROL: ¿qué tan fresco está cada resumen? ----------
CREATE TABLE IF NOT EXISTS central.sync_estado (
  app           text PRIMARY KEY,              -- 'planner','mrp','scraper'
  ultima_sync   timestamptz NOT NULL DEFAULT now()
);

-- ---------- VISTA PARA EL AGENTE ----------
CREATE OR REPLACE VIEW central.v_stock_bajo AS
  SELECT material, categoria, cantidad, unidad, minimo, faltante
  FROM central.mrp_stock WHERE stock_bajo
  ORDER BY faltante DESC, material;

-- ---------- NOTA ----------
-- Cada app reemplaza su "foto" completa con una sincronización idempotente
-- (INSERT ... ON CONFLICT DO UPDATE + DELETE de lo que ya no existe) y marca
-- su fila en sync_estado. El código está en cada repositorio: api/vistaCentral.ts (Scraper),
-- src/lib/vistaCentral.ts (Planner) y utils/vista_central.py (MRP).
