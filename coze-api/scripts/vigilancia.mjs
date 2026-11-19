// Vigilancia de V1K: comprueba desde fuera que la API y el panel respondan y que cada app haya sincronizado hace poco.
// Lo ejecuta .github/workflows/vigilancia.yml cada 6 horas, pero también sirve a mano:
//   API_TOKEN=... node scripts/vigilancia.mjs
//
// El repositorio es PÚBLICO: lo que se escribe en el registro del flujo y en la incidencia no lleva datos del negocio ni el token,
// solo el estado de cada pieza (nombres de las apps, horas desde la última sincronización y códigos de problema).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const BASE_DEFECTO = 'https://v1k-coze-api.vercel.app';
export const REPO_DEFECTO = 'https://github.com/InmobiliariaPolyline/V1K';
export const APPS = ['planner', 'mrp', 'scraper'];
/**
 * Horas máximas sin sincronizar antes de dar la alarma. Planner y MRP sincronizan al guardar datos o al arrancar, así que pueden
 * pasar un fin de semana largo sin novedades; el Scraper corre solo y se espera más seguido.
 */
export const UMBRALES_H = { planner: 96, mrp: 96, scraper: 30 };
export const LATENCIA_AVISO_MS = 5000;
export const REINTENTOS = 3;
export const ESPERA_REINTENTO_MS = 5000;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pide una ruta con reintentos (la API y la base pueden tardar al despertar). Nunca lanza: devuelve { estado, ms, cuerpo, error }. */
export async function pedir(url, { token = '', fetchFn = globalThis.fetch, reintentos = REINTENTOS, espera = ESPERA_REINTENTO_MS, tiempoMax = 20000 } = {}) {
  let ultimo = { estado: 0, ms: 0, cuerpo: null, error: 'sin intentos' };
  for (let i = 1; i <= reintentos; i++) {
    const t0 = Date.now();
    try {
      const r = await fetchFn(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'manual', signal: AbortSignal.timeout(tiempoMax) });
      const texto = await r.text();
      let cuerpo = null;
      try { cuerpo = JSON.parse(texto); } catch { /* no es JSON (p. ej. el HTML del panel) */ }
      ultimo = { estado: r.status, ms: Date.now() - t0, cuerpo, texto: cuerpo ? undefined : texto.slice(0, 200), error: null };
    } catch (e) {
      ultimo = { estado: 0, ms: Date.now() - t0, cuerpo: null, error: e?.name === 'TimeoutError' ? 'tiempo agotado' : 'sin conexión' };
    }
    // Un 401/403/404 no mejora reintentando; un error del servidor o de red sí puede ser pasajero.
    if (ultimo.estado >= 200 && ultimo.estado < 500) break;
    if (i < reintentos) await esperar(espera);
  }
  return ultimo;
}

/**
 * Evalúa lo observado y devuelve { problemas: [{ nivel: 'error'|'aviso', codigo, texto }], apps: [{ app, hace_horas }], latenciaMs }.
 * `obs` = { api: respuesta de /api/frescura, panel: respuesta de /, js: respuesta de /js/app.js }.
 */
export function evaluar(obs, { umbrales = UMBRALES_H } = {}) {
  const problemas = [];
  const agregar = (nivel, codigo, texto) => problemas.push({ nivel, codigo, texto });
  const { api, panel, js } = obs;

  if (panel && panel.estado !== 200) agregar('error', 'panel', `El panel no responde (HTTP ${panel.estado || panel.error}).`);
  if (js && js.estado !== 200) agregar('error', 'panel-js', `El código del panel no carga (HTTP ${js.estado || js.error}).`);

  let apps = [];
  if (!api || api.estado === 0 || api.estado >= 500) {
    agregar('error', 'api-caida', `La API no responde (${api?.estado ? `HTTP ${api.estado}` : api?.error ?? 'sin respuesta'}) tras varios intentos.`);
  } else if (api.estado === 401 || api.estado === 403) {
    agregar('error', 'api-token', 'La API rechazó el token: el secreto API_TOKEN del repositorio no coincide con el de Vercel.');
  } else if (api.estado !== 200 || !Array.isArray(api.cuerpo?.datos)) {
    agregar('error', 'api-respuesta', `La API respondió algo inesperado (HTTP ${api.estado}).`);
  } else {
    if (api.ms > LATENCIA_AVISO_MS) agregar('aviso', 'api-lenta', `La API tardó ${Math.round(api.ms / 100) / 10} s en responder.`);
    apps = api.cuerpo.datos.map((f) => ({ app: String(f.app), hace_horas: Number(f.hace_horas) }));
    for (const app of APPS) {
      const f = apps.find((x) => x.app === app);
      const limite = umbrales[app];
      if (!f) agregar('error', `sync-${app}`, `${app}: todavía no ha sincronizado nunca.`);
      else if (!Number.isFinite(f.hace_horas)) agregar('aviso', `sync-${app}`, `${app}: no se pudo leer la hora de su última sincronización.`);
      else if (f.hace_horas >= limite) agregar('error', `sync-${app}`, `${app}: lleva ${redondear(f.hace_horas)} h sin sincronizar (límite ${limite} h).`);
      else if (f.hace_horas >= limite * 0.75) agregar('aviso', `sync-${app}`, `${app}: lleva ${redondear(f.hace_horas)} h sin sincronizar (se alarma a las ${limite} h).`);
    }
  }
  return { problemas, apps, latenciaMs: api?.ms ?? null };
}

