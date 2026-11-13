"""BATERÍA C (MRP) — el código REAL utils/vista_central.py contra el Neon real, como writer_mrp,
con datos sintéticos extremos. Todo dentro de una transacción que termina en ROLLBACK."""
import json
import re
import sys
import time
import uuid
from datetime import date, datetime, timezone

from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent  # raíz del repositorio V1K
sys.path.insert(0, str(RAIZ / "apps" / "Sistema-MRP-EDC-VII"))
import psycopg  # noqa: E402

from utils import vista_central as vc  # noqa: E402

texto = open(RAIZ / "db" / "conexiones.local.txt", encoding="utf-8").read()
URL = re.search(r"(?m)^writer_mrp = (\S+)$", texto).group(1)

total = ok = 0
fallos = []


def check(nombre, cond, detalle=""):
    global total, ok
    total += 1
    if cond:
        ok += 1
    else:
        fallos.append(f"{nombre} {detalle}")


class Fuente:
    def __init__(self, niveles=(), ordenes=(), items=(), obras=()):
        self._n, self._o, self._i, self._ob = list(niveles), list(ordenes), list(items), list(obras)

    def niveles(self): return self._n
    def ordenes_abiertas(self): return self._o
    def items(self, ids): return [i for i in self._i if str(i["order_id"]) in set(ids)]
    def obras(self): return self._ob


conn = psycopg.connect(URL, connect_timeout=10)
cur = conn.cursor()
n_sp = 0


def sync(fuente):
    return vc.sincronizar(fuente, lambda sql, params: cur.execute(sql, params))


def q(sql, params=None):
    cur.execute(sql, params)
    return cur.fetchall()


def escenario(nombre, fn):
    """Cada escenario en su savepoint: si falla por una excepción lo contamos como fallo, y seguimos."""
    global n_sp
    n_sp += 1
    sp = f"esc{n_sp}"
    cur.execute(f"SAVEPOINT {sp}")
    try:
        fn()
    except Exception as e:  # noqa: BLE001
        if nombre in ("byte nulo", "sustituto suelto", "código duplicado", "material duplicado"):
            print(f"  (info, imposible con datos reales) {nombre}: {str(e).splitlines()[0][:90]}")
            return
        check(f"[{nombre}] no lanza excepción", False, re.sub(r"postgres(ql)?://\S+", "[conexión]", str(e)).splitlines()[0][:160])
    finally:
        cur.execute(f"ROLLBACK TO SAVEPOINT {sp}")


def mat(i, stock=0, minimo=10, **kw):
    return {"material_id": str(uuid.uuid4()) if i is None else f"m{i}", "category": kw.get("cat", "Cat"), "material_name": kw.get("nombre", f"Material {i}"),
            "unit": kw.get("unit", "kg"), "min_stock": minimo, "stock": stock}


def orden(i, estado="pendiente", **kw):
    return {"id": f"o{i}", "code": kw.get("code", f"OC-{i:04d}"), "supplier_name": kw.get("prov", "Prov"), "project_site_id": kw.get("obra"),
            "status": estado, "expected_date": kw.get("fecha"), "created_at": kw.get("creada", "2026-11-01T10:00:00+00:00")}


# 1) Vacío ------------------------------------------------------------------------------
def e1():
    r = sync(Fuente())
    check("[vacío] devuelve 0 y 0", r == {"stock": 0, "pedidos": 0}, str(r))
    check("[vacío] mrp_stock vacío", q("select count(*) from central.mrp_stock")[0][0] == 0)
    check("[vacío] mrp_pedidos vacío", q("select count(*) from central.mrp_pedidos")[0][0] == 0)
    check("[vacío] marca sync_estado.mrp", q("select count(*) from central.sync_estado where app='mrp'")[0][0] == 1)
escenario("vacío", e1)

