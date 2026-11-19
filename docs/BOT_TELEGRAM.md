# Bot de consultas por Telegram

Un bot de Telegram que **responde con los datos reales** de las tres apps mediante comandos y botones. Es de **solo lectura**, no usa
inteligencia artificial (no cuesta nada, responde al instante y no puede inventar datos) y es privado: solo contesta a los chats que
tú autorices.

> No es un segundo Coze: no entiende preguntas libres. Para eso está el agente de Coze. El bot es el atajo para lo que más se pregunta.

## Qué puedes pedirle

| Comando | Qué responde |
|---|---|
| `/resumen` | Lo urgente del día y los cambios frente a hace 7 días (el mismo del resumen de la mañana) |
| `/proyectos` | Todos los proyectos, los atrasados primero. `/proyectos atrasado`, `/proyectos en curso`, `/proyectos torre` |
| `/materiales` | Materiales bajo su mínimo, con aviso si el inventario está casi sin cargar. `/materiales cemento` |
| `/pedidos` | Órdenes de compra abiertas; marca ⏰ las que ya debían haber llegado. `/pedidos parcial`, `/pedidos aceros` |
| `/propiedades` | Avisos recientes con filtros: `/propiedades venta miraflores casa hasta 300000`, `/propiedades alquiler san isidro` |
| `/frescura` | Hace cuánto sincronizó cada app (✅ menos de 24 h, 🟡 hasta 72 h, 🔴 más) |
| `/tendencias` | Qué cambió frente a hace 7 días (proyectos atrasados, pedidos vencidos, precios medianos…) |
| `/ayuda` | La lista de comandos |

Cada respuesta trae botones para pasar a otra consulta sin escribir. Si escribes una frase suelta, el bot te orienta a `/ayuda`.

## Cómo está protegido

- **Solo lectura.** Usa la misma cadena `coze_reader` y las mismas consultas fijas de la API: no puede escribir ni borrar nada
  (una prueba automática comprueba que el código no contiene SQL de escritura).
- **Privado.** Antes de leer cualquier dato comprueba que el chat esté en `TELEGRAM_CHATS_PERMITIDOS`. A cualquier otro le responde
  «este bot es privado» y su número de chat, sin datos.
- **Solo Telegram puede llamarlo.** Cada llamada debe traer el secreto del webhook (`TELEGRAM_WEBHOOK_SECRET`), comparado en tiempo
  constante; sin él responde 401.
- **Sin inyecciones.** Todo texto que viene de los datos (nombres, títulos) se escapa antes de enviarlo y los enlaces se validan.
- **Sin filtraciones.** Si la base falla, el chat recibe «no pude leer los datos»; el detalle técnico y el token nunca salen.
- **Límite de ráfagas.** Máximo 20 mensajes por minuto por chat.

## Ponerlo en marcha (una sola vez, ~10 minutos)

1. **Crear un bot nuevo** (distinto al del resumen diario). En Telegram abre **@BotFather** (el que tiene la marca azul ✓), escribe
   `/newbot`, elige nombre y un usuario que termine en `bot`. Guarda el **token**.
2. **Anotar los chats autorizados.** Tu número de chat ya lo tienes (el del resumen diario). Para sumar a otra persona: que le escriba
   «hola» al bot nuevo; el bot le responderá su número de chat y tú lo agregas a la lista.
3. **Crear 3 variables en Vercel** (proyecto `v1k-coze-api` → **Settings → Environment Variables**, entorno *Production*):

   | Variable | Valor |
   |---|---|
   | `TELEGRAM_BOT_COMANDOS_TOKEN` | el token del paso 1 |
   | `TELEGRAM_WEBHOOK_SECRET` | un texto largo y aleatorio (24 caracteres o más; solo letras, números, `_` y `-`) |
   | `TELEGRAM_CHATS_PERMITIDOS` | los números de chat separados por comas, por ejemplo `123456789,987654321` |

   Luego **Deployments → Redeploy** para que las tome. (`DATABASE_URL_READER` ya existe.)
4. **Conectar el bot con el webhook.** En `coze-api/`:

   ```powershell
   $env:TELEGRAM_BOT_COMANDOS_TOKEN = "<token>"; $env:TELEGRAM_WEBHOOK_SECRET = "<secreto>"
   node scripts/telegram-webhook.mjs --instalar
   ```

   Publica también el menú de comandos que aparece al escribir «/».
5. **Probar.** Abre el bot, escribe `/resumen`. Para ver el estado del webhook: `node scripts/telegram-webhook.mjs --info`
   (muestra mensajes pendientes y el último error de Telegram, nunca el token).

## Si algo falla

| Síntoma | Causa probable |
|---|---|
| El bot no responde nada | El webhook no está instalado (`--info` muestra «ninguno») o falta el *Redeploy* tras crear las variables |
| `--info` muestra «Last error: Wrong response… 503» | Falta alguna de las 3 variables en Vercel |
| `--info` muestra «…401» | El secreto de Vercel no coincide con el usado en `--instalar`: vuelve a instalar |
| El bot responde «Este bot es privado» | El número de chat no está en `TELEGRAM_CHATS_PERMITIDOS` |
| «No pude leer los datos ahora» | La base no respondió; reintenta. Si persiste, mira la vigilancia (Actions) |
| Quieres apagarlo | `node scripts/telegram-webhook.mjs --borrar` (o quita `TELEGRAM_CHATS_PERMITIDOS` en Vercel) |

## Cambiar el token o el secreto

Cambia el valor en Vercel, haz *Redeploy* y vuelve a ejecutar `--instalar` con los valores nuevos. Si el token se expuso, en
@BotFather usa `/revoke` y repite desde el paso 3.

## Para desarrolladores

- Lógica pura y probada sin red: `coze-api/lib/telegram.js` (`procesarUpdate`, `crearManejador`). Endpoint: `coze-api/api/telegram.js`.
- Pruebas: `coze-api/test/telegram.test.mjs`; el endpoint real también se comprueba en la batería A.
- Agregar un comando: una función en `COMANDOS` y su nombre en `NOMBRES_COMANDOS` (el menú de Telegram y las pruebas lo toman de ahí).
