// Componentes de interfaz reutilizables. Todo se construye con dom.js (sin innerHTML).
import { copiar, descargar, h, icono, rebote, vaciar } from './dom.js';
import { aCsv, normalizar, numero, paginar } from './formato.js';

// ══════════════ Notificaciones ══════════════
export function toast(texto, { tipo = 'info', ms = 3600 } = {}) {
  const cont = document.getElementById('toasts');
  if (!cont) return;
  const ic = tipo === 'ok' ? 'ok' : tipo === 'error' ? 'alerta' : 'info';
  const t = h(`div.toast.toast--${tipo}`, {}, icono(ic), h('div.toast__texto', { texto }));
  cont.append(t);
  while (cont.children.length > 4) cont.firstElementChild.remove();
  setTimeout(() => t.remove(), ms);
}

// ══════════════ Piezas pequeñas ══════════════
export const insignia = (texto, tono = '') => h(`span.insignia${tono ? `.insignia--${tono}` : ''}`, { texto });

const TONO_ESTADO = { atrasado: 'peligro', 'en curso': 'info', terminado: 'ok', 'por iniciar': '', pendiente: 'aviso', enviada: 'info', parcial: 'aviso', VENTA: 'venta', ALQUILER: 'alquiler' };
export const insigniaEstado = (estado) => insignia(estado, TONO_ESTADO[estado] ?? '');

/** Tarjeta de indicador: { icono, etiqueta, valor, pie, tono: 'ok'|'aviso'|'alerta', onClick, titulo } */
export function kpi({ icono: ic, etiqueta, valor, pie = '', tono = '', onClick = null, titulo = '' }) {
  const el = h(`${onClick ? 'button' : 'div'}.tarjeta.kpi${tono ? `.kpi--${tono}` : ''}${onClick ? '.tarjeta--clic' : ''}`, { attrs: { ...(onClick ? { type: 'button' } : {}), ...(titulo ? { title: titulo } : {}) }, on: onClick ? { click: onClick } : {} },
    h('div.kpi__cabeza', {}, h('span', { texto: etiqueta }), ic ? h('span.kpi__icono', {}, icono(ic)) : null),
    h('div.kpi__valor', { texto: String(valor) }),
    pie ? h('div.kpi__pie', { texto: pie }) : null,
  );
  if (onClick) el.style.textAlign = 'left';
  return el;
}

/** Estado vacío: { icono, titulo, texto, accion: { texto, onClick } } */
export function vacio({ icono: ic = 'info', titulo, texto = '', accion = null }) {
  return h('div.vacio', {}, icono(ic), h('strong', { texto: titulo }), texto ? h('p', { texto }) : null,
    accion ? h('button.boton.boton--chico', { attrs: { type: 'button' }, on: { click: accion.onClick }, texto: accion.texto }) : null);
}

/** Aviso en línea: tipo 'error' | 'aviso' | 'info'. */
export function banner({ tipo = 'info', texto, accion = null }) {
  const ic = tipo === 'error' ? 'alerta' : tipo === 'aviso' ? 'alerta' : 'info';
  return h(`div.aviso-banner.aviso-banner--${tipo}`, { attrs: { role: tipo === 'error' ? 'alert' : 'status' } }, icono(ic), h('div.aviso-banner__texto', { texto }),
    accion ? h('button.boton.boton--chico', { attrs: { type: 'button' }, on: { click: accion.onClick }, texto: accion.texto }) : null);
}

export const esqueleto = (clase = 'esqueleto--bloque') => h(`div.esqueleto.${clase}`);

/** Tarjeta con cabecera: devuelve { el, cuerpo, acciones }. */
export function tarjeta({ titulo, icono: ic = null, clase = '', sub = '' } = {}) {
  const acciones = h('div.tarjeta__acciones', { estilo: { display: 'flex', gap: '0.4rem', alignItems: 'center' } });
  const cuerpo = h('div.tarjeta__cuerpo');
  const el = h(`section.tarjeta${clase ? `.${clase.split(' ').join('.')}` : ''}`, {},
    titulo ? h('div.tarjeta__cabeza', {}, h('h2', {}, ic ? icono(ic) : null, titulo, sub ? h('span.suave', { texto: ` ${sub}`, estilo: { fontWeight: '400' } }) : null), acciones) : null,
    cuerpo);
  return { el, cuerpo, acciones };
}

