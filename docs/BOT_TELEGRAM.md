# Bot de consultas por Telegram

Un bot de Telegram que **responde con los datos reales** de las tres apps mediante comandos y botones. Es de **solo lectura**, no usa
inteligencia artificial (no cuesta nada, responde al instante y no puede inventar datos) y es privado: solo contesta a los chats que
tú autorices.

> **Para quien lo va a usar** (registrarse en Telegram, buscar los bots, pedir acceso): [`TELEGRAM_PASO_A_PASO.md`](TELEGRAM_PASO_A_PASO.md).
> Esta página es para quien lo **administra**. Además de este bot existe el **bot del resumen diario** (`@v1k_asistente_bot`), que solo envía.

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

## Dar o quitar acceso a una persona (módulo «Accesos» del panel)

La persona se registra en Telegram, busca `@v1k_consultas_bot`, pulsa **Iniciar** y el bot le contesta su **número de chat**. Ella te envía ese número
y su teléfono (guía para ella: [`TELEGRAM_PASO_A_PASO.md`](TELEGRAM_PASO_A_PASO.md)). Tú:

1. Abre el panel (https://v1k-coze-api.vercel.app) y entra a **Accesos de Telegram** (menú «Sistema», atajo **U**).
2. Pega tu **token de administrador** (`ADMIN_TOKEN`; es distinto del token de solo lectura del panel). Solo se guarda en memoria, en esa pestaña.
3. Escribe **nombre, teléfono y número de chat** y pulsa **Dar acceso**. Si la persona ya había pulsado «Iniciar», el bot le avisa que ya tiene acceso.
4. Desde ese momento usa el bot (en menos de 15 segundos) y recibe el resumen de la mañana. No hace falta tocar Vercel ni GitHub, ni hacer *Redeploy*.

En la misma pantalla: **Revocar** (sin acceso, pero queda en la lista), **Reactivar** y **Quitar** (la borra). Máximo 50 personas.

| Dato | Para qué sirve |
|---|---|
| Número de chat | Es lo que **autoriza**: Telegram identifica a las personas por él. Es el mismo para los dos bots. |
| Teléfono | Solo es un dato de **tu registro**: Telegram no permite comprobarlo desde un bot, así que no autoriza a nadie. |
| Nombre | Para reconocer a la persona en la lista. |

**Quién ve qué.** La tabla con nombres y teléfonos (`central.telegram_accesos`) solo la toca el rol `writer_accesos`, y solo desde el módulo. El bot y el resumen
diario leen únicamente la lista de números de chat activos (vista `v_telegram_chats_activos`); Coze y el panel de datos no la ven.

**Administradores fijos.** Los números de `TELEGRAM_CHATS_PERMITIDOS` (Vercel) y `TELEGRAM_CHAT_ID` (GitHub) siguen funcionando sin aparecer en la lista del módulo: son tu
acceso de respaldo si el módulo o la base fallan. Si la base falla, el bot atiende solo a esos administradores (nadie entra por error).

## Activar el módulo «Accesos» (una sola vez)

1. **Crear la tabla y el rol en Neon.** En el SQL Editor, con el rol dueño, ejecuta `db/04_accesos.sql` **con una contraseña real en lugar de
   `CAMBIAR_POR_CONTRASENA_LARGA_6`** (el archivo local `db/04_accesos.local.sql` ya la lleva; no se versiona). Es seguro repetirlo.
2. **Crear 2 variables en Vercel** (*Production*, tipo *Secret*): `DATABASE_URL_ACCESOS` (la cadena de `writer_accesos`) y `ADMIN_TOKEN` (largo y aleatorio,
   32 caracteres o más). Ambas están en `db/conexiones.local.txt`. Luego **Redeploy**.
3. **Probar:** panel → **Accesos de Telegram** → pega el `ADMIN_TOKEN`. Debe mostrar la lista vacía y el formulario.
4. Si quieres que el resumen de la mañana también llegue a las personas del módulo, el flujo **Diario** ya usa `HISTORIAL_DATABASE_URL` para leer la lista
   (no hay que crear secretos nuevos: el rol `writer_historial` recibe lectura de la vista en el mismo SQL).

**Seguridad del módulo.** Sin el token de administrador no se ve ni se cambia nada (401). El token de lectura de Coze **no** sirve aquí. Los datos se validan, hay un tope de 50
personas y los errores de la base nunca llegan al navegador. Para cambiar el token: nuevo valor en Vercel → *Redeploy*.

## Si algo falla

| Síntoma | Causa probable |
|---|---|
| El bot no responde nada | El webhook no está instalado (`--info` muestra «ninguno») o falta el *Redeploy* tras crear las variables |
| `--info` muestra «Last error: Wrong response… 503» | Falta alguna de las 3 variables en Vercel |
| `--info` muestra «…401» | El secreto de Vercel no coincide con el usado en `--instalar`: vuelve a instalar |
| El bot responde «Este bot es privado» | El número de chat no está en `TELEGRAM_CHATS_PERMITIDOS` |
| «No pude leer los datos ahora» | La base no respondió; reintenta. Si persiste, mira la vigilancia (Actions) |
| El módulo dice «no está configurado en el servidor» | Faltan `ADMIN_TOKEN` o `DATABASE_URL_ACCESOS` en Vercel, o falta el *Redeploy* |
| El módulo dice «Token de administrador incorrecto» | Estás usando el token de lectura u otro: usa el valor de `ADMIN_TOKEN` |
| El módulo dice «no pudo usar la base de datos» | Falta ejecutar `db/04_accesos.sql` en Neon, o la contraseña de `DATABASE_URL_ACCESOS` no coincide con la del rol |
| Di acceso a alguien pero el bot le dice «privado» | Espera unos segundos (la lista se refresca cada 15 s) y comprueba que el número de chat sea el que el bot le mostró |
| Quieres apagarlo | `node scripts/telegram-webhook.mjs --borrar` (o quita `TELEGRAM_CHATS_PERMITIDOS` en Vercel) |

## Cambiar el token o el secreto

Cambia el valor en Vercel, haz *Redeploy* y vuelve a ejecutar `--instalar` con los valores nuevos. Si el token se expuso, en
@BotFather usa `/revoke` y repite desde el paso 3.

## Para desarrolladores

- Lógica pura y probada sin red: `coze-api/lib/telegram.js` (`procesarUpdate`, `crearManejador`). Endpoint: `coze-api/api/telegram.js`.
- Pruebas: `coze-api/test/telegram.test.mjs`; el endpoint real también se comprueba en la batería A.
- Agregar un comando: una función en `COMANDOS` y su nombre en `NOMBRES_COMANDOS` (el menú de Telegram y las pruebas lo toman de ahí).
