# Glosario de la vista central (base de conocimiento del agente)

Este documento explica los términos que aparecen en los datos de Vista Central, para responder con precisión.

## Origen de los datos

Los datos son **resúmenes sincronizados** desde tres sistemas de la empresa; no son los sistemas en vivo.

- **Planner**: proyectos de obra (llamados «expedientes»), sus tareas y sus hitos.
- **MRP**: almacén y compras de materiales (stock, stock mínimo y órdenes de compra).
- **Scraper**: propiedades en venta y alquiler recogidas de portales inmobiliarios.

Cada sistema se sincroniza en momentos distintos. La **frescura** indica cuándo fue la última vez (`ultima_sync`) y hace cuántas horas (`hace_horas`).
Las horas están en UTC; Lima es UTC-5.

## Proyectos (Planner)

- **Estado** de un proyecto, calculado al sincronizar:
  - **por iniciar**: todavía no llega su fecha de inicio.
  - **en curso**: ya empezó y no ha pasado su fecha de fin.
  - **atrasado**: pasó su fecha de fin y su avance es menor al 100 %.
  - **terminado**: avance del 100 %.
- **Avance** (`avance_pct`): porcentaje de 0 a 100, promedio del avance de sus tareas.
- **Tarea atrasada**: tarea cuya fecha de fin ya pasó y su avance es menor al 100 %.
- **Hito**: fecha clave de un proyecto (por ejemplo, una entrega o un trámite).
- El presupuesto y el equipo de cada proyecto **no** se sincronizan: no se pueden consultar.

## Materiales y compras (MRP)

- **Stock mínimo**: cantidad por debajo de la cual conviene reponer un material. Solo se sincronizan los materiales que tienen mínimo definido.
- **Cantidad**: existencias actuales en el almacén (el almacén es único; no hay stock por obra).
- **Stock bajo**: material cuya cantidad es igual o menor a su mínimo.
- **Faltante**: cuánto falta para llegar al mínimo (mínimo menos cantidad; nunca negativo).
- **Importante**: casi todo el catálogo tiene mínimo definido y existencias en cero, así que casi todos los materiales figuran como «stock bajo». Conviene dar el total y mostrar solo los de mayor faltante.
- **Orden de compra abierta**: pedido a un proveedor que todavía no se recibió completo. Estados: **pendiente** (creada), **enviada** (enviada al proveedor) y **parcial** (recibida en parte).
- **Llegada estimada**: fecha prevista de llegada; puede no estar definida.
- Los precios y los contactos de proveedores **no** se sincronizan.

## Propiedades (Scraper)

- **Operación**: **VENTA** o **ALQUILER**.
- **Portal**: sitio de origen del aviso (infocasas, urbania, adondevivir, properati, babilonia).
- **Precio** y **moneda**: el precio como lo publica el portal, en soles (**PEN**) o dólares (**USD**). **precio_usd** es el precio convertido a dólares, útil para comparar.
- Un precio de 0 significa que el aviso **no publica precio**.
- Solo se copian las propiedades **más recientes** (hasta 200); el **resumen por portal** cuenta todo el catálogo.
- **Distrito**, **inmueble** (Casa, Departamento, Terreno…), dormitorios, baños y área son los datos del aviso.
- Cada propiedad trae el **enlace** al aviso original.

## Cómo preguntar bien

- Preguntas generales: «¿Cómo va todo?» devuelve el panorama completo en una sola consulta.
- Preguntas concretas se resuelven mejor con filtros: estado del proyecto, categoría de material, operación, distrito, tipo de inmueble, portal y precio máximo o mínimo en dólares.