// ══════════════ Controles ══════════════
/** Control segmentado: opciones [{ valor, etiqueta, icono? }]. */
export function segmentado(opciones, actual, onCambio, { etiqueta = 'Opciones' } = {}) {
  const el = h('div.segmentado', { attrs: { role: 'group', 'aria-label': etiqueta } });
  const pintar = (sel) => {
    vaciar(el);
    for (const o of opciones) el.append(h('button', { attrs: { type: 'button', 'aria-pressed': String(o.valor === sel), title: o.etiqueta }, on: { click: () => { pintar(o.valor); onCambio(o.valor); } } }, o.icono ? icono(o.icono) : null, h('span', { texto: o.etiqueta })));
  };
  pintar(actual);
  return el;
}

/** Chips de filtro: items [{ valor, etiqueta, n? }]; actual puede ser '' (todos). */
export function chips(items, actual, onCambio, { etiqueta = 'Filtros' } = {}) {
  const el = h('div.chips', { attrs: { role: 'group', 'aria-label': etiqueta } });
  const pintar = (sel) => {
    vaciar(el);
    for (const it of items) el.append(h('button.chip', { attrs: { type: 'button', 'aria-pressed': String(it.valor === sel) }, on: { click: () => { const nuevo = it.valor === sel && it.valor !== '' ? '' : it.valor; pintar(nuevo); onCambio(nuevo); } } }, it.etiqueta, it.n !== undefined ? h('span.chip__n', { texto: numero(it.n, 0) }) : null));
  };
  pintar(actual);
  return el;
}

/** Campo con etiqueta: devuelve { el, entrada }. */
export function campo({ etiqueta, tipo = 'text', valor = '', placeholder = '', ayuda = '', opciones = null, attrs = {}, id = null }) {
  const entrada = opciones
    ? h('select', { attrs: { ...attrs, ...(id ? { id } : {}) } }, opciones.map((o) => h('option', { attrs: { value: o.valor, ...(o.valor === valor ? { selected: true } : {}) }, texto: o.etiqueta })))
    : h('input', { attrs: { type: tipo, placeholder, autocomplete: 'off', spellcheck: 'false', ...attrs, ...(id ? { id } : {}) } });
  if (!opciones) entrada.value = valor;
  else entrada.value = valor;
  const el = h('label.campo', {}, h('span.campo__etiqueta', { texto: etiqueta }), entrada, ayuda ? h('span.campo__ayuda', { texto: ayuda }) : null);
  return { el, entrada };
}

/** Buscador con espera: onTexto(texto) se llama al dejar de teclear. */
export function buscador({ placeholder = 'Buscar…', valor = '', onTexto, ms = 300 }) {
  const entrada = h('input', { attrs: { type: 'search', placeholder, autocomplete: 'off', spellcheck: 'false', 'aria-label': placeholder } });
  entrada.value = valor;
  const emitir = rebote(() => onTexto(entrada.value.trim()), ms);
  entrada.addEventListener('input', emitir);
  entrada.addEventListener('keydown', (e) => { if (e.key === 'Enter') { emitir.cancelar(); onTexto(entrada.value.trim()); } });
  return { el: h('div.entrada-busqueda', {}, icono('buscar'), entrada), entrada };
}

// ══════════════ Tablas ══════════════
/**
 * tabla({ columnas, filas, orden: { clave, dir }, onOrden(clave), onFila(fila), vacioEl })
 * columnas: [{ clave, titulo, num?, ordenable?, render?(fila) }]
 */
