// Panel V1K: arranque, shell (barra lateral y superior), enrutador, atajos, paleta de comandos y sesión.
import { ErrorApi, consultar, invalidar, validarToken } from './nucleo/api.js';
import { banner, dialogo, paleta, toast, vacio } from './nucleo/componentes.js';
import { $, h, icono, vaciar } from './nucleo/dom.js';
import {
  activarDemo, alternarTema, aplicarAspecto, cerrarSesion, desactivarDemo, esDemo, guardarPref, guardarToken,
  haySesion, leerPrefs, prefs,
} from './nucleo/estado.js';
import { fechaHora, hoyIso, numero } from './nucleo/formato.js';
import { inventarioSinCargar } from './nucleo/insights.js';
import { RUTAS, RUTA_INICIAL, armarHash, combinarParams, parsearHash } from './nucleo/rutas.js';

export const VERSION = '2.0.0';

// ── Secciones ──────────────────────────────────────────────────────────────────────────
const SECCIONES = [
  { id: 'inicio', titulo: 'Inicio', icono: 'inicio', grupo: 'Panel', atajo: 'h', cargar: () => import('./vistas/inicio.js') },
  { id: 'tendencias', titulo: 'Tendencias', icono: 'linea', grupo: 'Panel', atajo: 't', cargar: () => import('./vistas/tendencias.js') },
  { id: 'proyectos', titulo: 'Proyectos', icono: 'proyectos', grupo: 'Operación', atajo: 'p', cargar: () => import('./vistas/proyectos.js') },
  { id: 'calendario', titulo: 'Calendario', icono: 'calendario', grupo: 'Operación', atajo: 'c', cargar: () => import('./vistas/calendario.js') },
  { id: 'materiales', titulo: 'Materiales', icono: 'materiales', grupo: 'Operación', atajo: 'm', cargar: () => import('./vistas/materiales.js') },
  { id: 'pedidos', titulo: 'Pedidos', icono: 'pedidos', grupo: 'Operación', atajo: 'o', cargar: () => import('./vistas/pedidos.js') },
  { id: 'propiedades', titulo: 'Propiedades', icono: 'propiedades', grupo: 'Mercado', atajo: 'i', cargar: () => import('./vistas/propiedades.js') },
  { id: 'explorador', titulo: 'Explorador de API', icono: 'explorador', grupo: 'Herramientas', atajo: 'e', cargar: () => import('./vistas/explorador.js') },
  { id: 'asistente', titulo: 'Agente de Coze', icono: 'asistente', grupo: 'Herramientas', atajo: 'a', cargar: () => import('./vistas/asistente.js') },
  { id: 'sistema', titulo: 'Estado del sistema', icono: 'sistema', grupo: 'Sistema', atajo: 's', cargar: () => import('./vistas/sistema.js') },
];
const SECCION = Object.fromEntries(SECCIONES.map((x) => [x.id, x]));

let actual = null;        // { id, destruir }
let temporizador = null;
let insigniasNav = {};    // id -> { texto, tono }
let ultimaActualizacion = null;

// ══════════════ Sesión: entrada con token o demostración ══════════════
function mostrarEntrada(mensaje = '') {
  detenerAuto();
  actual?.destruir?.(); actual = null;
  $('#app').hidden = true;
  $('#entrada').hidden = false;
  $('#error-entrada').textContent = mensaje;
  $('#token').value = '';
  document.title = 'V1K · Panel';
}

function configurarEntrada() {
  $('#form-entrada').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const valor = $('#token').value.trim();
    if (valor.length < 24) { $('#error-entrada').textContent = 'El token es demasiado corto.'; return; }
    $('#error-entrada').textContent = 'Comprobando…';
    $('#btn-entrar').disabled = true;
    desactivarDemo();
    guardarToken(valor, $('#recordar').checked);
    try {
      if (!(await validarToken())) { cerrarSesion(); $('#error-entrada').textContent = 'Token incorrecto.'; return; }
      $('#error-entrada').textContent = '';
      entrarAlPanel();
    } catch {
      cerrarSesion();
      $('#error-entrada').textContent = 'No se pudo conectar con la API.';
    } finally { $('#btn-entrar').disabled = false; }
  });
  $('#btn-demo').addEventListener('click', () => { activarDemo(); invalidar(); entrarAlPanel(); });
}

function salir(mensaje = '') {
  cerrarSesion();
  invalidar();
  mostrarEntrada(mensaje);
}

