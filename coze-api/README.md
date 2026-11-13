# API de solo lectura y panel web

Coze llama a esta API con un token. La API consulta Neon como `coze_reader` (solo `SELECT`) y Coze nunca ve la cadena de
conexión. La misma API alimenta el **Panel V1K**, una interfaz web que está en la raíz del dominio.

```
Coze / Panel  --Bearer token-->  /api/<vista>  --coze_reader-->  Neon (esquema central)
```

## Endpoints (todos GET)

Cada vista acepta solo los filtros de la tabla. Un valor no válido responde **400** con un mensaje que explica qué se acepta;
los parámetros desconocidos se ignoran. Todas aceptan `limite` (entero entre 1 y el máximo de la vista).

| Ruta | Qué devuelve | Filtros | Límite (defecto / máx.) |
|---|---|---|---|
| `/api/resumen-general` | **Todo el panorama en una llamada**: proyectos por estado y atrasados, próximos hitos, stock, pedidos, propiedades por portal y frescura | — | — |
| `/api/proyectos` | Proyectos con estado, avance, tareas atrasadas y próximo hito (atrasados primero) | `estado` (`por iniciar`, `en curso`, `atrasado`, `terminado`), `q` | 200 / 200 |
| `/api/hitos` | Fechas clave con el nombre del proyecto | `proyecto`, `desde`, `hasta` (AAAA-MM-DD) | 200 / 200 |
| `/api/stock-bajo` | Materiales en o bajo su mínimo, por mayor faltante | `categoria`, `q` | 25 / 100 |
| `/api/pedidos` | Órdenes de compra abiertas y su llegada estimada | `estado` (`pendiente`, `enviada`, `parcial`), `q` | 200 / 200 |
| `/api/propiedades` | Propiedades recientes del scraper | `q`, `operacion` (`VENTA`, `ALQUILER`), `inmueble`, `distrito`, `portal`, `precio_min_usd`, `precio_max_usd` | 50 / 100 |
| `/api/propiedades-resumen` | Total del catálogo por portal y operación | `portal`, `operacion` | 50 / 50 |
| `/api/frescura` | Última sincronización de cada app y hace cuántas horas (`hace_horas`) | — | 10 / 10 |

Ejemplo:

```bash
curl -H "Authorization: Bearer TU_TOKEN" \
  "https://TU-PROYECTO.vercel.app/api/propiedades?operacion=VENTA&distrito=Miraflores&precio_max_usd=200000&limite=5"
```

La respuesta siempre es `{ vista, generado_en, total, datos }`. **`generado_en` es solo la hora de la consulta**, no indica qué tan
actuales son los datos: para eso está `frescura`.

## Panel web

La raíz (`/`) sirve el **Panel V1K** desde `public/`. Pide el token, lo valida con una consulta barata y abre nueve
secciones: Inicio, Proyectos (tarjetas, línea de tiempo o tabla), Calendario, Materiales, Pedidos, Propiedades, Explorador de
API, Agente de Coze y Sistema. Sin token se puede explorar con **datos de ejemplo** (modo demostración, sin llamar a la API).
No usa librerías ni recursos externos, y el token se queda en el navegador (`sessionStorage`; `localStorage` solo si se marca
«Recordar»).

```
public/
├── index.html            cascarón: menú, barra, sprite de iconos y formulario de entrada
├── css/                  carga.css (pantalla de carga, autónoma), base.css (tokens y estructura), componentes.css, vistas.css
├── js/carga.js           pantalla de carga: barra de progreso real (archivos descargados + etapas del panel)
├── js/app.js             enrutador por hash, menú, paleta de comandos y atajos
├── js/nucleo/            dom, formato, rutas, estado, api, demo, gráficos, componentes e insights (alertas)
├── js/vistas/            un módulo por sección: export default { montar(ctx) }
└── vistas.json           descripción de las vistas (se genera con `npm run openapi`)
```

