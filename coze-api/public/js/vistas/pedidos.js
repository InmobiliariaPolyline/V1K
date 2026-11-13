// Pedidos: órdenes de compra abiertas del MRP, con estado, llegada estimada y avance de recepción.
import { consultar } from '../nucleo/api.js';
import { h } from '../nucleo/dom.js';
import { barraExportar, buscador, chips, insigniaEstado, kpi, paginacion, paginar, tabla, tarjeta, vacio } from '../nucleo/componentes.js';
import { barrasH } from '../nucleo/graficos.js';
import { contiene, diasEntre, fechaCorta, numero, ordenarPor, plural, porcentaje, relativoDias, soloFecha } from '../nucleo/formato.js';
import { cargandoGenerico, encabezado, poner } from './_comun.js';

const ESTADOS = ['pendiente', 'enviada', 'parcial'];

export default {
  async montar(ctx) {
    const { contenedor, hoy } = ctx;
    cargandoGenerico(contenedor);
    const resp = await consultar('pedidos', { limite: 200 });
    const todos = resp.datos.map((p) => {
      const pedida = Number(p.cantidad_pedida) || 0, recibida = Number(p.cantidad_recibida) || 0;
      const llegada = soloFecha(p.llegada_estimada);
      return { ...p, pedida, recibida, avance: pedida > 0 ? (recibida / pedida) * 100 : 0, llegada, dias: llegada ? diasEntre(hoy, llegada) : null };
    });
    let estado = ESTADOS.includes(ctx.params.estado) ? ctx.params.estado : '';
    let texto = ctx.params.q ?? '';
    let orden = { clave: 'llegada', dir: 'asc' };
    let pagina = 1;

    const zona = h('div'), zonaExport = h('div'), zonaChips = h('div', { estilo: { marginBottom: '0.8rem' } });
    const zonaProv = h('div');
    const vencidos = todos.filter((p) => p.dias !== null && p.dias < 0);
    const estaSemana = todos.filter((p) => p.dias !== null && p.dias >= 0 && p.dias <= 7);
    const sinFecha = todos.filter((p) => p.dias === null);

    const filtrar = () => todos.filter((p) => (!estado || p.estado === estado) && (!texto || contiene(`${p.proveedor} ${p.obra ?? ''} ${p.pedido_id}`, texto)));

    function pintar() {
      ctx.cambiarParams({ estado, q: texto });
      const lista = filtrar();
      const ord = ordenarPor(lista, orden.clave, orden.dir);
      const info = paginar(ord, pagina, 12);
      pagina = info.pagina;
      poner(zonaExport, barraExportar({ nombre: 'pedidos-abiertos', columnas: [{ clave: 'pedido_id', titulo: 'Pedido' }, { clave: 'proveedor', titulo: 'Proveedor' }, { clave: 'obra', titulo: 'Obra' }, { clave: 'estado', titulo: 'Estado' }, { clave: 'llegada_estimada', titulo: 'Llegada estimada' }, { clave: 'lineas', titulo: 'Líneas' }, { clave: 'cantidad_pedida', titulo: 'Pedido' }, { clave: 'cantidad_recibida', titulo: 'Recibido' }], filas: ord }));
      poner(zona, tabla({
        columnas: [
          { clave: 'pedido_id', titulo: 'Orden' }, { clave: 'proveedor', titulo: 'Proveedor', larga: true }, { clave: 'obra', titulo: 'Obra' },
          { clave: 'estado', titulo: 'Estado', render: (f) => insigniaEstado(f.estado) },
          { clave: 'llegada', titulo: 'Llegada', render: (f) => f.llegada ? h('span', { estilo: { color: f.dias < 0 ? 'var(--peligro)' : f.dias <= 7 ? 'var(--aviso)' : '' } }, `${fechaCorta(f.llegada)} · ${relativoDias(f.llegada, hoy)}`) : 'Sin fecha' },
          { clave: 'lineas', titulo: 'Líneas', num: true },
          { clave: 'avance', titulo: 'Recibido', num: true, render: (f) => h('div', { estilo: { minWidth: '7rem' } }, h('div.progreso', {}, h('span', { estilo: { width: `${porcentaje(f.avance)}%` } })), h('small.suave', { texto: `${numero(f.avance, 0)} % · ${numero(f.recibida, 0)}/${numero(f.pedida, 0)}` }))},
        ],
        filas: info.filas, orden, onOrden: (clave) => { orden = { clave, dir: orden.clave === clave && orden.dir === 'asc' ? 'desc' : 'asc' }; pintar(); },
        vacioEl: vacio({ icono: 'pedidos', titulo: 'Ningún pedido coincide', texto: 'Cambia el estado o la búsqueda.' }),
      }), paginacion(info, (n) => { pagina = n; pintar(); }));
    }

    // Pedidos por proveedor (conteo de órdenes abiertas)
    const porProv = new Map();
    for (const p of todos) porProv.set(p.proveedor, (porProv.get(p.proveedor) ?? 0) + 1);
    const top = [...porProv].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([prov, n]) => ({ etiqueta: prov, valor: n, color: 'var(--mrp)', onClick: () => { texto = prov; construirBusqueda(); pintar(); } }));
    zonaProv.append(top.length ? barrasH(top) : vacio({ icono: 'pedidos', titulo: 'Sin proveedores' }));

    const buscaWrap = h('div.herramientas');
    function construirBusqueda() {
      const b = buscador({ placeholder: 'Buscar proveedor, obra u orden…', valor: texto, onTexto: (t) => { texto = t; pagina = 1; pintar(); } });
      poner(buscaWrap, b.el, h('div.herramientas__espacio'), zonaExport);
    }
    construirBusqueda();
    zonaChips.append(chips([{ valor: '', etiqueta: 'Todos', n: todos.length }, ...ESTADOS.map((e) => ({ valor: e, etiqueta: e[0].toUpperCase() + e.slice(1), n: todos.filter((p) => p.estado === e).length }))], estado, (v) => { estado = v; pagina = 1; pintar(); }, { etiqueta: 'Filtrar por estado' }));

    const tTabla = tarjeta({ titulo: 'Órdenes de compra abiertas', icono: 'pedidos', clase: 'c-8' });
    tTabla.cuerpo.append(buscaWrap, zona);
    const tProv = tarjeta({ titulo: 'Órdenes por proveedor', icono: 'persona', clase: 'c-4' });
    tProv.cuerpo.append(zonaProv);

    poner(contenedor, 
      encabezado({ titulo: 'Pedidos', sub: 'Órdenes de compra del MRP que todavía no se han recibido por completo.' }),
      h('div.rejilla.rejilla--4', {},
        kpi({ icono: 'pedidos', etiqueta: 'Abiertos', valor: numero(todos.length, 0), pie: `${plural(todos.reduce((a, p) => a + (p.lineas || 0), 0), 'línea', 'líneas')} en total` }),
        kpi({ icono: 'alerta', etiqueta: 'Con llegada vencida', valor: numero(vencidos.length, 0), tono: vencidos.length ? 'alerta' : 'ok', pie: 'Debían llegar antes de hoy' }),
        kpi({ icono: 'calendario', etiqueta: 'Llegan en 7 días', valor: numero(estaSemana.length, 0), tono: estaSemana.length ? 'aviso' : '' , pie: 'Incluye los de hoy' }),
        kpi({ icono: 'info', etiqueta: 'Sin fecha', valor: numero(sinFecha.length, 0), pie: 'Llegada sin estimar' })),
      zonaChips, h('div.grid12', {}, tTabla.el, tProv.el));
    pintar();
  },
};
