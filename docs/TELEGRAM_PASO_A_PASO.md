# Telegram para V1K — guía paso a paso

Esta guía es para **quien va a usar los bots**, aunque nunca haya usado Telegram. En unos 10 minutos tendrás tu cuenta, encontrarás
los dos bots y sabrás qué pedirles. No necesitas saber de programación.

<img src="assets/telegram-registro.svg" alt="Los seis pasos: instalar Telegram, registrarte con tu teléfono, buscar el bot, pulsar Iniciar, copiar tu número de chat y enviárselo al administrador" width="100%" />

## Los dos bots

V1K tiene **dos bots**. Hacen cosas distintas y los dos son de **solo lectura**: no pueden cambiar ni borrar nada.

<img src="assets/telegram-bots.svg" alt="Dos bots: el asistente envía el resumen cada mañana a las 08:07 y el de consultas responde cuando le escribes" width="100%" />

| | **Resumen diario** | **Consultas** |
|---|---|---|
| Usuario para buscarlo | **`@v1k_asistente_bot`** (puede verse como «v1kbot») | **`@v1k_consultas_bot`** |
| Enlace directo | [t.me/v1k_asistente_bot](https://t.me/v1k_asistente_bot) | [t.me/v1k_consultas_bot](https://t.me/v1k_consultas_bot) |
| Qué hace | Te **escribe solo** cada mañana a las 08:07 (hora de Lima) con lo urgente del día | **Tú le preguntas** con botones o comandos y responde al instante |
| Tienes que… | Pulsar **Iniciar** una sola vez | Pulsar **Iniciar** y usar los botones |
| Responde si le escribes | No: es solo un buzón de avisos | Sí |

## Paso 1 · Instalar Telegram

- **Celular Android:** abre *Play Store*, busca **Telegram** (el del avión de papel blanco sobre fondo azul) e instálalo.
- **iPhone:** *App Store*, busca **Telegram Messenger**.
- **Computadora:** entra a [telegram.org](https://telegram.org) y descarga *Telegram Desktop* (Windows o Mac). También funciona en
  [web.telegram.org](https://web.telegram.org).

Es gratis y no tiene publicidad molesta.

## Paso 2 · Registrarte con tu número

1. Abre la aplicación y pulsa **Empezar a chatear** (*Start Messaging*).
2. Escribe tu número de celular **con el código de país** (Perú: `+51` y tus 9 dígitos).
3. Telegram te enviará un **código** por mensaje de texto o dentro de otra sesión de Telegram. Escríbelo en la pantalla.
4. Escribe tu nombre (el que verán tus contactos) y, si quieres, una foto.
5. Acepta el permiso de notificaciones: así te llegará el resumen de la mañana. El de contactos puedes negarlo.

> **Cuidado:** el código de verificación es personal. **Nunca se lo des a nadie**, ni siquiera a alguien que diga ser de Telegram o de V1K.

## Paso 3 · Buscar los bots

1. En la pantalla principal toca la **lupa** (arriba).
2. Escribe `v1k_consultas_bot` y toca el resultado.
3. Repite con `v1k_asistente_bot`.

**Para no equivocarte:** existen cuentas falsas con nombres parecidos. Comprueba que debajo del nombre aparezca **exactamente**
`@v1k_consultas_bot` o `@v1k_asistente_bot`, letra por letra. Más seguro aún: toca los enlaces de la tabla de arriba y se abre el chat
correcto. Si tienes dudas, pídele el enlace al administrador.

## Paso 4 · Pulsar «Iniciar»

Dentro del chat del bot toca el botón azul **INICIAR** (*START*) de abajo. Sin este paso el bot no puede escribirte.

La **primera vez**, el bot de consultas te responderá algo así:

> 🔒 Este bot es privado.
> Tu número de chat es **123456789**. Pídele al administrador que lo autorice.

Es lo esperado: el bot solo atiende a las personas que el administrador autorizó.

## Paso 5 · Enviar tu número de chat al administrador

Copia ese número (mantén presionado sobre el mensaje) y envíaselo al administrador por el medio que ya usan (WhatsApp, correo…).
**Es el mismo número para los dos bots**, así que basta con enviarlo una vez.

El administrador te avisará cuando esté listo. Entonces vuelve al bot de consultas y pulsa **Iniciar** de nuevo (o escribe `/ayuda`):
verás el menú con botones. Desde la mañana siguiente te llegará también el resumen diario.

> El administrador solo ve **ese número**. No ve tu teléfono, tu nombre, tus contactos ni tus otras conversaciones.

## Cómo usar el bot de consultas

Toca los botones o escribe los comandos. Si olvidas alguno, el botón **Menú** (abajo a la izquierda) los lista.

<img src="assets/telegram-uso.svg" alt="Ejemplo de conversación: se pide /resumen y el bot responde con lo urgente, los datos al día y los botones del menú" width="100%" />

| Para saber… | Escribe o pulsa | Ejemplos |
|---|---|---|
| Lo urgente de hoy | `/resumen` | |
| Cómo van los proyectos | `/proyectos` | `/proyectos atrasado` · `/proyectos en curso` · `/proyectos torre` |
| Qué materiales faltan | `/materiales` | `/materiales cemento` |
| Qué pedidos esperan llegar | `/pedidos` | `/pedidos parcial` · `/pedidos aceros` |
| Propiedades del catálogo | `/propiedades` | `/propiedades venta miraflores hasta 300000` · `/propiedades alquiler oficina` |
| Si los datos están al día | `/frescura` | |
| Qué cambió en la semana | `/tendencias` | disponible desde el segundo día de historial |
| Ver todo esto otra vez | `/ayuda` | |

**Consejos**
- No hace falta escribir acentos: `/propiedades alquiler san isidro` funciona igual.
- Para `/propiedades` puedes combinar: operación (`venta` o `alquiler`), tipo (`casa`, `departamento`, `terreno`, `oficina`, `local`),
  distrito, y precio máximo (`hasta 300000`) o mínimo (`desde 1000`) en dólares.
- Si escribes una frase suelta («¿cómo van las obras?») el bot no la entiende: usa los botones. Para preguntas libres está el
  agente de Coze.
- Cada respuesta trae botones al pie para pasar a otra consulta sin escribir.

## Leer el resumen de la mañana

Llega a las **08:07** desde `@v1k_asistente_bot`. Léelo de arriba abajo:

- **✅ Todo en orden / 🟡 Hay puntos por revisar / 🔴 Requiere atención:** el estado general.
- **Qué mirar primero:** lo más importante, con 🔴 (urgente), 🟡 (aviso) o 🔹 (información).
- **Próximos días:** hitos de proyectos y llegadas de pedidos.
- **Cambios en N días:** qué mejoró o empeoró frente a hace una semana (aparece desde el segundo día de historial).
- **Datos al día:** hace cuántas horas sincronizó cada app. Si alguna pasa de un día, los números pueden estar desactualizados.

## Si algo no funciona

| Qué pasa | Qué hacer |
|---|---|
| No encuentro el bot al buscar | Usa el enlace directo de la tabla de arriba |
| «Este bot es privado» | Envía tu número de chat (Paso 5) al administrador y espera su aviso |
| Pulso un botón y no responde | Espera unos segundos; si sigue igual, escribe `/ayuda` |
| «No pude leer los datos ahora» | Es un fallo momentáneo de la base: intenta de nuevo en un minuto |
| No me llega el resumen de la mañana | Pulsa **Iniciar** en `@v1k_asistente_bot`, y pídele al administrador que confirme que tu número está en la lista |
| Me llegan demasiados avisos | Toca el nombre del bot → **Silenciar**: seguirás pudiendo abrirlo cuando quieras |
| Dudo de un mensaje | Los bots **nunca** piden contraseñas, códigos ni pagos. Si uno lo pide, no es el bot de V1K |

## Para el administrador: dar acceso a una persona nueva

Con el número de chat que te envió la persona:

1. **Bot de consultas:** en Vercel (proyecto `v1k-coze-api` → Settings → Environment Variables) agrega el número a
   `TELEGRAM_CHATS_PERMITIDOS`, separado por comas (`111111111,222222222`), y haz **Redeploy**.
2. **Resumen diario:** en GitHub (Settings → Secrets and variables → Actions) agrega el número al secreto `TELEGRAM_CHAT_ID`,
   también separado por comas. No hace falta redeploy. La persona debe haber pulsado **Iniciar** en `@v1k_asistente_bot`.
3. Prueba: **Actions → Diario → Run workflow**; la persona recibe el resumen en su Telegram.

Para quitar a alguien, borra su número de las dos listas. Detalles técnicos y solución de problemas:
[`BOT_TELEGRAM.md`](BOT_TELEGRAM.md) y [`OPERACION.md`](OPERACION.md).
