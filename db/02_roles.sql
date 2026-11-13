-- ============================================================
-- ROLES: uno para Coze (solo lectura) y uno por app (escritura acotada)
-- Ejecutar DESPUÉS de 01_schema.sql, con el rol dueño de Neon.
-- Reemplaza las contraseñas por valores largos, aleatorios y distintos
-- (no las guardes en este archivo ni las compartas en chat).
-- ============================================================

-- ---------- 1) Coze: solo lectura ----------
CREATE ROLE coze_reader LOGIN PASSWORD 'CAMBIAR_POR_CONTRASENA_LARGA_1';

REVOKE ALL ON SCHEMA public FROM coze_reader;
GRANT USAGE ON SCHEMA central TO coze_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA central TO coze_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA central GRANT SELECT ON TABLES TO coze_reader;

-- Defensa extra: aunque algo falle, la sesión no puede escribir
ALTER ROLE coze_reader SET default_transaction_read_only = on;
ALTER ROLE coze_reader SET statement_timeout = '5s';
ALTER ROLE coze_reader CONNECTION LIMIT 5;

-- ---------- 2) Un rol por app: solo puede tocar SUS tablas ----------
-- Si una credencial se filtra, solo se puede dañar el resumen de esa app.
-- Cada app reemplaza su "foto" en cada sincronización, por eso necesita DELETE
-- (solo en sus tablas) y UPSERT sobre sync_estado.

CREATE ROLE writer_scraper LOGIN PASSWORD 'CAMBIAR_POR_CONTRASENA_LARGA_2';
CREATE ROLE writer_planner LOGIN PASSWORD 'CAMBIAR_POR_CONTRASENA_LARGA_3';
CREATE ROLE writer_mrp     LOGIN PASSWORD 'CAMBIAR_POR_CONTRASENA_LARGA_4';

GRANT USAGE ON SCHEMA central TO writer_scraper, writer_planner, writer_mrp;

GRANT SELECT, INSERT, UPDATE, DELETE ON central.scraper_propiedades, central.scraper_resumen TO writer_scraper;
GRANT SELECT, INSERT, UPDATE, DELETE ON central.planner_proyectos, central.planner_hitos     TO writer_planner;
GRANT SELECT, INSERT, UPDATE, DELETE ON central.mrp_stock, central.mrp_pedidos               TO writer_mrp;

-- sync_estado: cada app solo puede tocar su propia fila (RLS)
ALTER TABLE central.sync_estado ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON central.sync_estado TO writer_scraper, writer_planner, writer_mrp;

CREATE POLICY sync_scraper ON central.sync_estado FOR ALL TO writer_scraper
  USING (app = 'scraper') WITH CHECK (app = 'scraper');
CREATE POLICY sync_planner ON central.sync_estado FOR ALL TO writer_planner
  USING (app = 'planner') WITH CHECK (app = 'planner');
CREATE POLICY sync_mrp ON central.sync_estado FOR ALL TO writer_mrp
  USING (app = 'mrp') WITH CHECK (app = 'mrp');
-- coze_reader y el dueño siguen leyendo todo
CREATE POLICY sync_lectura ON central.sync_estado FOR SELECT TO coze_reader USING (true);

-- ---------- Verificación ----------
-- Como coze_reader:
--   SELECT * FROM central.v_stock_bajo;                          -- debe funcionar
--   INSERT INTO central.sync_estado (app) VALUES ('x');           -- debe FALLAR
--   SELECT * FROM public.cualquier_tabla;                         -- debe FALLAR
-- Como writer_scraper:
--   DELETE FROM central.scraper_resumen;                          -- debe funcionar
--   DELETE FROM central.mrp_stock;                                -- debe FALLAR
--   INSERT INTO central.sync_estado (app) VALUES ('mrp');         -- debe FALLAR
