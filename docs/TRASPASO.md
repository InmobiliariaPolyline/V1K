# Traspaso: dejar V1K en manos de otra persona

Esta guía sirve para que **otra persona se haga cargo de todo** (los bots de Telegram, la API, el panel, la base de datos y la vigilancia) y la persona que lo montó pueda irse o **borrar su cuenta de Telegram**
sin que nada se pierda. Está pensada para seguirse **en orden** y marcar cada casilla.

> **Regla de oro:** los bots deben **transferirse antes** de borrar la cuenta de Telegram que los creó. Con la cuenta ya eliminada no hay forma conocida de recuperarlos.
> **Nunca pongas un token, una contraseña o una cadena de conexión en este documento, en el repositorio, en un chat o en un correo.** Se entregan con un gestor de contraseñas o en persona.

## 1. Qué hay y dónde se administra

| Pieza | Para qué sirve | Dónde se administra | A nombre de quién está hoy |
|---|---|---|---|
| Bot de consultas `@v1k_consultas_bot` | Responde comandos y botones | **@BotFather** (cuenta de Telegram del creador) | Cuenta de Telegram del creador |
| Bot del resumen `@v1k_asistente_bot` | Envía el resumen de las 08:07 y responde el «briefing» | **@BotFather** | Cuenta de Telegram del creador |
| Código y flujos automáticos | Repositorio `InmobiliariaPolyline/V1K` (pruebas, vigilancia, historial diario y resumen) | **GitHub** | Cuenta de GitHub del creador |
| API, panel y webhooks de los bots | Proyecto `v1k-coze-api` | **Vercel** | Cuenta de Vercel del creador |
| Base de datos central | Datos del Planner, el MRP y el Scraper | **Neon** | Cuenta de Neon del creador |
| Agente de IA | Contesta preguntas libres con los datos | **Coze** | Cuenta de Coze del creador |
| Apps Planner, MRP y Scraper | Sincronizan sus datos a la base con su propio rol | Cada app (fuera de este repositorio) | Quien las administre |

Completa la última columna con los nombres reales antes de empezar. Cada servicio debe terminar con **la persona nueva como dueña o administradora**.

## 2. Orden recomendado

### A. Preparar a la persona que recibe

- [ ] Tiene una cuenta de Telegram propia, con el **código de verificación en dos pasos** activado (Ajustes → Privacidad y seguridad). Es la protección contra perder la cuenta.
- [ ] Tiene cuenta en **GitHub**, **Vercel** y **Neon** (puede crearlas con su correo de trabajo).
- [ ] Usa un **gestor de contraseñas** donde guardará los secretos del punto 3.
- [ ] Leyó [`BOT_TELEGRAM.md`](BOT_TELEGRAM.md) (administración de los bots) y [`OPERACION.md`](OPERACION.md) (qué hacer cuando algo falla).

### B. Transferir los dos bots (lo más urgente)

Hazlo **una vez por cada bot**:

