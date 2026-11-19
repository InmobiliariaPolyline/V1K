-- ============================================================
-- ACCESOS DEL BOT DE TELEGRAM: quién puede usar el bot de consultas y recibir el resumen diario.
-- Los administra el módulo «Accesos» del panel (con el token de administrador): se escribe el número de chat y el teléfono
-- de la persona y, desde ese momento, puede usar el bot. Sin redeploy y sin tocar Vercel ni GitHub.
--
-- Ejecutar DESPUÉS de 01_schema.sql, 02_roles.sql y 03_historial.sql, con el rol dueño de Neon.
-- Es seguro repetirlo (no borra ni duplica nada).
-- Reemplaza la contraseña por un valor largo y aleatorio (no la guardes en este archivo).
--
-- Quién escribe: un 6.º rol, `writer_accesos`, que SOLO puede tocar esta tabla (no ve proyectos, materiales ni propiedades).
-- Quién lee: el bot y el resumen diario ven únicamente la lista de números de chat activos (vista v_telegram_chats_activos),
-- nunca los nombres ni los teléfonos. Coze y el panel de datos (coze_reader) no tienen acceso a la tabla.
-- ============================================================

CREATE TABLE IF NOT EXISTS central.telegram_accesos (
  chat_id        bigint PRIMARY KEY CHECK (chat_id > 0),            -- número de chat de Telegram (el de una persona es positivo)
  nombre         text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 60),
  telefono       text NOT NULL CHECK (telefono ~ '^\+?[0-9][0-9 -]{5,18}[0-9]$'),   -- solo para el registro del administrador
  activo         boolean NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- Lo único que ven el bot y el resumen diario: los números de chat con acceso (como texto)
CREATE OR REPLACE VIEW central.v_telegram_chats_activos AS
  SELECT chat_id::text AS chat_id FROM central.telegram_accesos WHERE activo;

-- ---------- Rol de escritura acotada ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'writer_accesos') THEN
    CREATE ROLE writer_accesos LOGIN PASSWORD 'CAMBIAR_POR_CONTRASENA_LARGA_6';
  END IF;
END $$;

GRANT USAGE ON SCHEMA central TO writer_accesos;
GRANT SELECT, INSERT, UPDATE, DELETE ON central.telegram_accesos TO writer_accesos;   -- solo esta tabla
ALTER ROLE writer_accesos SET statement_timeout = '5s';
ALTER ROLE writer_accesos CONNECTION LIMIT 3;

-- OJO: 02_roles.sql da a coze_reader SELECT por defecto sobre TODA tabla nueva del esquema (ALTER DEFAULT PRIVILEGES). Esta tabla tiene
-- nombres y teléfonos, así que se le quita explícitamente: coze_reader (el bot y la API) solo lee la vista de números de chat.
REVOKE ALL ON central.telegram_accesos FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coze_reader') THEN
    REVOKE ALL ON central.telegram_accesos FROM coze_reader;
  END IF;
END $$;

-- El bot (coze_reader) y el resumen diario (writer_historial) leen SOLO la vista de números de chat
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coze_reader') THEN
    GRANT SELECT ON central.v_telegram_chats_activos TO coze_reader;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'writer_historial') THEN
    GRANT SELECT ON central.v_telegram_chats_activos TO writer_historial;
  END IF;
END $$;

-- ---------- Verificación ----------
-- Como writer_accesos:
--   INSERT INTO central.telegram_accesos (chat_id, nombre, telefono) VALUES (123456789, 'Prueba', '+51 999 888 777');   -- funciona
--   SELECT * FROM central.planner_proyectos;                                                                              -- debe FALLAR
-- Como coze_reader:
--   SELECT * FROM central.v_telegram_chats_activos;      -- funciona (solo números de chat)
--   SELECT * FROM central.telegram_accesos;              -- debe FALLAR (no ve nombres ni teléfonos)
