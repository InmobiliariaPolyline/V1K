# Vista central para el agente de Coze: puesta en marcha

<img src="assets/arquitectura.svg" alt="Arquitectura" width="100%" />

Todo es **opcional y apagado por defecto**: las apps solo sincronizan si existe `CENTRAL_DATABASE_URL`. Sin esa
variable se comportan exactamente como antes.

## Estado

| Pieza | Dónde | Estado |
|---|---|---|
| Base central | Neon, esquema `central` | En producción |
| API de solo lectura | Vercel (`coze-api/`) | En producción |
| Sincronización del Planner | Render, `planner-backend` (PR #1) | En producción |
| Sincronización del MRP | Streamlit, `Sistema-MRP-EDC-VII` (PR #2, #3 y #4) | En producción |
| Sincronización del Scraper | Netlify, `REAL_ESTATE_SCRAPER` (PR #1 y #2) | En producción |
| Plugin y agente | Coze | Creados; falta la prueba conversacional (créditos) |

## Orden recomendado (para reproducirlo desde cero)

1. **Neon (base central).** Crea un proyecto nuevo, solo para esto. En el *SQL Editor* ejecuta `db/01_schema.sql` y luego
   `db/02_roles.sql`, **cambiando antes las 4 contraseñas de ejemplo** por valores largos, aleatorios y distintos.
2. **Cadenas de conexión.** En Neon copia el host *pooled* (el que lleva `-pooler`) y arma una cadena por rol:
   `postgresql://ROL:CONTRASEÑA@HOST/neondb?sslmode=require`. No las pegues en chats ni en Git.
3. **Variables de entorno** (cada una solo en el servidor de su servicio):

   | Servicio | Variable | Valor |
   |---|---|---|
   | Vercel (`coze-api`) | `DATABASE_URL_READER` | cadena de `coze_reader` |
   | Vercel (`coze-api`) | `API_TOKEN` | token aleatorio de 32 caracteres o más |
   | Render (Planner) | `CENTRAL_DATABASE_URL` | cadena de `writer_planner` |
   | Netlify (Scraper) | `CENTRAL_DATABASE_URL` | cadena de `writer_scraper` |
   | Streamlit (MRP), en *Secrets* | `CENTRAL_DATABASE_URL = "…"` | cadena de `writer_mrp`, **entre comillas** (formato TOML) |

4. **Vercel.** Importa el repositorio, con *Root Directory* `coze-api` y *Framework Preset* `Other`. En
   *Deployment Protection* desactiva **Vercel Authentication**, o Coze no podrá llamar a la API (ya se protege con su token).
5. **Comprobar la API:** `GET /api/frescura` con `Authorization: Bearer <API_TOKEN>`. Sin token debe responder 401.
6. **Coze.** Crea un plugin con *Cloud Plugin → Create based on existing services*, importando `coze-api/openapi.yaml`;
   autorización *Service token / API key* en la cabecera `Authorization` con el valor `Bearer <API_TOKEN>`. Prueba y
   habilita cada herramienta, publica el plugin y añádelo a un agente con [`INSTRUCCIONES_AGENTE.md`](INSTRUCCIONES_AGENTE.md).
7. **Comprobar el conjunto:** ejecuta las baterías de [`tests-integracion/`](../tests-integracion).

## Qué se copia y qué no

| App | Se copia | NO se copia |
|---|---|---|
| Planner | nombre, responsable, estado, avance, fechas, tareas atrasadas, hitos | presupuesto, equipo, enlaces públicos, logotipos, usuarios |
| MRP | materiales con stock mínimo (stock, mínimo, faltante) y órdenes abiertas (proveedor, obra, llegada, cantidades) | precios, contactos de proveedores, trabajadores, usuarios, adjuntos |
| Scraper | las 200 propiedades más recientes (sin descripción, dirección, coordenadas ni publicador) y totales por portal | usuarios, suscripciones, sesiones, auditoría |

## Cuándo sincroniza cada app

| App | Cuándo |
|---|---|
| Planner | Al arrancar el servidor y tras cualquier escritura exitosa (con 5 s de espera para agrupar ediciones) |
| MRP | Al arrancar la app y tras cada cambio de stock, de stock mínimo, de órdenes o de obras |
| Scraper | Tras guardar avisos (ingesta propia y carga con Apify), como máximo una vez por minuto |

## Cómo se comporta si algo falla

- La sincronización corre en segundo plano, con límite de tiempo, y **un error nunca rompe** guardar un aviso, editar un
  proyecto o registrar un movimiento: solo deja una línea de aviso en los registros, sin credenciales.
- Cada sincronización es idempotente: repetirla no duplica nada, y si la base central cae, el siguiente cambio la repone.
- `GET /api/frescura` dice cuándo sincronizó cada app: si un dato está viejo, el agente puede avisarlo.

## Cómo revertir

- Quitar la variable `CENTRAL_DATABASE_URL` apaga la sincronización de esa app al instante.
- Revocar un rol en Neon (`DROP ROLE writer_mrp;`) corta el acceso de esa app sin tocar las demás.
- Las apps no tienen migraciones en sus bases: no hay nada que deshacer allí.

## Qué hay que actualizar si cambias una credencial

| Si cambias… | Actualiza… |
|---|---|
| Contraseña de `neondb_owner` | Nada: ningún servicio la usa |
| Contraseña de `coze_reader` | `DATABASE_URL_READER` en Vercel y vuelve a desplegar |
| Contraseña de un `writer_*` | `CENTRAL_DATABASE_URL` de esa app |
| `API_TOKEN` | Vercel y la autorización del plugin en Coze |

## Limitaciones conocidas

- **Scraper:** al limitarse a una sincronización por minuto, los avisos del último minuto de una ingesta pueden quedar
  sin copiar hasta la siguiente. Una mejora posible es que la función `scraper-watchdog` (cada 6 horas) también sincronice.
- **Planner:** el estado (*atrasado*, *en curso*…) y las tareas atrasadas se calculan **al sincronizar**; si pasan días
  sin escrituras, el valor no cambia hasta la siguiente sincronización o arranque.
- **MRP:** casi todo el catálogo tiene stock mínimo y existencias en cero, así que casi todo figura como stock bajo.
  La API devuelve solo los 25 con mayor faltante.
- **Render y Streamlit se duermen:** la sincronización de arranque ocurre cuando despiertan, no antes.
- **Fechas:** las columnas de fecha llegan como `2026-10-30T00:00:00.000Z`; el agente las muestra como DD/MM/AAAA.