export function tabla({ columnas, filas, orden = null, onOrden = null, onFila = null, vacioEl = null }) {
  if (!filas.length && vacioEl) return vacioEl;
  const cab = h('tr', {}, columnas.map((c) => {
    const ordenable = onOrden && c.ordenable !== false;
    const activo = orden?.clave === c.clave;
    const th = h('th', { clase: c.num ? 'num' : '', attrs: { scope: 'col', ...(activo ? { 'aria-sort': orden.dir === 'asc' ? 'ascending' : 'descending' } : {}) } },
      ordenable ? h('button', { attrs: { type: 'button' }, on: { click: () => onOrden(c.clave) } }, c.titulo, activo ? icono(orden.dir === 'asc' ? 'arriba' : 'abajo') : null) : c.titulo);
    return th;
  }));
  const cuerpo = filas.map((f) => h(`tr${onFila ? '.fila-clic' : ''}`, { attrs: onFila ? { tabindex: '0' } : {}, on: onFila ? { click: () => onFila(f), keydown: (e) => { if (e.key === 'Enter') onFila(f); } } : {} },
    columnas.map((c) => h('td', { clase: `${c.num ? 'num' : ''} ${c.larga ? 'celda-larga' : ''}` }, c.render ? c.render(f) : String(f[c.clave] ?? '—')))));
  return h('div.tabla-envoltorio', {}, h('table.tabla', {}, h('thead', {}, cab), h('tbody', {}, cuerpo)));
}

/** Pie de paginación a partir de paginar(): onPagina(n). */
export function paginacion(info, onPagina) {
  if (info.total === 0) return null;
  return h('div.paginacion', {},
    h('span', { texto: `${numero(info.desde, 0)}–${numero(info.hasta, 0)} de ${numero(info.total, 0)}` }),
    info.paginas > 1 ? h('div.paginacion__botones', {},
      h('button.boton.boton--chico.boton--icono', { attrs: { type: 'button', 'aria-label': 'Página anterior', ...(info.pagina <= 1 ? { disabled: true } : {}) }, on: { click: () => onPagina(info.pagina - 1) } }, icono('flecha', 'icono--invertido')),
      h('span', { texto: `Página ${info.pagina} de ${info.paginas}` }),
      h('button.boton.boton--chico.boton--icono', { attrs: { type: 'button', 'aria-label': 'Página siguiente', ...(info.pagina >= info.paginas ? { disabled: true } : {}) }, on: { click: () => onPagina(info.pagina + 1) } }, icono('flecha'))) : null);
}

export { paginar };

/** Botones de exportación: CSV, JSON y copiar. columnas: [{ clave, titulo }]. */
export function barraExportar({ nombre, columnas, filas }) {
  const base = `${nombre}-${new Date().toISOString().slice(0, 10)}`;
  return h('div.chips.no-imprimir', {},
    h('button.boton.boton--chico', { attrs: { type: 'button', title: 'Descargar como CSV (abre bien en Excel)' }, on: { click: () => { descargar(`${base}.csv`, aCsv(columnas, filas), 'text/csv;charset=utf-8'); toast('CSV descargado', { tipo: 'ok' }); } } }, icono('descargar'), 'CSV'),
    h('button.boton.boton--chico', { attrs: { type: 'button', title: 'Descargar como JSON' }, on: { click: () => { descargar(`${base}.json`, JSON.stringify(filas, null, 2), 'application/json'); toast('JSON descargado', { tipo: 'ok' }); } } }, icono('descargar'), 'JSON'),
    h('button.boton.boton--chico', { attrs: { type: 'button', title: 'Copiar como texto separado por tabuladores (para pegar en una hoja de cálculo)' }, on: { click: async () => { const ok = await copiar([columnas.map((c) => c.titulo).join('\t'), ...filas.map((f) => columnas.map((c) => String(typeof c.clave === 'function' ? c.clave(f) : f[c.clave] ?? '')).join('\t'))].join('\n')); toast(ok ? 'Copiado al portapapeles' : 'No se pudo copiar', { tipo: ok ? 'ok' : 'error' }); } } }, icono('copiar'), 'Copiar'),
  );
}

// ══════════════ Diálogos (elemento <dialog> nativo: foco y Esc ya resueltos) ══════════════
/**
 * dialogo({ titulo, cuerpo, pie, lateral, ancho }) -> { el, cerrar }
 * Se cierra con Esc, con el botón ✕ o al hacer clic fuera.
 */