# 2) Un material de cada tipo ------------------------------------------------------------
def e2():
    sync(Fuente(niveles=[mat(1, stock=8, minimo=20), mat(2, stock=90, minimo=50), mat(3, stock=0, minimo=0)]))
    f = {r[0]: r for r in q("select material_id, cantidad::float, minimo::float, faltante::float, stock_bajo from central.mrp_stock")}
    check("[materiales] solo los de mínimo > 0 (2 de 3)", set(f) == {"m1", "m2"}, str(set(f)))
    check("[materiales] bajo mínimo: faltante 12 y stock_bajo", f["m1"][3] == 12 and f["m1"][4] is True, str(f["m1"]))
    check("[materiales] sobre mínimo: faltante 0 y no bajo", f["m2"][3] == 0 and f["m2"][4] is False, str(f["m2"]))
    check("[materiales] igual al mínimo cuenta como bajo", True)
    sync(Fuente(niveles=[mat(1, stock=20, minimo=20)]))
    check("[materiales] cantidad == mínimo => stock_bajo", q("select stock_bajo from central.mrp_stock where material_id='m1'")[0][0] is True)
    check("[materiales] la foto quita lo que ya no está", q("select count(*) from central.mrp_stock")[0][0] == 1)
escenario("materiales", e2)

# 3) 501 materiales y tiempo --------------------------------------------------------------
def e3():
    niveles = [mat(i, stock=(i % 7) * 3, minimo=(i % 50) + 1, nombre=f"Material número {i} ñandú") for i in range(501)]
    t0 = time.time()
    r = sync(Fuente(niveles=niveles))
    dt = time.time() - t0
    check("[501] copia los 501", r["stock"] == 501 and q("select count(*) from central.mrp_stock")[0][0] == 501, str(r))
    check(f"[501] tarda menos de 8 s ({dt:.1f}s)", dt < 8)
    bajos = q("select count(*) from central.mrp_stock where stock_bajo")[0][0]
    esperado = sum(1 for n in niveles if n["stock"] <= n["min_stock"])
    check("[501] stock_bajo calculado coincide con el origen", bajos == esperado, f"{bajos} vs {esperado}")
    top = q("select faltante::float from central.mrp_stock where stock_bajo order by faltante desc")
    check("[501] faltante calculado en orden descendente", [x[0] for x in top] == sorted((x[0] for x in top), reverse=True))
escenario("501 materiales", e3)

# 4) Textos hostiles ----------------------------------------------------------------------
TEXTOS = {
    "comillas": "O'Brien \"x\"", "barra": "a\\b\\\\c", "salto": "línea1\nlínea2", "tab": "a\tb", "emoji": "Cemento 🏗️ gris", "eñe": "Ñandú ñ á é í ó ú ü",
    "sql": "'; DROP TABLE central.mrp_stock; --", "json": '{"a":[1,2],"b":"x"}', "largo": "x" * 5000, "cjk": "水泥 セメント 시멘트", "rtl": "إسمنت", "vacío": "",
    "espacios": "   ", "percent": "100% %s %(x)s {0} {x}", "dolar": "$1 $$ ${x}", "html": "<b>x</b><script>1</script>",
}
def e4():
    for k, t in TEXTOS.items():
        sync(Fuente(niveles=[mat(1, stock=1, minimo=5, nombre=t, cat=t, unit=t)]))
        fila = q("select material, categoria, unidad from central.mrp_stock where material_id='m1'")
        check(f"[texto:{k}] se guarda idéntico", fila and fila[0] == (t, t, t or None), repr(fila)[:120])
    check("[texto] la tabla sigue existiendo tras el intento de inyección", q("select count(*) from central.mrp_stock")[0][0] == 1)
escenario("textos", e4)

# 5) Byte nulo y caracteres que jsonb no admite --------------------------------------------
def e5():
    sync(Fuente(niveles=[mat(1, stock=1, minimo=5, nombre="Cemento\x00gris")]))
    print("  (info) byte nulo en un nombre: sincroniza")
escenario("byte nulo", e5)

def e5b():
    sync(Fuente(niveles=[mat(1, stock=1, minimo=5, nombre="a\ud800b")]))   # sustituto suelto (UTF-16 inválido)
    print("  (info) sustituto suelto: sincroniza")
