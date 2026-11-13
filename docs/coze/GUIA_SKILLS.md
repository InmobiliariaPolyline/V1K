# Skills del agente en Coze: guía de configuración

Qué cambiar en el editor del agente (**Development → Asistente V1K**) para aprovechar las mejoras de la API.
Todo se hace en la interfaz de Coze; los textos están listos para copiar. Los nombres de los menús pueden variar un poco.

> **Créditos:** configurar no gasta créditos. Solo gasta probar el agente en la vista previa. Probar las herramientas desde el
> editor del plugin (ícono ▶) tampoco consume créditos del modelo.

## 1. Actualizar el plugin (8 herramientas, con filtros)

La API ahora tiene la herramienta nueva **`resumen_general`** y filtros en las demás. Hay que volver a importar el contrato.

1. **Library → Vista Central** (el plugin).
2. **Import** y sube [`coze-api/openapi.yaml`](../../coze-api/openapi.yaml) (o pega su contenido en *URL y datos sin procesar*).
3. Si Coze avisa de que ya existen herramientas con el mismo nombre, elige **sobrescribir/actualizar**. Si no lo permite,
   borra las 7 antiguas (menú ⋯ de cada una) y vuelve a importar.
4. Verifica que aparecen **8 herramientas** y que cada una tiene el interruptor **Permitir** activado.
5. Prueba cada una con **▶ → Run**. Las nuevas conviene probarlas así:
   - `resumen_general`: sin parámetros. La respuesta debe traer `proyectos`, `stock`, `propiedades`, `frescura`…
   - `propiedades`: pon `operacion = VENTA` y `limite = 3`.
   - `stock_bajo`: pon `limite = 3`.
6. **Publish** con una versión nueva (por ejemplo `v0.0.2`) y la descripción: *«Añade resumen_general y filtros por estado, operación, distrito y precio»*.
   Deja marcada la opción de privacidad *«will not collect and transmit user info»*.

## 2. Añadir la herramienta nueva al agente

En el editor del agente, columna del medio, **Skills → Plugins**: debe mostrar las 8 herramientas de Vista Central. Si falta
`resumen_general`, pulsa **+** en *Plugins*, elige **Library tools → Vista Central** y añádela.

## 3. Instrucciones (Persona & prompt)

Sustituye todo el contenido por el prompt de [`../INSTRUCCIONES_AGENTE.md`](../INSTRUCCIONES_AGENTE.md): `Ctrl+A` y pegar.
Cambios principales: usa **solo** `resumen_general` para preguntas generales, aplica filtros en las concretas, se corrige solo
si recibe un error de parámetro, y explica bien que casi todo el stock figura como bajo.

## 4. Preguntas iniciales (*Chat experience → Opening questions*)

Aparecen como botones al abrir el chat. Añade estas:

1. ¿Cómo va todo hoy?
2. ¿Qué proyectos van atrasados?
3. ¿Qué materiales tienen mayor faltante?
4. ¿Qué casas en venta hay por menos de 300 mil dólares?
5. ¿Qué tan actualizados están los datos?

*(Opcional)* En el mensaje de apertura: *«Hola, soy el asistente de V1K. Puedo contarte cómo van tus proyectos, qué materiales faltan, qué pedidos vienen en camino y qué propiedades hay disponibles.»*

## 5. Atajos (*Chat experience → Shortcuts*)

Botones de un clic. Cada atajo tiene un **nombre** y el **mensaje** que envía:

| Nombre | Mensaje que envía |
|---|---|
| Resumen del día | ¿Cómo va todo hoy? |
| Proyectos atrasados | ¿Qué proyectos van atrasados y cuántas tareas tienen atrasadas? |
| Stock crítico | ¿Qué materiales tienen mayor faltante? |
| Propiedades en venta | Muéstrame las 5 propiedades en venta más recientes |
| Frescura de datos | ¿Qué tan actualizados están los datos? |

## 6. Base de conocimiento (*Knowledge → Text*)

Sube [`glosario.md`](glosario.md) (**Knowledge → Text → Add → Upload local file**). Explica qué significan *faltante*, *stock bajo*,
los estados de un proyecto, *precio_usd*, etc., y sirve para que el agente responda con precisión cuando le pregunten «¿qué es…?».

- Déjalo en recuperación automática (*Auto-call*).
- La recuperación añade texto al contexto solo cuando la pregunta lo necesita. Si notas que gasta más créditos, puedes
  quitarlo: el prompt ya cubre lo esencial.

## 7. ¿Hace falta un *workflow*?

**No por ahora.** Un workflow de «resumen diario» sirve para encadenar varias consultas, pero `resumen_general` ya trae todo en una sola
llamada y el agente lo redacta. Un workflow solo añadiría pasos (y créditos). Se considera si más adelante quieres, por ejemplo, un
informe con un formato fijo o enviarlo por un canal.

## 8. Probar (cuando haya créditos)

Borra la conversación de la vista previa y haz **una sola pregunta**: *¿Cómo va todo hoy?*

Lo correcto es que el agente:

- haga **una sola llamada** (`resumen_general`) y no cinco;
- indique la **frescura** de cada sistema con su hora (no «actualizado al momento de la consulta»);
- muestre las **fechas** como DD/MM/AAAA;
- diga que **casi todo el catálogo está bajo su mínimo** y muestre solo los de mayor faltante.

Después prueba una concreta con filtros: *¿Qué casas en venta hay en Yanahuara por menos de 300 mil dólares?*
Debe llamar a `propiedades` con `operacion`, `inmueble`, `distrito` y `precio_max_usd`.
