// Agente de Coze: preguntas sugeridas (con botón de copiar) y las herramientas que tiene el agente.
import { metadatos } from '../nucleo/api.js';
import { copiar, h, icono } from '../nucleo/dom.js';
import { tarjeta, toast } from '../nucleo/componentes.js';
import { encabezado, poner } from './_comun.js';

const PREGUNTAS = [
  { grupo: 'Visión general', icono: 'inicio', items: ['Dame un resumen general de la empresa.', '¿Hay algo urgente que deba atender hoy?', '¿Están actualizados los datos? ¿Cuándo sincronizó cada sistema?'] },
  { grupo: 'Planner', icono: 'proyectos', items: ['¿Qué proyectos están atrasados y cuántas tareas llevan atrasadas?', '¿Cuál es el avance del proyecto Torre Miraflores?', '¿Qué hitos vencen en los próximos días?', '¿Quién es responsable de más proyectos atrasados?'] },
  { grupo: 'MRP', icono: 'materiales', items: ['¿Qué materiales están por debajo del mínimo en la categoría Acero?', '¿Cuáles son los 10 materiales con mayor faltante?', '¿Qué pedidos de compra siguen abiertos y cuándo llegan?', '¿Hay pedidos con la llegada vencida?'] },
  { grupo: 'Scraper', icono: 'propiedades', items: ['Muéstrame departamentos en venta en Miraflores hasta 250 mil dólares.', '¿Cuántas propiedades hay por portal?', '¿Cuáles son los alquileres más baratos de San Isidro?', 'Busca casas en La Molina entre 300 y 500 mil dólares.'] },
];

export default {
  async montar(ctx) {
    const { contenedor } = ctx;
    const copiarTexto = async (t) => toast((await copiar(t)) ? 'Pregunta copiada' : 'No se pudo copiar', { tipo: 'ok' });

    const grupos = PREGUNTAS.map((g) => {
      const t = tarjeta({ titulo: g.grupo, icono: g.icono, clase: 'c-6' });
      t.cuerpo.append(h('div', { estilo: { display: 'flex', flexDirection: 'column', gap: '0.5rem' } }, g.items.map((q) => h('div.pregunta', {}, h('span.pregunta__texto', { texto: q }), h('button.boton.boton--chico.boton--icono', { attrs: { type: 'button', 'aria-label': `Copiar pregunta: ${q}`, title: 'Copiar' }, on: { click: () => copiarTexto(q) } }, icono('copiar'))))));
      return t.el;
    });

    const tHerr = tarjeta({ titulo: 'Herramientas del agente', icono: 'asistente', clase: 'c-12' });
    const lista = h('div', {}, h('p.suave', { texto: 'Cargando…' }));
    tHerr.cuerpo.append(h('p.suave', { texto: 'El agente solo puede consultar estas vistas de lectura. No escribe, no ejecuta SQL y no ve contraseñas.', estilo: { marginTop: 0 } }), lista);
    metadatos().then((m) => {
      const herramientas = m.vistas.filter((v) => !v.soloPanel);
      poner(lista, ...herramientas.map((v) => h('div.herramienta', {}, icono('chispa'), h('div', {}, h('code', { texto: v.nombre.replaceAll('-', '_') }), h('div', { texto: v.titulo }), v.filtros.length ? h('div.suave', { texto: `Filtros: ${v.filtros.map((f) => f.nombre).join(', ')}`, estilo: { fontSize: '0.82rem' } }) : null))));
    }).catch(() => poner(lista, h('p.suave', { texto: 'No se pudo cargar la lista de herramientas.' })));

    const tTips = tarjeta({ titulo: 'Para preguntar mejor', icono: 'info', clase: 'c-12' });
    tTips.cuerpo.append(h('ul', { estilo: { margin: 0, paddingLeft: '1.2rem', lineHeight: '1.7' } },
      h('li', { texto: 'Pide cosas concretas: un proyecto, un material, un distrito o un rango de precio.' }),
      h('li', { texto: 'Si el agente no encuentra algo, prueba con menos filtros o el nombre exacto.' }),
      h('li', { texto: 'Pregunta «¿están actualizados los datos?» antes de decidir con cifras de ayer.' }),
      h('li', { texto: 'Cada pregunta consume créditos de Coze: una pregunta general rinde más que cinco sueltas.' })));

    poner(contenedor, 
      encabezado({ titulo: 'Agente de Coze', sub: 'Qué preguntarle al agente de V1K y con qué datos responde.' }),
      h('div.grid12', {}, ...grupos), h('div.grid12', {}, tHerr.el), h('div.grid12', {}, tTips.el));
  },
};
