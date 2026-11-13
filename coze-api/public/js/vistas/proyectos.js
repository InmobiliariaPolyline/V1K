// Proyectos: tarjetas, línea de tiempo (Gantt) o tabla, con búsqueda, filtro por estado, orden y detalle lateral.
import { consultar } from '../nucleo/api.js';
import { h, icono } from '../nucleo/dom.js';
import { barraExportar, buscador, chips, dialogo, insigniaEstado, kpi, paginacion, paginar, segmentado, tabla, vacio, banner } from '../nucleo/componentes.js';
import { gantt } from '../nucleo/graficos.js';
import { contiene, diasEntre, fechaCorta, numero, ordenarPor, plural, porcentaje, relativoDias, soloFecha } from '../nucleo/formato.js';
import { guardarPref, prefs } from '../nucleo/estado.js';
import { cargandoGenerico, encabezado, poner } from './_comun.js';

const ESTADOS = ['atrasado', 'en curso', 'por iniciar', 'terminado'];
const ORDENES = [
  { valor: 'estado', etiqueta: 'Estado (atrasados primero)' },
  { valor: 'avance_desc', etiqueta: 'Mayor avance' },
  { valor: 'avance_asc', etiqueta: 'Menor avance' },
  { valor: 'fin', etiqueta: 'Fecha de fin más cercana' },
  { valor: 'nombre', etiqueta: 'Nombre (A–Z)' },
  { valor: 'tareas', etiqueta: 'Más tareas atrasadas' },
];
const PESO_ESTADO = { atrasado: 0, 'en curso': 1, 'por iniciar': 2, terminado: 3 };

const normalizarProy = (p) => ({ ...p, avance: Number(p.avance_pct) || 0, inicioF: soloFecha(p.inicio), finF: soloFecha(p.fin) });

function ordenar(lista, orden) {
  switch (orden) {
    case 'avance_desc': return ordenarPor(lista, 'avance', 'desc', 'numero');
    case 'avance_asc': return ordenarPor(lista, 'avance', 'asc', 'numero');
    case 'fin': return ordenarPor(lista, 'finF', 'asc');
    case 'nombre': return ordenarPor(lista, 'nombre', 'asc');
    case 'tareas': return ordenarPor(lista, 'tareas_atrasadas', 'desc', 'numero');
    default: return [...lista].sort((a, b) => (PESO_ESTADO[a.estado] ?? 9) - (PESO_ESTADO[b.estado] ?? 9) || a.nombre.localeCompare(b.nombre, 'es'));
  }
}

function tonoAvance(p) { return p.estado === 'atrasado' ? 'peligro' : p.estado === 'terminado' ? 'ok' : 'info'; }

