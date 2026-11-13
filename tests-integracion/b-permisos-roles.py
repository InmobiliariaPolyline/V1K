"""BATERÍA B — matriz de permisos de los 4 roles contra el Neon REAL.
Cada prueba corre dentro de un SAVEPOINT que se deshace, y toda la sesión termina con ROLLBACK: no deja nada.
No imprime contraseñas."""
import re
import sys

import psycopg

from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent  # raíz del repositorio V1K
texto = open(RAIZ / "db" / "conexiones.local.txt", encoding="utf-8").read()
URL = {m.group(1): m.group(2) for m in re.finditer(r"(?m)^(coze_reader|writer_scraper|writer_planner|writer_mrp) = (\S+)$", texto)}
assert len(URL) == 4

TABLAS = {  # tabla -> (columna cualquiera, dueño)
    "planner_proyectos": ("proyecto_id", "writer_planner"),
    "planner_hitos": ("hito_id", "writer_planner"),
    "mrp_stock": ("material_id", "writer_mrp"),
    "mrp_pedidos": ("pedido_id", "writer_mrp"),
    "scraper_propiedades": ("propiedad_id", "writer_scraper"),
    "scraper_resumen": ("portal", "writer_scraper"),
    "sync_estado": ("app", None),
}
VISTA = "v_stock_bajo"
OPS = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]

total = ok = 0
fallos = []


def check(nombre, cond, detalle=""):
    global total, ok
    total += 1
    if cond:
        ok += 1
    else:
        fallos.append(f"{nombre} {detalle}")


def limpio(e):
    return re.sub(r"postgres(ql)?://\S+", "[conexión]", str(e)).splitlines()[0][:140]


class Sesion:
    def __init__(self, rol):
        self.rol = rol
        self.conn = psycopg.connect(URL[rol], connect_timeout=10)
        self.n = 0

    def intenta(self, sql, params=None):
        """Devuelve (sqlstate|None, filas|None, rowcount). Siempre deshace."""
        self.n += 1
        sp = f"sp{self.n}"
        self.conn.execute(f"SAVEPOINT {sp}")
        try:
            cur = self.conn.execute(sql, params)
            filas = None
            try:
                filas = cur.fetchall()
            except psycopg.ProgrammingError:
                pass
            return None, filas, cur.rowcount
        except psycopg.Error as e:
            return (e.sqlstate or "?"), None, -1
        finally:
            self.conn.execute(f"ROLLBACK TO SAVEPOINT {sp}")

    def secuencia(self, sentencias):
        """Ejecuta varias sentencias en un mismo savepoint; devuelve el sqlstate de la primera que falle (o None) y la última lista de filas."""
        self.n += 1
        sp = f"sp{self.n}"
        self.conn.execute(f"SAVEPOINT {sp}")
        try:
            filas = None
            for sql in sentencias:
                cur = self.conn.execute(sql)
                try:
                    filas = cur.fetchall()
                except psycopg.ProgrammingError:
                    filas = None
            return None, filas
        except psycopg.Error as e:
            return (e.sqlstate or "?"), None
        finally:
            self.conn.execute(f"ROLLBACK TO SAVEPOINT {sp}")

    def cerrar(self):
        self.conn.rollback()
        self.conn.close()


def sql_op(op, tabla, col):
    t = f"central.{tabla}"
    return {
        "SELECT": f"SELECT 1 FROM {t} LIMIT 1",
        "INSERT": f"INSERT INTO {t} ({col}) SELECT NULL WHERE false",
        "UPDATE": f"UPDATE {t} SET {col} = {col} WHERE false",
        "DELETE": f"DELETE FROM {t} WHERE false",
        "TRUNCATE": f"TRUNCATE {t}",
    }[op]


def permitido(rol, tabla, op):
    if rol == "coze_reader":
        return op == "SELECT"
    dueno = TABLAS[tabla][1]
    if tabla == "sync_estado":
        return op in ("SELECT", "INSERT", "UPDATE")
    if dueno == rol:
        return op in ("SELECT", "INSERT", "UPDATE", "DELETE")
    return False