// ══════════════ Shell ══════════════
function construirLateral() {
  const lateral = $('#lateral');
  vaciar(lateral);
  const grupos = [];
  for (const s of SECCIONES) { if (!grupos.includes(s.grupo)) grupos.push(s.grupo); }
  lateral.append(
    h('div.marca', {}, h('div.marca__logo', {}, icono('base')), h('div.marca__texto', {}, h('div.marca__nombre', { texto: 'V1K' }), h('div.marca__sub', { texto: 'Vista central · solo lectura' }))),
    h('nav', { attrs: { 'aria-label': 'Secciones' } }, grupos.map((g) => h('div.nav__grupo', {}, h('div.nav__titulo', { texto: g }),
      SECCIONES.filter((s) => s.grupo === g).map((s) => {
        const ins = insigniasNav[s.id];
        return h('a.nav__item', { attrs: { href: armarHash(s.id), 'data-seccion': s.id, title: s.titulo } }, icono(s.icono), h('span.nav__texto', { texto: s.titulo }), ins ? h(`span.nav__insignia${ins.tono === 'alerta' ? '.nav__insignia--alerta' : ''}`, { texto: ins.texto }) : null);
      })))),
    h('div.nav__espacio'),
    h('div.lateral__pie', {},
      h('div.sesion', {}, h('div.sesion__avatar', {}, icono(esDemo() ? 'chispa' : 'persona')), h('div.sesion__texto', {}, h('strong', { texto: esDemo() ? 'Demostración' : 'Sesión con token' }), h('span.suave', { texto: esDemo() ? 'Datos de ejemplo' : 'Datos reales' }))),
      h('button.nav__item', { attrs: { type: 'button', title: 'Contraer o expandir la barra lateral (B)' }, on: { click: alternarLateral } }, icono('menu'), h('span.nav__texto.boton__texto', { texto: 'Contraer barra' })),
      h('button.nav__item', { attrs: { type: 'button', title: 'Cerrar sesión' }, on: { click: () => salir() } }, icono('salir'), h('span.nav__texto.boton__texto', { texto: esDemo() ? 'Salir de la demostración' : 'Cerrar sesión' }))),
  );
  marcarNav();
}

