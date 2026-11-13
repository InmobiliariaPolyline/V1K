# Pruebas realizadas a la sincronización (13/11/2026)

Resumen de las baterías ejecutadas contra el sistema real (Vercel + Neon) y contra el código real de sincronización
de cada app. Los scripts están en [`tests-integracion/`](../tests-integracion) y se pueden repetir cuando se quiera. Ninguna dejó datos en la base: las que escriben lo hacen dentro de una transacción que termina en
`ROLLBACK`.

| Batería | Qué prueba | Resultado |
|---|---|---|
| **A. API en vivo** | 557 comprobaciones sobre 419 peticiones reales: matriz de autenticación (13 variantes × 8 rutas), 6 métodos HTTP, nombres de ruta hostiles, 40 valores del parámetro `q` (inyección SQL, unicode, comodines, 10.000 caracteres, byte nulo), forma de cada respuesta contra el OpenAPI, **filtros** (valores válidos que filtran de verdad y 15 casos no válidos que dan 400 con mensaje), **`resumen_general`** coherente con las demás vistas, **panel web** (cada uno de los 24 módulos JS, hojas de estilo e imágenes publicados con su tipo y cabeceras, idénticos a los del repositorio; CSP; sin token en el código; archivos internos no publicados; vistas solo del panel con token y fuera del contrato de Coze), ráfaga de 60 peticiones simultáneas | **557 / 557** (tras corregir 2 fallos) |
| **B. Permisos de los 4 roles** | 397 comprobaciones en Neon real: cada rol × cada tabla × 5 operaciones, 29 operaciones de DDL y escape (crear/alterar/borrar, `SET ROLE`, `COPY … TO PROGRAM`, leer archivos), seguridad por fila de `sync_estado`, atributos de los roles, contraseñas falsas, sin SSL | **397 / 397** |
| **C. Código real de sync** | El módulo de cada app contra Neon con su rol, con datos extremos: vacío, 501 materiales, 300 proyectos × 20 tareas, 10.000 propiedades, textos hostiles, números enormes, reemplazo e idempotencia, fallo del origen. Para el Scraper, además, el controlador HTTP de Neon que usa Netlify | MRP **60 / 60**, Scraper **49 / 49**, Planner **46 / 46** (2 casos informativos que no pueden ocurrir con datos reales) |
| **D. Datos reales** | 53 comprobaciones de integridad de lo que hay ahora en la base central, y que cada vista de la API (las consultas se toman de `lib/vistas.js`) devuelva exactamente lo que hay en la base, fila por fila | **53 / 53** (con datos de las tres apps) |

## Fallos encontrados y qué se hizo

1. **API:** `/api/constructor`, `/api/__proto__`, `/api/toString`… daban 502 en vez de 404. **Corregido y desplegado.**
2. **API:** un `q` con byte nulo daba 502. **Corregido y desplegado.** Además, `%`, `_` y `\` en la búsqueda ahora se
   tratan como texto literal.
3. **MRP y Scraper:** una cantidad o un precio mayor a 999.999.999.999,99 hacía fallar toda la sincronización
   (`numeric field overflow`). **Corregido y fusionado** (MRP: PR #4, Scraper: PR #2).
4. **No corregido, porque no puede ocurrir con datos reales:** un byte nulo o un carácter UTF-16 inválido en un texto
   (Postgres no puede guardarlos) y claves duplicadas en el origen (lo impiden las claves primarias y únicas).

## Pruebas automáticas de `coze-api` (sin red)

`npm test` en `coze-api/` ejecuta cinco suites: humo (autenticación, métodos, nombres heredados), cada consulta y cada filtro contra
el esquema real en un Postgres de prueba, el manejo de filtros no válidos, que `openapi.yaml` esté al día respecto de `lib/vistas.js`,
y el panel web (832 comprobaciones): funciones puras de formato, rutas, gráficos SVG y alertas; el modo demostración, que debe devolver las mismas columnas y los mismos mensajes de error que la API real (más de 40 casos comparados contra `lib/vistas.js`); y la seguridad estática (sin `innerHTML`, sin scripts ni estilos en línea, sin recursos externos, enlaces solo `http(s)`, importaciones que existen, iconos del sprite y clases de CSS definidas).

El panel rediseñado además se revisó en un servidor local con las mismas cabeceras que Vercel (`npm run panel`), en modo demostración: las nueve secciones en escritorio y móvil (375 px), tema claro y oscuro, sin errores de consola ni violaciones de la CSP, y sin desbordes horizontales. En producción se repitió el recorrido de las nueve secciones con datos de ejemplo.

## Prueba de producción del Scraper (13/11/2026)

Tras lanzar a mano el workflow *Scraper propio (InfoCasas)*, `scraper` apareció en `frescura` a los ~40 segundos y el
resumen de propiedades (4.234 en total) siguió actualizándose cada minuto mientras corría la ingesta.
Limitación conocida: la sincronización se limita a una por minuto, así que el último minuto de una ejecución puede
quedar sin copiar hasta la siguiente ingesta.

## Lo que no se pudo comprobar

- **Registros de Render (Planner) y de Netlify (Scraper):** se revisaron los de despliegue (sin problemas). Los de
  ejecución no son accesibles desde aquí; la prueba es indirecta: `frescura` marca las tres apps.
- **Que la sincronización se dispare tras una edición** en el Planner o el MRP en producción. Hasta ahora solo se ha
  visto la sincronización de arranque. Se comprueba cambiando un dato real y mirando la API unos segundos después.
- **Lectura real de Supabase por parte del MRP:** se comprobó el resultado (501 materiales copiados) pero las pruebas
  de estrés usan un origen simulado.
