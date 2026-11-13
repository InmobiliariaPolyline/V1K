// Alertas automáticas del Inicio, a partir de resumen-general. Función pura: se prueba en Node.
import { diasEntre, haceHoras, NOMBRE_APP, numero, plural } from './formato.js';

/**
 * generarAlertas(resumen, hoy) -> [{ tono: 'peligro'|'aviso'|'info'|'ok', icono, titulo, texto, ir: { ruta, params } }]
 * Ordenadas por gravedad. `resumen` es la fila de /api/resumen-general.
 */
export function generarAlertas(r, hoy) {
  const a = [];
  const { proyectos: p, stock: st, pedidos: pe, propiedades: pr } = r;

  if (p.atrasados > 0) {
    a.push({ tono: 'peligro', icono: 'alerta', titulo: `${plural(p.atrasados, 'proyecto atrasado', 'proyectos atrasados')}`,
      texto: `${plural(p.tareas_atrasadas, 'tarea atrasada', 'tareas atrasadas')} en total. ${r.proyectos_atrasados[0] ? `El más antiguo: ${r.proyectos_atrasados[0].nombre}.` : ''}`.trim(),
      ir: { ruta: 'proyectos', params: { estado: 'atrasado' } } });
  } else if (p.total > 0) {
    a.push({ tono: 'ok', icono: 'ok', titulo: 'Ningún proyecto atrasado', texto: `${plural(p.en_curso, 'proyecto en curso', 'proyectos en curso')}.`, ir: { ruta: 'proyectos', params: {} } });
  }

  const vencidos = (r.proximos_pedidos ?? []).filter((x) => x.llegada_estimada && diasEntre(hoy, x.llegada_estimada) < 0);
  if (vencidos.length) {
    a.push({ tono: 'peligro', icono: 'pedidos', titulo: `${plural(vencidos.length, 'pedido con llegada vencida', 'pedidos con llegada vencida')}`,
      texto: `${vencidos.map((x) => x.pedido_id).join(', ')} debía${vencidos.length > 1 ? 'n' : ''} llegar antes de hoy.`, ir: { ruta: 'pedidos', params: {} } });
  }

  if (st.materiales_con_minimo > 0) {
    const pct = (st.en_stock_bajo / st.materiales_con_minimo) * 100;
    if (st.en_stock_bajo > 0) {
      a.push({ tono: pct >= 50 ? 'peligro' : 'aviso', icono: 'materiales', titulo: `${numero(st.en_stock_bajo, 0)} de ${numero(st.materiales_con_minimo, 0)} materiales bajo su mínimo`,
        texto: `${numero(pct, 0)} % del catálogo con mínimo; ${numero(st.sin_existencias, 0)} sin existencias.${r.mayor_faltante[0] ? ` Mayor faltante: ${r.mayor_faltante[0].material}.` : ''}`, ir: { ruta: 'materiales', params: {} } });
    } else {
      a.push({ tono: 'ok', icono: 'ok', titulo: 'Stock sobre el mínimo', texto: 'Ningún material está por debajo de su mínimo.', ir: { ruta: 'materiales', params: {} } });
    }
  }

  if (pe.abiertos === 0 && p.total > 0) {
    a.push({ tono: 'info', icono: 'pedidos', titulo: 'Sin órdenes de compra abiertas', texto: 'Todo lo pedido ya fue recibido o no hay pedidos registrados.', ir: { ruta: 'pedidos', params: {} } });
  }

  const cercanos = (r.proximos_hitos ?? []).filter((h) => { const d = diasEntre(hoy, h.fecha); return d !== null && d >= 0 && d <= 7; });
  if (cercanos.length) {
    a.push({ tono: 'info', icono: 'calendario', titulo: `${plural(cercanos.length, 'hito en los próximos 7 días', 'hitos en los próximos 7 días')}`,
      texto: `${cercanos[0].descripcion} — ${cercanos[0].proyecto ?? 's/p'}.`, ir: { ruta: 'calendario', params: {} } });
  }

  // Frescura de cada sistema
  const conocidas = new Set(r.frescura.map((f) => f.app));
  for (const app of ['planner', 'mrp', 'scraper']) {
    if (!conocidas.has(app)) a.push({ tono: 'aviso', icono: 'reloj', titulo: `${NOMBRE_APP[app]} todavía no ha sincronizado`, texto: 'No hay datos de este sistema en la vista central.', ir: { ruta: 'sistema', params: {} } });
  }
  for (const f of r.frescura) {
    if (f.hace_horas >= 72) a.push({ tono: 'peligro', icono: 'reloj', titulo: `${NOMBRE_APP[f.app] ?? f.app} sin sincronizar ${haceHoras(f.hace_horas).replace('hace ', 'desde hace ')}`, texto: 'Los datos de este sistema pueden estar desactualizados.', ir: { ruta: 'sistema', params: {} } });
    else if (f.hace_horas >= 24) a.push({ tono: 'aviso', icono: 'reloj', titulo: `${NOMBRE_APP[f.app] ?? f.app}: última sincronización ${haceHoras(f.hace_horas)}`, texto: 'Más de un día sin novedades de este sistema.', ir: { ruta: 'sistema', params: {} } });
  }

  if (pr.copiadas === 0 && pr.total_catalogo === 0) {
    a.push({ tono: 'aviso', icono: 'propiedades', titulo: 'Sin propiedades sincronizadas', texto: 'El Scraper aún no ha enviado avisos.', ir: { ruta: 'propiedades', params: {} } });
  }

  const orden = { peligro: 0, aviso: 1, info: 2, ok: 3 };
  return a.sort((x, y) => orden[x.tono] - orden[y.tono]);
}

/** Estado global a partir de las alertas: 'peligro' | 'aviso' | 'ok'. */
export function saludGlobal(alertas) {
  if (alertas.some((x) => x.tono === 'peligro')) return 'peligro';
  if (alertas.some((x) => x.tono === 'aviso')) return 'aviso';
  return 'ok';
}

/** Texto corto para el anillo de frescura. */
export function horasCorto(h) {
  if (typeof h !== 'number' || !Number.isFinite(h)) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 24) return `${Math.round(h * 10) / 10} h`;
  return `${Math.floor(h / 24)} d`;
}

/** Porcentaje de «frescura» para el anillo: 100 recién sincronizado, 0 a las 72 horas o más. */
export function pctFrescura(h) {
  if (typeof h !== 'number' || !Number.isFinite(h)) return 0;
  return Math.max(0, Math.min(100, 100 - (h / 72) * 100));
}