DDL = [
    ("crear tabla en central", "CREATE TABLE central.zz_prueba (a int)"),
    ("crear tabla en public", "CREATE TABLE public.zz_prueba (a int)"),
    ("crear esquema", "CREATE SCHEMA zz_prueba"),
    ("crear vista", "CREATE VIEW central.zz_vista AS SELECT 1 AS a"),
    ("crear función en public", "CREATE FUNCTION public.zz_f() RETURNS int LANGUAGE sql AS 'select 1'"),
    ("borrar tabla central.mrp_stock", "DROP TABLE central.mrp_stock"),
    ("borrar tabla central.sync_estado", "DROP TABLE central.sync_estado"),
    ("borrar esquema central", "DROP SCHEMA central CASCADE"),
    ("alterar tabla (añadir columna)", "ALTER TABLE central.planner_proyectos ADD COLUMN zz int"),
    ("alterar tabla (renombrar)", "ALTER TABLE central.scraper_resumen RENAME TO zz_resumen"),
    ("crear índice", "CREATE INDEX zz_idx ON central.mrp_stock (material)"),
    ("crear disparador", "CREATE TRIGGER zz_trg BEFORE INSERT ON central.mrp_stock FOR EACH ROW EXECUTE FUNCTION pg_catalog.suppress_redundant_updates_trigger()"),
    ("comentar tabla", "COMMENT ON TABLE central.mrp_stock IS 'zz'"),
    ("desactivar RLS", "ALTER TABLE central.sync_estado DISABLE ROW LEVEL SECURITY"),
    ("borrar política RLS", "DROP POLICY sync_mrp ON central.sync_estado"),
    ("crear rol", "CREATE ROLE zz_rol"),
    ("borrar rol coze_reader", "DROP ROLE coze_reader"),
    ("alterar otro rol", "ALTER ROLE neondb_owner PASSWORD 'zz'"),
    ("crear extensión", "CREATE EXTENSION IF NOT EXISTS pgcrypto"),
    ("COPY a un programa del servidor", "COPY (SELECT 1) TO PROGRAM 'echo hola'"),
    ("COPY a un archivo", "COPY (SELECT 1) TO '/tmp/zz.txt'"),
    ("leer archivo del servidor", "SELECT pg_read_file('/etc/passwd')"),
    ("listar directorio del servidor", "SELECT pg_ls_dir('/')"),
    ("cambiar a neondb_owner", "SET ROLE neondb_owner"),
    ("SET SESSION AUTHORIZATION", "SET SESSION AUTHORIZATION neondb_owner"),
    ("matar otras sesiones", "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND usename <> current_user"),
    ("cargar biblioteca", "LOAD 'auto_explain'"),
]

