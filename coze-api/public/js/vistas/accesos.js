// Accesos de Telegram: el administrador escribe el número de chat y el teléfono de una persona y, desde ese momento, esa persona
// puede usar el bot de consultas y recibir el resumen de la mañana. Se protege con un token de administrador (distinto del de lectura).
import { ErrorApi } from '../nucleo/api.js';
import {
  MAX_ACCESOS, cambiarEstado, darAcceso, entrarAdmin, hayAdmin, listar, quitar, resumirAccesos, salirAdmin, textoAlta, validarFormulario,
} from '../nucleo/accesos.js';
import { banner, campo, dialogo, insignia, kpi, tabla, tarjeta, toast, vacio } from '../nucleo/componentes.js';
import { h, icono } from '../nucleo/dom.js';
import { esDemo } from '../nucleo/estado.js';
import { fechaCorta } from '../nucleo/formato.js';
import { encabezado, poner } from './_comun.js';

/** Mensaje para el administrador según el error del servidor. */
function textoError(e) {
  if (!(e instanceof ErrorApi)) return 'Ocurrió un error inesperado.';
  if (e.estado === 503) return 'El módulo de accesos todavía no está configurado en el servidor: faltan ADMIN_TOKEN o DATABASE_URL_ACCESOS en Vercel (guía: docs/BOT_TELEGRAM.md).';
  if (e.estado === 401) return 'Token de administrador incorrecto.';
  if (e.estado === 502) return 'El servidor no pudo usar la base de datos. ¿Ya ejecutaste db/04_accesos.sql en Neon?';
  return e.message;
}