function marcarNav() {
  document.querySelectorAll('#lateral .nav__item[data-seccion]').forEach((a) => {
    if (a.dataset.seccion === actual?.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

function construirBarra(seccion) {
  const barra = $('#barra');
  vaciar(barra);
  barra.append(
    h('button.boton.boton--icono.boton--fantasma.boton--menu', { attrs: { type: 'button', 'aria-label': 'Abrir menú' }, on: { click: () => abrirMenu(true) } }, icono('menu')),
    h('div.barra__titulo', {}, h('div', {}, h('div.barra__migas', { texto: `Panel V1K / ${seccion.grupo}` }), h('h1', { texto: seccion.titulo }))),
    h('div.barra__espacio'),
    h('button.buscador', { attrs: { type: 'button', 'aria-label': 'Abrir la paleta de comandos' }, on: { click: abrirPaleta } }, icono('buscar'), h('span.buscador__texto', { texto: 'Buscar o ir a…' }), h('kbd', { texto: 'Ctrl K' })),
    h('div.barra__acciones', {},
      h(`span.pastilla#estado-conexion`, { texto: 'Cargando…', attrs: { role: 'status' } }),
      h('button.boton.boton--icono.boton--fantasma#btn-actualizar', { attrs: { type: 'button', title: 'Actualizar datos (R)', 'aria-label': 'Actualizar datos' }, on: { click: () => refrescar(true) } }, icono('refrescar')),
      h('button.boton.boton--icono.boton--fantasma', { attrs: { type: 'button', title: 'Cambiar tema (T)', 'aria-label': 'Cambiar tema' }, on: { click: () => { alternarTema(); pintarBotonesTema(); } } }, icono('auto', 'icono--tema icono--tema-auto'), icono('luna', 'icono--tema icono--tema-oscuro'), icono('sol', 'icono--tema icono--tema-claro')),
      h('button.boton.boton--icono.boton--fantasma', { attrs: { type: 'button', title: 'Atajos de teclado (?)', 'aria-label': 'Atajos de teclado' }, on: { click: mostrarAtajos } }, icono('teclado'))),
  );
  estadoConexion(esDemo() ? 'demo' : 'cargando');
}

function pintarBotonesTema() { /* el icono lo decide el CSS según data-tema; ver vistas.css */ }

export function estadoConexion(tipo, texto = '') {
  const p = $('#estado-conexion');
  if (!p) return;
  const mapa = { ok: ['pastilla--ok', 'Conectado'], error: ['pastilla--error', 'Sin conexión'], cargando: ['', 'Cargando…'], demo: ['pastilla--demo', 'Demostración'], aviso: ['pastilla--aviso', 'Con avisos'] };
  const [clase, etiqueta] = mapa[tipo] ?? mapa.cargando;
  p.className = `pastilla${clase ? ` ${clase}` : ''}`;
  p.textContent = texto || etiqueta;
}

function construirPie() {
  const pie = $('#pie');
  vaciar(pie);
  pie.append(h('span#pie-actualizado', { texto: ultimaActualizacion ? `Actualizado: ${fechaHora(ultimaActualizacion)}` : '—' }), h('span', { texto: `Panel V1K v${VERSION} · solo lectura · los datos son resúmenes sincronizados desde cada app` }));
}

function avisoDemo() {
  const cont = $('#avisos');
  vaciar(cont);
  if (esDemo()) cont.append(banner({ tipo: 'info', texto: 'Estás viendo datos de ejemplo. No se conecta a la API ni muestra información real.', accion: { texto: 'Usar mi token', onClick: () => salir() } }));
}

// ══════════════ Barra lateral en móvil y colapsada en escritorio ══════════════
function abrirMenu(abierto) {
  const app = $('#app');
  app.classList.toggle('app--menu-abierto', abierto);
  $('#velo').hidden = !abierto;
}
function alternarLateral() {
  const colapsado = !$('#app').classList.contains('app--colapsado');
  $('#app').classList.toggle('app--colapsado', colapsado);
  guardarPref('lateral', colapsado ? 'colapsado' : 'abierto');
}

// ══════════════ Insignias de la barra lateral (a partir del resumen) ══════════════
async function cargarInsignias() {
  try {
    const r = (await consultar('resumen-general')).datos[0];
    insigniasNav = {};
    if (r.proyectos.atrasados > 0) insigniasNav.proyectos = { texto: String(r.proyectos.atrasados), tono: 'alerta' };
    if (r.pedidos.abiertos > 0) insigniasNav.pedidos = { texto: String(r.pedidos.abiertos), tono: '' };
    if (r.stock.en_stock_bajo > 0 && !inventarioSinCargar(r.stock)) insigniasNav.materiales = { texto: r.stock.en_stock_bajo > 99 ? '99+' : String(r.stock.en_stock_bajo), tono: 'alerta' };
    const viejas = r.frescura.filter((f) => f.hace_horas >= 72).length;
    if (viejas) insigniasNav.sistema = { texto: String(viejas), tono: 'alerta' };
    construirLateral();
    ultimaActualizacion = Date.now();
    construirPie();
  } catch { /* las insignias son opcionales */ }
}

// ══════════════ Enrutador ══════════════
async function montar(ruta, params) {
  const seccion = SECCION[ruta] ?? SECCION[RUTA_INICIAL];
  actual?.destruir?.();
  actual = { id: seccion.id, destruir: null };
  marcarNav();
  construirBarra(seccion);
  abrirMenu(false);
  document.title = `${seccion.titulo} · V1K Panel`;

  const contenedor = $('#contenido');
  vaciar(contenedor);
  contenedor.setAttribute('aria-busy', 'true');
  const miActual = actual;
  try {
    const modulo = await seccion.cargar();
    globalThis.v1kCarga?.etapa('datos');   // el módulo de la sección ya llegó: falta que lleguen sus datos
    if (actual !== miActual) return;
    const ctx = {
      contenedor, params, seccion, hoy: hoyIso(), demo: esDemo(),
      navegar: (r, p = {}) => { location.hash = armarHash(r, p); },
      /** Cambia los parámetros de la URL sin crear historial (los filtros quedan en el enlace). */
      cambiarParams: (cambios) => { const nuevos = combinarParams(ctx.params, cambios); ctx.params = nuevos; history.replaceState(null, '', armarHash(seccion.id, nuevos)); return nuevos; },
      refrescar: () => refrescar(false),
      estado: estadoConexion,
      error: (e) => errorEnVista(e, contenedor),
      comandos: [],
    };
    ctx.params = { ...params };
    const res = await modulo.default.montar(ctx);
    if (actual === miActual) { actual.destruir = res?.destruir ?? null; actual.comandos = ctx.comandos; }
    if (!esDemo()) estadoConexion('ok');
    ultimaActualizacion = Date.now();
    construirPie();
  } catch (e) {
    if (actual === miActual) errorEnVista(e, contenedor);
  } finally {
    contenedor.removeAttribute('aria-busy');
    cerrarCarga();
  }
  // El foco pasa al contenido sin desplazar la pantalla: lectores de pantalla anuncian el cambio de sección.
  contenedor.focus({ preventScroll: true });
}

/** Maneja un error de datos: 401 cierra la sesión; el resto muestra un aviso con «Reintentar». */
function errorEnVista(e, contenedor) {
  if (e instanceof ErrorApi && e.estado === 401) { salir('El token no es válido o cambió. Vuelve a pegarlo.'); return null; }
  estadoConexion('error');
  const msg = e instanceof ErrorApi ? (e.estado === 400 ? e.message : `La API respondió: ${e.message}`) : 'Ocurrió un error inesperado al mostrar esta sección.';
  const aviso = banner({ tipo: 'error', texto: msg, accion: { texto: 'Reintentar', onClick: () => refrescar(true) } });
  if (contenedor) { vaciar(contenedor); contenedor.append(aviso, vacio({ icono: 'alerta', titulo: 'No se pudo cargar esta sección', texto: 'Puedes reintentar o volver al inicio.', accion: { texto: 'Ir al inicio', onClick: () => { location.hash = armarHash('inicio'); } } })); }
  return aviso;
}

function ruteo() {
  if (!haySesion()) { mostrarEntrada(); return; }
  const { ruta, params } = parsearHash(location.hash);
  montar(ruta, params);
}

/** Vuelve a cargar la sección actual (con la caché vaciada si `forzar`). */
function refrescar(forzar) {
  if (!haySesion() || $('#app').hidden) return;
  if (forzar) invalidar();
  const btn = $('#btn-actualizar');
  btn?.classList.add('boton--girando');
  const { ruta, params } = parsearHash(location.hash);
  montar(ruta, params).finally(() => { $('#btn-actualizar')?.classList.remove('boton--girando'); if (forzar) toast('Datos actualizados', { tipo: 'ok', ms: 1800 }); });
  if (forzar) cargarInsignias();
}

// ══════════════ Actualización automática ══════════════
function detenerAuto() { if (temporizador) { clearInterval(temporizador); temporizador = null; } }
function programarAuto() {
  detenerAuto();
  const min = prefs().auto;
  if (!min) return;
  temporizador = setInterval(() => {
    if (document.hidden) return;                              // no gasta peticiones con la pestaña oculta
    if (document.querySelector('dialog[open]')) return;       // no interrumpe un diálogo abierto
    if (document.activeElement && /^(input|select|textarea)$/i.test(document.activeElement.tagName)) return;
    refrescar(true);
  }, min * 60_000);
}
export function cambiarAuto(min) { guardarPref('auto', min); programarAuto(); toast(min ? `Se actualizará cada ${min} min` : 'Actualización automática desactivada', { tipo: 'info' }); }

// ══════════════ Paleta de comandos y atajos ══════════════
function comandosGlobales() {
  const nav = SECCIONES.map((s) => ({ id: `ir-${s.id}`, grupo: 'Ir a', etiqueta: s.titulo, icono: s.icono, atajo: ['g', s.atajo], palabras: s.id, accion: () => { location.hash = armarHash(s.id); } }));
  const p = prefs();
  const acciones = [
    { id: 'refrescar', grupo: 'Acciones', etiqueta: 'Actualizar datos', icono: 'refrescar', atajo: ['R'], accion: () => refrescar(true) },
    { id: 'tema', grupo: 'Acciones', etiqueta: 'Cambiar tema (claro / oscuro)', icono: 'sol', atajo: ['T'], palabras: 'modo claro oscuro', accion: () => alternarTema() },
    { id: 'tema-auto', grupo: 'Acciones', etiqueta: 'Tema según el sistema', icono: 'auto', accion: () => guardarPref('tema', 'auto') },
    { id: 'densidad', grupo: 'Acciones', etiqueta: p.densidad === 'compacta' ? 'Densidad cómoda' : 'Densidad compacta', icono: 'lista', accion: () => guardarPref('densidad', p.densidad === 'compacta' ? 'comoda' : 'compacta') },
    { id: 'lateral', grupo: 'Acciones', etiqueta: 'Contraer o expandir la barra lateral', icono: 'menu', atajo: ['B'], accion: alternarLateral },
    { id: 'auto-0', grupo: 'Actualización automática', etiqueta: 'Apagar la actualización automática', icono: 'reloj', accion: () => cambiarAuto(0) },
    { id: 'auto-1', grupo: 'Actualización automática', etiqueta: 'Actualizar cada minuto', icono: 'reloj', accion: () => cambiarAuto(1) },
    { id: 'auto-5', grupo: 'Actualización automática', etiqueta: 'Actualizar cada 5 minutos', icono: 'reloj', accion: () => cambiarAuto(5) },
    { id: 'atajos', grupo: 'Ayuda', etiqueta: 'Ver los atajos de teclado', icono: 'teclado', atajo: ['?'], accion: mostrarAtajos },
    { id: 'imprimir', grupo: 'Acciones', etiqueta: 'Imprimir esta sección', icono: 'imprimir', accion: () => window.print() },
    { id: 'salir', grupo: 'Sesión', etiqueta: esDemo() ? 'Salir de la demostración' : 'Cerrar sesión', icono: 'salir', accion: () => salir() },
  ];
  return [...nav, ...(actual?.comandos ?? []), ...acciones];
}
function abrirPaleta() { if (!document.querySelector('dialog.paleta')) paleta(comandosGlobales()); }

function mostrarAtajos() {
  const fila = (teclas, texto) => h('li', {}, h('span', { texto }), h('span', {}, teclas.map((k) => h('kbd', { texto: k }))));
  dialogo({
    titulo: 'Atajos de teclado',
    cuerpo: h('div', { estilo: { display: 'grid', gap: '1rem' } },
      h('ul.atajos', {}, fila(['Ctrl', 'K'], 'Paleta de comandos'), fila(['/'], 'Paleta de comandos'), fila(['R'], 'Actualizar datos'), fila(['T'], 'Cambiar tema'), fila(['B'], 'Barra lateral'), fila(['?'], 'Esta ayuda'), fila(['Esc'], 'Cerrar un diálogo')),
      h('div', {}, h('h3', { texto: 'Ir a una sección: G y luego…' }), h('ul.atajos', { estilo: { marginTop: '0.6rem' } }, SECCIONES.map((s) => fila(['G', s.atajo.toUpperCase()], s.titulo))))),
  });
}

let esperandoG = null;
function teclado(e) {
  const escribiendo = /^(input|select|textarea)$/i.test(e.target.tagName) || e.target.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrirPaleta(); return; }
  if (escribiendo || e.ctrlKey || e.metaKey || e.altKey || $('#app').hidden) return;
  if (document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (esperandoG) {
    clearTimeout(esperandoG); esperandoG = null;
    const s = SECCIONES.find((x) => x.atajo === k);
    if (s) { e.preventDefault(); location.hash = armarHash(s.id); }
    return;
  }
  if (k === 'g') { esperandoG = setTimeout(() => { esperandoG = null; }, 1200); return; }
  if (k === '/') { e.preventDefault(); abrirPaleta(); }
  else if (k === '?') { e.preventDefault(); mostrarAtajos(); }
  else if (k === 'r') refrescar(true);
  else if (k === 't') alternarTema();
  else if (k === 'b') alternarLateral();
}

// ══════════════ Arranque ══════════════
function entrarAlPanel() {
  $('#entrada').hidden = true;
  $('#app').hidden = false;
  $('#app').classList.toggle('app--colapsado', prefs().lateral === 'colapsado');
  insigniasNav = {};
  construirLateral();
  construirPie();
  avisoDemo();
  programarAuto();
  if (!location.hash || location.hash === '#') history.replaceState(null, '', armarHash(RUTA_INICIAL));
  ruteo();
  cargarInsignias();
}

/** Cierra la pantalla de carga (una sola vez): al mostrarse la primera sección o el formulario de entrada. */
let cargaCerrada = false;
function cerrarCarga() {
  if (cargaCerrada) return;
  cargaCerrada = true;
  const c = globalThis.v1kCarga;
  if (c) c.terminar(); else document.getElementById('carga')?.remove();
}

function iniciar() {
  // Los estilos llegan con media="print" para no bloquear la pantalla de carga; js/carga.js los activa y esto es el respaldo.
  document.querySelectorAll('link[rel="stylesheet"][media="print"]').forEach((l) => { l.media = 'all'; });
  globalThis.v1kCarga?.etapa('arranque');
  leerPrefs();
  aplicarAspecto();
  configurarEntrada();
  $('#velo').addEventListener('click', () => abrirMenu(false));
  window.addEventListener('hashchange', () => { if (haySesion()) ruteo(); });
  window.addEventListener('keydown', teclado);
  globalThis.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => aplicarAspecto());
  window.addEventListener('offline', () => estadoConexion('error', 'Sin red'));
  window.addEventListener('online', () => { estadoConexion('cargando'); refrescar(true); });
  if (haySesion()) entrarAlPanel(); else { mostrarEntrada(); cerrarCarga(); }
}

iniciar();
export { SECCIONES, RUTAS, numero };
