// Inicio: panorama general con alertas, frescura de los datos, indicadores y gráficos.
import { consultar } from '../nucleo/api.js';
import { h, icono } from '../nucleo/dom.js';
import { banner, insigniaEstado, kpi, tarjeta, vacio } from '../nucleo/componentes.js';
import { anillo, barrasH, dona, leyenda } from '../nucleo/graficos.js';
import { compacto, estadoFrescura, fechaCorta, haceHoras, NOMBRE_APP, numero, plural, relativoDias, saludo } from '../nucleo/formato.js';
import { generarAlertas, horasCorto, inventarioSinCargar, pctFrescura, saludGlobal } from '../nucleo/insights.js';
import { cargandoGenerico, fila, poner } from './_comun.js';

const COLOR_ESTADO = { atrasado: 'var(--peligro)', 'en curso': 'var(--primario-2)', terminado: 'var(--ok)', 'por iniciar': 'var(--txt-3)' };
const COLOR_APP = { planner: 'var(--planner)', mrp: 'var(--mrp)', scraper: 'var(--scraper)' };
const COLOR_PORTAL = ['var(--primario-2)', 'var(--scraper)', 'var(--mrp)', 'var(--primario)', 'var(--info)'];
const TONO_FRESCURA = { ok: 'var(--ok)', aviso: 'var(--aviso)', viejo: 'var(--peligro)', desconocido: 'var(--txt-3)' };