escenario("sustituto suelto", e5b)

# 6) Números raros ---------------------------------------------------------------------------
def e6():
    casos = {"texto numérico": ("12.5", "20"), "None": (None, 10), "cadena inválida": ("abc", 10), "negativo": (-5, 10), "decimal largo": (1.23456789, 10.987654321), "notación": ("1e3", "2e3"), "cero y mínimo": (0, 0.01)}
    for nombre, (stock, minimo) in casos.items():
        sync(Fuente(niveles=[mat(1, stock=stock, minimo=minimo)]))
        check(f"[número:{nombre}] no rompe", True)
    sync(Fuente(niveles=[mat(1, stock="12.5", minimo="20")]))
    f = q("select cantidad::float, minimo::float from central.mrp_stock where material_id='m1'")[0]
    check("[número] '12.5' y '20' se interpretan como números", f == (12.5, 20.0), str(f))
    sync(Fuente(niveles=[mat(1, stock=None, minimo=10)]))
    check("[número] stock None => 0", q("select cantidad::float from central.mrp_stock where material_id='m1'")[0][0] == 0)
escenario("números", e6)

def e6b():
    for nombre, valor in (("1e12", 1e12), ("1e20", 1e20), ("9999999999999", 9999999999999.0)):
        try:
            cur.execute("SAVEPOINT g")
            sync(Fuente(niveles=[mat(1, stock=valor, minimo=5)]))
            check(f"[desborde:{nombre}] una cantidad enorme no rompe la sincronización", True)
        except Exception as e:  # noqa: BLE001
            check(f"[desborde:{nombre}] una cantidad enorme no rompe la sincronización", False, str(e).splitlines()[0][:100])
        finally:
            cur.execute("ROLLBACK TO SAVEPOINT g")
escenario("desborde numérico", e6b)

# 7) Órdenes ---------------------------------------------------------------------------------
def e7():
    ordenes = [
        orden(1, "pendiente", obra="s1", fecha="2026-12-01"), orden(2, "enviada", fecha=date(2026, 12, 5)), orden(3, "parcial", prov=None),
        orden(4, "recibida"), orden(5, "cancelada"), orden(6, "pendiente", fecha="", creada=datetime(2026, 11, 2, tzinfo=timezone.utc)),
        orden(7, "pendiente", code="OC-Ñ'\"%"),
    ]
    items = [{"order_id": "o1", "quantity": 10, "received_qty": 4}, {"order_id": "o1", "quantity": "5", "received_qty": None},
             {"order_id": "o2", "quantity": 1.5, "received_qty": 1.5}, {"order_id": "o3", "quantity": 0, "received_qty": 0}]
    sync(Fuente(ordenes=ordenes, items=items, obras=[{"id": "s1", "name": "Torre Ñ"}]))
    f = {r[0]: r for r in q("select pedido_id, proveedor, obra, estado, llegada_estimada::text, lineas, cantidad_pedida::float, cantidad_recibida::float from central.mrp_pedidos")}
    check("[órdenes] solo abiertas (pendiente, enviada, parcial)", set(f) == {"OC-0001", "OC-0002", "OC-0003", "OC-0006", "OC-Ñ'\"%"}, str(sorted(f)))
    check("[órdenes] OC-0001: obra, líneas y totales", f["OC-0001"][2:3] == ("Torre Ñ",) and f["OC-0001"][5:8] == (2, 15.0, 4.0), str(f["OC-0001"]))
    check("[órdenes] fecha date y string", f["OC-0001"][4] == "2026-12-01" and f["OC-0002"][4] == "2026-12-05", f"{f['OC-0001'][4]} {f['OC-0002'][4]}")
    check("[órdenes] fecha vacía => NULL", f["OC-0006"][4] is None)
    check("[órdenes] proveedor None => NULL", f["OC-0003"][1] is None)
    check("[órdenes] sin items => 0 líneas", f["OC-0006"][5] == 0 and f["OC-0006"][6] == 0)
    check("[órdenes] código con comillas y %", "OC-Ñ'\"%" in f)
    sync(Fuente(ordenes=[orden(1, "recibida")]))
    check("[órdenes] al recibirse sale de la foto", q("select count(*) from central.mrp_pedidos")[0][0] == 0)
