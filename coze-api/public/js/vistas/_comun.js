// Piezas compartidas por las vistas.
import { h, icono } from '../nucleo/dom.js';
import { esqueleto } from '../nucleo/componentes.js';

/** Encabezado de sección: título, descripción y acciones a la derecha. */
export function encabezado({ titulo, sub = '', acciones = [] }) {
  return h('div.encabezado', {}, h('div.encabezado__texto', {}, h('h2.encabezado__titulo', { texto: titulo }), sub ? h('p.suave', { texto: sub }) : null), h('div.encabezado__acciones', {}, acciones));
}

/** Cuadrícula de 12 columnas: usar hijos con las clases c-3, c-4, c-6, c-8, c-12. */
export const cuadricula = (...hijos) => h('div.grid12', {}, hijos);

/** Esqueleto genérico mientras cargan los datos. */
export function cargandoGenerico(contenedor) {
  contenedor.replaceChildren(
    h('div.rejilla.rejilla--3', {}, esqueleto('esqueleto--kpi'), esqueleto('esqueleto--kpi'), esqueleto('esqueleto--kpi')),
    h('div.grid12', {}, h('div.c-8', {}, esqueleto()), h('div.c-4', {}, esqueleto())),
  );
}

/** Fila de lista con icono, título, meta y contenido a la derecha. */
export function fila({ icono: ic = null, titulo, meta = '', derecha = null, tono = '', onClick = null, href = null }) {
  const tag = href ? 'a' : onClick ? 'button' : 'div';
  return h(`${tag}.item${tono ? `.item--${tono}` : ''}`, { attrs: { ...(href ? { href } : {}), ...(onClick ? { type: 'button' } : {}) }, on: onClick ? { click: onClick } : {} },
    ic ? h('span.item__icono', {}, icono(ic)) : null,
    h('span.item__texto', {}, h('span.item__titulo', { texto: titulo }), meta ? h('span.item__meta', { texto: meta }) : null),
    derecha ? h('span.item__derecha', {}, derecha) : null);
}

/** Como replaceChildren, pero ignora null/undefined/false (replaceChildren los escribiría como texto «null»). */
export function poner(nodo, ...hijos) {
  nodo.replaceChildren(...hijos.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
  return nodo;
}
