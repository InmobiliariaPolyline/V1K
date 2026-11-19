// Accesos de Telegram (módulo del administrador): validación del formulario, resumen de la lista y cliente de /api/accesos.
// El token de administrador vive SOLO en memoria (se pierde al recargar la página) y es distinto del token de lectura del panel.
// Funciones puras y un motor de demostración: se prueban en test/panel.test.mjs.
import { ErrorApi } from './api.js';
import { esDemo } from './estado.js';

export const MAX_ACCESOS = 50;
const TELEFONO_RE = /^\+?[0-9][0-9 -]{5,18}[0-9]$/;   // la misma regla que el servidor y la tabla
const CHAT_RE = /^[1-9][0-9]{4,14}$/;

export const limpiarTexto = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
export const limpiarChat = (t) => String(t ?? '').replace(/[\s.,]/g, '');

/** Valida el formulario de alta. { ok: true, valor } o { ok: false, errores: { nombre?, telefono?, chat_id? } } */
export function validarFormulario({ nombre, telefono, chat_id } = {}) {
  const n = limpiarTexto(nombre), t = limpiarTexto(telefono), c = limpiarChat(chat_id);
  const errores = {};
  if (n.length < 2 || n.length > 60) errores.nombre = 'Escribe el nombre de la persona (de 2 a 60 letras).';
  if (!TELEFONO_RE.test(t)) errores.telefono = 'El teléfono no parece válido. Ejemplo: +51 999 888 777';
  if (!CHAT_RE.test(c)) errores.chat_id = 'El número de chat son solo dígitos (de 5 a 15). Ejemplo: 123456789';
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true, valor: { nombre: n, telefono: t, chat_id: c } };
}

/** { total, activos, revocados, libres } de la lista de personas. */
export function resumirAccesos(lista = []) {
  const activos = lista.filter((p) => p.activo).length;
  return { total: lista.length, activos, revocados: lista.length - activos, libres: Math.max(0, MAX_ACCESOS - lista.length) };
}

/** Texto del aviso tras dar acceso: dice si la persona fue avisada por Telegram o si debe pulsar «Iniciar» primero. */
export function textoAlta(respuesta, nombre) {
  const quien = limpiarTexto(nombre) || 'La persona';
  if (respuesta?.actualizado) return `Datos de ${quien} actualizados. Tiene acceso.`;
  return respuesta?.notificado
    ? `${quien} ya tiene acceso y se le avisó por Telegram.`
    : `${quien} ya tiene acceso. No se le pudo avisar: debe abrir el bot y pulsar «Iniciar»; desde ahí ya puede usarlo.`;
}

// ── Token de administrador (solo en memoria) ───────────────────────────────────────────
let tokenAdmin = '';
export const hayAdmin = () => esDemo() || tokenAdmin.length >= 32;
export const entrarAdmin = (t) => { tokenAdmin = String(t ?? '').trim(); };
export const salirAdmin = () => { tokenAdmin = ''; };

// ── Motor de demostración: mismas reglas que el servidor, sin red ──────────────────────
export function crearDemoAccesos(ahora = () => new Date()) {
  const iso = () => ahora().toISOString();
  let lista = [
    { chat_id: '711222333', nombre: 'Ana Ejemplo', telefono: '+51 999 111 222', activo: true, creado_en: iso(), actualizado_en: iso() },
    { chat_id: '711444555', nombre: 'Luis Ejemplo', telefono: '+51 999 333 444', activo: false, creado_en: iso(), actualizado_en: iso() },
  ];
  const ordenada = () => [...lista].sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'));
  return async function pedir(metodo, cuerpo = {}) {
    if (metodo === 'GET') return { total: lista.length, maximo: MAX_ACCESOS, datos: ordenada() };
    if (metodo === 'POST') {
      const v = validarFormulario(cuerpo);
      if (!v.ok) throw new ErrorApi(400, Object.values(v.errores)[0]);
      const previa = lista.find((p) => p.chat_id === v.valor.chat_id);
      if (!previa && lista.length >= MAX_ACCESOS) throw new ErrorApi(409, `Se alcanzó el máximo de ${MAX_ACCESOS} personas.`);
      const fila = { ...(previa ?? { creado_en: iso() }), ...v.valor, activo: true, actualizado_en: iso() };
      lista = [...lista.filter((p) => p.chat_id !== fila.chat_id), fila];
      return { persona: fila, notificado: false, actualizado: Boolean(previa) };
    }
    const chat = limpiarChat(cuerpo.chat_id);
    const i = lista.findIndex((p) => p.chat_id === chat);
    if (i < 0) throw new ErrorApi(404, 'Esa persona no está en la lista.');
    if (metodo === 'PATCH') { lista[i] = { ...lista[i], activo: Boolean(cuerpo.activo), actualizado_en: iso() }; return { persona: lista[i], notificado: false }; }
    if (metodo === 'DELETE') { lista = lista.filter((_, j) => j !== i); return { eliminada: chat }; }
    throw new ErrorApi(405, 'Método no permitido');
  };
}
let demo = null;

// ── Cliente de /api/accesos ───────────────────────────────────────────────────────────
async function pedir(metodo, cuerpo) {
  if (esDemo()) { demo ??= crearDemoAccesos(); return demo(metodo, cuerpo); }
  let resp;
  try {
    resp = await fetch('/api/accesos', {
      method: metodo,
      headers: { Authorization: `Bearer ${tokenAdmin}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      cache: 'no-store',
    });
  } catch { throw new ErrorApi(0, 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'); }
  let json = null;
  try { json = await resp.json(); } catch { /* respuesta sin JSON */ }
  if (!resp.ok) {
    if (resp.status === 401) tokenAdmin = '';
    throw new ErrorApi(resp.status, json?.error ?? `Error ${resp.status}`);
  }
  return json;
}

export const listar = () => pedir('GET');
export const darAcceso = (datos) => pedir('POST', datos);
export const cambiarEstado = (chat_id, activo) => pedir('PATCH', { chat_id, activo });
export const quitar = (chat_id) => pedir('DELETE', { chat_id });