export default {
  async montar(ctx) {
    const { contenedor } = ctx;
    const demo = esDemo();
    const cabecera = encabezado({
      titulo: 'Accesos de Telegram',
      sub: 'Quién puede usar el bot de consultas y recibir el resumen de la mañana. Solo para administradores.',
    });

    // ── Puerta: pide el token de administrador ──────────────────────────────────────────
    function pintarPuerta(mensaje = '') {
      const token = campo({ etiqueta: 'Token de administrador', tipo: 'password', placeholder: 'Pégalo aquí', attrs: { autocomplete: 'off', 'aria-label': 'Token de administrador' }, ayuda: 'Es distinto del token de solo lectura con el que entraste al panel. Solo se guarda en esta pestaña, en memoria.' });
      const aviso = h('div', { attrs: { 'aria-live': 'polite' } }, mensaje ? banner({ tipo: 'error', texto: mensaje }) : null);
      const boton = h('button.boton.boton--primario', { attrs: { type: 'submit' } }, icono('candado'), 'Desbloquear');
      const form = h('form', {
        estilo: { display: 'grid', gap: '0.9rem', maxWidth: '30rem' },
        on: {
          submit: async (ev) => {
            ev.preventDefault();
            const valor = token.entrada.value.trim();
            if (valor.length < 32) { poner(aviso, banner({ tipo: 'error', texto: 'El token de administrador tiene al menos 32 caracteres.' })); return; }
            boton.disabled = true;
            poner(aviso, banner({ tipo: 'info', texto: 'Comprobando…' }));
            entrarAdmin(valor);
            try { await pintarLista(); } catch (e) { salirAdmin(); pintarPuerta(textoError(e)); }
          },
        },
      }, token.el, aviso, h('div', {}, boton));
      const t = tarjeta({ titulo: 'Entrar como administrador', icono: 'candado', clase: 'c-12' });
      t.cuerpo.append(
        h('p.suave', { estilo: { marginBottom: '1.1rem' }, texto: 'Para ver o cambiar quién tiene acceso al bot hace falta el token de administrador. Sin él, este módulo no muestra ni modifica nada.' }),
        form,
      );
      poner(contenedor, cabecera, h('div.grid12', {}, t.el));
    }

    // ── Lista y formulario ─────────────────────────────────────────────────────────────
    async function pintarLista() {
      const resp = await listar();
      const lista = resp.datos ?? [];
      const r = resumirAccesos(lista);

      // Formulario de alta
      const fNombre = campo({ etiqueta: 'Nombre', placeholder: 'Ana Pérez', attrs: { maxlength: '60', 'aria-label': 'Nombre' } });
      const fTel = campo({ etiqueta: 'Teléfono', tipo: 'tel', placeholder: '+51 999 888 777', attrs: { maxlength: '20', 'aria-label': 'Teléfono' }, ayuda: 'Solo para tu registro: Telegram no permite comprobarlo.' });
      const fChat = campo({ etiqueta: 'Número de chat', placeholder: '123456789', attrs: { inputmode: 'numeric', maxlength: '20', 'aria-label': 'Número de chat' }, ayuda: 'Lo que le responde el bot a la persona cuando pulsa «Iniciar».' });
      const errores = h('div', { attrs: { 'aria-live': 'polite' } });
      const enviar = h('button.boton.boton--primario', { attrs: { type: 'submit' } }, icono('ok'), 'Dar acceso');
      const form = h('form', {
        estilo: { display: 'grid', gap: '0.8rem' },
        on: {
          submit: async (ev) => {
            ev.preventDefault();
            const v = validarFormulario({ nombre: fNombre.entrada.value, telefono: fTel.entrada.value, chat_id: fChat.entrada.value });
            if (!v.ok) { poner(errores, banner({ tipo: 'error', texto: Object.values(v.errores)[0] })); return; }
            enviar.disabled = true;
            try {
              const res = await darAcceso(v.valor);
              toast(textoAlta(res, v.valor.nombre), { tipo: res.notificado || res.actualizado ? 'ok' : 'info', ms: 6500 });
              await pintarLista();
            } catch (e) {
              poner(errores, banner({ tipo: 'error', texto: textoError(e) }));
              if (e instanceof ErrorApi && e.estado === 401) { salirAdmin(); pintarPuerta(textoError(e)); }
              enviar.disabled = false;
            }
          },
        },
      }, fNombre.el, fTel.el, fChat.el, errores, h('div', {}, enviar));

      const tForm = tarjeta({ titulo: 'Dar acceso a una persona', icono: 'persona', clase: 'c-4' });
      tForm.cuerpo.append(form,
        h('ol.suave', { estilo: { margin: '1rem 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem', display: 'grid', gap: '0.25rem', listStyleType: 'decimal' } },
          h('li', { texto: 'La persona abre Telegram y busca @v1k_consultas_bot.' }),
          h('li', { texto: 'Pulsa «Iniciar»: el bot le responde su número de chat.' }),
          h('li', { texto: 'Te lo envía; lo escribes aquí con su nombre y teléfono.' }),
          h('li', { texto: 'Desde ese momento ya puede usar el bot.' })));

      // Lista de personas
      const columnas = [
        { clave: 'nombre', titulo: 'Persona', render: (p) => h('div', {}, h('strong', { texto: p.nombre }),
          h('div.suave', { estilo: { fontSize: '0.8rem' }, texto: p.telefono }),
          h('div.suave', { estilo: { fontSize: '0.8rem' }, texto: `chat ${p.chat_id} · desde ${fechaCorta(p.creado_en)}` })) },
        { clave: 'activo', titulo: 'Estado', render: (p) => insignia(p.activo ? 'Con acceso' : 'Sin acceso', p.activo ? 'ok' : 'peligro') },
        { clave: 'acciones', titulo: 'Acciones', ordenable: false, render: (p) => h('div', { estilo: { display: 'flex', gap: '0.35rem', flexWrap: 'wrap' } },
          h('button.boton.boton--chico', { attrs: { type: 'button', 'aria-label': `${p.activo ? 'Revocar el acceso de' : 'Reactivar el acceso de'} ${p.nombre}` }, on: { click: () => cambiar(p) } }, p.activo ? 'Revocar' : 'Reactivar'),
          h('button.boton.boton--chico.boton--peligro', { attrs: { type: 'button', 'aria-label': `Quitar a ${p.nombre} de la lista` }, on: { click: () => confirmarQuitar(p) } }, 'Quitar')) },
      ];
      const tabl = tabla({
        columnas, filas: lista,
        vacioEl: vacio({ icono: 'persona', titulo: 'Todavía no hay personas', texto: 'Agrega a la primera con el formulario. Los administradores de la variable TELEGRAM_CHATS_PERMITIDOS no aparecen aquí.' }),
      });
      const tLista = tarjeta({ titulo: 'Personas con acceso', icono: 'lista', clase: 'c-8', sub: `${r.total} de ${MAX_ACCESOS}` });
      tLista.acciones.append(h('button.boton.boton--chico', { attrs: { type: 'button', title: 'Cerrar el acceso de administrador en esta pestaña' }, on: { click: () => { salirAdmin(); pintarPuerta(); } } }, icono('salir'), 'Salir del modo administrador'));
      tLista.cuerpo.append(tabl);

      poner(contenedor,
        cabecera,
        demo ? banner({ tipo: 'info', texto: 'Modo demostración: los cambios solo existen en esta pestaña y no se envía nada a Telegram.' }) : null,
        h('div.rejilla.rejilla--3', {},
          kpi({ icono: 'ok', etiqueta: 'Con acceso', valor: r.activos, pie: 'usan el bot y reciben el resumen', tono: 'ok' }),
          kpi({ icono: 'alerta', etiqueta: 'Sin acceso', valor: r.revocados, pie: 'revocadas, siguen en la lista', tono: r.revocados ? 'aviso' : '' }),
          kpi({ icono: 'persona', etiqueta: 'Cupo libre', valor: r.libres, pie: `máximo ${MAX_ACCESOS} personas` })),
        h('div.grid12', {}, tForm.el, tLista.el));
    }

    async function cambiar(p) {
      try {
        const res = await cambiarEstado(p.chat_id, !p.activo);
        toast(p.activo ? `${p.nombre} ya no tiene acceso.` : (res.notificado ? `${p.nombre} tiene acceso otra vez y se le avisó.` : `${p.nombre} tiene acceso otra vez.`), { tipo: 'ok' });
        await pintarLista();
      } catch (e) { toast(textoError(e), { tipo: 'error', ms: 6000 }); if (e instanceof ErrorApi && e.estado === 401) pintarPuerta(textoError(e)); }
    }

    function confirmarQuitar(p) {
      const d = dialogo({
        titulo: 'Quitar de la lista',
        cuerpo: h('p', { texto: `¿Quitar a ${p.nombre} de la lista? Dejará de usar el bot y de recibir el resumen. Para volver a darle acceso habrá que agregarla otra vez.` }),
        pie: [
          h('button.boton', { attrs: { type: 'button' }, on: { click: () => d.cerrar() }, texto: 'Cancelar' }),
          h('button.boton.boton--primario', { attrs: { type: 'button' }, on: { click: async () => {
            d.cerrar();
            try { await quitar(p.chat_id); toast(`${p.nombre} se quitó de la lista.`, { tipo: 'ok' }); await pintarLista(); }
            catch (e) { toast(textoError(e), { tipo: 'error', ms: 6000 }); }
          } }, texto: 'Quitar' }),
        ],
      });
    }

    if (!hayAdmin()) { pintarPuerta(); return; }
    try { await pintarLista(); } catch (e) { salirAdmin(); pintarPuerta(textoError(e)); }
  },
};
