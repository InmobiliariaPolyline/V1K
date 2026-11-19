# Operación: pruebas automáticas, vigilancia y qué hacer cuando algo falla

Este repositorio es **público**: ni el registro de las ejecuciones ni las incidencias deben llevar datos del negocio ni el token.
Todo lo de aquí abajo respeta eso.

## 1. Qué corre solo

| Qué | Cuándo | Para qué | Dónde se ve |
|---|---|---|---|
| **CI** (`.github/workflows/ci.yml`) | En cada push a `main` y en cada solicitud de cambios | Corre `npm test` de `coze-api` (7 suites sin red) con Node 20 y 22, y verifica que no se versionen secretos | Pestaña **Actions** y la marca ✓/✗ de cada commit |
| **Vigilancia** (`.github/workflows/vigilancia.yml`) | Cada 6 horas (y a mano: **Actions → Vigilancia → Run workflow**) | Comprueba desde fuera que la API y el panel respondan y que cada app haya sincronizado hace poco | Pestaña **Actions** y la etiqueta **vigilancia** en **Issues** |
| **Dependabot** (`.github/dependabot.yml`) | Semanal (npm) y mensual (acciones) | Abre solicitudes de cambios cuando hay versiones nuevas o vulnerabilidades | **Pull requests**, etiqueta *dependencias* |

Las baterías contra el sistema real (`tests-integracion/`) **no** corren en el CI porque necesitan credenciales de la base: se lanzan a mano.

## 2. Activar la vigilancia (una sola vez)

1. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
2. Nombre: `API_TOKEN`. Valor: el mismo token de la API que está en Vercel y en Coze (sin la palabra `Bearer`).
3. Ve a **Actions → Vigilancia → Run workflow** y comprueba que termina en verde. En el registro verás una línea como
   `API 1694 ms · mrp 20.8 h · planner 18.3 h · scraper 3.5 h` y `Todo en orden.`

Si ves «Falta el secreto API_TOKEN», el paso 2 no se hizo bien.

## 3. Qué se vigila y cuándo salta la alarma

| Pieza | Límite | Por qué ese límite |
|---|---|---|
| **Scraper** sin sincronizar | **30 h** (aviso desde las 22.5 h) | Corre solo, varias veces al día |
| **Planner** / **MRP** sin sincronizar | **96 h** (aviso desde las 72 h) | Sincronizan al guardar datos o al arrancar: un fin de semana largo sin uso es normal |
| API | Sin respuesta tras 3 intentos, o token rechazado | La API y la base pueden tardar en despertar: se reintenta antes de alarmar |
| Panel | `/` o `/js/app.js` no responden | Es la cara visible del sistema |
| Latencia | Más de 5 s (solo aviso) | Suele ser pasajero |

Se pueden cambiar sin tocar el código con variables del flujo: `UMBRAL_SCRAPER_H`, `UMBRAL_PLANNER_H`, `UMBRAL_MRP_H`.

**Qué pasa cuando hay un error:** se abre una incidencia con la etiqueta **vigilancia** (GitHub te avisa por correo), la ejecución
queda marcada como fallida y, cada 6 horas, el texto de la incidencia se actualiza. **Cuando todo vuelve a la normalidad, la
incidencia se cierra sola.** Los avisos (🟡) por sí solos no abren incidencias.

## 4. Qué hacer según el problema

| Código | Qué significa | Qué hacer |
|---|---|---|
| `api-token` | La API rechazó el token | El secreto `API_TOKEN` de GitHub no coincide con el de Vercel. Corrígelo (ver «Rotar el token» abajo) |
| `api-caida` | La API no responde | Mira **Vercel → Deployments** (¿falló el último despliegue?) y **Neon** (¿la base está activa y con cuota?). Si el último despliegue es el culpable, reviértelo desde Vercel |
| `panel` / `panel-js` | El panel o su JavaScript no cargan | Casi siempre un despliegue roto: **Vercel → Deployments → Promote** el anterior |
| `sync-scraper` | El Scraper lleva más de 30 h sin sincronizar | Revisa que el flujo de ingesta del Scraper (GitHub Actions / Netlify) esté corriendo y que exista `CENTRAL_DATABASE_URL` en Netlify |
| `sync-planner` | El Planner no sincroniza | Revisa su servicio en Render (¿dormido o caído?) y los registros: busca «vista central». Guardar un dato o reiniciar lo fuerza |
| `sync-mrp` | El MRP no sincroniza | Revisa la app en Streamlit y `CENTRAL_DATABASE_URL` en sus secretos |
| `api-lenta` | Tardó más de 5 s | Solo un aviso. Si se repite, mira la latencia en el panel (**Sistema**) y en Neon |

Después de arreglarlo, no hace falta hacer nada más: la siguiente vigilancia cierra la incidencia. Para comprobarlo antes, lanza el flujo a mano.

## 5. Rotar el token de la API

Hazlo si el token se filtró o cada cierto tiempo:

1. Genera uno nuevo (PowerShell): `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})`
2. **Vercel → Settings → Environment Variables → `API_TOKEN`**: pega el nuevo y **redespliega**.
3. **Coze → plugin Vista Central → Authorization**: cambia el valor a `Bearer <nuevo>` y vuelve a publicar el plugin si lo pide.
4. **GitHub → secreto `API_TOKEN`**: actualízalo.
5. Actualiza el archivo local `db/conexiones.local.txt` (no se versiona).
6. Comprueba con **Actions → Vigilancia → Run workflow** y con el panel (**Salir** y entrar con el nuevo token).

## 6. Leer un fallo del CI

1. Pestaña **Actions → CI**, abre la ejecución roja y el paso **Ejecutar las pruebas**.
2. Cada suite imprime `OK: …` al terminar; la que falla muestra el mensaje y la línea. Para repetirlo en tu máquina:
   `cd coze-api && npm ci && npm test`.
3. Fallos típicos: `openapi.yaml` desactualizado (corre `npm run openapi` y súbelo), una ilustración con cifras distintas a la tabla de pruebas
   del README, o la lista de archivos de arranque en `js/carga.js` (si agregas un `import` estático en `app.js`).

**Recomendado:** en **Settings → Branches → Add rule** para `main`, marca *Require status checks to pass* con **Pruebas (Node 20)** y
**Pruebas (Node 22)**. Así nada llega a `main` con las pruebas rotas.

## 7. Límites a tener presentes

- GitHub **desactiva los flujos programados tras 60 días sin actividad** en el repositorio. Si la vigilancia deja de correr, entra a
  **Actions** y pulsa *Enable workflow*.
- Los flujos programados pueden retrasarse unos minutos (más en horas punta); por eso corren al minuto 17 y no en punto.
- La vigilancia mira la **frescura** y la **disponibilidad**, no la calidad de los datos. Para eso están la batería D y
  [`CALIDAD_DE_DATOS.md`](CALIDAD_DE_DATOS.md).