- Las vistas `stock-categorias` y `propiedades-distritos` existen **solo para los gráficos del panel**: llevan `panel: true`
  en `lib/vistas.js`, no entran en `openapi.yaml` y el agente de Coze no las ve (así sigue con 8 herramientas).
- El Explorador de API y el modo demostración leen `vistas.json`, así que un filtro nuevo en `lib/vistas.js` aparece solo.
- Para verlo en local con las mismas cabeceras de seguridad que Vercel: `npm run panel` y abre http://localhost:4173
  (en local no hay `/api`: usa el modo demostración). Con `RETARDO=450 npm run panel` cada archivo tarda 450 ms más y se ve la pantalla de carga como con una conexión lenta.

`vercel.json` sirve `public/` y añade las cabeceras de seguridad (CSP estricta, `X-Frame-Options`, `nosniff`,
`Referrer-Policy`, `Permissions-Policy`).

## Contrato OpenAPI

`openapi.yaml` **se genera** desde `lib/vistas.js` (la fuente de las consultas y de los filtros):

```bash
npm run openapi
```

Una prueba falla si el archivo está desactualizado. Si cambias un filtro, hay que **volver a importar el contrato** en el
plugin de Coze (ver [`../docs/coze/GUIA_SKILLS.md`](../docs/coze/GUIA_SKILLS.md)).

## Despliegue en Vercel

1. En Neon ya debes haber corrido `01_schema.sql` y `02_roles.sql` (carpeta `db/` del repositorio).
2. Copia la cadena de conexión **pooled** de `coze_reader` (host con `-pooler`).
3. Genera un token aleatorio (PowerShell):
   ```powershell
   -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})
   ```
4. Importa el repositorio en Vercel con *Root Directory* `coze-api` y *Framework Preset* `Other`.
5. En Vercel → Settings → Environment Variables, crea (solo Production):
   - `DATABASE_URL_READER` = la cadena de `coze_reader`
   - `API_TOKEN` = el token del paso 3
6. En *Deployment Protection* desactiva **Vercel Authentication** (la API ya se protege con su token).
7. Redespliega y prueba:
   ```bash
   curl -H "Authorization: Bearer TU_TOKEN" https://TU-PROYECTO.vercel.app/api/frescura
   ```
   Sin cabecera debe responder 401. La raíz del dominio debe mostrar el panel.

## Conectar Coze

Importa `openapi.yaml` como plugin (*Cloud Plugin → Create based on existing services*), con autorización
*Service token / API key* en la cabecera `Authorization` y el valor `Bearer TU_TOKEN`. Prueba y habilita cada herramienta, publica
el plugin y añádelo al agente. La configuración completa (instrucciones, preguntas iniciales, atajos y glosario) está en
[`../docs/coze/GUIA_SKILLS.md`](../docs/coze/GUIA_SKILLS.md).

## Pruebas locales

```bash
npm install
npm test
```

Cinco suites, sin red: humo (autenticación, métodos, nombres heredados), cada consulta y cada filtro contra
`db/01_schema.sql` en un Postgres de prueba (PGlite), el manejo de filtros no válidos, que `openapi.yaml` esté al día y el panel
(funciones puras, modo demostración con las mismas reglas que la API, y comprobaciones estáticas de CSP, XSS, importaciones,
iconos y estilos). Las baterías contra el sistema real están en [`../tests-integracion/`](../tests-integracion).

## Seguridad

- **Lista cerrada de consultas:** el cliente no puede enviar SQL. Los filtros se declaran en `lib/vistas.js`, se validan (valores
  permitidos, números, fechas) y viajan siempre como parámetros; `limite` se valida como entero dentro del rango de la vista.
- Solo `GET`; token comparado en tiempo constante; los tokens de menos de 24 caracteres se rechazan.
- El texto de búsqueda se sanea: sin caracteres de control y con `%`, `_` y `\` tratados como texto literal.
- Si el token se filtra: cambia `API_TOKEN` en Vercel y en la autorización del plugin de Coze. Si la cadena de Neon se filtra:
  cambia la contraseña de `coze_reader` en Neon y `DATABASE_URL_READER` en Vercel.