export function dialogo({ titulo, cuerpo, pie = null, lateral = false, onCerrar = null }) {
  const el = h(`dialog${lateral ? '.panel-lateral' : ''}.dialogo`, { attrs: { 'aria-label': titulo } });
  const cerrar = () => { if (el.open) el.close(); };
  el.append(
    h('div.dialogo__cabeza', {}, h('h2', { texto: titulo }), h('button.boton.boton--fantasma.boton--icono.boton--chico', { attrs: { type: 'button', 'aria-label': 'Cerrar' }, on: { click: cerrar } }, icono('cerrar'))),
    h('div.dialogo__cuerpo', {}, cuerpo),
    ...(pie ? [h('div.dialogo__pie', {}, pie)] : []),
  );
  el.addEventListener('click', (e) => { if (e.target === el) cerrar(); });
  el.addEventListener('close', () => { el.remove(); onCerrar?.(); });
  document.body.append(el);
  el.showModal();
  return { el, cerrar };
}

// ══════════════ Paleta de comandos ══════════════
/**
 * paleta(comandos) abre la paleta. comandos: [{ id, grupo, etiqueta, icono, atajo, palabras, accion }]
 * Flechas para moverse, Enter para ejecutar, Esc para cerrar.
 */
export function paleta(comandos) {
  const entrada = h('input', { attrs: { type: 'text', placeholder: 'Escribe un comando o el nombre de una sección…', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'paleta-lista', 'aria-label': 'Buscar comando' } });
  const lista = h('div.paleta__lista', { attrs: { id: 'paleta-lista', role: 'listbox' } });
  let visibles = [], idx = 0;

  const ejecutar = (c) => { dlg.close(); setTimeout(() => c.accion(), 0); };
  const pintar = () => {
    vaciar(lista);
    const q = normalizar(entrada.value);
    visibles = comandos.filter((c) => !q || normalizar(`${c.etiqueta} ${c.grupo} ${c.palabras ?? ''}`).includes(q));
    if (idx >= visibles.length) idx = Math.max(0, visibles.length - 1);
    if (!visibles.length) { lista.append(h('div.vacio', {}, icono('buscar'), h('strong', { texto: 'Sin coincidencias' }), h('p', { texto: 'Prueba con otra palabra.' }))); return; }
    let grupoActual = null;
    visibles.forEach((c, i) => {
      if (c.grupo !== grupoActual) { grupoActual = c.grupo; lista.append(h('div.paleta__grupo', { texto: grupoActual })); }
      lista.append(h('button.paleta__item', { attrs: { type: 'button', role: 'option', 'aria-selected': String(i === idx), id: `cmd-${i}` }, on: { click: () => ejecutar(c), mousemove: () => { if (idx !== i) { idx = i; marcar(); } } } },
        icono(c.icono ?? 'flecha'), h('span.paleta__texto', { texto: c.etiqueta }), c.atajo ? h('span', {}, c.atajo.map((k) => h('kbd', { texto: k }))) : null));
    });
  };
  const marcar = () => {
    lista.querySelectorAll('.paleta__item').forEach((b, i) => { b.setAttribute('aria-selected', String(i === idx)); if (i === idx) b.scrollIntoView({ block: 'nearest' }); });
    entrada.setAttribute('aria-activedescendant', `cmd-${idx}`);
  };

  const dlg = h('dialog.paleta', { attrs: { 'aria-label': 'Paleta de comandos' } },
    h('div.paleta__entrada', {}, icono('buscar'), entrada),
    lista,
    h('div.paleta__pie', {}, h('span', {}, h('kbd', { texto: '↑' }), ' ', h('kbd', { texto: '↓' }), ' navegar'), h('span', {}, h('kbd', { texto: '↵' }), ' abrir'), h('span', {}, h('kbd', { texto: 'esc' }), ' cerrar')));
  entrada.addEventListener('input', () => { idx = 0; pintar(); });
  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(visibles.length - 1, idx + 1); marcar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); marcar(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (visibles[idx]) ejecutar(visibles[idx]); }
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  pintar();
  dlg.showModal();
  entrada.focus();
  return dlg;
}