export default {
  async montar(ctx) {
    const { contenedor, hoy } = ctx;
    cargandoGenerico(contenedor);
    const [resp, cats, dist] = await Promise.all([
      consultar('resumen-general'),
      consultar('stock-categorias').catch(() => ({ datos: [] })),
      consultar('propiedades-distritos').catch(() => ({ datos: [] })),
    ]);
    const r = resp.datos[0];
    if (!r) { poner(contenedor, vacio({ icono: 'base', titulo: 'Todavía no hay datos', texto: 'Cuando las apps sincronicen, el panorama aparecerá aquí.' })); return; }

    const alertas = generarAlertas(r, hoy);
    const salud = saludGlobal(alertas);
    const textoSalud = { ok: 'Todo en orden', aviso: 'Hay puntos por revisar', peligro: 'Requiere atención' }[salud];
    const problemas = alertas.filter((a) => a.tono === 'peligro' || a.tono === 'aviso').length;

    // ── Saludo ──
    const cab = h('section.saludo', {},
      h('h2', { texto: `${saludo()}, equipo V1K` }),
      h('p', { texto: 'Este es el estado de Planner, MRP y Scraper según la última sincronización.' }),
      h('div.saludo__estado', {},
        h(`span.salud.salud--${salud}`, {}, icono(salud === 'ok' ? 'ok' : 'alerta'), textoSalud),
        problemas ? h('span.suave', { texto: plural(problemas, 'punto por revisar', 'puntos por revisar') }) : null));

    // ── Frescura ──
    const frescos = ['planner', 'mrp', 'scraper'].map((app) => {
      const f = r.frescura.find((x) => x.app === app);
      const horas = f ? f.hace_horas : null;
      const est = f ? estadoFrescura(horas) : 'desconocido';
      return h('div.frescura__app', {},
        anillo(pctFrescura(horas), { tam: 62, grosor: 7, color: TONO_FRESCURA[est] ?? 'var(--txt-3)', texto: horasCorto(horas) }),
        h('div', {}, h('div.frescura__nombre', { estilo: { color: COLOR_APP[app] }, texto: NOMBRE_APP[app] }),
          h('div.frescura__texto', { texto: f ? haceHoras(horas) : 'sin sincronizar' })));
    });
    const tFrescura = tarjeta({ titulo: 'Frescura de los datos', icono: 'reloj', clase: 'c-12' });
    tFrescura.cuerpo.append(h('div.frescura', {}, frescos));

    // ── Indicadores ──
    const p = r.proyectos, st = r.stock, pr = r.propiedades;
    const indicadores = h('div.rejilla.rejilla--4', {},
      kpi({ icono: 'proyectos', etiqueta: 'Proyectos', valor: numero(p.total, 0), pie: `${numero(p.en_curso, 0)} en curso · ${numero(p.terminados, 0)} terminados`, onClick: () => ctx.navegar('proyectos') }),
      kpi({ icono: 'alerta', etiqueta: 'Atrasados', valor: numero(p.atrasados, 0), pie: plural(p.tareas_atrasadas, 'tarea atrasada', 'tareas atrasadas'), tono: p.atrasados ? 'alerta' : 'ok', onClick: () => ctx.navegar('proyectos', { estado: 'atrasado' }) }),
      inventarioSinCargar(st)
        ? kpi({ icono: 'materiales', etiqueta: 'Inventario cargado', valor: numero(st.materiales_con_minimo - st.sin_existencias, 0), pie: `de ${numero(st.materiales_con_minimo, 0)} materiales con mínimo · el resto sin existencias`, tono: 'aviso', titulo: 'Casi ningún material tiene existencias registradas en el MRP', onClick: () => ctx.navegar('materiales') })
        : kpi({ icono: 'materiales', etiqueta: 'Stock bajo mínimo', valor: numero(st.en_stock_bajo, 0), pie: `de ${numero(st.materiales_con_minimo, 0)} materiales · ${numero(st.sin_existencias, 0)} sin existencias`, tono: st.en_stock_bajo ? 'aviso' : 'ok', onClick: () => ctx.navegar('materiales') }),
      kpi({ icono: 'pedidos', etiqueta: 'Pedidos abiertos', valor: numero(r.pedidos.abiertos, 0), pie: r.proximos_pedidos[0] ? `Próximo: ${relativoDias(r.proximos_pedidos[0].llegada_estimada, hoy)}` : 'Sin pedidos abiertos', onClick: () => ctx.navegar('pedidos') }),
      kpi({ icono: 'propiedades', etiqueta: 'Propiedades', valor: compacto(pr.total_catalogo), pie: `${numero(pr.copiadas, 0)} copiadas al panel`, onClick: () => ctx.navegar('propiedades') }),
    );

    // ── Alertas ──
    const tAlertas = tarjeta({ titulo: 'Qué mirar primero', icono: 'chispa', clase: 'c-8' });
    tAlertas.cuerpo.append(h('div.lista', {}, alertas.map((a) => fila({ icono: a.icono, titulo: a.titulo, meta: a.texto, tono: a.tono, onClick: () => ctx.navegar(a.ir.ruta, a.ir.params) }))));

    // ── Proyectos por estado ──
    const segEstado = [['atrasado', p.atrasados], ['en curso', p.en_curso], ['por iniciar', p.por_iniciar], ['terminado', p.terminados]].map(([e, n]) => ({ etiqueta: e[0].toUpperCase() + e.slice(1), valor: n, color: COLOR_ESTADO[e], clave: e }));
    const tProy = tarjeta({ titulo: 'Proyectos por estado', icono: 'proyectos', clase: 'c-4' });
    tProy.cuerpo.append(h('div.con-dona', {}, dona(segEstado, { tam: 170, grosor: 26, centro: { valor: p.total, texto: 'proyectos' }, onClick: (s) => ctx.navegar('proyectos', { estado: s.clave }) }), leyenda(segEstado, { onClick: (s) => ctx.navegar('proyectos', { estado: s.clave }) })));

    // ── Stock por categoría ──
    const tCats = tarjeta({ titulo: 'Faltante de stock por categoría', icono: 'materiales', clase: 'c-6' });
    const filasCat = (cats.datos ?? []).filter((c) => c.faltante_total > 0).slice(0, 7).map((c) => ({ etiqueta: c.categoria, valor: c.faltante_total, extra: `${plural(c.en_stock_bajo, 'material bajo mínimo', 'materiales bajo mínimo')} de ${numero(c.materiales, 0)}`, color: 'var(--mrp)', onClick: () => ctx.navegar('materiales', { categoria: c.categoria }) }));
    tCats.cuerpo.append(filasCat.length ? barrasH(filasCat, { formato: compacto }) : vacio({ icono: 'ok', titulo: 'Sin faltantes', texto: 'Ninguna categoría está por debajo de su mínimo.' }));

    // ── Propiedades por portal ──
    const porPortal = new Map();
    for (const x of r.propiedades_por_portal) porPortal.set(x.portal, (porPortal.get(x.portal) ?? 0) + x.total);
    const tPortales = tarjeta({ titulo: 'Propiedades por portal', icono: 'propiedades', clase: 'c-6' });
    const segPortal = [...porPortal].map(([portal, total], i) => ({ etiqueta: portal, valor: total, color: COLOR_PORTAL[i % COLOR_PORTAL.length], clave: portal }));
    tPortales.cuerpo.append(segPortal.length ? h('div.con-dona', {}, dona(segPortal, { tam: 170, grosor: 26, centro: { valor: compacto(pr.total_catalogo), texto: 'avisos' }, onClick: (s) => ctx.navegar('propiedades', { portal: s.clave }) }), leyenda(segPortal, { onClick: (s) => ctx.navegar('propiedades', { portal: s.clave }) })) : vacio({ icono: 'propiedades', titulo: 'Sin avisos', texto: 'El Scraper todavía no sincronizó propiedades.' }));

    // ── Próximos hitos y pedidos ──
    const tHitos = tarjeta({ titulo: 'Próximos hitos', icono: 'calendario', clase: 'c-4' });
    tHitos.cuerpo.append(r.proximos_hitos.length ? h('div.lista', {}, r.proximos_hitos.map((x) => fila({ icono: 'bandera', titulo: x.descripcion, meta: x.proyecto ?? 'Sin proyecto', derecha: h('span', { texto: relativoDias(x.fecha, hoy), attrs: { title: fechaCorta(x.fecha) } }), onClick: () => ctx.navegar('calendario') }))) : vacio({ icono: 'calendario', titulo: 'Sin hitos próximos' }));

    const tPedidos = tarjeta({ titulo: 'Próximas llegadas', icono: 'pedidos', clase: 'c-4' });
    tPedidos.cuerpo.append(r.proximos_pedidos.length ? h('div.lista', {}, r.proximos_pedidos.map((x) => fila({ icono: 'pedidos', titulo: x.proveedor, meta: `${x.pedido_id} · ${x.obra ?? 's/obra'}`, derecha: h('span', {}, h('div', { texto: x.llegada_estimada ? relativoDias(x.llegada_estimada, hoy) : 'sin fecha' }), insigniaEstado(x.estado)), onClick: () => ctx.navegar('pedidos') }))) : vacio({ icono: 'pedidos', titulo: 'Sin pedidos abiertos' }));

    const tFalta = tarjeta({ titulo: 'Mayor faltante', icono: 'materiales', clase: 'c-4' });
    tFalta.cuerpo.append(r.mayor_faltante.length ? h('div.lista', {}, r.mayor_faltante.map((x) => fila({ icono: 'alerta', tono: 'aviso', titulo: x.material, meta: x.categoria ?? 'Sin categoría', derecha: h('span', { texto: `−${numero(x.faltante, 0)} ${x.unidad ?? ''}` }), onClick: () => ctx.navegar('materiales', { q: x.material }) }))) : vacio({ icono: 'ok', titulo: 'Sin faltantes' }));

    // ── Distritos más activos ──
    const porDistrito = new Map();
    for (const d of dist.datos ?? []) porDistrito.set(d.distrito, (porDistrito.get(d.distrito) ?? 0) + d.avisos);
    const topDist = [...porDistrito].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([d, n]) => ({ etiqueta: d, valor: n, color: 'var(--scraper)', onClick: () => ctx.navegar('propiedades', { distrito: d }) }));
    const tDist = tarjeta({ titulo: 'Distritos con más avisos', icono: 'pin', clase: 'c-6' });
    tDist.cuerpo.append(topDist.length ? barrasH(topDist) : vacio({ icono: 'pin', titulo: 'Sin distritos' }));

    // ── Accesos ──
    const accesos = [['calendario', 'Calendario', 'Hitos del mes'], ['explorador', 'Explorador de API', 'Prueba las consultas'], ['asistente', 'Agente de Coze', 'Preguntas sugeridas'], ['sistema', 'Sistema', 'Latencia y ajustes']];
    const tAccesos = tarjeta({ titulo: 'Más herramientas', icono: 'cuadricula', clase: 'c-6' });
    tAccesos.cuerpo.append(h('div.atajos-modulos', {}, accesos.map(([id, t, sub]) => h('a.modulo', { attrs: { href: `#/${id}` } }, icono(id), h('span', {}, t, h('small', { texto: sub }))))));

    poner(contenedor, 
      cab,
      indicadores,
      h('div.grid12', {}, tAlertas.el, tProy.el),
      h('div.grid12', {}, tFrescura.el),
      h('div.grid12', {}, tCats.el, tPortales.el),
      h('div.grid12', {}, tHitos.el, tPedidos.el, tFalta.el),
      h('div.grid12', {}, tDist.el, tAccesos.el),
      problemas ? banner({ tipo: 'info', texto: 'Los datos del panel se leen en modo solo lectura; para corregirlos usa las apps de origen.' }) : null,
    );
    ctx.comandos.push({ id: 'inicio-alertas', grupo: 'Inicio', etiqueta: 'Ver qué mirar primero', icono: 'chispa', accion: () => tAlertas.el.scrollIntoView({ behavior: 'smooth' }) });
  },
};
