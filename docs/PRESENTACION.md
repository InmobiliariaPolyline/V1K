# Guion de presentación del proyecto V1K

Pensado para exponerlo en **10 minutos** (con otros 5 de preguntas). Todo lo que se afirma aquí sale de lo que hay en este repositorio;
las cifras se pueden comprobar en [`PRUEBAS_REALIZADAS.md`](PRUEBAS_REALIZADAS.md) y en el [README](../README.md).

> **Frase para abrir:** «Construí un asistente al que se le pregunta en español cómo van las obras, los materiales y las
> propiedades, y que responde con datos reales de tres sistemas a la vez, sin esperar a que ninguno despierte.»

---

## 1. El resumen en una página

**Problema.** La empresa tiene tres sistemas (Project Planner, Sistema MRP y Real Estate Scraper) alojados en servicios gratuitos que se
**duermen entre 20 y 90 segundos**. Un asistente que los consulte uno por uno tarda, falla por *timeouts* y obliga a darle acceso a
cada sistema.

**Solución.** Cada app guarda un **resumen** en una base central (Neon) que nunca duerme. Una API pequeña y **de solo lectura**
(Vercel) lo expone con consultas fijas, y el agente de **Coze** la usa como herramienta para responder. El mismo dato alimenta un
**panel web** que no gasta créditos de Coze.

```
Planner · MRP · Scraper  →  Neon (resúmenes)  →  API de solo lectura  →  Agente de Coze  /  Panel web
```

**Resultados (a 19/11/2026).**

| Qué | Cifra |
|---|---|
| Respuesta de la API | unos **150 a 250 ms** (antes: 20 a 90 s esperando a las apps) |
| Herramientas del agente | **8**, todas de solo lectura (una, `resumen_general`, trae todo en una llamada) |
| Panel web | **10 secciones**, tema claro/oscuro, móvil, modo demostración sin token |
| Comprobaciones contra el sistema real | **1,333** (A: 588 · B: 535 · C: 155 · D: 55), todas correctas |
| Pruebas automáticas sin red (en cada cambio) | **10 suites**, p. ej. panel 1,087 e ilustraciones 1,445 comprobaciones |
| Roles de base de datos | **5**, cada uno con el mínimo privilegio |
| Automatización | CI en cada cambio, vigilancia cada 6 h, foto diaria y resumen por Telegram cada mañana |
| Ritmo | el repositorio central tiene **más de 20 commits en 7 días** (13 a 19/11/2026), cada uno con pruebas |

**Lo que lo hace distinto.** No es solo «un chatbot»: es una pieza **segura** (el agente nunca escribe y nunca ve credenciales),
**probada** (se buscó romperla de cientos de maneras), **observable** (avisa sola si algo se atrasa) y **útil sin el agente** (el panel).

---

## 2. Guion minuto a minuto (10 minutos)

| Min | Qué mostrar | Qué decir | Recurso |
|---|---|---|---|
| **0:00 – 1:00** | Título y el problema | El caso de las apps que se duermen. «Cada pregunta esperaba hasta un minuto y medio.» | `assets/antes-ahora.svg` |
| **1:00 – 2:30** | La arquitectura | Tres apps → Neon → API de solo lectura → Coze y panel. Por qué una base central: no depender de que las apps estén despiertas, y dar al agente solo resúmenes. | `assets/arquitectura.svg` |
| **2:30 – 4:00** | **Demo del panel** (modo demostración) | Ver sección 3 de este documento. | Panel, botón «Explorar con datos de ejemplo» |
| **4:00 – 5:30** | **El agente de Coze** | La conversación: una sola llamada a `resumen_general`, respuesta con proyectos, stock y pedidos. Ver el plan B abajo. | `assets/chat-agente.svg` o la pregunta del día |
| **5:30 – 6:30** | Seguridad | Cuatro capas: token, lista cerrada de consultas, rol de solo lectura, base con solo resúmenes. Un SQL malicioso se detiene en la lista cerrada. | `assets/capas-seguridad.svg` |
| **6:30 – 7:30** | Pruebas | 1,333 comprobaciones en cuatro baterías contra el sistema real; qué errores encontraron (sección 4). | `assets/pruebas-baterias.svg` |
| **7:30 – 8:30** | Automatización | CI en GitHub, vigilancia cada 6 h y el resumen diario: **mostrar el Telegram en el celular**. | Celular y pestaña Actions |
| **8:30 – 9:30** | Lo que descubrió con los datos reales | Inventario del MRP sin cargar y alquileres «por m²»: cómo se detectó y qué se corrigió. | `CALIDAD_DE_DATOS.md` |
| **9:30 – 10:00** | Cierre | Qué sigue (sección 6) y agradecimiento. | — |

