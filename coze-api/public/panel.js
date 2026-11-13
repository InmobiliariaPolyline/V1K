// Panel V1K: consulta la API (solo lectura) con el token del usuario y dibuja el resultado.
// Todo el contenido que viene de la API se inserta con textContent (nunca innerHTML), así que no hay XSS.
import { dinero, estadoFrescura, fechaCorta, fechaHora, haceHoras, NOMBRE_APP, numero, porcentaje, urlSegura } from './formato.js';

const CLAVE = 'v1k-token';
const $ = (id) => document.getElementById(id);

// ── Token: sessionStorage por defecto; localStorage solo si el usuario marca «Recordar» ──
function leerToken() {
  try { return sessionStorage.getItem(CLAVE) || localStorage.getItem(CLAVE) || ''; } catch { return ''; }
}
function guardarToken(token, recordar) {
  try {
    sessionStorage.setItem(CLAVE, token);
    if (recordar) localStorage.setItem(CLAVE, token); else localStorage.removeItem(CLAVE);
  } catch { /* navegador sin almacenamiento: el token vive solo en memoria */ memoria = token; }
}
function borrarToken() {
  memoria = '';
  try { sessionStorage.removeItem(CLAVE); localStorage.removeItem(CLAVE); } catch { /* nada */ }
}
let memoria = '';
const token = () => leerToken() || memoria;

// ── Utilidades de DOM ─────────────────────────────────────────────────────────────────
function el(tag, { clase, texto, attrs } = {}, hijos = []) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  for (const [k, v] of Object.entries(attrs ?? {})) e.setAttribute(k, v);
  for (const h of hijos) e.append(h);
  return e;
}
const vaciar = (nodo) => nodo.replaceChildren();
const vacio = (texto) => el('li', { clase: 'vacio', texto });

// ── Llamadas a la API ─────────────────────────────────────────────────────────────────
class ErrorApi extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado; }
}

