-- ============================================================
-- HISTORIAL DIARIO: una foto por día de los números que importan
-- (proyectos atrasados, stock, pedidos, propiedades y precios medianos).
-- Sirve para ver tendencias en el panel y para el resumen diario.
--
-- Ejecutar DESPUÉS de 01_schema.sql y 02_roles.sql, con el rol dueño de Neon.
-- Es seguro repetirlo (no borra ni duplica nada).
-- Reemplaza la contraseña por un valor largo y aleatorio (no la guardes en este archivo).
--
-- Quién escribe: un 5.º rol, `writer_historial`, que solo puede LEER las tablas centrales y ESCRIBIR en esta tabla. La foto la toma
-- un flujo de GitHub Actions (una vez al día) llamando a central.tomar_foto_diaria(); las apps no cambian.
-- ============================================================

CREATE TABLE IF NOT EXISTS central.historial_diario (
  dia                        date PRIMARY KEY,            -- día en hora de Lima
  proyectos_total            integer NOT NULL DEFAULT 0,
  proyectos_en_curso         integer NOT NULL DEFAULT 0,
  proyectos_atrasados        integer NOT NULL DEFAULT 0,
  tareas_atrasadas           integer NOT NULL DEFAULT 0,
  avance_medio_pct           numeric(5,1),
  materiales_con_minimo      integer NOT NULL DEFAULT 0,
  materiales_sin_existencias integer NOT NULL DEFAULT 0,
  materiales_en_stock_bajo   integer NOT NULL DEFAULT 0,
  pedidos_abiertos           integer NOT NULL DEFAULT 0,
  pedidos_vencidos           integer NOT NULL DEFAULT 0,
  propiedades_catalogo       bigint  NOT NULL DEFAULT 0,  -- todo el catálogo (scraper_resumen)
  propiedades_copiadas       integer NOT NULL DEFAULT 0,  -- las más recientes copiadas (scraper_propiedades)
  propiedades_dudosas        integer NOT NULL DEFAULT 0,  -- con precio que parece un error (ver abajo)
  precio_mediano_venta_usd   numeric(14,2),
  precio_mediano_alquiler_usd numeric(14,2),
  actualizado_en             timestamptz NOT NULL DEFAULT now()
);

