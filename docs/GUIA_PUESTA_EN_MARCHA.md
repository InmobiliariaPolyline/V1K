# Vista central para el agente de Coze — puesta en marcha

```
Planner (Render)  ─┐
MRP (Streamlit)   ─┼─ cada app copia un RESUMEN ─► Neon: esquema `central` ◄─ coze-api (Vercel) ◄─ Coze
Scraper (Netlify) ─┘      (rol writer_<app>)                                  (rol coze_reader)
```

Todo es **opcional y apagado por defecto**: las apps solo sincronizan si existe `CENTRAL_DATABASE_URL`.
Sin esa variable se comportan exactamente como antes.

## Qué hay en esta carpeta

| Pieza | Dónde | Estado |
|---|---|---|
| Esquema y roles de la base central | `db/01_schema.sql`, `db/02_roles.sql` | Probado contra Postgres de prueba (PGlite); **no ejecutado en tu Neon** |
| API de solo lectura para Coze | `coze-api/` | 14 comprobaciones pasan; **no desplegada** |
| Sincronización del Scraper | `apps/REAL_ESTATE_SCRAPER` (rama `feature/sync-vista-central`) | 8 pruebas nuevas pasan; **sin commit ni push** |
| Sincronización del Planner | `apps/planner-backend` (misma rama) | 9 pruebas nuevas + SQL real verificado; **sin commit ni push** |
| Sincronización del MRP | `apps/Sistema-MRP-EDC-VII` (misma rama) | 13 pruebas nuevas + SQL real verificado; **sin commit ni push** |

## Orden recomendado

1. **Neon (base central).** Crea una base nueva (o un proyecto nuevo) solo para esto. En el SQL Editor ejecuta
   `db/01_schema.sql` y luego `db/02_roles.sql`, **cambiando antes las 4 contraseñas** por valores largos y distintos.
2. **Cadenas de conexión.** En Neon copia la cadena *pooled* de cada rol: `coze_reader`, `writer_scraper`,
   `writer_planner`, `writer_mrp`. No las pegues en chats ni en Git.
3. **Variables de entorno** (cada una solo en el servidor de su app):

   | App | Variable | Dónde |
   |---|---|---|
   | Scraper | `CENTRAL_DATABASE_URL` = cadena de `writer_scraper` | Netlify → Environment variables |
   | Planner | `CENTRAL_DATABASE_URL` = cadena de `writer_planner` | Render → Environment |
   | MRP | `CENTRAL_DATABASE_URL` = cadena de `writer_mrp` | Streamlit → Secrets |
   | coze-api | `DATABASE_URL_READER` = cadena de `coze_reader`, `API_TOKEN` | Vercel |

4. **Subir el código de las apps** (tú decides cuándo; yo no he hecho commit ni push). Cada repo tiene los cambios
   en la rama `feature/sync-vista-central`. Revisa el diff, abre un Pull Request y fusiónalo. Hasta que pongas
   la variable del paso 3, no pasa nada.
5. **Primer llenado.** El Planner y el MRP sincronizan solos al arrancar. El Scraper lo hace en la siguiente
   ingesta o carga. Comprueba con `curl -H "Authorization: Bearer TU_TOKEN" https://TU-API/api/frescura`.
6. **Coze.** Crea el plugin (ver `coze-api/README.md`) y pregunta algo real.

## Qué se copia y qué no

| App | Se copia | NO se copia |
|---|---|---|
| Planner | nombre, responsable, estado, avance, fechas, tareas atrasadas, hitos | presupuesto, equipo, enlaces públicos, logotipos, usuarios |
| MRP | materiales con stock mínimo (stock, mínimo, faltante), órdenes abiertas (proveedor, obra, llegada, cantidades) | precios, contactos de proveedores, trabajadores, usuarios, adjuntos |
| Scraper | las 200 propiedades más recientes (sin descripción, dirección, coordenadas ni publicador) y conteos por portal | usuarios, suscripciones, sesiones, auditoría |

## Cómo se comporta si algo falla

- La sincronización corre en segundo plano, con límite de tiempo, y **un error nunca rompe** guardar un aviso,
  editar un proyecto o registrar un movimiento: solo queda una línea de aviso en los registros (sin credenciales).
- Cada sincronización es idempotente (repetirla no duplica). Si la base central cae, el siguiente cambio la repone.
- `GET /api/frescura` dice cuándo sincronizó cada app: si el agente ve un dato viejo, puede avisarlo.

## Cómo revertir

- Quitar la variable `CENTRAL_DATABASE_URL` apaga la sincronización de esa app al instante.
- Revocar un rol en Neon (`DROP ROLE writer_mrp;`) corta el acceso de esa app sin tocar las demás.
- Las apps no se modifican de otra forma: no hay migraciones en sus bases.

## Limitaciones conocidas (para tu informe)

- El Planner recalcula el avance de las tareas automáticas **al leerlas**; si nadie abre el expediente, el avance
  central puede quedar un poco atrasado hasta el siguiente cambio. Los datos vienen con su hora en `frescura`.
- El MRP usa Supabase por PostgREST: lee hasta 1000 filas por página y pagina; está preparado, pero no se probó
  contra tu Supabase real.
- Render (Planner) y Streamlit se duermen: la sincronización del arranque ocurre cuando despiertan, no antes.
- El MRP agrega la dependencia `psycopg[binary]` a `requirements.txt`; hay que redeplegar para instalarla.
