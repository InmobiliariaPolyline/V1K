// Sistema: estado de la conexión, latencia, frescura de los datos, preferencias, atajos y acerca de.
import { consultar, invalidar, metricas } from '../nucleo/api.js';
import { h, icono } from '../nucleo/dom.js';
import { segmentado, tarjeta, toast, banner } from '../nucleo/componentes.js';
import { fechaHora, haceHoras, NOMBRE_APP, numero, estadoFrescura } from '../nucleo/formato.js';
import { esDemo, guardarPref, prefs } from '../nucleo/estado.js';
import { cambiarAuto, SECCIONES, VERSION } from '../app.js';
import { encabezado, poner } from './_comun.js';

export default {
  async montar(ctx) {
    const { contenedor } = ctx;
    const demo = esDemo();
    const zonaLat = h('div'), zonaFresc = h('div'), zonaHist = h('div.hist');

    function pintarHist() {
      const h40 = metricas.historial.slice(-30);
      const max = Math.max(1, ...h40.map((x) => x.ms));
      poner(zonaHist, ...h40.map((x) => h(`i${x.ok ? '' : '.mal'}`, { estilo: { height: `${Math.max(8, (x.ms / max) * 100)}%` }, attrs: { title: `${x.vista}: ${x.ms} ms` } })));
    }

    async function medir() {
      const boton = zonaLat.querySelector('button');
      boton?.setAttribute('disabled', '');
      const tiempos = [];
      let fallo = null;
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        try { await consultar('frescura', {}, { forzar: true }); tiempos.push(performance.now() - t0); } catch (e) { fallo = e; break; }
      }
      if (fallo) { poner(zonaLat, banner({ tipo: 'error', texto: fallo.message })); return; }
      const prom = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
      pintarLatencia(prom, Math.min(...tiempos), Math.max(...tiempos));
      pintarHist();
    }
    function pintarLatencia(prom, min, max) {
      poner(zonaLat, 
        prom === null ? h('p.suave', { texto: 'Todavía no se midió.' }) : h('div', {}, h('div.latencia', { texto: `${numero(prom, 0)} ms` }), h('p.suave', { texto: `mínimo ${numero(min, 0)} ms · máximo ${numero(max, 0)} ms (3 consultas)`, estilo: { margin: '0.2rem 0 0.8rem' } })),
        h('button.boton.boton--primario', { attrs: { type: 'button' }, on: { click: medir } }, icono('refrescar'), prom === null ? 'Medir latencia' : 'Volver a medir'));
    }

    const resp = await consultar('frescura', {}, { forzar: true });
    const filas = resp.datos;
    const comp = ['planner', 'mrp', 'scraper'].map((app) => {
      const f = filas.find((x) => x.app === app);
      if (!f) return { tono: 'peligro', ic: 'alerta', texto: `${NOMBRE_APP[app]}: nunca ha sincronizado.` };
      const est = estadoFrescura(f.hace_horas);
      const tono = est === 'ok' ? 'ok' : est === 'aviso' ? 'aviso' : 'peligro';
      return { tono, ic: tono === 'ok' ? 'ok' : 'alerta', texto: `${NOMBRE_APP[app]}: ${haceHoras(f.hace_horas)} (${fechaHora(f.ultima_sync)})` };
    });
    zonaFresc.append(h('ul.lista-comprobacion', {}, comp.map((c) => h(`li.comp--${c.tono}`, {}, icono(c.ic), h('span', { texto: c.texto })))));

    const tConex = tarjeta({ titulo: 'Conexión', icono: 'sistema', clase: 'c-4' });
    tConex.cuerpo.append(
      h('dl.definiciones', {}, h('dt', { texto: 'Modo' }), h('dd', { texto: demo ? 'Demostración (datos ficticios)' : 'Datos reales' }), h('dt', { texto: 'Acceso' }), h('dd', { texto: 'Solo lectura' }), h('dt', { texto: 'Consultas hechas' }), h('dd', { texto: `${numero(metricas.llamadas, 0)} (${numero(metricas.aciertos, 0)} desde la caché)` }), h('dt', { texto: 'Errores' }), h('dd', { texto: numero(metricas.errores, 0) })),
      h('div', { estilo: { marginTop: '0.9rem' } }, h('button.boton', { attrs: { type: 'button' }, on: { click: () => { invalidar(); toast('Caché vaciada', { tipo: 'ok' }); ctx.refrescar(); } } }, icono('refrescar'), 'Vaciar caché')));

    const tLat = tarjeta({ titulo: 'Latencia de la API', icono: 'reloj', clase: 'c-4' });
    tLat.cuerpo.append(zonaLat, h('div', { estilo: { marginTop: '1rem' } }, zonaHist));
    const tFresc = tarjeta({ titulo: 'Frescura de los datos', icono: 'base', clase: 'c-4' });
    tFresc.cuerpo.append(zonaFresc);

    // Preferencias
    const tPref = tarjeta({ titulo: 'Preferencias', icono: 'ayuda', clase: 'c-6' });
    const p = prefs();
    const fila = (titulo, ayuda, control) => h('div', { estilo: { display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.6rem 0', borderBottom: '1px solid var(--borde)' } }, h('div', {}, h('b', { texto: titulo }), h('div.suave', { texto: ayuda, estilo: { fontSize: '0.82rem' } })), control);
    tPref.cuerpo.append(
      fila('Tema', 'Claro, oscuro o el del sistema.', segmentado([{ valor: 'auto', etiqueta: 'Auto', icono: 'auto' }, { valor: 'claro', etiqueta: 'Claro', icono: 'sol' }, { valor: 'oscuro', etiqueta: 'Oscuro', icono: 'luna' }], p.tema, (v) => guardarPref('tema', v), { etiqueta: 'Tema' })),
      fila('Densidad', 'Compacta muestra más filas.', segmentado([{ valor: 'comoda', etiqueta: 'Cómoda' }, { valor: 'compacta', etiqueta: 'Compacta' }], p.densidad, (v) => guardarPref('densidad', v), { etiqueta: 'Densidad' })),
      fila('Actualización automática', 'Vuelve a pedir los datos cada cierto tiempo.', segmentado([{ valor: 0, etiqueta: 'No' }, { valor: 1, etiqueta: '1 min' }, { valor: 5, etiqueta: '5 min' }, { valor: 15, etiqueta: '15 min' }], p.auto, (v) => cambiarAuto(Number(v)), { etiqueta: 'Actualización automática' })));

    // Atajos
    const tAtajos = tarjeta({ titulo: 'Atajos de teclado', icono: 'teclado', clase: 'c-6' });
    const atajo = (teclas, texto) => h('li', {}, h('span', { texto }), h('span', {}, teclas.flatMap((k, i) => (i ? [' ', h('kbd', { texto: k })] : [h('kbd', { texto: k })]))));
    tAtajos.cuerpo.append(h('ul.atajos', {}, atajo(['Ctrl', 'K'], 'Paleta de comandos'), atajo(['/'], 'Abrir la paleta'), ...SECCIONES.map((s) => atajo(['G', s.atajo.toUpperCase()], `Ir a ${s.titulo}`)), atajo(['R'], 'Actualizar'), atajo(['T'], 'Cambiar tema'), atajo(['B'], 'Mostrar u ocultar menú lateral'), atajo(['?'], 'Ver ayuda')));

    // Arquitectura y acerca de
    const tArq = tarjeta({ titulo: 'Cómo fluyen los datos', icono: 'base', clase: 'c-8 arquitectura' });
    tArq.cuerpo.append(h('img', { attrs: { src: 'arquitectura.svg', alt: 'Diagrama: Planner, MRP y Scraper sincronizan a Neon; la API de Vercel lee de Neon y alimenta al agente de Coze y a este panel.', loading: 'lazy' } }));
    const tAcerca = tarjeta({ titulo: 'Acerca de', icono: 'info', clase: 'c-4' });
    tAcerca.cuerpo.append(h('dl.definiciones', {}, h('dt', { texto: 'Panel' }), h('dd', { texto: `V1K v${VERSION}` }), h('dt', { texto: 'Fuente' }), h('dd', { texto: 'Neon (esquema central)' }), h('dt', { texto: 'API' }), h('dd', { texto: 'Vercel · solo lectura' }), h('dt', { texto: 'Agente' }), h('dd', { texto: 'Coze' })),
      h('p.suave', { texto: 'Los datos son resúmenes que cada app copia a Neon; las apps originales siguen siendo la fuente de verdad.', estilo: { fontSize: '0.84rem' } }));

    poner(contenedor, 
      encabezado({ titulo: 'Sistema', sub: 'Estado de la conexión, frescura de los datos y preferencias de este panel.' }),
      h('div.grid12', {}, tConex.el, tLat.el, tFresc.el), h('div.grid12', {}, tPref.el, tAtajos.el), h('div.grid12', {}, tArq.el, tAcerca.el));
    const ult = metricas.historial.at(-1);
    pintarLatencia(ult?.ok ? ult.ms : null, ult?.ms, ult?.ms);
    pintarHist();
  },
};
