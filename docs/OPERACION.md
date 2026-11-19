# Operación: pruebas automáticas, vigilancia y qué hacer cuando algo falla

Este repositorio es **público**: ni el registro de las ejecuciones ni las incidencias deben llevar datos del negocio ni el token.
Todo lo de aquí abajo respeta eso.

## 1. Qué corre solo

| Qué | Cuándo | Para qué | Dónde se ve |
|---|---|---|---|
| **CI** (`.github/workflows/ci.yml`) | En cada push a `main` y en cada solicitud de cambios | Corre `npm test` de `coze-api` (10 suites sin red) con Node 20 y 22, y verifica que no se versionen secretos | Pestaña **Actions** y la marca ✓/✗ de cada commit |
| **Vigilancia** (`.github/workflows/vigilancia.yml`) | Cada 6 horas (y a mano: **Actions → Vigilancia → Run workflow**) | Comprueba desde fuera que la API y el panel respondan y que cada app haya sincronizado hace poco | Pestaña **Actions** y la etiqueta **vigilancia** en **Issues** |
| **Diario** (`.github/workflows/diario.yml`) | Cada mañana, 08:07 de Lima (y a mano) | Toma la foto diaria del historial en Neon y te manda el resumen por Telegram | **Actions → Diario** y tu chat de Telegram |
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

## 3b. Historial y resumen diario por Telegram

**Qué hace.** Una vez al día guarda en Neon una foto de los números que importan (tabla `central.historial_diario`) y te escribe por
Telegram un resumen: estado general, qué mirar primero, próximos hitos y llegadas, y los **cambios desde hace 7 días**. El panel usa
ese historial en la sección **Tendencias**. La foto la toma el rol `writer_historial` (solo lee las tablas centrales y escribe su tabla).

**Privacidad.** El repositorio es público y el registro de la ejecución también. Por eso los scripts solo escriben «foto tomada» y
«resumen enviado (N caracteres)»; el contenido viaja únicamente a Telegram. Nunca uses `--mostrar` dentro del flujo.

### Activarlo (una sola vez)

1. **Crear la tabla y el rol en Neon.** En el SQL Editor de Neon, con el rol dueño, ejecuta `db/03_historial.sql` **con una contraseña
   real en lugar de `CAMBIAR_POR_CONTRASENA_LARGA_5`** (el archivo local `db/03_historial.local.sql` ya la lleva; no se versiona).
   Es seguro repetirlo.
2. **Crear el bot de Telegram.** En Telegram busca **@BotFather**, escribe `/newbot`, elige un nombre y un usuario que termine en
   `bot`. Te dará un **token**. Abre tu bot y escríbele «hola».
3. **Saber el número de tu chat.** En `coze-api/`: `TELEGRAM_BOT_TOKEN=<tu token> node scripts/resumen-diario.mjs --buscar-chat`.
   Imprime algo como `chat 123456789 (private) Ana`: ese número es tu `TELEGRAM_CHAT_ID`.
4. **Crear 3 secretos nuevos** en GitHub (**Settings → Secrets and variables → Actions**; `API_TOKEN` ya existe):
   `HISTORIAL_DATABASE_URL` (la cadena de `writer_historial`, en `db/conexiones.local.txt`), `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`.
5. **Probarlo:** **Actions → Diario → Run workflow**. Debe terminar en verde, mostrar «Foto del día AAAA-MM-DD tomada.» y
   «Resumen enviado (N caracteres).», y el mensaje debe llegarte al celular.

Para **ver el mensaje en tu equipo** sin enviarlo: `API_TOKEN=<token> node scripts/resumen-diario.mjs --mostrar`.

### Si algo falla

| Síntoma | Causa probable |
|---|---|
| «Falta el secreto HISTORIAL_DATABASE_URL» | El secreto no existe o es muy corto |
| «No se pudo tomar la foto diaria: password authentication failed» | La contraseña del secreto no coincide con la del rol `writer_historial` |
| «No se pudo tomar la foto diaria: function … does not exist» | Falta ejecutar `db/03_historial.sql` en Neon |
| «Telegram respondió HTTP 401» | `TELEGRAM_BOT_TOKEN` incorrecto |
| «Telegram respondió HTTP 400» | `TELEGRAM_CHAT_ID` incorrecto, o no le escribiste «hola» al bot |
| El mensaje dice «Historial: se guarda una foto por día…» | Es normal los primeros días: los cambios aparecen con 2 días o más de historial |
| En el panel, Tendencias dice «El historial todavía no está activado» | Falta ejecutar `db/03_historial.sql` |

### Bot de consultas

Además del resumen de la mañana existe un **bot de consultas** (comandos y botones, solo lectura). Es otro bot y otra función de
Vercel (`/api/telegram`): se activa con 3 variables de Vercel, no con secretos de GitHub. Guía completa: [`BOT_TELEGRAM.md`](BOT_TELEGRAM.md).

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
