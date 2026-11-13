// Funciones puras de formato del panel (sin DOM): se prueban en test/panel.test.mjs.

const MESES_ISO = /^(\d{4})-(\d{2})-(\d{2})/;

/** «2026-11-07» o «2026-11-07T00:00:00.000Z» -> «07/11/2026». Sin conversión de zona horaria (las fechas son de calendario). */
export function fechaCorta(valor) {
  if (typeof valor !== 'string') return '—';
  const m = MESES_ISO.exec(valor);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/** Fecha y hora local de un instante ISO: «13/11/2026 13:37». */
export function fechaHora(valor) {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Horas -> texto legible: 0.2 -> «hace 12 min», 1.5 -> «hace 1.5 h», 30 -> «hace 1 día», 100 -> «hace 4 días». */
export function haceHoras(horas) {
  if (typeof horas !== 'number' || !Number.isFinite(horas) || horas < 0) return '—';
  if (horas < 1) {
    const min = Math.max(1, Math.round(horas * 60));
    return `hace ${min} min`;
  }
  if (horas < 24) return `hace ${Math.round(horas * 10) / 10} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

/** Semáforo de frescura según las horas desde la última sincronización. */
export function estadoFrescura(horas) {
  if (typeof horas !== 'number' || !Number.isFinite(horas)) return 'desconocido';
  if (horas < 24) return 'ok';
  if (horas < 72) return 'aviso';
  return 'viejo';
}

/** 1234567.5 -> «1,234,567.5» (formato es-PE: coma para los miles y punto para los decimales). */
export function numero(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('es-PE', { maximumFractionDigits: 2 }) : '—';
}

/** Precio con su moneda: («268000.00», «USD») -> «US$ 268,000»; («3800000», «PEN») -> «S/ 3,800,000». */
export function dinero(valor, moneda) {
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return 'Sin precio';
  const simbolo = moneda === 'USD' ? 'US$' : moneda === 'PEN' ? 'S/' : (moneda ?? '');
  return `${simbolo} ${v.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`.trim();
}

/** Solo enlaces http(s): evita `javascript:` u otros esquemas en datos que vienen de fuera. */
export function urlSegura(valor) {
  if (typeof valor !== 'string') return null;
  try {
    const u = new URL(valor);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Porcentaje acotado a 0-100 para barras de progreso. */
export function porcentaje(valor) {
  const v = Number(valor);
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

/** Nombre legible de cada app. */
export const NOMBRE_APP = { planner: 'Planner', mrp: 'MRP', scraper: 'Scraper' };
