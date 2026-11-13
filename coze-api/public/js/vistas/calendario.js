// Calendario: hitos de los proyectos en una cuadrícula mensual y una agenda del mes (o del día elegido).
import { consultar } from '../nucleo/api.js';
import { h, icono } from '../nucleo/dom.js';
import { chips, tarjeta, vacio } from '../nucleo/componentes.js';
import { calendarioMes } from '../nucleo/graficos.js';
import { aIso, fechaLarga, nombreDia, nombreMes, numero, plural, relativoDias, soloFecha } from '../nucleo/formato.js';
import { cargandoGenerico, encabezado, fila, poner } from './_comun.js';

export default {
  async montar(ctx) {
    const { contenedor, hoy } = ctx;
    cargandoGenerico(contenedor);
    const resp = await consultar('hitos', { limite: 200 });
    const hitos = resp.datos.map((x) => ({ ...x, dia: soloFecha(x.fecha) })).filter((x) => x.dia);

    const fHoy = new Date(`${hoy}T00:00:00`);
    let anio = fHoy.getFullYear(), mes = fHoy.getMonth();
    const m = /^(\d{4})-(\d{2})$/.exec(ctx.params.mes ?? '');
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) { anio = Number(m[1]); mes = Number(m[2]) - 1; }
    let seleccion = ctx.params.dia && /^\d{4}-\d{2}-\d{2}$/.test(ctx.params.dia) ? ctx.params.dia : null;
    let proyecto = ctx.params.proyecto ?? '';

    const proyectos = [...new Set(hitos.map((x) => x.proyecto).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    const zonaCal = h('div'), zonaAgenda = h('div'), zonaChips = h('div', { estilo: { marginBottom: '0.8rem' } });
    const prefijo = () => `${anio}-${String(mes + 1).padStart(2, '0')}`;
    const visibles = () => hitos.filter((x) => !proyecto || x.proyecto === proyecto);

    function irMes(delta) { const d = new Date(anio, mes + delta, 1); anio = d.getFullYear(); mes = d.getMonth(); seleccion = null; pintar(); }
    function irHoy() { anio = fHoy.getFullYear(); mes = fHoy.getMonth(); seleccion = hoy; pintar(); }

    function pintar() {
      ctx.cambiarParams({ mes: prefijo() === hoy.slice(0, 7) ? '' : prefijo(), dia: seleccion ?? '', proyecto });
      const lista = visibles();
      const porDia = new Map();
      for (const x of lista) porDia.set(x.dia, (porDia.get(x.dia) ?? 0) + 1);
      const delMes = lista.filter((x) => x.dia.startsWith(prefijo()));

      poner(zonaCal, 
        h('div.cal-nav', {},
          h('button.boton.boton--icono.boton--chico', { attrs: { type: 'button', 'aria-label': 'Mes anterior' }, on: { click: () => irMes(-1) } }, icono('flecha', 'icono--invertido')),
          h('h3', { texto: `${nombreMes(mes)} ${anio}` }),
          h('button.boton.boton--icono.boton--chico', { attrs: { type: 'button', 'aria-label': 'Mes siguiente' }, on: { click: () => irMes(1) } }, icono('flecha')),
          h('button.boton.boton--chico', { attrs: { type: 'button' }, on: { click: irHoy }, texto: 'Hoy' })),
        calendarioMes(anio, mes, { eventosPorDia: porDia, hoy, seleccion, onDia: (f) => { seleccion = seleccion === f ? null : f; pintar(); } }));

      const dia = seleccion ? lista.filter((x) => x.dia === seleccion) : null;
      const mostrados = dia ?? delMes;
      const titulo = dia ? `${nombreDia(new Date(`${seleccion}T00:00:00`).getDay())} ${fechaLarga(seleccion)}` : `Agenda de ${nombreMes(mes)}`;
      const agenda = new Map();
      for (const x of mostrados) { if (!agenda.has(x.dia)) agenda.set(x.dia, []); agenda.get(x.dia).push(x); }
      const bloques = [...agenda].sort((a, b) => a[0].localeCompare(b[0])).map(([f, xs]) =>
        h('div.agenda__dia', {}, h('h4.agenda__fecha', { texto: `${fechaLarga(f)} · ${relativoDias(f, hoy)}` }),
          h('div.lista', {}, xs.map((x) => fila({ icono: 'bandera', tono: f < hoy ? '' : f === hoy ? 'aviso' : 'info', titulo: x.descripcion, meta: x.proyecto ?? 'Sin proyecto', onClick: () => ctx.navegar('proyectos', { q: x.proyecto ?? '' }) })))));
      poner(zonaAgenda, 
        h('h3.agenda__titulo', { texto: titulo }),
        h('p.suave', { texto: plural(mostrados.length, 'hito', 'hitos'), estilo: { margin: '0 0 0.8rem' } }),
        ...(bloques.length ? bloques : [vacio({ icono: 'calendario', titulo: dia ? 'Sin hitos este día' : 'Sin hitos este mes', texto: 'Usa las flechas para ver otros meses.' })]));
    }

    poner(zonaChips, chips([{ valor: '', etiqueta: 'Todos los proyectos' }, ...proyectos.slice(0, 8).map((p) => ({ valor: p, etiqueta: p }))], proyecto, (v) => { proyecto = v; seleccion = null; pintar(); }, { etiqueta: 'Filtrar por proyecto' }));
    const tCal = tarjeta({ titulo: 'Calendario', icono: 'calendario', clase: 'c-6' });
    const tAg = tarjeta({ titulo: 'Agenda', icono: 'lista', clase: 'c-6' });
    tCal.cuerpo.append(zonaCal);
    tAg.cuerpo.append(zonaAgenda);
    const proximos = hitos.filter((x) => x.dia >= hoy).length;
    poner(contenedor, 
      encabezado({ titulo: 'Calendario', sub: `Hitos y fechas clave de los proyectos. ${plural(proximos, 'hito próximo', 'hitos próximos')} en total.` }),
      zonaChips,
      h('div.grid12', {}, tCal.el, tAg.el));
    pintar();
    ctx.comandos.push({ id: 'cal-hoy', grupo: 'Calendario', etiqueta: 'Calendario: ir a hoy', icono: 'calendario', accion: irHoy });
  },
};