const redondear = (n) => Math.round(n * 10) / 10;

/** Texto de la incidencia (Markdown). Público: solo estado, nunca datos del negocio. */
export function incidenciaMd(res, { fecha = new Date(), enlace = '', repo = REPO_DEFECTO } = {}) {
  const errores = res.problemas.filter((p) => p.nivel === 'error');
  const lineas = [
    `**Vigilancia de V1K** · ${fecha.toISOString().replace('T', ' ').slice(0, 16)} UTC`,
    '',
    errores.length ? `Hay **${errores.length}** problema${errores.length > 1 ? 's' : ''} que atender:` : 'Hay avisos, pero nada urgente:',
    '',
    ...res.problemas.map((p) => `- ${p.nivel === 'error' ? '🔴' : '🟡'} ${p.texto}`),
    '',
    res.apps.length ? `Última sincronización: ${res.apps.map((a) => `${a.app} ${Number.isFinite(a.hace_horas) ? `${redondear(a.hace_horas)} h` : '—'}`).join(' · ')}.` : '',
    enlace ? `\nDetalle de la ejecución: ${enlace}` : '',
    `\nQué hacer en cada caso: [docs/OPERACION.md](${repo}/blob/main/docs/OPERACION.md). Esta incidencia se actualiza sola y se cierra cuando todo vuelve a la normalidad.`,
  ];
  return `${lineas.filter((l, i) => l !== '' || lineas[i - 1] !== '').join('\n')}\n`;
}

/** Umbrales desde el entorno (UMBRAL_PLANNER_H, UMBRAL_MRP_H, UMBRAL_SCRAPER_H); los valores no válidos se ignoran. */
export function umbralesDeEntorno(env = process.env) {
  const u = { ...UMBRALES_H };
  for (const app of APPS) { const v = Number(env[`UMBRAL_${app.toUpperCase()}_H`]); if (Number.isFinite(v) && v > 0) u[app] = v; }
  return u;
}

export async function vigilar({ base = BASE_DEFECTO, token, fetchFn, reintentos, espera, umbrales } = {}) {
  const opc = { fetchFn, reintentos, espera };
  const [api, panel, js] = await Promise.all([
    pedir(`${base}/api/frescura`, { ...opc, token }),
    pedir(`${base}/`, opc),
    pedir(`${base}/js/app.js`, opc),
  ]);
  return evaluar({ api, panel, js }, { umbrales });
}

// ── Ejecución directa (flujo de GitHub Actions o a mano) ─────────────────────────────────
async function principal() {
  const token = process.env.API_TOKEN ?? '';
  if (token.length < 24) {
    console.error('Falta el secreto API_TOKEN (Settings → Secrets and variables → Actions) o es demasiado corto.');
    process.exit(2);
  }
  const base = (process.env.API_BASE || BASE_DEFECTO).replace(/\/+$/, '');
  const res = await vigilar({ base, token, umbrales: umbralesDeEntorno() });
  const errores = res.problemas.filter((p) => p.nivel === 'error').length;
  const avisos = res.problemas.length - errores;

  console.log(`API ${res.latenciaMs ?? '—'} ms · ${res.apps.map((a) => `${a.app} ${a.hace_horas} h`).join(' · ') || 'sin datos de frescura'}`);
  for (const p of res.problemas) console.log(`${p.nivel === 'error' ? 'ERROR' : 'AVISO'} [${p.codigo}] ${p.texto}`);
  if (!res.problemas.length) console.log('Todo en orden.');

  const enlace = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : '';
  const repo = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}` : REPO_DEFECTO;
  fs.writeFileSync('incidencia.md', incidenciaMd(res, { enlace, repo }));
  fs.writeFileSync('vigilancia.json', `${JSON.stringify(res, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `errores=${errores}\navisos=${avisos}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  principal().catch((e) => { console.error('La vigilancia falló:', e?.message ?? e); process.exit(2); });
}
