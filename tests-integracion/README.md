# Baterías de pruebas de integración

Pruebas contra el **sistema real** (API en Vercel y base central en Neon) y contra el **código real de sincronización**
de cada app. Sirven para comprobar, sin leer los registros de Render ni de Netlify, que la sincronización funciona.

> Usan las credenciales de `db/conexiones.local.txt` (archivo local que Git ignora). No imprimen contraseñas.
> Las que escriben en la base lo hacen dentro de una transacción que termina en `ROLLBACK`: no dejan datos.

| Archivo | Qué prueba | Resultado (13/11/2026) |
|---|---|---|
| `a-api-en-vivo.mjs` | **API en vivo**: autenticación (13 variantes × 8 rutas), métodos HTTP, rutas hostiles, parámetro `q`, filtros válidos y no válidos (400), `resumen_general`, panel web y cabeceras de seguridad, forma de cada respuesta contra el OpenAPI, ráfaga de 60 peticiones. Solo lectura | 557 / 557 |
| `b-permisos-roles.py` | **Permisos de los 5 roles** en Neon: cada rol × tabla × operación, DDL y escapes (`SET ROLE`, `COPY … TO PROGRAM`, leer archivos), seguridad por fila de `sync_estado`, contraseñas falsas, sin SSL | 397 / 397 |
| `c-sync-mrp.py` | **Sincronización del MRP** (`utils/vista_central.py`) con datos extremos, como `writer_mrp` | 60 / 60 |
| `c-sync-planner.mts` | **Sincronización del Planner** (`src/lib/vistaCentral.ts`), como `writer_planner` | 46 / 46 |
| `c-sync-scraper.mts` | **Sincronización del Scraper** (`api/vistaCentral.ts`), como `writer_scraper`, incluido el controlador HTTP de Neon que usa Netlify | 49 / 49 |
| `d-datos-reales.mjs` | **Integridad de los datos reales** de la base central y que cada vista de la API devuelva exactamente lo que hay en la base. Solo lectura | 53 / 53 |

## Requisitos

1. `db/conexiones.local.txt` con las cadenas de los 5 roles y el `API_TOKEN` (ver `docs/GUIA_PUESTA_EN_MARCHA.md`).
2. Las tres apps clonadas en `apps/` (ver el README de la raíz) y con sus dependencias instaladas (la batería D usa también `coze-api/lib/vistas.js`):
   `npm install` en `apps/planner-backend`, `pnpm install` en `apps/REAL_ESTATE_SCRAPER`. El MRP solo necesita Python.
3. Node 20+ y, en esta carpeta, `npm install`.
4. Para las baterías de Python (`b` y `c-sync-mrp`):

```bash
python -m venv .venv
.venv/Scripts/pip install "psycopg[binary]==3.3.9"     # en Linux/Mac: .venv/bin/pip
```

## Cómo ejecutarlas

```bash
cd tests-integracion
node a-api-en-vivo.mjs
.venv/Scripts/python -X utf8 b-permisos-roles.py
.venv/Scripts/python -X utf8 c-sync-mrp.py
npx tsx c-sync-planner.mts
npx tsx c-sync-scraper.mts
TZ=UTC node d-datos-reales.mjs        # TZ=UTC: las fechas `date` se comparan en UTC, como en Vercel
```

Cada una termina con una línea `BATERÍA X: n/n comprobaciones correctas` y, si algo falla, lista los fallos con `✘`.

## Qué significan los casos "informativos"

Los casos de byte nulo y de carácter UTF-16 inválido (Planner y MRP) y de claves duplicadas (MRP) **sí hacen fallar**
la sincronización, pero no pueden ocurrir con datos reales: Postgres no puede guardar un byte nulo y las claves
primarias y únicas impiden los duplicados. Se miden y se muestran como `(info, imposible con datos reales)`.

## Cuándo volver a ejecutarlas

- Después de cambiar `db/01_schema.sql`, `db/02_roles.sql`, la API (`coze-api/`) o el módulo de sincronización de una app.
- Antes de una demostración, para confirmar que todo sigue funcionando.
- Si el agente responde datos que no coinciden con lo que ves en las apps.