- [ ] **La persona que recibe** abre el bot en Telegram y pulsa **Iniciar** (si antes lo bloqueó, lo desbloquea). Necesita tener un cupo libre: cada cuenta puede ser dueña de hasta 20 bots.
- [ ] **Quien entrega** abre [@BotFather](https://t.me/BotFather) y envía `/mybots`.
- [ ] Elige el bot → **Bot Settings** → **Transfer Ownership** → **Choose recipient**.
- [ ] Escribe el @usuario de la persona que recibe y confirma. Telegram puede pedir la contraseña de verificación en dos pasos.
- [ ] La persona que recibe abre @BotFather → `/mybots` y comprueba que **ya aparece el bot** en su lista.

La transferencia **no cambia el token**: los bots siguen funcionando sin tocar nada más. Si la persona nueva prefiere un token que el anterior dueño nunca haya conocido, en @BotFather puede usar `/mybots` → el bot → **API Token** → **Revoke current token**; después hay que seguir el punto 4.

### C. Pasar el acceso del administrador (tu número de chat)

- [ ] La persona nueva abre cada bot y pulsa **Iniciar**: el bot le muestra su **número de chat**.
- [ ] En el panel, módulo **Accesos de Telegram** (con el token de administrador), la registra con su nombre, su teléfono y su número de chat.
- [ ] En **Vercel**, variable `TELEGRAM_CHATS_PERMITIDOS` (los administradores fijos): pone el número de la persona nueva y **quita el del anterior**. Después hay que hacer **Redeploy**.
- [ ] En **GitHub**, secreto `TELEGRAM_CHAT_ID` (a quién se envía el resumen; admite varios separados por comas): igual, agrega el nuevo y quita el anterior.
- [ ] Cuando la persona nueva confirme que le llega todo, **revoca o borra** el acceso de quien entrega en el módulo.

### D. Pasar la administración de los servicios

- [ ] **GitHub:** la persona nueva recibe el rol de administrador del repositorio (Settings → Collaborators) o, mejor, se transfiere el repositorio a una organización de la empresa.
- [ ] **Vercel:** se le invita al proyecto `v1k-coze-api` con permisos de dueño (o se mueve el proyecto a un equipo de la empresa).
- [ ] **Neon:** se le invita al proyecto con permisos de administrador.
- [ ] **Coze:** el agente se comparte o se transfiere a su cuenta. La cabecera `Authorization: Bearer …` del agente usa el mismo valor que `API_TOKEN`.
- [ ] **Planner, MRP y Scraper:** confirmar quién las administra y que sus cadenas de conexión (cada app usa su propio rol de escritura) quedaron guardadas en su gestor de contraseñas.

## 3. Mapa de secretos (solo los nombres)

Los valores **no** van aquí. Cada fila dice dónde vive el secreto y qué deja de funcionar si falta o cambia.

| Secreto | Dónde está | Qué hace | Si falta o cambia |
|---|---|---|---|
| `DATABASE_URL_READER` | Vercel | La API y los bots leen la base con un rol de solo lectura | La API y los bots dejan de responder datos |
| `API_TOKEN` | Vercel, GitHub y la cabecera del agente de Coze (**el mismo valor**) | Es el **token de lectura**: abre el panel y la API | Panel, Coze y vigilancia fallan hasta igualarlos |
| `ADMIN_TOKEN` | Vercel | Es el **token de administrador**: solo para el módulo «Accesos de Telegram». **Es distinto del de lectura** | No se pueden dar ni revocar accesos |
| `DATABASE_URL_ACCESOS` | Vercel | Rol que solo escribe la tabla de accesos | El módulo «Accesos» da error |
| `TELEGRAM_BOT_COMANDOS_TOKEN` | Vercel | Token del bot de consultas | Ese bot deja de contestar |
| `TELEGRAM_WEBHOOK_SECRET` | Vercel | Secreto con el que Telegram firma cada llamada al bot de consultas | El bot rechaza a Telegram (401) |
| `TELEGRAM_BOT_RESUMEN_TOKEN` | Vercel | Token del bot del resumen (es el mismo que `TELEGRAM_BOT_TOKEN` de GitHub) | Ese bot deja de contestar |
| `TELEGRAM_RESUMEN_WEBHOOK_SECRET` | Vercel | Secreto del webhook del bot del resumen | El bot rechaza a Telegram (401) |
| `TELEGRAM_CHATS_PERMITIDOS` | Vercel | Números de chat de los administradores fijos | Los administradores pierden acceso |
| `HISTORIAL_DATABASE_URL` | GitHub | El flujo diario guarda la foto del día | No se guarda el historial |
| `TELEGRAM_BOT_TOKEN` | GitHub | El flujo diario envía el resumen por el bot del resumen | No sale el resumen |
| `TELEGRAM_CHAT_ID` | GitHub | A quién se le envía el resumen (varios, separados por comas) | El resumen no llega a esa persona |
| Cadenas de los roles `writer_*` | Cada app (Planner, MRP, Scraper) | Cada app sincroniza sus datos con su propio rol | Esa app deja de actualizar la base |

> Las contraseñas de la base y las cadenas de conexión completas están en el archivo local `db/conexiones.local.txt` de quien montó el sistema. **Ese archivo no se sube al repositorio**
> (está en `.gitignore`): se entrega por un medio seguro, y quien lo recibe lo guarda en su gestor de contraseñas y borra la copia suelta.

### Después del traspaso (recomendado)

La persona que ya no estará en el proyecto conoce estos valores. Conviene que la persona nueva **los cambie por otros** cuando tenga tiempo, uno por uno y comprobando cada vez:

1. `API_TOKEN`: guía en [`OPERACION.md`](OPERACION.md) (sección «Rotar el token de la API»). Hay que igualarlo en Vercel, GitHub y Coze.
2. `ADMIN_TOKEN`: nuevo valor en Vercel y **Redeploy**.
3. Tokens de los bots: `/revoke` en @BotFather y el punto 4.
4. Contraseñas de los roles de la base: desde Neon, y luego actualizar donde se usan.

## 4. Si cambia el token de un bot

1. En **Vercel**, pon el token nuevo en la variable del bot (`TELEGRAM_BOT_COMANDOS_TOKEN` o `TELEGRAM_BOT_RESUMEN_TOKEN`) y haz **Redeploy**.
2. Si es el bot del resumen, pon el mismo token en el secreto `TELEGRAM_BOT_TOKEN` de **GitHub**.
3. Reinstala el webhook y el menú del bot (el token no se muestra en pantalla). En PowerShell, dentro de `coze-api`:

```powershell
$env:TELEGRAM_BOT_COMANDOS_TOKEN = "<token del bot de consultas>"
$env:TELEGRAM_WEBHOOK_SECRET = "<secreto del webhook de consultas>"
node scripts/telegram-webhook.mjs --instalar
```

```powershell
$env:TELEGRAM_BOT_RESUMEN_TOKEN = "<token del bot del resumen>"
$env:TELEGRAM_RESUMEN_WEBHOOK_SECRET = "<secreto del webhook del resumen>"
node scripts/telegram-webhook.mjs --instalar --bot resumen
```

4. Comprueba con `node scripts/telegram-webhook.mjs --info` (y `--info --bot resumen`) que el webhook apunta a la dirección correcta y que no hay errores pendientes.

## 5. Verificación final

Marca cada una cuando la persona nueva la haga **por sí misma**, desde su cuenta:

- [ ] En @BotFather → `/mybots` ve los dos bots.
- [ ] Le escribe **Iniciar** a cada bot y le aparece el panel de Inicio con **su** número de chat.
- [ ] Toca 🚨 Alertas y 📋 Resumen en el bot de consultas y recibe datos.
- [ ] Entra al panel con el token de lectura y abre **Accesos de Telegram** con el de administrador.
- [ ] En GitHub → Actions ejecuta el flujo **Diario** a mano (botón *Run workflow*) y el mensaje le llega a ella.
- [ ] En GitHub → Actions, la **Vigilancia** y el **CI** (pruebas) están en verde.
- [ ] Prueba dar un acceso de prueba y **revocarlo** en el módulo, y comprueba que el bot lo refleja.
- [ ] El administrador anterior ya no está en `TELEGRAM_CHATS_PERMITIDOS`, ni en `TELEGRAM_CHAT_ID`, ni en el módulo.

## 6. Datos del traspaso (se completan a mano)

| | |
|---|---|
| Persona que recibe | |
| Fecha del traspaso | |
| @usuario de Telegram que ahora es dueño de los bots | |
| Correo de GitHub / Vercel / Neon / Coze | |
| Dónde se guardan los secretos (nombre del gestor, **sin** valores) | |
| Quién administra Planner, MRP y Scraper | |

## 7. Si algo sale mal

| Situación | Qué hacer |
|---|---|
| Un bot no contesta tras el traspaso | `--info` del script del webhook: revisa la dirección y el error; si cambió el token, el punto 4 |
| «Token incorrecto» en el panel | Estás usando el de administrador donde va el de lectura (o al revés); son dos distintos |
| El resumen no llega | Mira el flujo **Diario** en GitHub → Actions; confirma que el chat nuevo esté en `TELEGRAM_CHAT_ID` y que la persona le haya escrito «Iniciar» al bot |
| La persona nueva no ve los bots en @BotFather | La transferencia no se completó: repetir el punto B (debe haber pulsado Iniciar antes) |
| Se borró la cuenta de Telegram antes de transferir | Los bots no se pueden recuperar desde Telegram; se crean bots nuevos con @BotFather, se ponen sus tokens (punto 4) y se reinstalan los webhooks. Los datos y el panel no se pierden |

El resto de situaciones (alertas de vigilancia, fallos del CI, límites) están en [`OPERACION.md`](OPERACION.md).
