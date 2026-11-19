// Tendencias: cómo han cambiado en el tiempo los proyectos atrasados, el stock, los pedidos y los precios (historial diario).
import { ErrorApi, consultar } from '../nucleo/api.js';
import { banner, chips, kpi, tarjeta, vacio } from '../nucleo/componentes.js';
import { h } from '../nucleo/dom.js';
import { compacto, dolares, fechaCorta, numero, plural } from '../nucleo/formato.js';
import { lineas, leyendaLineas } from '../nucleo/lineas.js';
import { METRICAS, compararCon, ordenarPorDia, serieDe, valorDe } from '../nucleo/tendencias.js';
import { cargandoGenerico, encabezado, poner } from './_comun.js';

const PERIODOS = [{ valor: '30', etiqueta: '30 días' }, { valor: '60', etiqueta: '60 días' }, { valor: '90', etiqueta: '90 días' }];
const COLOR = { peligro: 'var(--peligro)', info: 'var(--primario-2)', aviso: 'var(--aviso)', ok: 'var(--ok)', mrp: 'var(--mrp)', scraper: 'var(--scraper)' };

/** Gráficos: [título, icono, ancho de columna, series (nombre, clave, color), formato, desdeCero]. */
const GRAFICOS = [
  { titulo: 'Proyectos atrasados y en curso', icono: 'proyectos', series: [['Atrasados', 'proyectos_atrasados', COLOR.peligro], ['En curso', 'proyectos_en_curso', COLOR.info]], desdeCero: true },
  { titulo: 'Tareas atrasadas', icono: 'alerta', series: [['Tareas atrasadas', 'tareas_atrasadas', COLOR.aviso]], desdeCero: true },
  { titulo: 'Materiales sin existencias', icono: 'materiales', series: [['Sin existencias', 'materiales_sin_existencias', COLOR.mrp], ['Con mínimo definido', 'materiales_con_minimo', COLOR.info]], desdeCero: true },
  { titulo: 'Pedidos abiertos y vencidos', icono: 'pedidos', series: [['Abiertos', 'pedidos_abiertos', COLOR.info], ['Con llegada vencida', 'pedidos_vencidos', COLOR.peligro]], desdeCero: true },
  { titulo: 'Propiedades en el catálogo', icono: 'propiedades', series: [['Catálogo completo', 'propiedades_catalogo', COLOR.scraper]], formato: compacto },
  { titulo: 'Precio mediano de venta', icono: 'propiedades', series: [['Venta (mediana, US$)', 'precio_mediano_venta_usd', COLOR.scraper]], formato: dolares },
  { titulo: 'Precio mediano de alquiler', icono: 'propiedades', series: [['Alquiler (mediana, US$ al mes)', 'precio_mediano_alquiler_usd', COLOR.ok]], formato: dolares },
];

const flecha = { mejor: '▼', peor: '▲', igual: '·', neutro: '' };

export default {
  async montar(ctx) {
    const { contenedor } = ctx;
    cargandoGenerico(contenedor);
    let periodo = PERIODOS.some((p) => p.valor === ctx.params.dias) ? ctx.params.dias : '60';

    let resp;
    try {
      resp = await consultar('historial', { limite: 90 });
    } catch (e) {
      // Si la tabla del historial todavía no existe, la API responde con un error de base de datos: se explica en vez de asustar
      if (e instanceof ErrorApi && e.estado === 502) {
        poner(contenedor, encabezado({ titulo: 'Tendencias', sub: 'Cómo cambian los números con el paso de los días.' }),
          vacio({ icono: 'base', titulo: 'El historial todavía no está activado', texto: 'Falta crear la tabla central.historial_diario en Neon (db/03_historial.sql) y la foto diaria. Mira docs/OPERACION.md.' }));
        return;
      }
      throw e;
    }
    const todo = ordenarPorDia(resp.datos);
    const zona = h('div');

    function pintar() {
      const dias = Number(periodo);
      const ultimo = todo[todo.length - 1];
      const corte = ultimo ? new Date(new Date(`${ultimo.dia}T00:00:00`).getTime() - (dias - 1) * 86_400_000).toISOString().slice(0, 10) : '';
      const visibles = todo.filter((f) => f.dia >= corte);
      ctx.cambiarParams({ dias: periodo === '60' ? '' : periodo });

      if (!todo.length) { poner(zona, vacio({ icono: 'linea', titulo: 'Todavía no hay historial', texto: 'Se guarda una foto por día. Cuando exista la primera, aparecerá aquí.' })); return; }

      const cmp = compararCon(todo, 7);
      const tarjetasKpi = METRICAS.slice(0, 4).map((m) => {
        const fila = cmp?.filas.find((f) => f.clave === m.clave);
        const valor = valorDe(ultimo, m.clave);
        const pie = fila && fila.delta !== null ? `${flecha[fila.tono]} ${fila.delta === 0 ? 'sin cambios' : `${fila.delta > 0 ? '+' : '−'}${numero(Math.abs(fila.delta), 0)}`} en ${plural(cmp.dias, 'día', 'días')}` : 'aún sin comparación';
        return kpi({ icono: 'linea', etiqueta: m.etiqueta, valor: valor === null ? '—' : numero(valor, 0), pie, tono: fila?.tono === 'peor' ? 'alerta' : fila?.tono === 'mejor' ? 'ok' : '' });
      });

      const avisoCorto = visibles.length < 2
        ? banner({ tipo: 'info', texto: 'El historial recién empieza: se guarda una foto por día. Los gráficos aparecerán cuando haya al menos dos días.' })
        : null;

      const graficos = GRAFICOS.map((g) => {
        const series = g.series.map(([nombre, clave, color]) => ({ nombre, color, puntos: serieDe(visibles, clave) })).filter((x) => x.puntos.length);
        const t = tarjeta({ titulo: g.titulo, icono: g.icono, clase: 'c-6' });
        if (!series.length) t.cuerpo.append(vacio({ icono: 'info', titulo: 'Sin datos todavía', texto: 'Este dato aún no se ha registrado.' }));
        else t.cuerpo.append(lineas(series, { formato: g.formato, desdeCero: g.desdeCero }), leyendaLineas(series));
        return t.el;
      });

      poner(zona,
        h('div.rejilla.rejilla--4', {}, tarjetasKpi),
        avisoCorto,
        h('div.grid12', {}, graficos),
        h('p.suave', { texto: `${plural(visibles.length, 'día', 'días')} con datos · desde ${fechaCorta(visibles[0]?.dia)} hasta ${fechaCorta(ultimo.dia)}. Los precios medianos no cuentan los avisos con precio dudoso.`, estilo: { fontSize: '0.84rem' } }));
    }

    poner(contenedor,
      encabezado({ titulo: 'Tendencias', sub: 'Cómo cambian en el tiempo los proyectos atrasados, el stock, los pedidos y los precios. Una foto por día.' }),
      h('div', { estilo: { marginBottom: '0.8rem' } }, chips(PERIODOS, periodo, (v) => { periodo = v || periodo; pintar(); }, { etiqueta: 'Periodo' })),
      zona);
    pintar();
  },
};