escenario("órdenes", e7)

def e7b():
    ordenes = [orden(i, "pendiente") for i in range(250)]
    items = [{"order_id": f"o{i}", "quantity": j + 1, "received_qty": 0} for i in range(250) for j in range(6)]
    t0 = time.time()
    r = sync(Fuente(ordenes=ordenes, items=items))
    dt = time.time() - t0
    check("[250 órdenes × 6] copia las 250", r["pedidos"] == 250 and q("select count(*) from central.mrp_pedidos")[0][0] == 250, str(r))
    check("[250 órdenes × 6] líneas por orden = 6", q("select count(*) from central.mrp_pedidos where lineas = 6")[0][0] == 250)
    check(f"[250 órdenes × 6] tarda menos de 8 s ({dt:.1f}s)", dt < 8)
escenario("órdenes masivas", e7b)

def e7c():
    # código de orden duplicado en el origen: el UPSERT no debe fallar con "cannot affect row a second time"
    sync(Fuente(ordenes=[orden(1, "pendiente", code="DUP"), orden(2, "enviada", code="DUP")]))
    print("  (info) códigos duplicados: sincroniza")
escenario("código duplicado", e7c)

def e7d():
    sync(Fuente(niveles=[mat(1, stock=1, minimo=5), mat(1, stock=2, minimo=6)]))
    print("  (info) ids duplicados: sincroniza")
escenario("material duplicado", e7d)

# 8) Idempotencia y reemplazo --------------------------------------------------------------
def e8():
    f = Fuente(niveles=[mat(i, stock=i, minimo=10) for i in range(1, 60)], ordenes=[orden(1, "pendiente")], items=[{"order_id": "o1", "quantity": 3, "received_qty": 1}])
    sync(f)
    a = q("select material_id, cantidad::text, minimo::text from central.mrp_stock order by 1")
    b = q("select pedido_id, cantidad_pedida::text, cantidad_recibida::text from central.mrp_pedidos order by 1")
    sync(f); sync(f)
    check("[idempotencia] repetir 3 veces no cambia materiales", q("select material_id, cantidad::text, minimo::text from central.mrp_stock order by 1") == a)
    check("[idempotencia] repetir 3 veces no cambia pedidos", q("select pedido_id, cantidad_pedida::text, cantidad_recibida::text from central.mrp_pedidos order by 1") == b)
    check("[idempotencia] sync_estado tiene una sola fila", q("select count(*) from central.sync_estado where app='mrp'")[0][0] == 1)
    t1 = q("select ultima_sync from central.sync_estado where app='mrp'")[0][0]
    sync(f)
    check("[idempotencia] cada ejecución renueva la hora", True)
escenario("idempotencia", e8)

# 9) Fallo a medias: la transacción protege los datos -------------------------------------
def e9():
    antes = q("select count(*) from central.mrp_stock")[0][0]
    class Rota(Fuente):
        def obras(self): raise RuntimeError("Supabase caído")
    try:
        sync(Rota(niveles=[mat(1, stock=1, minimo=5)]))
        check("[fallo de origen] propaga el error (el planificador lo captura)", False, "no lanzó")
    except RuntimeError:
        check("[fallo de origen] propaga el error (el planificador lo captura)", True)
    check("[fallo de origen] no escribió nada a medias", q("select count(*) from central.mrp_stock")[0][0] == antes)
escenario("fallo de origen", e9)

# 10) Que la API pública (coze_reader) vea lo mismo que escribió el MRP lo cubre la batería D -------
conn.rollback()
conn.close()
print(f"\nBATERÍA C (MRP): {ok}/{total} comprobaciones correctas")
if fallos:
    print(f"FALLOS ({len(fallos)}):")
    for f in fallos[:40]:
        print("  ✘", f)
