// Explorador de API: arma un formulario con los filtros de cada vista, ejecuta la consulta y muestra la respuesta
// como JSON, tabla o comando cURL (siempre con un marcador en lugar del token real).
import { consultar, metadatos } from '../nucleo/api.js';
import { copiar, h, icono } from '../nucleo/dom.js';
import { banner, campo, tabla, tarjeta, toast, vacio } from '../nucleo/componentes.js';
import { numero, plural } from '../nucleo/formato.js';
import { esDemo } from '../nucleo/estado.js';
import { encabezado, poner } from './_comun.js';

const historial = [];   // últimas consultas de esta sesión (solo en memoria)

export default {
  async montar(ctx) {
    const { contenedor } = ctx;
    let meta;
    try { meta = await metadatos(); } catch { poner(contenedor, encabezado({ titulo: 'Explorador de API' }), banner({ tipo: 'error', texto: 'No se pudo cargar la descripción de las vistas (vistas.json).' })); return; }
    const vistas = meta.vistas;
    let actual = vistas.find((v) => v.nombre === ctx.params.vista) ?? vistas[0];
    let pestana = 'respuesta';
    let ultima = null;     // { url, estado, ms, cuerpo, error }

    const lista = h('div.vista-lista');
    const panel = h('div');
    const resultado = h('div');

    function pintarLista() {
      poner(lista, ...vistas.map((v) => h('button', { attrs: { type: 'button', 'aria-pressed': String(v === actual) }, on: { click: () => { actual = v; ultima = null; ctx.cambiarParams({ vista: v.nombre }); pintarLista(); pintarPanel(); } } },
        h('strong', { texto: v.nombre }), h('small', { texto: v.soloPanel ? `${v.titulo} (solo panel)` : v.titulo }))));
    }

    function urlDe(params) {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
      return `/api/${actual.nombre}${qs.size ? `?${qs}` : ''}`;
    }

    function pintarPanel() {
      const campos = actual.filtros.map((f) => {
        if (f.tipo === 'enum') return [f.nombre, campo({ etiqueta: f.nombre, opciones: [{ valor: '', etiqueta: '(cualquiera)' }, ...f.valores.map((v) => ({ valor: v, etiqueta: v }))], ayuda: f.descripcion })];
        if (f.tipo === 'numero') return [f.nombre, campo({ etiqueta: f.nombre, tipo: 'number', attrs: { min: String(f.min), max: String(f.max), step: 'any' }, ayuda: f.descripcion })];
        if (f.tipo === 'fecha') return [f.nombre, campo({ etiqueta: f.nombre, tipo: 'date', ayuda: f.descripcion })];
        return [f.nombre, campo({ etiqueta: f.nombre, placeholder: 'texto…', ayuda: f.descripcion })];
      });
      const limite = actual.limite !== null ? campo({ etiqueta: 'limite', tipo: 'number', valor: String(actual.limite), attrs: { min: '1', max: String(actual.limiteMax), step: '1' }, ayuda: `Entre 1 y ${actual.limiteMax}` }) : null;
      const ruta = h('div.ruta-api', {}, h('span.metodo', { texto: 'GET' }), h('span', { texto: urlDe({}) }));
      const params = () => { const p = {}; for (const [n, c] of campos) p[n] = c.entrada.value.trim(); if (limite) p.limite = limite.entrada.value.trim(); return p; };
      const refrescarRuta = () => ruta.lastChild.textContent = urlDe(params());

      const ejecutar = async (e) => {
        e?.preventDefault();
        const p = params();
        const url = urlDe(p);
        poner(resultado, h('div.esqueleto.esqueleto--bloque'));
        const t0 = performance.now();
        try {
          const cuerpo = await consultar(actual.nombre, p, { forzar: true });
          ultima = { url, estado: 200, ms: Math.round(performance.now() - t0), cuerpo };
        } catch (err) {
          ultima = { url, estado: err.estado || 0, ms: Math.round(performance.now() - t0), error: err.message };
          if (err.estado === 401) { ctx.error(err); return; }
        }
        historial.unshift({ url, estado: ultima.estado, ms: ultima.ms });
        historial.length = Math.min(historial.length, 8);
        pintarResultado();
        pintarHistorial();
      };

      const form = h('form', { attrs: { novalidate: true }, on: { submit: ejecutar, input: refrescarRuta, change: refrescarRuta } },
        h('div.filtros', {}, ...campos.map(([, c]) => c.el), ...(limite ? [limite.el] : [])),
        h('div', { estilo: { display: 'flex', gap: '0.5rem', marginTop: '0.9rem', flexWrap: 'wrap' } },
          h('button.boton.boton--primario', { attrs: { type: 'submit' } }, icono('flecha'), 'Ejecutar'),
          h('button.boton', { attrs: { type: 'button' }, on: { click: () => { for (const [, c] of campos) c.entrada.value = ''; if (limite) limite.entrada.value = String(actual.limite); refrescarRuta(); } }, texto: 'Limpiar' })));

      const t = tarjeta({ titulo: actual.nombre, icono: 'explorador' });
      t.cuerpo.append(h('p.suave', { texto: actual.titulo, estilo: { marginTop: 0 } }), ...(actual.soloPanel ? [h('p', {}, h('span.insignia.insignia--info', { texto: 'Solo panel' }), ' Esta vista la usa el panel; el agente de Coze no la tiene como herramienta.')] : []), ruta, h('div', { estilo: { height: '0.9rem' } }), form);
      poner(panel, t.el, h('div', { estilo: { height: 'var(--esp)' } }), resultado, historialEl);
      poner(resultado, vacio({ icono: 'explorador', titulo: 'Aún no hay resultados', texto: 'Pulsa «Ejecutar» para consultar esta vista.' }));
      pintarHistorial();
    }

    function curl() {
      const base = meta.servidor ?? `${location.origin}`;
      return `curl -s -H "Authorization: Bearer TU_TOKEN" "${base}${ultima.url}"`;
    }

    function pintarResultado() {
      if (!ultima) return;
      const ok = ultima.estado === 200;
      const cab = h('div', { estilo: { display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.8rem' } },
        h('span.estado-http', { estilo: { color: ok ? 'var(--ok)' : 'var(--peligro)' } }, icono(ok ? 'ok' : 'alerta'), ok ? '200 OK' : `Error ${ultima.estado || 'de red'}`),
        h('span.suave', { texto: `${numero(ultima.ms, 0)} ms` }),
        ok ? h('span.suave', { texto: plural(ultima.cuerpo.total ?? ultima.cuerpo.datos.length, 'fila', 'filas') }) : null);
      const t = tarjeta({ titulo: 'Resultado', icono: 'tabla' });
      let cuerpo;
      if (!ok) {
        cuerpo = banner({ tipo: 'error', texto: ultima.error });
      } else {
        const json = JSON.stringify(ultima.cuerpo, null, 2);
        const filas = ultima.cuerpo.datos;
        const planas = filas.length && filas.every((f) => Object.values(f).every((v) => v === null || typeof v !== 'object'));
        const pestanas = [['respuesta', 'Respuesta'], ...(planas ? [['tabla', 'Tabla']] : []), ['curl', 'cURL'], ['contrato', 'Contrato']];
        if (!pestanas.some(([id]) => id === pestana)) pestana = 'respuesta';
        const contenido = pestana === 'respuesta' ? h('pre.codigo', { texto: json })
          : pestana === 'tabla' ? tabla({ columnas: Object.keys(filas[0]).map((c) => ({ clave: c, titulo: c, render: (f) => String(f[c] ?? '—') })), filas: filas.slice(0, 100) })
          : pestana === 'curl' ? h('div', {}, h('pre.codigo.codigo--envuelto', { texto: curl() }), h('p.suave', { texto: 'Cambia TU_TOKEN por el token de la API. El panel nunca lo muestra.', estilo: { fontSize: '0.82rem' } }))
          : h('div', {}, h('p', {}, h('b', { texto: 'Campos de cada fila: ' }), actual.campos.join(', ')), h('ul', {}, actual.filtros.length ? actual.filtros.map((f) => h('li', {}, h('code.mono', { texto: f.nombre }), ` (${f.tipo}${f.valores ? `: ${f.valores.join(' | ')}` : ''}${f.min !== undefined ? `, ${f.min}–${f.max}` : ''}) — ${f.descripcion}`)) : [h('li', { texto: 'Esta vista no acepta filtros.' })]));
        cuerpo = h('div', {},
          h('div.pestanas', { attrs: { role: 'tablist' } }, pestanas.map(([id, texto]) => h('button', { attrs: { type: 'button', role: 'tab', 'aria-selected': String(id === pestana) }, on: { click: () => { pestana = id; pintarResultado(); } }, texto }))),
          contenido,
          h('div', { estilo: { marginTop: '0.8rem' } }, h('button.boton.boton--chico', { attrs: { type: 'button' }, on: { click: async () => toast((await copiar(json)) ? 'JSON copiado' : 'No se pudo copiar', { tipo: 'ok' }) } }, icono('copiar'), 'Copiar JSON')));
      }
      t.cuerpo.append(cab, cuerpo);
      poner(resultado, t.el);
    }

    const historialEl = h('div');
    function pintarHistorial() {
      if (!historial.length) { poner(historialEl); return; }
      const t = tarjeta({ titulo: 'Consultas recientes', icono: 'reloj', clase: 'tarjeta--lisa' });
      t.cuerpo.append(h('div.lista', {}, historial.map((x) => h('div.item', {}, h('span.item__texto', {}, h('span.item__titulo.mono', { texto: x.url })), h('span.item__derecha', { texto: `${x.estado || 'red'} · ${numero(x.ms, 0)} ms`, estilo: { color: x.estado === 200 ? 'var(--ok)' : 'var(--peligro)' } })))));
      poner(historialEl, h('div', { estilo: { height: 'var(--esp)' } }), t.el);
    }

    poner(contenedor, 
      encabezado({ titulo: 'Explorador de API', sub: 'Prueba las consultas que usa el agente. Son de solo lectura y no se puede enviar SQL.' }),
      esDemo() ? banner({ tipo: 'info', texto: 'Modo demostración: las respuestas son datos de ejemplo, no llaman a la API real.' }) : null,
      h('div.explorador', {}, h('div', {}, h('div.tarjeta', {}, h('div.tarjeta__cabeza', {}, h('h2', {}, icono('lista'), 'Vistas')), h('div.tarjeta__cuerpo', {}, lista))), panel));
    pintarLista();
    pintarPanel();
  },
};
