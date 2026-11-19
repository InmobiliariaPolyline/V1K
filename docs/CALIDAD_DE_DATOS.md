# Calidad de los datos (revisión del 19/11/2026)

Revisión de solo lectura de lo que hay en la base central (rol `coze_reader`, agregados y ejemplos). Su objetivo: que el agente y el
panel no digan cosas engañosas con total seguridad.

## Qué se encontró

### MRP: el inventario casi no está cargado
| Dato | Valor |
|---|---|
| Materiales con stock mínimo | 501 |
| Con existencias en cero | **499** |
| Con alguna existencia | 2 (marco de madera: 20 · varilla corrugada: 15) |
| Pedidos de compra abiertos | 0 |

**Causa:** el script `scripts/definir_stock_minimo.py` del MRP asigna un mínimo de partida a todo el catálogo («se ajustan después
desde Inventario › Stock mínimo»), pero las existencias reales casi no se han registrado. Por eso «stock bajo» abarcaba al 100 % y
el panel se ponía en rojo. **No es un error de sincronización**: la base central copia fielmente lo que hay en el MRP.

### Scraper: alquileres de oficina publicados «por m²»
Sobre los 200 avisos más recientes copiados:

| Operación | Avisos con precio | Precios dudosos | Ejemplo |
|---|---|---|---|
| Alquiler | 127 | **18** (14 %) | «Weens alquila oficina de 92.50 m²» a **S/ 41** (= S/ 41 por m², unos US$ 12) |
| Venta | 73 | 2 | Local de 584 m² a S/ 10,000 |

- Mediana de alquiler: US$ 1,280. Percentil 1 %: US$ 12. Máximo: US$ 101,356.
- Con esos valores el **promedio** de alquiler de un distrito se dispara o se hunde (se vio US$ 0.27 de mínimo en Miraflores y ~US$ 21 mil de
  promedio en Lima); la **mediana** casi no se mueve.
- El Scraper ya descarta lo absurdo (`precioInverosimil` en `api/ingest.ts`: ventas < US$ 1,000 o > 300 M, y alquileres > US$ 200,000),
  pero un «S/ 41 por m²» parece un precio normal y pasa.
- Todo lo demás está sano: tipo de cambio implícito estable (0.267 a 0.297), sin avisos sin distrito (45 distritos) y 1 grupo de duplicados.

### Otros datos revisados
- Frescura: Planner, MRP y Scraper con menos de 21 horas.
- Planner: pocos proyectos (2 atrasados en la revisión). No es un problema de calidad, solo poco volumen.

## Qué se corrigió (en este repositorio, sin tocar las apps)

| Cambio | Dónde |
|---|---|
| Si ≥ 90 % del catálogo está sin existencias, el panel lo muestra como **«Inventario casi sin cargar»** (aviso, no peligro): ya no dice «501 en falta», el indicador de Inicio pasa a «Inventario cargado» y la insignia roja del menú desaparece | `public/js/nucleo/insights.js`, Inicio, Materiales |
| Los precios por distrito usan la **mediana**, no el promedio (`precio_mediano_usd`, vista solo del panel) | `lib/vistas.js` |
| En Propiedades, los alquileres < US$ 80/mes, > US$ 100,000/mes y ventas < US$ 5,000 se marcan **«¿Precio dudoso?»** y no entran en el precio mediano, el más económico ni el más caro | `precioDudoso()` en `insights.js` |
| El agente avisa cuando un alquiler menor a US$ 80 al mes parece un precio por m² | `docs/INSTRUCCIONES_AGENTE.md` (pegar el prompt actualizado en Coze) |

Estas correcciones **no cambian el contrato** que ve Coze (`openapi.yaml`): no hace falta volver a importar el plugin.

## Correcciones recomendadas en el origen (decisión de cada equipo)

1. **Scraper:** en `normalizarAviso`, detectar alquileres de oficina publicados por m² (precio mensual por m² < ~US$ 5 con área ≥ 30 m²)
   y guardar el total mensual (`precio × área`), o dejarlos sin precio. Un aviso de 92 m² a «S/ 41» pasaría a S/ 3,772 al mes.
2. **MRP:** registrar las existencias reales del almacén (Inventario) o, mientras tanto, no copiar a la base central los materiales que
   nunca tuvieron movimiento, para que «stock bajo» signifique algo.
3. **Ambos:** que la base central guarde un historial diario (una fila por día de los totales) para poder ver tendencias y detectar saltos raros.

## Cómo repetir la revisión

Las consultas están en este mismo informe (agregados sobre `central.mrp_stock` y `central.scraper_propiedades`) y la batería D
(`tests-integracion/d-datos-reales.mjs`) comprueba la integridad básica. Conviene repetirlas después de cada cambio en el origen.