export default {
  async montar(ctx) {
    const { contenedor, hoy } = ctx;
    cargandoGenerico(contenedor);
    const resp = await consultar('proyectos', { limite: 200 });
    const todos = resp.datos.map(normalizarProy);
    let vista = prefs().proyVista;
    let estado = ESTADOS.includes(ctx.params.estado) ? ctx.params.estado : '';
    let texto = ctx.params.q ?? '';
    let orden = ORDENES.some((o) => o.valor === ctx.params.orden) ? ctx.params.orden : 'estado';
    let pagina = 1;

    const zona = h('div');
    const barraKpi = h('div.rejilla.rejilla--4');
    const conteo = (e) => todos.filter((p) => p.estado === e).length;

    const filtrar = () => ordenar(todos.filter((p) => (!estado || p.estado === estado) && (!texto || contiene(`${p.nombre} ${p.responsable ?? ''}`, texto))), orden);

    function abrirDetalle(p) {
      const cuerpo = h('div.detalle', {}, h('div.detalle__cabeza', {}, insigniaEstado(p.estado), p.tareas_atrasadas ? h('span.insignia.insignia--peligro', { texto: plural(p.tareas_atrasadas, 'tarea atrasada', 'tareas atrasadas') }) : null),
        h('div.progreso', {}, h('span', { estilo: { width: `${porcentaje(p.avance)}%` } })),
        h('p.suave', { texto: `${numero(p.avance, 0)} % de avance · ${plural(p.tareas_total, 'tarea', 'tareas')}` }),
        h('dl.detalle__rejilla', {},
          h('div', {}, h('dt', { texto: 'Responsable' }), h('dd', { texto: p.responsable ?? '—' })),
          h('div', {}, h('dt', { texto: 'Duración' }), h('dd', { texto: p.finF && p.inicioF ? `${numero(diasEntre(p.inicioF, p.finF), 0)} días` : '—' })),
          h('div', {}, h('dt', { texto: 'Inicio' }), h('dd', { texto: fechaCorta(p.inicio) })),
          h('div', {}, h('dt', { texto: 'Fin previsto' }), h('dd', { texto: `${fechaCorta(p.fin)} · ${relativoDias(p.fin, hoy)}` }))),
        h('h3', { texto: 'Próximos hitos' }));
      const lista = h('div.lista', {}, h('p.suave', { texto: 'Cargando…' }));
      cuerpo.append(lista);
      dialogo({ titulo: p.nombre, cuerpo, lateral: true });
      consultar('hitos', { proyecto: p.nombre, limite: 30 }).then((r) => {
        const propios = r.datos.filter((x) => x.proyecto === p.nombre);
        poner(lista, ...(propios.length ? propios.map((x) => h('div.item', {}, h('span.item__icono', {}, icono('bandera')), h('span.item__texto', {}, h('span.item__titulo', { texto: x.descripcion }), h('span.item__meta', { texto: fechaCorta(x.fecha) })), h('span.item__derecha', { texto: relativoDias(x.fecha, hoy) }))) : [h('p.suave', { texto: 'Este proyecto no tiene hitos registrados.' })]));
      }).catch(() => poner(lista, h('p.suave', { texto: 'No se pudieron cargar los hitos.' })));
    }

    function tarjetaProyecto(p) {
      return h('button.tarjeta.tarjeta--clic.proy', { attrs: { type: 'button' }, on: { click: () => abrirDetalle(p) } },
        h('div.proy__cab', {}, h('div', {}, h('div.proy__nombre', { texto: p.nombre }), h('div.proy__resp', { texto: p.responsable ?? 'Sin responsable' })), insigniaEstado(p.estado)),
        h('div.proy__avance', {}, h(`div.progreso.progreso--${tonoAvance(p) === 'peligro' ? 'peligro' : tonoAvance(p)}`, {}, h('span', { estilo: { width: `${porcentaje(p.avance)}%` } })), h('b', { texto: `${numero(p.avance, 0)} %` })),
        h('div.proy__pie', {},
          h('span', {}, icono('calendario'), `Fin ${fechaCorta(p.fin)} (${relativoDias(p.fin, hoy)})`),
          p.tareas_atrasadas ? h('span', { estilo: { color: 'var(--peligro)' } }, icono('alerta'), plural(p.tareas_atrasadas, 'atrasada', 'atrasadas')) : null,
          p.proximo_hito ? h('span', {}, icono('bandera'), `${p.proximo_hito} · ${relativoDias(p.proximo_hito_fecha, hoy)}`) : null));
    }

    function pintar() {
      const lista = filtrar();
      ctx.cambiarParams({ estado, q: texto, orden: orden === 'estado' ? '' : orden });
      const nodos = [];
      if (!lista.length) {
        nodos.push(vacio({ icono: 'buscar', titulo: 'Ningún proyecto coincide', texto: 'Cambia el estado o el texto de búsqueda.', accion: { texto: 'Quitar filtros', onClick: () => { estado = ''; texto = ''; construir(); } } }));
      } else if (vista === 'linea') {
        nodos.push(gantt(lista, { hoy, onClick: abrirDetalle }), h('p.suave', { texto: 'La barra va de inicio a fin; el relleno es el avance y la línea punteada marca hoy.', estilo: { marginTop: '0.6rem' } }));
      } else if (vista === 'tabla') {
        const info = paginar(lista, pagina, 15);
        pagina = info.pagina;
        nodos.push(tabla({
          columnas: [
            { clave: 'nombre', titulo: 'Proyecto', larga: true }, { clave: 'responsable', titulo: 'Responsable' },
            { clave: 'estado', titulo: 'Estado', render: (f) => insigniaEstado(f.estado) },
            { clave: 'avance', titulo: 'Avance', num: true, render: (f) => `${numero(f.avance, 0)} %` },
            { clave: 'finF', titulo: 'Fin', render: (f) => fechaCorta(f.fin) },
            { clave: 'tareas_atrasadas', titulo: 'Atrasadas', num: true },
          ],
          filas: info.filas, onFila: abrirDetalle,
        }), paginacion(info, (n) => { pagina = n; pintar(); }));
      } else {
        nodos.push(h('div.rejilla--tarjetas', {}, lista.map(tarjetaProyecto)));
      }
      poner(zona, h('p.suave', { texto: `${plural(lista.length, 'proyecto', 'proyectos')}${lista.length !== todos.length ? ` de ${numero(todos.length, 0)}` : ''}`, estilo: { margin: '0 0 0.6rem' } }), ...nodos);
      poner(barraExportarEl, barraExportar({ nombre: 'proyectos', columnas: [{ clave: 'nombre', titulo: 'Proyecto' }, { clave: 'responsable', titulo: 'Responsable' }, { clave: 'estado', titulo: 'Estado' }, { clave: 'avance_pct', titulo: 'Avance %' }, { clave: 'inicio', titulo: 'Inicio' }, { clave: 'fin', titulo: 'Fin' }, { clave: 'tareas_total', titulo: 'Tareas' }, { clave: 'tareas_atrasadas', titulo: 'Tareas atrasadas' }], filas: lista }));
    }

    const barraExportarEl = h('div');
    const herramientas = h('div.herramientas');
    function construir() {
      poner(barraKpi, 
        kpi({ icono: 'proyectos', etiqueta: 'Total', valor: numero(todos.length, 0), pie: `Avance medio ${numero(todos.length ? todos.reduce((a, p) => a + p.avance, 0) / todos.length : 0, 0)} %` }),
        kpi({ icono: 'alerta', etiqueta: 'Atrasados', valor: numero(conteo('atrasado'), 0), tono: conteo('atrasado') ? 'alerta' : 'ok', pie: plural(todos.reduce((a, p) => a + (p.tareas_atrasadas || 0), 0), 'tarea atrasada', 'tareas atrasadas') }),
        kpi({ icono: 'linea', etiqueta: 'En curso', valor: numero(conteo('en curso'), 0) }),
        kpi({ icono: 'ok', etiqueta: 'Terminados', valor: numero(conteo('terminado'), 0), tono: 'ok' }));
      const buscar = buscador({ placeholder: 'Buscar por nombre o responsable…', valor: texto, onTexto: (t) => { texto = t; pagina = 1; pintar(); } });
      const selOrden = h('select', { attrs: { 'aria-label': 'Ordenar por' }, on: { change: (e) => { orden = e.target.value; pintar(); } } }, ORDENES.map((o) => h('option', { attrs: { value: o.valor, ...(o.valor === orden ? { selected: true } : {}) }, texto: o.etiqueta })));
      poner(herramientas, buscar.el, selOrden,
        segmentado([{ valor: 'tarjetas', etiqueta: 'Tarjetas', icono: 'cuadricula' }, { valor: 'linea', etiqueta: 'Línea de tiempo', icono: 'linea' }, { valor: 'tabla', etiqueta: 'Tabla', icono: 'tabla' }], vista, (v) => { vista = v; guardarPref('proyVista', v); pagina = 1; pintar(); }, { etiqueta: 'Tipo de vista' }),
        h('div.herramientas__espacio'), barraExportarEl);
      poner(chipsEl, chips([{ valor: '', etiqueta: 'Todos', n: todos.length }, ...ESTADOS.map((e) => ({ valor: e, etiqueta: e[0].toUpperCase() + e.slice(1), n: conteo(e) }))], estado, (v) => { estado = v; pagina = 1; pintar(); }, { etiqueta: 'Filtrar por estado' }));
      pintar();
    }
    const chipsEl = h('div', { estilo: { marginBottom: '0.8rem' } });

    poner(contenedor, 
      encabezado({ titulo: 'Proyectos', sub: 'Avance, fechas y tareas atrasadas de cada proyecto del Planner.' }),
      resp.total > todos.length ? banner({ tipo: 'aviso', texto: 'Se muestran solo los primeros 200 proyectos.' }) : null,
      barraKpi, chipsEl, herramientas, zona);
    construir();
  },
};