try:
    # ── 1) Matriz tabla × operación × rol ───────────────────────────────────────
    for rol in URL:
        s = Sesion(rol)
        for tabla, (col, _d) in TABLAS.items():
            for op in OPS:
                st, _f, _n = s.intenta(sql_op(op, tabla, col))
                esperado = permitido(rol, tabla, op)
                if esperado:
                    check(f"[matriz] {rol} puede {op} {tabla}", st is None, f"-> sqlstate {st}")
                else:
                    bloqueo = ("42501", "25006") if rol == "coze_reader" else ("42501",)
                    check(f"[matriz] {rol} NO puede {op} {tabla}", st in bloqueo, f"-> sqlstate {st}")
        # vista
        for op in OPS:
            st, _f, _n = s.intenta(sql_op(op, VISTA, "material"))
            if rol == "coze_reader" and op == "SELECT":
                check(f"[matriz] {rol} puede SELECT {VISTA}", st is None, f"-> {st}")
            elif op == "TRUNCATE":
                check(f"[matriz] {rol} NO puede TRUNCATE {VISTA}", st in ("42501", "42809", "25006"), f"-> {st}")
            else:
                bloqueo = ("42501", "25006") if rol == "coze_reader" else ("42501",)
                check(f"[matriz] {rol} NO puede {op} {VISTA}", st in bloqueo, f"-> {st}")

        # ── 2) DDL, superusuario y escapes ──────────────────────────────────────
        for nombre, sql in DDL:
            st, _f, _n = s.intenta(sql)
            check(f"[ddl] {rol} NO puede: {nombre}", st is not None and st != "?" and st in ("42501", "42704", "42809", "0LP01", "55000", "25006"), f"-> {st}")

        # GRANT: Postgres solo avisa si no hay grant option; lo importante es que NO cambie nada
        otros = [r for r in URL if r != rol]
        for destino, etiqueta in (("PUBLIC", "PUBLIC"), ("CURRENT_USER", "sí mismo")):
            st, filas = s.secuencia([
                f"GRANT ALL ON ALL TABLES IN SCHEMA central TO {destino}",
                "SELECT has_table_privilege(current_user, 'central.sync_estado', 'DELETE'), "
                "has_table_privilege(current_user, 'central.mrp_stock', 'TRUNCATE'), "
                "has_table_privilege(current_user, 'central.planner_proyectos', 'INSERT'), "
                "has_table_privilege(current_user, 'central.scraper_propiedades', 'INSERT')",
            ])
            sd, tr, ip, isc = (filas[0] if filas else (None,) * 4)
            propio = {"writer_planner": ip, "writer_scraper": isc, "writer_mrp": None}.get(rol)
            check(f"[grant] {rol}: GRANT a {etiqueta} no le da DELETE en sync_estado", st is not None or sd is False, f"-> {st} {sd}")
            check(f"[grant] {rol}: GRANT a {etiqueta} no le da TRUNCATE", st is not None or tr is False, f"-> {st} {tr}")
        for otro in otros:
            st, filas = s.secuencia([
                "GRANT ALL ON ALL TABLES IN SCHEMA central TO PUBLIC",
                f"SELECT has_table_privilege('{otro}', 'central.sync_estado', 'DELETE'), has_table_privilege('{otro}', 'central.mrp_stock', 'TRUNCATE')",
            ])
            check(f"[grant] {rol}: GRANT a PUBLIC no eleva a {otro}", st is not None or (filas and filas[0] == (False, False)), f"-> {st} {filas}")
        for destino in [r for r in URL if r != rol] + ["neondb_owner"]:
            st, _f = s.secuencia([f"SET ROLE {destino}"])
            check(f"[escape] {rol} NO puede hacer SET ROLE {destino}", st == "42501", f"-> {st}")

        # ── 3) Atributos del rol ────────────────────────────────────────────────
        st, filas, _n = s.intenta("SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = current_user")
        if filas:
            sup, crol, cdb, repl, byp, login = filas[0]
            check(f"[rol] {rol} no es superusuario", sup is False)
            check(f"[rol] {rol} no puede crear roles", crol is False)
            check(f"[rol] {rol} no puede crear bases", cdb is False)
            check(f"[rol] {rol} sin replicación", repl is False)
            check(f"[rol] {rol} no se salta RLS", byp is False)
            check(f"[rol] {rol} puede iniciar sesión", login is True)
        else:
            check(f"[rol] {rol} atributos legibles", False, f"-> {st}")
        st, filas, _n = s.intenta("SELECT current_setting('is_superuser')")
        check(f"[rol] {rol} is_superuser=off", filas and filas[0][0] == "off")
        st, filas, _n = s.intenta("SELECT current_user")
        check(f"[rol] {rol} entra con su propio usuario", filas and filas[0][0] == rol)
        st, filas, _n = s.intenta("SELECT pg_has_role(current_user, 'neon_superuser', 'member')")
        check(f"[rol] {rol} no es miembro de neon_superuser", filas and filas[0][0] is False)
        st, filas, _n = s.intenta("SELECT count(*) FROM pg_roles r JOIN pg_auth_members m ON m.member = r.oid WHERE r.rolname = current_user")
        check(f"[rol] {rol} no pertenece a otros roles", filas and filas[0][0] == 0, f"-> {filas}")

        # ── 4) Detalles propios de cada rol ─────────────────────────────────────
        if rol == "coze_reader":
            st, filas, _n = s.intenta("SHOW default_transaction_read_only")
            check("[coze_reader] default_transaction_read_only=on", filas and filas[0][0] == "on", f"-> {filas}")
            st, filas, _n = s.intenta("SHOW statement_timeout")
            check("[coze_reader] statement_timeout=5s", filas and filas[0][0] == "5s", f"-> {filas}")
            otra = psycopg.connect(URL["coze_reader"], connect_timeout=10, autocommit=True)
            otra.execute("SET default_transaction_read_only = off")
            ro = otra.execute("SHOW default_transaction_read_only").fetchone()[0]
            for op, sql in (("INSERT", "INSERT INTO central.sync_estado (app) VALUES ('zz')"), ("UPDATE", "UPDATE central.sync_estado SET app = app"), ("DELETE", "DELETE FROM central.sync_estado"), ("TRUNCATE", "TRUNCATE central.sync_estado")):
                try:
                    otra.execute("BEGIN")
                    otra.execute(sql)
                    check(f"[coze_reader] con el modo lectura apagado ({ro}) no puede {op}", False, "se permitió")
                except psycopg.Error as e:
                    check(f"[coze_reader] con el modo lectura apagado ({ro}) no puede {op} (solo por privilegios)", e.sqlstate == "42501", f"-> {e.sqlstate}")
                finally:
                    otra.execute("ROLLBACK")
            otra.close()
            st, filas, _n = s.intenta("SELECT app FROM central.sync_estado ORDER BY 1")
            apps = [f[0] for f in (filas or [])]
            check("[coze_reader] ve todas las filas de sync_estado", set(apps) >= {"planner", "mrp"}, f"-> {apps}")
            st, filas, _n = s.intenta("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
            check("[coze_reader] no hay tablas en public", filas and filas[0][0] == 0, f"-> {filas}")
        else:
            propia = rol.split("_")[1]
            st, filas, _n = s.intenta("SELECT app FROM central.sync_estado")
            apps = [f[0] for f in (filas or [])]
            check(f"[rls] {rol} solo ve su fila de sync_estado", set(apps) <= {propia}, f"-> {apps}")
            st, _f, _n = s.intenta(f"INSERT INTO central.sync_estado (app) VALUES ('{propia}') ON CONFLICT (app) DO UPDATE SET ultima_sync = now()")
            check(f"[rls] {rol} puede marcar su propia fila", st is None, f"-> {st}")
            for otra in {"scraper", "planner", "mrp"} - {propia}:
                st, _f, _n = s.intenta(f"INSERT INTO central.sync_estado (app) VALUES ('{otra}')")
                check(f"[rls] {rol} NO puede crear la fila de {otra}", st == "42501", f"-> {st}")
                st, _f, n = s.intenta(f"UPDATE central.sync_estado SET ultima_sync = now() WHERE app = '{otra}'")
                check(f"[rls] {rol} NO puede actualizar la fila de {otra} (0 filas)", st is None and n == 0, f"-> {st} {n}")
            st, _f, _n = s.intenta(f"UPDATE central.sync_estado SET app = 'otra' WHERE app = '{propia}'")
            check(f"[rls] {rol} NO puede renombrar su fila a otra app", st in ("42501", None), f"-> {st}")
            # Si no existía su fila, el UPDATE anterior no toca nada; lo comprobamos creando y renombrando
            st, _f = s.secuencia([
                f"INSERT INTO central.sync_estado (app) VALUES ('{propia}') ON CONFLICT (app) DO UPDATE SET ultima_sync = now()",
                f"UPDATE central.sync_estado SET app = 'zz' WHERE app = '{propia}'",
            ])
            check(f"[rls] {rol} no puede cambiar su fila a un nombre ajeno (WITH CHECK)", st == "42501", f"-> {st}")
        s.cerrar()

    # ── 5) Autenticación ────────────────────────────────────────────────────────
    for rol in URL:
        base = URL[rol]
        mala = re.sub(r"(postgresql://[^:]+:)[^@]+(@)", r"\1" + "x" * 32 + r"\2", base)
        try:
            psycopg.connect(mala, connect_timeout=10).close()
            check(f"[auth] {rol} con contraseña falsa", False, "conectó")
        except psycopg.Error as e:
            check(f"[auth] {rol} con contraseña falsa es rechazada", "authentication failed" in str(e), limpio(e))
        vacia = re.sub(r"(postgresql://[^:]+:)[^@]+(@)", r"\1\2", base)
        try:
            psycopg.connect(vacia, connect_timeout=10).close()
            check(f"[auth] {rol} con contraseña vacía", False, "conectó")
        except psycopg.Error as e:
            check(f"[auth] {rol} con contraseña vacía es rechazada", True)
        sin_ssl = base.replace("sslmode=require", "sslmode=disable")
        try:
            psycopg.connect(sin_ssl, connect_timeout=10).close()
            check(f"[auth] {rol} sin SSL", False, "conectó sin cifrar")
        except psycopg.Error:
            check(f"[auth] {rol} sin SSL es rechazada", True)
    # contraseña de un rol con el nombre de otro
    cruzada = re.sub(r"(postgresql://)[^:]+(:)", r"\1writer_mrp\2", URL["coze_reader"])
    try:
        psycopg.connect(cruzada, connect_timeout=10).close()
        check("[auth] contraseña de coze_reader no sirve para writer_mrp", False, "conectó")
    except psycopg.Error:
        check("[auth] contraseña de coze_reader no sirve para writer_mrp", True)

except Exception as e:  # noqa: BLE001
    print("ERROR INESPERADO:", limpio(e))
    raise

print(f"\nBATERÍA B: {ok}/{total} comprobaciones correctas")
if fallos:
    print(f"FALLOS ({len(fallos)}):")
    for f in fallos[:50]:
        print("  ✘", f)
sys.exit(0 if ok == total else 1)
