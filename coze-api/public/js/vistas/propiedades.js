// Propiedades: avisos del Scraper con filtros en la API, tarjetas o lista, estadísticas y precios por distrito.
import { consultar, metadatos } from '../nucleo/api.js';
import { h, icono } from '../nucleo/dom.js';
import { barraExportar, campo, insignia, tabla, tarjeta, vacio } from '../nucleo/componentes.js';
import { barrasH } from '../nucleo/graficos.js';
import { compacto, dinero, dolares, haceDesde, mediana, numero, plural, urlSegura } from '../nucleo/formato.js';
import { guardarPref, prefs } from '../nucleo/estado.js';
import { segmentado } from '../nucleo/componentes.js';
import { cargandoGenerico, encabezado, poner } from './_comun.js';

const CLAVES = ['q', 'operacion', 'inmueble', 'distrito', 'portal', 'precio_min_usd', 'precio_max_usd'];
const DEGRADADOS = {
  infocasas: 'linear-gradient(135deg,#0ea5e9,#6366f1)', urbania: 'linear-gradient(135deg,#a855f7,#ec4899)',
  adondevivir: 'linear-gradient(135deg,#f59e0b,#ef4444)', properati: 'linear-gradient(135deg,#10b981,#0ea5e9)', babilonia: 'linear-gradient(135deg,#64748b,#334155)',
};
const LIMITES = [25, 50, 100];