**Si te sobra tiempo:** el *Explorador de API* (probar una consulta en vivo y ver el `curl`) y el diagrama de sincronización
(`assets/sincronizacion.svg`). **Si te falta:** salta el Calendario y las Propiedades en la demo.

---

## 3. Guion de la demostración del panel (sin token, sin internet de por medio)

Abre el sitio y pulsa **«Explorar con datos de ejemplo»**: todo funciona con datos ficticios, no llama a la API y no muestra
información de la empresa. Ideal para proyectar.

1. **Inicio (30 s).** «Esto es lo primero que ve alguien al abrir el panel.» Señala el estado general, **«Qué mirar primero»** (alertas
   automáticas) y la **frescura de cada app**: «el sistema sabe cuándo sincronizó cada una».
2. **Tendencias (20 s).** Los gráficos del historial diario y el cambio frente a hace 7 días. «Una foto por día; así se ve si
   mejora o empeora.»
3. **Proyectos (30 s).** Cambia a **«Línea de tiempo»** (el Gantt): barra de inicio a fin, relleno de avance, línea de «hoy». Pulsa un
   proyecto: panel lateral con sus hitos.
4. **Materiales (20 s).** El cartel de **«inventario casi sin cargar»**. «Los datos reales mostraban 499 de 501 materiales en cero;
   el panel lo explica en vez de gritar 501 faltantes.»
5. **Propiedades (30 s).** Aplica un filtro (por ejemplo, alquiler en un distrito). Señala **«¿Precio dudoso?»**: alquileres de oficina
   publicados por m². «Los filtros quedan en el enlace; se puede compartir la búsqueda.»
6. **Explorador de API (30 s).** Elige una vista, pulsa *Ejecutar* y muestra las pestañas **JSON / Tabla / cURL**. «Estas son las mismas
   consultas que usa el agente. No existe forma de enviar SQL.»
7. **Detalles que impresionan (20 s).** `Ctrl + K` (paleta de comandos), `T` (cambia el tema), `G` y luego `P` (ir a Proyectos).
   «Funciona en el celular y se puede imprimir.»

**Antes de empezar:** abre el panel en una pestaña, cierra el resto, ajusta el zoom a 110 % si se proyecta, y deja el tema en el que se
vea mejor en el proyector (el oscuro suele verse bien en pantallas grandes; el claro, en salones con mucha luz).

---

## 4. Los puntos fuertes, con ejemplos concretos

**Seguridad (diseño, no un añadido).**
- El agente **solo lee**: una lista cerrada de 8 consultas, sin SQL del cliente; los filtros se validan y viajan como parámetros.
- **5 roles** con mínimo privilegio: `coze_reader` es solo lectura; cada app escribe solo en sus tablas y en su propia fila de control
  (seguridad por fila); el historial tiene su propio rol que no puede borrar.
- El panel tiene política de seguridad estricta (sin scripts ni estilos en línea, datos siempre como texto), y el repositorio es
  público **sin un solo secreto**: hay una prueba que lo verifica en cada cambio.

**Pruebas que encontraron errores reales** (esto convence más que decir «lo probé»):
- Rutas como `/api/constructor` daban un error 502 en vez de 404 (propiedades heredadas de JavaScript).
- Un texto con un carácter nulo hacía fallar la base; ahora se limpia.
- Un precio mayor a 999 mil millones rompía **toda** la sincronización de dos apps; ahora se acota.
- El *pooler* de Neon rechazaba un parámetro de conexión que el MRP enviaba; se corrigió y quedó una prueba.
- Una prueba de las ilustraciones detectó tiempos de animación inválidos antes de publicarlas.

**Calidad de datos** (`CALIDAD_DE_DATOS.md`).
- **MRP:** 499 de 501 materiales sin existencias; la causa no era un error de sincronización, sino que los mínimos son valores de partida y el
  inventario nunca se cargó. El panel y el agente ahora lo explican.
- **Scraper:** 18 de 127 alquileres recientes (14 %) tenían precio «por m²» guardado como total. Se corrigió en el panel (mediana y aviso
  de precio dudoso) y se preparó un cambio en el Scraper (PR) para guardar el total mensual.

**Operación.**
- Un flujo de **CI** (Node 20 y 22) corre las 10 suites en cada cambio.
- La **vigilancia** comprueba cada 6 horas la API, el panel y la frescura de cada app; abre una incidencia si algo falla.
- Cada mañana, un **resumen por Telegram** con lo urgente y los cambios de la semana; el registro público del flujo nunca incluye datos del negocio.

