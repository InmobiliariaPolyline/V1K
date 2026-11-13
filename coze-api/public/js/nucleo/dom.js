// Constructor de DOM seguro. NUNCA usa innerHTML: todo texto entra con textContent, así que los datos que vienen de
// la API no pueden inyectar HTML ni scripts. Los estilos dinámicos se fijan con la API CSSOM (permitida por la CSP).

const NS_SVG = 'http://www.w3.org/2000/svg';

/** Aplana hijos: nodos, textos, números, arreglos anidados; ignora null/undefined/false. */
function agregar(padre, hijos) {
  for (const h of hijos) {
    if (h === null || h === undefined || h === false) continue;
    if (Array.isArray(h)) agregar(padre, h);
    else if (h instanceof Node) padre.append(h);
    else padre.append(document.createTextNode(String(h)));
  }
}

function aplicar(el, props) {
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'texto') el.textContent = String(v);
    else if (k === 'clase') el.classList.add(...String(v).split(/\s+/).filter(Boolean));
    else if (k === 'attrs') { for (const [a, val] of Object.entries(v)) if (val !== undefined && val !== null && val !== false) el.setAttribute(a, val === true ? '' : String(val)); }
    else if (k === 'on') { for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn); }
    else if (k === 'datos') { for (const [d, val] of Object.entries(v)) el.dataset[d] = String(val); }
    else if (k === 'estilo') { for (const [p, val] of Object.entries(v)) { if (p.startsWith('--')) el.style.setProperty(p, String(val)); else el.style[p] = String(val); } }
    else if (k === 'propiedades') Object.assign(el, v);
    else throw new Error(`propiedad desconocida en h(): ${k}`);
  }
}

/**
 * h('div.tarjeta.kpi#id', { texto, clase, attrs, on, datos, estilo }, ...hijos)
 * Crea un elemento HTML. No existe forma de pasar HTML en bruto.
 */
export function h(spec, props = {}, ...hijos) {
  const m = /^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/.exec(spec);
  if (!m) throw new Error(`especificación no válida: ${spec}`);
  const el = document.createElement(m[1] || 'div');
  for (const parte of m[2].match(/[.#][\w-]+/g) ?? []) {
    if (parte[0] === '.') el.classList.add(parte.slice(1)); else el.id = parte.slice(1);
  }
  aplicar(el, props ?? {});
  agregar(el, hijos);
  return el;
}

/** Elemento SVG: s('circle', { cx: 5, cy: 5, r: 3, class: 'x' }, ...hijos). Los atributos van tal cual. */
export function s(tag, attrs = {}, ...hijos) {
  const el = document.createElementNS(NS_SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, String(v));
  agregar(el, hijos);
  return el;
}

/** Icono del sprite de index.html: icono('refrescar') -> <svg class="icono"><use href="#i-refrescar"/></svg> */
export function icono(nombre, clase = '') {
  const svg = document.createElementNS(NS_SVG, 'svg');
  svg.setAttribute('class', `icono${clase ? ` ${clase}` : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  const uso = document.createElementNS(NS_SVG, 'use');
  uso.setAttribute('href', `#i-${nombre}`);
  svg.append(uso);
  return svg;
}

export const vaciar = (nodo) => nodo.replaceChildren();
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Función con espera: agrupa llamadas seguidas (por ejemplo, teclear en un buscador). */
export function rebote(fn, ms = 250) {
  let t;
  const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  f.cancelar = () => clearTimeout(t);
  return f;
}

/** Copia texto al portapapeles; devuelve true si lo logró. */
export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = h('textarea', { attrs: { readonly: true }, estilo: { position: 'fixed', opacity: '0' } });
    area.value = texto;
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

/** Descarga un texto como archivo (CSV, JSON…). */
export function descargar(nombre, contenido, tipo = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = h('a', { attrs: { href: url, download: nombre } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