async function api(ruta, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  const resp = await fetch(`/api/${ruta}${qs.size ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: 'no-store',
  });
  let cuerpo = null;
  try { cuerpo = await resp.json(); } catch { /* respuesta sin JSON */ }
  if (!resp.ok) throw new ErrorApi(resp.status, cuerpo?.error ?? `Error ${resp.status}`);
  return cuerpo;
}

// ── Pintar secciones ──────────────────────────────────────────────────────────────────
function pintarFrescura(filas) {
  const cont = $('frescura');
  vaciar(cont);
  const porApp = new Map(filas.map((f) => [f.app, f]));
  for (const app of ['planner', 'mrp', 'scraper']) {
    const f = porApp.get(app);
    const estado = f ? estadoFrescura(f.hace_horas) : 'desconocido';
    cont.append(el('article', { clase: `tarjeta app app--${app}` }, [
      el('div', { clase: 'app__cabeza' }, [
        el('span', { clase: 'app__nombre', texto: NOMBRE_APP[app] }),
        el('span', { clase: `punto punto--${estado}`, attrs: { title: estado === 'ok' ? 'Al día' : estado === 'aviso' ? 'Algo viejo' : estado === 'viejo' ? 'Desactualizado' : 'Sin sincronizar' } }),
      ]),
      el('p', { clase: 'app__hace', texto: f ? haceHoras(f.hace_horas) : 'Sin sincronizar' }),
      el('p', { clase: 'suave', texto: f ? `Última sincronización: ${fechaHora(f.ultima_sync)}` : 'Todavía no ha enviado datos' }),
    ]));
  }
}

function kpi(valor, etiqueta, variante) {
  return el('article', { clase: `tarjeta kpi${variante ? ` kpi--${variante}` : ''}` }, [
    el('div', { clase: 'kpi__valor', texto: numero(valor) }),
    el('div', { clase: 'kpi__etiqueta', texto: etiqueta }),
  ]);
}

function pintarKpis(r) {
  const cont = $('kpis');
  vaciar(cont);
  cont.append(
    kpi(r.proyectos.total, 'Proyectos'),
    kpi(r.proyectos.atrasados, 'Proyectos atrasados', r.proyectos.atrasados > 0 ? 'alerta' : 'ok'),
    kpi(r.proyectos.tareas_atrasadas, 'Tareas atrasadas', r.proyectos.tareas_atrasadas > 0 ? 'alerta' : 'ok'),
    kpi(r.stock.en_stock_bajo, `Materiales bajo mínimo (de ${numero(r.stock.materiales_con_minimo)})`, r.stock.en_stock_bajo > 0 ? 'alerta' : 'ok'),
    kpi(r.pedidos.abiertos, 'Pedidos abiertos'),
    kpi(r.propiedades.total_catalogo, 'Propiedades en el catálogo'),
  );
}

function pintarAtrasados(lista, totalProyectos) {
  const ul = $('lista-atrasados');
  vaciar(ul);
  if (!lista.length) { ul.append(vacio(totalProyectos === 0 ? 'Todavía no hay proyectos sincronizados.' : 'Ningún proyecto atrasado.')); return; }
  for (const p of lista) {
    const barra = el('div', { clase: 'progreso', attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(porcentaje(p.avance_pct)) } }, [el('span')]);
    barra.firstChild.style.width = `${porcentaje(p.avance_pct)}%`;
    ul.append(el('li', {}, [
      el('div', { clase: 'lista__fila' }, [
        el('span', { clase: 'lista__titulo', texto: p.nombre }),
        el('span', { clase: 'lista__meta', texto: `${numero(p.avance_pct)} % de avance` }),
      ]),
      el('div', { clase: 'lista__meta', texto: `${p.responsable ?? '—'} · debía terminar el ${fechaCorta(p.fin)} · ${numero(p.tareas_atrasadas)} tarea(s) atrasada(s)` }),
      barra,
    ]));
  }
}

function pintarHitos(lista) {
  const ul = $('lista-hitos');
  vaciar(ul);
  if (!lista.length) { ul.append(vacio('No hay hitos próximos.')); return; }
  for (const h of lista) {
    ul.append(el('li', {}, [
      el('div', { clase: 'lista__fila' }, [
        el('span', { clase: 'lista__titulo', texto: h.descripcion }),
        el('span', { clase: 'lista__meta', texto: fechaCorta(h.fecha) }),
      ]),
      el('div', { clase: 'lista__meta', texto: h.proyecto ?? '—' }),
    ]));
  }
}

function pintarPedidos(lista, abiertos) {
  const ul = $('lista-pedidos');
  vaciar(ul);
  if (!lista.length) { ul.append(vacio(abiertos === 0 ? 'No hay órdenes de compra abiertas.' : 'Sin datos.')); return; }
  for (const p of lista) {
    ul.append(el('li', {}, [
      el('div', { clase: 'lista__fila' }, [
        el('span', { clase: 'lista__titulo', texto: `${p.pedido_id} · ${p.proveedor ?? '—'}` }),
        el('span', { clase: 'lista__meta', texto: p.llegada_estimada ? `llega ${fechaCorta(p.llegada_estimada)}` : 'sin fecha' }),
      ]),
      el('div', { clase: 'lista__meta', texto: `${p.estado} · ${p.obra ?? 'sin obra'}` }),
    ]));
  }
}

function pintarStock(filas, r) {
  const tb = $('tabla-stock').tBodies[0];
  vaciar(tb);
  $('nota-stock').textContent = `${numero(r.stock.en_stock_bajo)} de ${numero(r.stock.materiales_con_minimo)} materiales con mínimo están en su mínimo o por debajo (${numero(r.stock.sin_existencias)} sin existencias). Se muestran los de mayor faltante.`;
  if (!filas.length) { tb.append(el('tr', {}, [el('td', { attrs: { colspan: '5' }, clase: 'vacio', texto: 'Ningún material bajo su mínimo.' })])); return; }
  for (const m of filas) {
    tb.append(el('tr', {}, [
      el('td', { texto: m.material }),
      el('td', { texto: m.categoria ?? '—' }),
      el('td', { clase: 'num', texto: `${numero(m.cantidad)} ${m.unidad ?? ''}`.trim() }),
      el('td', { clase: 'num', texto: numero(m.minimo) }),
      el('td', { clase: 'num', texto: numero(m.faltante) }),
    ]));
  }
}

function pintarPortales(lista) {
  const cont = $('portales');
  vaciar(cont);
  const max = Math.max(1, ...lista.map((x) => x.total));
  for (const x of lista) {
    const pista = el('div', { clase: 'barra__pista' }, [el('span')]);
    pista.firstChild.style.width = `${Math.max(2, (x.total / max) * 100)}%`;
    cont.append(el('div', { clase: 'barra' }, [
      el('span', { texto: `${x.portal} · ${x.operacion === 'VENTA' ? 'venta' : x.operacion === 'ALQUILER' ? 'alquiler' : 'sin operación'}` }),
      pista,
      el('span', { clase: 'barra__valor', texto: numero(x.total) }),
    ]));
  }
}

function pintarPropiedades(filas) {
  const tb = $('tabla-props').tBodies[0];
  vaciar(tb);
  if (!filas.length) { tb.append(el('tr', {}, [el('td', { attrs: { colspan: '5' }, clase: 'vacio', texto: 'Ninguna propiedad coincide con el filtro.' })])); return; }
  for (const p of filas) {
    const enlace = urlSegura(p.url);
    const titulo = enlace ? el('a', { texto: p.titulo ?? '(sin título)', attrs: { href: enlace, target: '_blank', rel: 'noopener noreferrer' } }) : document.createTextNode(p.titulo ?? '(sin título)');
    const op = (p.operacion ?? '').toLowerCase();
    tb.append(el('tr', {}, [
      el('td', {}, [titulo, el('div', { clase: 'lista__meta', texto: [p.inmueble, p.area].filter(Boolean).join(' · ') })]),
      el('td', {}, [el('span', { clase: `etiqueta etiqueta--${op}`, texto: op || '—' })]),
      el('td', { texto: p.distrito ?? '—' }),
      el('td', { clase: 'num', texto: dinero(p.precio, p.moneda) }),
      el('td', { texto: p.portal }),
    ]));
  }
}

// ── Carga de datos ────────────────────────────────────────────────────────────────────
function estadoConexion(clase, texto) {
  const p = $('estado-conexion');
  p.className = `pastilla${clase ? ` pastilla--${clase}` : ''}`;
  p.textContent = texto;
}
function mostrarAviso(texto) {
  const a = $('aviso');
  a.hidden = !texto;
  a.textContent = texto ?? '';
}

async function cargarPropiedades() {
  const params = { limite: '10' };
  const op = $('f-operacion').value, distrito = $('f-distrito').value.trim(), precio = $('f-precio').value;
  if (op) params.operacion = op;
  if (distrito) params.distrito = distrito;
  if (precio) params.precio_max_usd = precio;
  const r = await api('propiedades', params);
  $('nota-props').textContent = r.total ? `Mostrando las ${r.total} más recientes${op || distrito || precio ? ' que cumplen el filtro' : ''}.` : '';
  pintarPropiedades(r.datos);
}

let cargando = false;
async function cargar() {
  if (cargando) return;
  cargando = true;
  $('btn-actualizar').disabled = true;
  estadoConexion('', 'Cargando…');
  try {
    const [resumen, stock] = await Promise.all([api('resumen-general'), api('stock-bajo', { limite: '10' })]);
    const r = resumen.datos[0];
    pintarFrescura(r.frescura);
    pintarKpis(r);
    pintarAtrasados(r.proyectos_atrasados, r.proyectos.total);
    pintarHitos(r.proximos_hitos);
    pintarPedidos(r.proximos_pedidos, r.pedidos.abiertos);
    pintarStock(stock.datos, r);
    pintarPortales(r.propiedades_por_portal);
    await cargarPropiedades();
    $('generado').textContent = `Actualizado: ${fechaHora(resumen.generado_en)}`;
    estadoConexion('ok', 'Conectado');
    mostrarAviso('');
  } catch (e) {
    if (e instanceof ErrorApi && e.estado === 401) { salir('El token no es válido o cambió. Vuelve a pegarlo.'); return; }
    estadoConexion('error', 'Sin conexión');
    mostrarAviso(e instanceof ErrorApi ? `La API respondió: ${e.message}` : 'No se pudo conectar con la API. Revisa tu conexión e intenta de nuevo.');
  } finally {
    cargando = false;
    $('btn-actualizar').disabled = false;
  }
}

// ── Navegación entrada / panel ───────────────────────────────────────────────────────
let temporizador = null;
function detenerAuto() { if (temporizador) { clearInterval(temporizador); temporizador = null; } }

function mostrarPanel() {
  $('vista-entrada').hidden = true;
  $('vista-panel').hidden = false;
  cargar();
}
function salir(mensaje = '') {
  detenerAuto();
  $('auto').checked = false;
  borrarToken();
  $('vista-panel').hidden = true;
  $('vista-entrada').hidden = false;
  $('token').value = '';
  $('error-entrada').textContent = mensaje;
  document.title = 'V1K · Panel';
}

$('form-entrada').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const valor = $('token').value.trim();
  if (valor.length < 24) { $('error-entrada').textContent = 'El token es demasiado corto.'; return; }
  $('error-entrada').textContent = 'Comprobando…';
  guardarToken(valor, $('recordar').checked);
  try {
    await api('frescura');   // prueba barata para validar el token antes de entrar
    $('error-entrada').textContent = '';
    mostrarPanel();
  } catch (e) {
    borrarToken();
    $('error-entrada').textContent = e instanceof ErrorApi && e.estado === 401 ? 'Token incorrecto.' : 'No se pudo conectar con la API.';
  }
});
$('btn-actualizar').addEventListener('click', cargar);
$('btn-salir').addEventListener('click', () => salir());
$('form-props').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try { await cargarPropiedades(); mostrarAviso(''); }
  catch (e) { mostrarAviso(e instanceof ErrorApi ? e.message : 'No se pudo consultar las propiedades.'); }
});
$('auto').addEventListener('change', (ev) => {
  detenerAuto();
  if (ev.target.checked) temporizador = setInterval(cargar, 60_000);
});

// Arranque: si ya hay un token guardado, intenta entrar directamente
if (token()) mostrarPanel(); else $('vista-entrada').hidden = false;