---

## 5. Preguntas que pueden hacerte (y cómo responderlas)

**¿Por qué una base central y no llamar a las apps directamente?**
Las apps se duermen y cada llamada tarda hasta 90 s; además habría que dar al agente acceso a tres sistemas. Con la base central el agente responde
en ~150 ms y solo ve resúmenes, no los sistemas de origen.

**¿Qué pasa si se filtra el token?**
Solo permite **leer resúmenes**: no escribe, no ve contraseñas de las apps ni datos sensibles. Se rota en minutos (hay una guía en
`OPERACION.md`) y la vigilancia avisa si queda desincronizado.

**¿Qué pasa si una app falla o está caída?**
La sincronización es en segundo plano y **nunca rompe la app**: un fallo solo se registra. El panel muestra la frescura de cada app y la vigilancia avisa si
alguna lleva demasiado sin sincronizar.

**¿Los datos están al día?**
Cada app sincroniza al guardar datos (y el Planner y el MRP también al arrancar). El panel y el agente muestran **hace cuántas horas** sincronizó cada una.
El único hueco conocido (el último minuto de una ingesta del Scraper) tiene un cambio preparado.

**¿Cuánto cuesta?**
Está montado sobre servicios con nivel gratuito (las apps ya vivían en ellos; la API, la base, el CI y los flujos usan los planes que se tienen). El único límite real que se notó es el de **preguntas al agente por día** en Coze,
por eso existe el panel y el resumen diario: dan lo mismo sin gastar créditos.

**¿Por qué no se le dio al agente más herramientas?**
Cada herramienta se envía en cada pregunta y gasta créditos. Por eso hay una sola (`resumen_general`) que trae todo en una llamada.
Las vistas para gráficos son **solo del panel**.

**¿Qué haría si crece (más usuarios o más datos)?**
Tokens por persona en lugar de uno compartido, y más tablas en el historial. La base y la API ya separan lectura y escritura, así que escalan por separado.

---

## 6. Qué haría con más tiempo

1. **Cargar el inventario real del MRP** (lo que más cambiaría las respuestas sobre materiales).
2. **Que el agente use el historial** («¿mejoró el stock esta semana?»): necesita 7 días de datos y volver a importar el plugin.
3. **Acceso por persona** al panel (nombre y vencimiento por token) en lugar de uno compartido.
4. **Fusionar los cambios preparados en el Scraper** (alquileres «por m²» y respaldo de sincronización).
5. **Más canales** para el agente (Telegram o un chat web), además de Coze.

---

## 7. Lista de verificación para el día anterior y el día de la presentación

**El día anterior**
- [ ] **Coze permite una pregunta por día:** haz la pregunta del ensayo *antes* o toma una **captura** de la respuesta y úsala como plan B. No gastes la
      pregunta del día de la presentación si quieres hacerla en vivo.
- [ ] Confirma que el prompt del agente está actualizado (con la tabla de proyectos) y publicado.
- [ ] Revisa en GitHub → **Actions** que **CI**, **Vigilancia** y **Diario** estén en verde.
- [ ] Comprueba que el resumen de Telegram llegó esta mañana (tendrá ya la sección de cambios).
- [ ] Abre el panel con el modo demostración y recorre la demo una vez, cronometrada.

**El día de la presentación**
- [ ] Panel abierto en el modo demostración, **sin token en pantalla** (nunca muestres el token ni el archivo `conexiones.local.txt`).
- [ ] Celular con Telegram abierto en el chat del bot (para mostrar el resumen).
- [ ] Pestañas listas: README del repositorio (con las ilustraciones animadas) y **Actions**.
- [ ] Plan B si falla internet: el modo demostración y las ilustraciones del repositorio (`docs/assets/`) funcionan sin la API.
- [ ] Una captura de la respuesta del agente por si Coze no responde.

---

## 8. Frases que funcionan

- «El agente **no sabe** nada que no esté en los resúmenes, y **no puede** escribir en ningún sistema.»
- «No esperé a que ninguna app despertara: la base central **nunca duerme**.»
- «Las pruebas no son un trámite: **encontraron errores reales** que se corrigieron antes de usarlo.»
- «Cuando los datos reales mostraron algo raro, el sistema **lo explica** en lugar de dar una cifra engañosa.»
- «Todo se puede **repetir**: cualquiera puede correr las pruebas y ver los mismos resultados.»
