# V1K — Agente de Coze sobre una vista central

Un asistente en **Coze** al que se le pregunta en lenguaje natural por el estado de las obras, los materiales y las
propiedades, y responde con un resumen de tres aplicaciones a la vez, sin esperar a que ninguna "despierte".

> *"¿Cómo van mis proyectos? ¿Qué materiales están bajos? ¿Qué propiedades nuevas hay en Miraflores?"*

## Cómo funciona

```
Planner (Render)  ─┐
MRP (Streamlit)   ─┼─ cada app copia un RESUMEN ─► Neon: esquema `central` ◄─ coze-api (Vercel) ◄─ Coze
Scraper (Netlify) ─┘      (rol writer_<app>)                                  (rol coze_reader)
```

Las apps están en servicios gratuitos que se duermen de 20 a 90 segundos. En vez de que Coze las llame una por una,
cada app guarda un resumen en una base central (Neon) que nunca duerme, y Coze solo **lee** de ella a través de una
API pequeña y de solo lectura.

## Contenido

| Carpeta o archivo | Qué es |
|---|---|
| [`db/01_schema.sql`](db/01_schema.sql) | Esquema `central`: una tabla-resumen por app, control de frescura y vista de stock bajo |
| [`db/02_roles.sql`](db/02_roles.sql) | Roles de Neon: `coze_reader` (solo lectura) y un `writer_*` por app, cada uno limitado a sus tablas |
| [`coze-api/`](coze-api) | API de solo lectura para Coze (función serverless de Vercel) con pruebas |
| [`docs/GUIA_PUESTA_EN_MARCHA.md`](docs/GUIA_PUESTA_EN_MARCHA.md) | Orden de despliegue, variables por app, qué se copia, cómo revertir y limitaciones |
| [`tests-integracion/`](tests-integracion) | Baterías de pruebas contra el sistema real (API, permisos de los roles, sincronización de cada app, integridad de los datos) |
| [`patches/`](patches) | Los cambios de sincronización de las 3 apps como parches de Git (ver abajo) |
| `apps/` | *No está en este repositorio.* Copias de trabajo de los repos de las apps (ver abajo) |

## Las tres apps conectadas

La sincronización vive en cada repo, en la rama `feature/sync-vista-central`:

| App | Repositorio | Pila | Módulo |
|---|---|---|---|
| Scraper inmobiliario | `InmobiliariaPolyline/REAL_ESTATE_SCRAPER` | TypeScript, Netlify, Neon | `api/vistaCentral.ts` |
| Project Planner | `InmobiliariaPolyline/planner-backend` | Express, Prisma, Render, Neon | `src/lib/vistaCentral.ts` |
| Sistema MRP | `InmobiliariaPolyline/Sistema-MRP-EDC-VII` | Python, Streamlit, Supabase | `utils/vista_central.py` |

Para trabajar con ellas en local:

```bash
mkdir apps && cd apps
git clone https://github.com/InmobiliariaPolyline/REAL_ESTATE_SCRAPER.git
git clone https://github.com/InmobiliariaPolyline/planner-backend.git
git clone https://github.com/InmobiliariaPolyline/Sistema-MRP-EDC-VII.git
```

## Principios de diseño

- **Coze nunca escribe** y nunca ve credenciales de las apps: solo llama a la API con un token.
- **Todo apagado por defecto:** las apps sincronizan solo si existe `CENTRAL_DATABASE_URL`.
- **Un fallo de sincronización nunca rompe una app.** Es en segundo plano, con límite de tiempo e idempotente.
- **Solo resúmenes.** Sin presupuestos, precios, usuarios, contactos ni adjuntos.
- **Mínimo privilegio:** si una credencial se filtra, solo se afecta el resumen de esa app.

## Pruebas

```bash
cd coze-api && npm install && npm test   # autenticación + cada consulta contra db/01_schema.sql en un Postgres de prueba
```

Las pruebas de la sincronización de cada app están en su propio repositorio.

## Estado

Escrito y probado en local. **Pendiente:** ejecutar el esquema en Neon, desplegar `coze-api`, configurar las
variables de entorno y crear el plugin en Coze. Ver [`docs/GUIA_PUESTA_EN_MARCHA.md`](docs/GUIA_PUESTA_EN_MARCHA.md).

## Contexto

Proyecto final de la pasantía.