export default {
  async montar(ctx) {
    const { contenedor } = ctx;
    cargandoGenerico(contenedor);
    let vista = prefs().propVista;
    const filtros = {};
    for (const k of CLAVES) filtros[k] = ctx.params[k] ?? '';
    let limite = LIMITES.includes(Number(ctx.params.limite)) ? Number(ctx.params.limite) : 50;

    let meta = null;
    try { meta = (await metadatos()).vistas.find((v) => v.nombre === 'propiedades'); } catch { /* sin metadatos: se usan valores fijos */ }
    const valoresDe = (n, defecto) => meta?.filtros.find((f) => f.nombre === n)?.valores ?? defecto;

    const distritos = await consultar('propiedades-distritos').catch(() => ({ datos: [] }));

    const campos = {
      q: campo({ etiqueta: 'Buscar', placeholder: 'Título, distrito o tipo…', valor: filtros.q }),
      operacion: campo({ etiqueta: 'Operación', valor: filtros.operacion, opciones: [{ valor: '', etiqueta: 'Todas' }, ...valoresDe('operacion', ['VENTA', 'ALQUILER']).map((v) => ({ valor: v, etiqueta: v[0] + v.slice(1).toLowerCase() }))] }),
      inmueble: campo({ etiqueta: 'Tipo de inmueble', placeholder: 'Casa, Departamento…', valor: filtros.inmueble }),
      distrito: campo({ etiqueta: 'Distrito', placeholder: 'Miraflores…', valor: filtros.distrito }),
      portal: campo({ etiqueta: 'Portal', valor: filtros.portal, opciones: [{ valor: '', etiqueta: 'Todos' }, ...valoresDe('portal', ['infocasas', 'urbania', 'adondevivir', 'properati', 'babilonia']).map((v) => ({ valor: v, etiqueta: v }))] }),
      precio_min_usd: campo({ etiqueta: 'Precio mín. (US$)', tipo: 'number', valor: filtros.precio_min_usd, attrs: { min: '0', step: '1000', inputmode: 'numeric' } }),
      precio_max_usd: campo({ etiqueta: 'Precio máx. (US$)', tipo: 'number', valor: filtros.precio_max_usd, attrs: { min: '0', step: '1000', inputmode: 'numeric' } }),
    };
    const selLimite = h('select', { attrs: { 'aria-label': 'Cantidad de resultados' } }, LIMITES.map((n) => h('option', { attrs: { value: n, ...(n === limite ? { selected: true } : {}) }, texto: `${n} avisos` })));
    const zonaResultados = h('div'), zonaDist = h('div'), zonaStats = h('div.fila-estadistica'), zonaExport = h('div'), zonaActivos = h('div.chips', { estilo: { marginBottom: '0.8rem' } });
    const aviso = h('div');

    function leerFormulario() {
      for (const k of CLAVES) filtros[k] = campos[k].entrada.value.trim();
      limite = Number(selLimite.value);
    }
    function limpiar() {
      for (const k of CLAVES) { filtros[k] = ''; campos[k].entrada.value = ''; }
      buscar();
    }

    function pintarActivos() {
      const etiquetas = { q: 'Texto', operacion: 'Operación', inmueble: 'Tipo', distrito: 'Distrito', portal: 'Portal', precio_min_usd: 'Desde US$', precio_max_usd: 'Hasta US$' };
      const activos = CLAVES.filter((k) => filtros[k]);
      poner(zonaActivos, ...activos.map((k) => h('button.chip', { attrs: { type: 'button', 'aria-label': `Quitar filtro ${etiquetas[k]}`, title: 'Quitar este filtro' }, on: { click: () => { filtros[k] = ''; campos[k].entrada.value = ''; buscar(); } } }, `${etiquetas[k]}: ${filtros[k]}`, icono('cerrar'))));
    }

    function tarjetaProp(p) {
      const enlace = urlSegura(p.url);
      const foto = h('div.prop__foto', { estilo: { background: DEGRADADOS[p.portal] ?? DEGRADADOS.babilonia } }, icono('propiedades'), p.operacion ? h(`span.insignia.insignia--${p.operacion === 'VENTA' ? 'venta' : 'alquiler'}`, { texto: p.operacion }) : null);
      return h('article.tarjeta.prop', {},
        foto,
        h('div.prop__precio', {}, dinero(p.precio, p.moneda), p.moneda !== 'USD' && Number(p.precio_usd) > 0 ? h('small', { texto: `≈ ${dolares(p.precio_usd)}` }) : null),
        h('div.prop__titulo', { texto: p.titulo ?? 'Sin título' }),
        h('div.prop__meta', {}, p.distrito ? h('span', {}, icono('pin'), p.distrito) : null, p.inmueble ? h('span', { texto: p.inmueble }) : null,
          p.dormitorios ? h('span', { texto: `${numero(parseFloat(p.dormitorios), 0)} dorm.` }) : null, p.banios ? h('span', { texto: `${numero(parseFloat(p.banios), 0)} baños` }) : null, parseFloat(p.area) > 0 ? h('span', { texto: `${numero(parseFloat(p.area), 0)} m²` }) : null),
        h('div.prop__pie', {}, h('span', { texto: `${p.portal} · ${haceDesde(p.encontrada_en)}` }),
          enlace ? h('a.boton.boton--chico', { attrs: { href: enlace, target: '_blank', rel: 'noopener noreferrer' } }, 'Ver aviso', icono('enlace')) : h('span.suave', { texto: 'Sin enlace' })));
    }

    function pintarEstadisticas(filas) {
      const precios = filas.map((p) => Number(p.precio_usd)).filter((v) => v > 0);
      const est = (valor, etiqueta) => h('div.estadistica', {}, h('div.estadistica__valor', { texto: valor }), h('div.estadistica__etiqueta', { texto: etiqueta }));
      poner(zonaStats, 
        est(numero(filas.length, 0), filas.length >= limite ? `avisos (tope de ${limite})` : 'avisos'),
        est(precios.length ? dolares(mediana(precios)) : '—', 'precio mediano'),
        est(precios.length ? dolares(Math.min(...precios)) : '—', 'más económico'),
        est(precios.length ? dolares(Math.max(...precios)) : '—', 'más caro'),
        est(numero(new Set(filas.map((p) => p.distrito).filter(Boolean)).size, 0), 'distritos'));
    }

    function pintarDistritos() {
      const op = filtros.operacion;
      const acum = new Map();
      for (const d of distritos.datos ?? []) {
        if (op && d.operacion !== op) continue;
        const a = acum.get(d.distrito) ?? { avisos: 0, suma: 0, n: 0 };
        a.avisos += d.avisos;
        if (d.precio_prom_usd > 0) { a.suma += d.precio_prom_usd * d.avisos; a.n += d.avisos; }
        acum.set(d.distrito, a);
      }
      const top = [...acum].sort((a, b) => b[1].avisos - a[1].avisos).slice(0, 8).map(([dist, a]) => ({ etiqueta: dist, valor: a.avisos, extra: a.n ? `Promedio ${dolares(a.suma / a.n)}` : 'Sin precios', color: filtros.distrito.toLowerCase() === dist.toLowerCase() ? 'var(--primario)' : 'var(--scraper)', onClick: () => { filtros.distrito = dist; campos.distrito.entrada.value = dist; buscar(); } }));
      poner(zonaDist, top.length ? barrasH(top) : vacio({ icono: 'pin', titulo: 'Sin distritos', texto: 'Aún no hay avisos con distrito.' }));
    }

    async function buscar() {
      leerFormulario();
      ctx.cambiarParams({ ...filtros, limite: limite === 50 ? '' : limite });
      pintarActivos();
      pintarDistritos();
      poner(zonaResultados, h('div.rejilla--tarjetas', {}, Array.from({ length: 6 }, () => h('div.esqueleto.esqueleto--bloque'))));
      poner(aviso);
      let r;
      try { r = await consultar('propiedades', { ...filtros, limite }); } catch (e) {
        if (e.estado === 400) { poner(zonaResultados); poner(aviso, h('div.aviso-banner.aviso-banner--error', { attrs: { role: 'alert' } }, icono('alerta'), h('div.aviso-banner__texto', { texto: e.message }))); return; }
        ctx.error(e); return;
      }
      const filas = r.datos;
      pintarEstadisticas(filas);
      poner(zonaExport, barraExportar({ nombre: 'propiedades', columnas: [{ clave: 'portal', titulo: 'Portal' }, { clave: 'operacion', titulo: 'Operación' }, { clave: 'inmueble', titulo: 'Tipo' }, { clave: 'titulo', titulo: 'Título' }, { clave: 'precio', titulo: 'Precio' }, { clave: 'moneda', titulo: 'Moneda' }, { clave: 'precio_usd', titulo: 'Precio US$' }, { clave: 'distrito', titulo: 'Distrito' }, { clave: 'dormitorios', titulo: 'Dormitorios' }, { clave: 'banios', titulo: 'Baños' }, { clave: 'area', titulo: 'Área m²' }, { clave: 'url', titulo: 'Enlace' }, { clave: 'encontrada_en', titulo: 'Encontrada' }], filas }));
      if (!filas.length) { poner(zonaResultados, vacio({ icono: 'buscar', titulo: 'Ninguna propiedad coincide', texto: 'Prueba con menos filtros o un rango de precio más amplio.', accion: { texto: 'Quitar filtros', onClick: limpiar } })); return; }
      if (vista === 'lista') {
        poner(zonaResultados, tabla({
          columnas: [
            { clave: 'titulo', titulo: 'Aviso', larga: true }, { clave: 'operacion', titulo: 'Operación', render: (f) => insignia(f.operacion, f.operacion === 'VENTA' ? 'venta' : 'alquiler') },
            { clave: 'distrito', titulo: 'Distrito' }, { clave: 'inmueble', titulo: 'Tipo' },
            { clave: 'precio', titulo: 'Precio', num: true, render: (f) => h('span', { estilo: { whiteSpace: 'nowrap' } }, dinero(f.precio, f.moneda)) },
            { clave: 'area', titulo: 'm²', num: true, render: (f) => (parseFloat(f.area) > 0 ? numero(parseFloat(f.area), 0) : '—') },
            { clave: 'portal', titulo: 'Portal' },
            { clave: 'url', titulo: '', render: (f) => (urlSegura(f.url) ? h('a', { attrs: { href: urlSegura(f.url), target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Abrir aviso en el portal' } }, icono('enlace')) : '') },
          ],
          filas,
        }));
      } else poner(zonaResultados, h('div.rejilla--tarjetas', {}, filas.map(tarjetaProp)));
    }

    const formulario = h('form.filtros', { attrs: { novalidate: true }, on: { submit: (e) => { e.preventDefault(); buscar(); } } },
      ...Object.values(campos).map((c) => c.el),
      campoLimite(selLimite),
      h('div', { estilo: { display: 'flex', gap: '0.5rem' } },
        h('button.boton.boton--primario', { attrs: { type: 'submit' } }, icono('buscar'), 'Buscar'),
        h('button.boton', { attrs: { type: 'button' }, on: { click: limpiar }, texto: 'Limpiar' })));

    const tFiltros = tarjeta({ titulo: 'Filtros', icono: 'filtro', clase: 'c-12' });
    tFiltros.cuerpo.append(formulario);
    const tDist = tarjeta({ titulo: 'Distritos con más avisos', icono: 'pin', clase: 'c-4' });
    tDist.cuerpo.append(zonaDist, h('p.suave', { texto: 'Pulsa un distrito para filtrar. El promedio usa solo avisos con precio.', estilo: { marginTop: '0.8rem', fontSize: '0.8rem' } }));
    const tRes = tarjeta({ titulo: 'Resultados', icono: 'lista', clase: 'c-8' });
    tRes.acciones.append(segmentado([{ valor: 'tarjetas', etiqueta: 'Tarjetas', icono: 'cuadricula' }, { valor: 'lista', etiqueta: 'Lista', icono: 'lista' }], vista, (v) => { vista = v; guardarPref('propVista', v); buscar(); }, { etiqueta: 'Tipo de vista' }), zonaExport);
    tRes.cuerpo.append(zonaActivos, aviso, zonaStats, zonaResultados);

    poner(contenedor, 
      encabezado({ titulo: 'Propiedades', sub: 'Avisos de venta y alquiler que recoge el Scraper. Los filtros se aplican en la API y quedan guardados en el enlace.' }),
      h('div.grid12', {}, tFiltros.el), h('div.grid12', {}, tRes.el, tDist.el));
    await buscar();
  },
};

function campoLimite(sel) {
  return h('label.campo', {}, h('span.campo__etiqueta', { texto: 'Mostrar' }), sel);
}
