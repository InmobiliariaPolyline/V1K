# API de solo lectura para Coze

Coze llama a esta API con un token. La API consulta Neon como `coze_reader`
(solo `SELECT`). Coze nunca ve la cadena de conexión.

```
Coze  --Bearer token-->  /api/<vista>  --coze_reader-->  Neon (esquema central)
```

## Endpoints (todos GET)

| Ruta | Qué devuelve | App |
|---|---|---|
| `/api/proyectos` | Proyectos con estado, avance, tareas atrasadas y próximo hito (atrasados primero) | Planner |
| `/api/hitos` | Próximas fechas clave con el nombre del proyecto | Planner |
| `/api/stock-bajo` | Materiales en o bajo su mínimo y cuánto falta | MRP |
| `/api/pedidos` | Órdenes de compra abiertas y su llegada estimada | MRP |
| `/api/propiedades?q=` | Las 50 propiedades más recientes (búsqueda opcional) | Scraper |
| `/api/propiedades-resumen` | Total del catálogo por portal y operación | Scraper |
| `/api/frescura` | Última sincronización de cada app | todas |

## Despliegue en Vercel

1. En Neon ya debes haber corrido `01_schema.sql` y `02_roles.sql` (carpeta `db/` del repositorio).
2. Copia la cadena de conexión **pooled** de `coze_reader` (host con `-pooler`).
3. Genera un token aleatorio (PowerShell):
   ```powershell
   -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})
   ```
4. Sube esta carpeta a Vercel (`vercel` desde `coze-api`, o conecta el repositorio).
5. En Vercel → Settings → Environment Variables, crea (solo Production):
   - `DATABASE_URL_READER` = la cadena de `coze_reader`
   - `API_TOKEN` = el token del paso 3
6. Redespliega y prueba:
   ```bash
   curl -H "Authorization: Bearer TU_TOKEN" https://TU-PROYECTO.vercel.app/api/frescura
   ```
   Sin cabecera debe responder 401.

## Conectar Coze (verifica los nombres en tu versión de Coze)

1. Plugins → Create plugin → **Create from existing service** (o importa `openapi.yaml`
   después de cambiar el dominio).
2. Autorización tipo **Service**, enviar el token como cabecera `Authorization`
   con valor `Bearer TU_TOKEN`.
3. Prueba cada herramienta en el editor del plugin y publícalo.
4. En el agente, añade el plugin y pega en las instrucciones algo como:
   "Antes de responder sobre proyectos, materiales o propiedades usa las
   herramientas del plugin. Si `frescura` muestra datos de más de 2 días, avísalo.
   Nunca inventes datos; si la herramienta falla, dilo."

## Pruebas locales

```bash
npm install
npm test        # sin base de datos real: comprueba la autenticación y cada consulta contra db/01_schema.sql en un Postgres de prueba
```

## Seguridad

- Lista cerrada de consultas: el cliente no puede enviar SQL.
- Solo `GET`; token comparado en tiempo constante; tokens de menos de 24 caracteres se rechazan.
- Si el token se filtra: cambia `API_TOKEN` en Vercel y en Coze. Si la cadena de Neon
  se filtra: cambia la contraseña de `coze_reader` en Neon.