-- Toma (o actualiza) la foto de hoy. Los precios dudosos NO entran en las medianas: ventas < US$ 5,000 y alquileres
-- < US$ 80 (suelen ser el precio por m²) o > US$ 100,000 al mes. Son los mismos umbrales que usa el panel (precioDudoso).
CREATE OR REPLACE FUNCTION central.tomar_foto_diaria() RETURNS central.historial_diario
LANGUAGE sql AS $$
  INSERT INTO central.historial_diario AS h (
    dia, proyectos_total, proyectos_en_curso, proyectos_atrasados, tareas_atrasadas, avance_medio_pct,
    materiales_con_minimo, materiales_sin_existencias, materiales_en_stock_bajo, pedidos_abiertos, pedidos_vencidos,
    propiedades_catalogo, propiedades_copiadas, propiedades_dudosas, precio_mediano_venta_usd, precio_mediano_alquiler_usd,
    actualizado_en)
  SELECT
    (now() AT TIME ZONE 'America/Lima')::date,
    (SELECT count(*) FROM central.planner_proyectos),
    (SELECT count(*) FROM central.planner_proyectos WHERE estado = 'en curso'),
    (SELECT count(*) FROM central.planner_proyectos WHERE estado = 'atrasado'),
    (SELECT coalesce(sum(tareas_atrasadas), 0) FROM central.planner_proyectos),
    (SELECT round(avg(avance_pct), 1) FROM central.planner_proyectos),
    (SELECT count(*) FROM central.mrp_stock),
    (SELECT count(*) FROM central.mrp_stock WHERE cantidad = 0),
    (SELECT count(*) FROM central.mrp_stock WHERE stock_bajo),
    (SELECT count(*) FROM central.mrp_pedidos),
    (SELECT count(*) FROM central.mrp_pedidos WHERE llegada_estimada < (now() AT TIME ZONE 'America/Lima')::date),
    (SELECT coalesce(sum(total), 0) FROM central.scraper_resumen),
    (SELECT count(*) FROM central.scraper_propiedades),
    (SELECT count(*) FROM central.scraper_propiedades
      WHERE precio_usd > 0 AND ((operacion = 'VENTA' AND precio_usd < 5000)
         OR (operacion = 'ALQUILER' AND (precio_usd < 80 OR precio_usd > 100000)))),
    (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY precio_usd))::numeric, 2) FROM central.scraper_propiedades
      WHERE operacion = 'VENTA' AND precio_usd >= 5000),
    (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY precio_usd))::numeric, 2) FROM central.scraper_propiedades
      WHERE operacion = 'ALQUILER' AND precio_usd >= 80 AND precio_usd <= 100000),
    now()
  ON CONFLICT (dia) DO UPDATE SET
    proyectos_total = EXCLUDED.proyectos_total, proyectos_en_curso = EXCLUDED.proyectos_en_curso,
    proyectos_atrasados = EXCLUDED.proyectos_atrasados, tareas_atrasadas = EXCLUDED.tareas_atrasadas,
    avance_medio_pct = EXCLUDED.avance_medio_pct, materiales_con_minimo = EXCLUDED.materiales_con_minimo,
    materiales_sin_existencias = EXCLUDED.materiales_sin_existencias, materiales_en_stock_bajo = EXCLUDED.materiales_en_stock_bajo,
    pedidos_abiertos = EXCLUDED.pedidos_abiertos, pedidos_vencidos = EXCLUDED.pedidos_vencidos,
    propiedades_catalogo = EXCLUDED.propiedades_catalogo, propiedades_copiadas = EXCLUDED.propiedades_copiadas,
    propiedades_dudosas = EXCLUDED.propiedades_dudosas, precio_mediano_venta_usd = EXCLUDED.precio_mediano_venta_usd,
    precio_mediano_alquiler_usd = EXCLUDED.precio_mediano_alquiler_usd, actualizado_en = EXCLUDED.actualizado_en
  RETURNING h.*;
$$;

-- ---------- Rol de escritura acotada ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'writer_historial') THEN
    CREATE ROLE writer_historial LOGIN PASSWORD 'CAMBIAR_POR_CONTRASENA_LARGA_5';
  END IF;
END $$;

GRANT USAGE ON SCHEMA central TO writer_historial;
-- Lee lo necesario para la foto (nada más)
GRANT SELECT ON central.planner_proyectos, central.mrp_stock, central.mrp_pedidos,
                central.scraper_propiedades, central.scraper_resumen TO writer_historial;
-- Escribe solo su tabla, y no puede borrar
GRANT SELECT, INSERT, UPDATE ON central.historial_diario TO writer_historial;
-- Una función se puede ejecutar por defecto desde cualquier rol: se restringe a quien corresponde
REVOKE EXECUTE ON FUNCTION central.tomar_foto_diaria() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION central.tomar_foto_diaria() TO writer_historial;
ALTER ROLE writer_historial SET statement_timeout = '15s';
ALTER ROLE writer_historial CONNECTION LIMIT 2;

-- Coze y el panel leen el historial (como el resto de las tablas centrales): solo lectura
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coze_reader') THEN
    GRANT SELECT ON central.historial_diario TO coze_reader;
  END IF;
END $$;

-- ---------- Verificación ----------
-- Como writer_historial:
--   SELECT * FROM central.tomar_foto_diaria();                    -- debe funcionar (una fila)
--   DELETE FROM central.historial_diario;                          -- debe FALLAR
--   INSERT INTO central.mrp_stock (material_id, material, cantidad, minimo) VALUES ('x','x',0,1);   -- debe FALLAR
-- Como coze_reader:
--   SELECT * FROM central.historial_diario ORDER BY dia DESC;      -- debe funcionar
--   SELECT * FROM central.tomar_foto_diaria();                     -- debe FALLAR
