// Materiales: stock bajo su mínimo, por categoría, con búsqueda en la API, orden en tabla y exportación.
import { consultar } from '../nucleo/api.js';
import { h } from '../nucleo/dom.js';
import { barraExportar, buscador, kpi, paginacion, paginar, tabla, tarjeta, vacio } from '../nucleo/componentes.js';
import { barrasH } from '../nucleo/graficos.js';
import { compacto, numero, ordenarPor, plural } from '../nucleo/formato.js';
import { inventarioSinCargar } from '../nucleo/insights.js';
import { banner } from '../nucleo/componentes.js';
import { cargandoGenerico, encabezado, poner } from './_comun.js';

const LIMITES = [25, 50, 100];

export default {
  async montar(ctx) {
    const { contenedor } = ctx;
    cargandoGenerico(contenedor);
    let q = ctx.params.q ?? '';
    let categoria = ctx.params.categoria ?? '';
    let limite = LIMITES.includes(Number(ctx.params.limite)) ? Number(ctx.params.limite) : 25;
    let orden = { clave: 'faltante', dir: 'desc' };
    let pagina = 1;

    const cats = await consultar('stock-categorias').catch(() => ({ datos: [] }));
    const resumen = await consultar('resumen-general').then((r) => r.datos[0]).catch(() => null);
    const sinCargar = resumen ? inventarioSinCargar(resumen.stock) : false;
    const zonaKpi = h('div.rejilla.rejilla--4'), zonaTabla = h('div'), zonaExport = h('div'), zonaGrafico = h('div');
    const tGraf = tarjeta({ titulo: 'Faltante por categoría', icono: 'materiales', clase: 'c-4' });
    const tTabla = tarjeta({ titulo: 'Materiales bajo su mínimo', icono: 'lista', clase: 'c-8' });
    tGraf.cuerpo.append(zonaGrafico);
    tTabla.acciones.append(zonaExport);
    tTabla.cuerpo.append(zonaTabla);

    function pintarGrafico() {
      const filas = (cats.datos ?? []).filter((c) => c.faltante_total > 0).map((c) => ({ etiqueta: c.categoria, valor: c.faltante_total, extra: `${numero(c.en_stock_bajo, 0)} de ${numero(c.materiales, 0)} bajo mínimo`, color: c.categoria === categoria ? 'var(--primario)' : 'var(--mrp)', onClick: () => { categoria = categoria === c.categoria ? '' : c.categoria; pagina = 1; cargar(); } }));
      poner(zonaGrafico, filas.length ? barrasH(filas, { formato: compacto }) : vacio({ icono: 'ok', titulo: 'Sin faltantes' }));
    }

    async function cargar() {
      ctx.cambiarParams({ q, categoria, limite: limite === 25 ? '' : limite });
      poner(zonaTabla, h('div.esqueleto.esqueleto--bloque'));
      let r;
      try { r = await consultar('stock-bajo', { q, categoria, limite }); } catch (e) { ctx.error(e); return; }
      const filas = r.datos.map((x) => ({ ...x, cant: Number(x.cantidad), min: Number(x.minimo), falta: Number(x.faltante) }));
      const sin = filas.filter((x) => x.cant === 0).length;
      poner(zonaKpi, 
        kpi({ icono: 'materiales', etiqueta: 'Mostrados', valor: numero(filas.length, 0), pie: filas.length >= limite ? `Tope de ${limite}: sube el límite para ver más` : 'Todos los que cumplen el filtro', tono: filas.length ? 'aviso' : 'ok' }),
        kpi({ icono: 'alerta', etiqueta: 'Sin existencias', valor: numero(sin, 0), pie: 'Cantidad en cero', tono: sin ? 'alerta' : 'ok' }),
        kpi({ icono: 'tabla', etiqueta: 'Faltante total', valor: compacto(filas.reduce((a, x) => a + (x.falta || 0), 0)), pie: 'Suma de unidades que faltan' }),
        kpi({ icono: 'filtro', etiqueta: 'Categorías', valor: numero(new Set(filas.map((x) => x.categoria)).size, 0), pie: categoria ? `Filtrando: ${categoria}` : 'Con al menos un material' }));
      pintarGrafico();
      pintarTabla(filas);
    }

    function pintarTabla(filas) {
      const ordenadas = ordenarPor(filas, orden.clave, orden.dir);
      const info = paginar(ordenadas, pagina, 15);
      pagina = info.pagina;
      poner(zonaExport, barraExportar({ nombre: 'materiales-stock-bajo', columnas: [{ clave: 'material', titulo: 'Material' }, { clave: 'categoria', titulo: 'Categoría' }, { clave: 'cantidad', titulo: 'Cantidad' }, { clave: 'unidad', titulo: 'Unidad' }, { clave: 'minimo', titulo: 'Mínimo' }, { clave: 'faltante', titulo: 'Faltante' }], filas: ordenadas }));
      poner(zonaTabla, tabla({
        columnas: [
          { clave: 'material', titulo: 'Material', larga: true }, { clave: 'categoria', titulo: 'Categoría' },
          { clave: 'cant', titulo: 'Cantidad', num: true, render: (f) => `${numero(f.cant, 2)} ${f.unidad ?? ''}` },
          { clave: 'min', titulo: 'Mínimo', num: true, render: (f) => numero(f.min, 2) },
          { clave: 'falta', titulo: 'Faltante', num: true, render: (f) => h('b', { texto: numero(f.falta, 2), estilo: { color: f.cant === 0 ? 'var(--peligro)' : 'var(--aviso)' } }) },
        ],
        filas: info.filas, orden, onOrden: (clave) => { orden = { clave, dir: orden.clave === clave && orden.dir === 'desc' ? 'asc' : 'desc' }; pintarTabla(filas); },
        vacioEl: vacio({ icono: 'ok', titulo: 'Ningún material bajo su mínimo', texto: q || categoria ? 'Prueba quitando los filtros.' : 'Todo el stock está sobre el mínimo.' }),
      }), paginacion(info, (n) => { pagina = n; pintarTabla(filas); }));
    }

    const buscar = buscador({ placeholder: 'Buscar material…', valor: q, onTexto: (t) => { q = t; pagina = 1; cargar(); } });
    const selLimite = h('select', { attrs: { 'aria-label': 'Cantidad máxima de materiales' }, on: { change: (e) => { limite = Number(e.target.value); pagina = 1; cargar(); } } }, LIMITES.map((n) => h('option', { attrs: { value: n, ...(n === limite ? { selected: true } : {}) }, texto: `Hasta ${n}` })));
    const quitar = h('button.boton.boton--chico', { attrs: { type: 'button' }, texto: 'Quitar categoría', on: { click: () => { categoria = ''; pagina = 1; cargar(); } } });
    const barra = h('div.herramientas', {}, buscar.el, selLimite, quitar);

    poner(contenedor, 
      encabezado({ titulo: 'Materiales', sub: 'Los materiales del MRP que están en o bajo su stock mínimo. Pulsa una barra para filtrar por categoría.' }),
      sinCargar ? banner({ tipo: 'aviso', texto: `Casi ningún material tiene existencias registradas: ${numero(resumen.stock.sin_existencias, 0)} de ${numero(resumen.stock.materiales_con_minimo, 0)} están en cero. Los mínimos son valores de partida; hasta que se cargue el inventario en el MRP, «stock bajo» no refleja una falta real.` }) : null,
      zonaKpi, barra, h('div.grid12', {}, tTabla.el, tGraf.el));
    await cargar();
  },
};
