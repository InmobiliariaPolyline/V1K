// Modo demostración: datos FICTICIOS y deterministas, con fechas relativas a hoy, y las mismas reglas de filtrado y de
// validación que la API real. No hace ninguna petición de red ni contiene información de la empresa.
import { ErrorApi, metadatos } from './api.js';
import { aIso, contiene, sumarDias } from './formato.js';

// ── Generador pseudoaleatorio con semilla (mulberry32): mismos datos en cada visita ─────
function semilla(n) {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (f) => `${f}T00:00:00.000Z`;            // las columnas `date` llegan así de la API real
const dosDec = (n) => (Math.round(n * 100) / 100).toFixed(2);

const PERSONAS = ['Ana Torres', 'Luis Ríos', 'Rosa Mendoza', 'Carlos Paredes', 'Lucía Vega'];
const PROYECTOS = [
  ['Torre Miraflores', 'atrasado', 62, -40, -6], ['Residencial Los Álamos', 'en curso', 48, -90, 70],
  ['Centro Comercial Andino', 'atrasado', 81, -150, -12], ['Edificio San Isidro Plaza', 'en curso', 27, -45, 130],
  ['Almacén Central Lurín', 'terminado', 100, -200, -20], ['Condominio Vista Verde', 'por iniciar', 0, 14, 260],
  ['Planta Industrial Callao', 'en curso', 73, -180, 38], ['Clínica Santa Rosa', 'atrasado', 35, -110, -3],
  ['Colegio Nueva Generación', 'terminado', 100, -320, -60], ['Hotel Costa Azul', 'en curso', 15, -20, 210],
];
const HITOS = ['Vaciado de losa', 'Entrega de planos', 'Inspección municipal', 'Recepción de acero', 'Pruebas de presión', 'Acabados del piso 3', 'Entrega de obra', 'Permiso de ocupación', 'Instalación de ascensores', 'Pruebas eléctricas', 'Cierre de estructura', 'Revisión de seguridad'];

const MATERIALES = [
  ['Acero y hierro', 'kg', [['Varilla corrugada 3/8"', 4200], ['Perfil laminado IPN', 1650], ['Alambre negro N.º 16', 900], ['Plancha de acero A36', 1200], ['Malla electrosoldada', 700]]],
  ['Cemento y concreto', 'bolsa', [['Cemento Portland tipo I', 600], ['Concreto premezclado f\'c 210', 300], ['Mortero listo', 250], ['Aditivo plastificante', 80]]],
  ['Agregados', 'm³', [['Arena gruesa', 220], ['Piedra chancada 1/2"', 180], ['Hormigón', 150], ['Afirmado', 120]]],
  ['Albañilería', 'unidad', [['Ladrillo King Kong 18 huecos', 9000], ['Bloque de concreto 15 cm', 4000], ['Ladrillo pastelero', 3000], ['Teja andina', 1500]]],
  ['Acabados', 'unidad', [['Cerámico piso 60×60', 800], ['Porcelanato 80×80', 520], ['Pintura látex (galón)', 240], ['Pegamento cerámico', 400], ['Fragua', 300]]],
  ['Electricidad', 'unidad', [['Cable THW 2.5 mm', 1400], ['Interruptor simple', 300], ['Tablero eléctrico', 40], ['Tubo conduit 3/4"', 600]]],
  ['Sanitarias', 'unidad', [['Tubo PVC 4"', 220], ['Inodoro one piece', 45], ['Lavatorio con pedestal', 60], ['Válvula de compuerta', 90]]],
  ['Madera y tableros', 'unidad', [['Tablero MDF 18 mm', 140], ['Madera tornillo 2×4', 400], ['Triplay fenólico', 120]]],
  ['Impermeabilizantes', 'unidad', [['Membrana asfáltica', 90], ['Sellador acrílico', 160], ['Imprimante', 110]]],
  ['Seguridad', 'unidad', [['Casco de seguridad', 100], ['Arnés de cuerpo completo', 40], ['Guantes de cuero', 300], ['Lentes de protección', 200]]],
  ['Herramientas', 'unidad', [['Taladro percutor', 12], ['Amoladora 7"', 10], ['Nivel láser', 6]]],
  ['Prefabricados de concreto', 'unidad', [['Vigueta pretensada', 500], ['Bovedilla cerámica', 1600], ['Poste de concreto', 60]]],
];
const PROVEEDORES = ['Aceros del Sur S.A.C.', 'Cementos Andinos', 'Ferretería Industrial Lima', 'Distribuidora Eléctrica Perú', 'Maderas del Oriente', 'Sanitarios Premium', 'Agregados Chilca'];

const DISTRITOS = [['Miraflores', 1.55], ['San Isidro', 1.7], ['Santiago de Surco', 1.15], ['La Molina', 1.1], ['Barranco', 1.35], ['San Borja', 1.2], ['Jesús María', 0.85], ['Lince', 0.8], ['Magdalena', 0.9], ['Cayma', 0.7], ['Yanahuara', 0.95], ['Cerro Colorado', 0.55]];
const INMUEBLES = [['Departamento', 85], ['Casa', 190], ['Terreno', 260], ['Oficina', 70], ['Local comercial', 110]];
const PORTALES = ['infocasas', 'urbania', 'adondevivir', 'properati'];
const TC = 3.7; // tipo de cambio ficticio

/** Construye todas las tablas de ejemplo. `ahora` permite fijar el día en las pruebas. */
export function construirDemo(ahora = new Date()) {
  const hoy = aIso(ahora);
  const r = semilla(20261113);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const ts = ahora.getTime();
  const instante = (horasAtras) => new Date(ts - horasAtras * 3_600_000).toISOString();

  // Proyectos y tareas
  const proyectos = PROYECTOS.map(([nombre, estado, avance, ini, fin], i) => {
    const inicio = sumarDias(hoy, ini), finF = sumarDias(hoy, fin);
    const total = 6 + Math.floor(r() * 18);
    const atras = estado === 'atrasado' ? 2 + Math.floor(r() * 6) : estado === 'en curso' ? Math.floor(r() * 3) : 0;
    return { _i: i, proyecto_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, nombre, responsable: PERSONAS[i % PERSONAS.length], estado, avance_pct: dosDec(avance), inicio: iso(inicio), fin: iso(finF), tareas_total: total, tareas_atrasadas: atras, proximo_hito: null, proximo_hito_fecha: null, actualizado_en: instante(1.6) };
  });

  // Hitos (algunos pasados, la mayoría próximos)
  const hitos = [];
  for (let i = 0; i < 18; i++) {
    const p = proyectos[i % proyectos.length];
    if (p.estado === 'terminado') continue;
    const dias = i < 3 ? -(2 + i * 3) : -4 + i * 4 + Math.floor(r() * 3);
    hitos.push({ hito_id: `h${i}`, proyecto_id: p.proyecto_id, proyecto: p.nombre, descripcion: HITOS[i % HITOS.length], fecha: iso(sumarDias(hoy, dias)) });
  }
  for (const p of proyectos) {
    const prox = hitos.filter((x) => x.proyecto_id === p.proyecto_id && x.fecha.slice(0, 10) >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    if (prox) { p.proximo_hito = prox.descripcion; p.proximo_hito_fecha = prox.fecha; }
  }

  // Materiales
  const materiales = [];
  let k = 0;
  for (const [categoria, unidad, lista] of MATERIALES) {
    for (const [nombre, minimo] of lista) {
      const bajo = r() < 0.62;
      const cantidad = bajo ? Math.floor(minimo * r() * 0.8) : Math.floor(minimo * (1.1 + r() * 2));
      materiales.push({ material_id: `m${k++}`, categoria, material: nombre, unidad, cantidad, minimo });
    }
  }
  const conFaltante = materiales.map((m) => ({ ...m, faltante: Math.max(m.minimo - m.cantidad, 0), stock_bajo: m.cantidad <= m.minimo }));

  // Pedidos
  const pedidos = Array.from({ length: 9 }, (_, i) => {
    const estado = pick(['pendiente', 'enviada', 'enviada', 'parcial']);
    const lineas = 1 + Math.floor(r() * 6);
    const pedida = 40 + Math.floor(r() * 900);
    const dias = i === 0 ? -4 : i === 1 ? -1 : 2 + Math.floor(r() * 24);
    return {
      pedido_id: `OC-${String(1040 + i).padStart(4, '0')}`, proveedor: PROVEEDORES[i % PROVEEDORES.length], obra: proyectos[(i * 3) % proyectos.length].nombre,
      estado, llegada_estimada: i % 4 === 3 ? null : iso(sumarDias(hoy, dias)), lineas,
      cantidad_pedida: dosDec(pedida), cantidad_recibida: dosDec(estado === 'parcial' ? pedida * 0.4 : 0), creado_en: instante(24 * (3 + i * 2)),
    };
  });

  // Propiedades
  const propiedades = Array.from({ length: 96 }, (_, i) => {
    const [distrito, factor] = pick(DISTRITOS);
    const [inmueble, areaBase] = pick(INMUEBLES);
    const operacion = r() < 0.64 ? 'VENTA' : 'ALQUILER';
    const area = Math.round(areaBase * (0.55 + r() * 1.1));
    const dorms = inmueble === 'Terreno' || inmueble === 'Local comercial' || inmueble === 'Oficina' ? null : 1 + Math.floor(r() * 4);
    const usdM2 = operacion === 'VENTA' ? 1500 * factor * (0.75 + r() * 0.6) : 9 * factor * (0.75 + r() * 0.6);
    let usd = Math.round(usdM2 * area / 100) * 100;
    if (operacion === 'ALQUILER') usd = Math.max(250, Math.round(usd / 10) * 10);
    const sinPrecio = r() < 0.05;
    const moneda = r() < 0.4 ? 'PEN' : 'USD';
    const portal = pick(PORTALES);
    return {
      propiedad_id: `${portal}:${190000000 + i * 137}`, portal, operacion, inmueble,
      titulo: `${inmueble} ${operacion === 'VENTA' ? 'en venta' : 'en alquiler'} en ${distrito}${dorms ? ` · ${dorms} dorm.` : ''}`,
      precio: sinPrecio ? '0.00' : dosDec(moneda === 'USD' ? usd : usd * TC), moneda, precio_usd: sinPrecio ? '0.00' : dosDec(usd),
      distrito, dormitorios: dorms ? String(dorms) : null, banios: dorms ? String(Math.max(1, dorms - Math.floor(r() * 2))) : null, area: `${area} m2`,
      url: `https://example.com/aviso/${190000000 + i * 137}`, encontrada_en: instante(0.2 + i * 0.38),
    };
  });

  // Un par de alquileres de oficina publicados «por m²» (pasa en los portales reales): el panel debe marcarlos como precio dudoso
  propiedades.filter((p) => p.operacion === 'ALQUILER').slice(0, 2).forEach((p, k) => {
    const porM2 = k === 0 ? 41 : 52;
    Object.assign(p, { inmueble: 'Oficina', moneda: 'PEN', precio: dosDec(porM2), precio_usd: dosDec(porM2 / TC), area: `${k === 0 ? 92 : 170} m2`, dormitorios: null, banios: null, titulo: `Oficina en alquiler en ${p.distrito} · ${k === 0 ? 92 : 170} m2` });
  });

  // Resúmenes derivados
  const factorCat = 32;
  const resumenPortal = [];
  for (const portal of PORTALES) for (const operacion of ['VENTA', 'ALQUILER']) {
    const n = propiedades.filter((p) => p.portal === portal && p.operacion === operacion).length;
    resumenPortal.push({ portal, operacion, total: n * factorCat + Math.floor(r() * 40), ultima_vista: instante(0.5 + r() * 20) });
  }
  const frescura = [['mrp', 1.3], ['planner', 1.6], ['scraper', 0.5]].map(([app, h]) => ({ app, ultima_sync: instante(h), hace_horas: h }));

  return { hoy, ahora: ts, proyectos, hitos, materiales: conFaltante, pedidos, propiedades, resumenPortal, frescura };
}

// ── Reglas de validación y de filtrado idénticas a las de la API ───────────────────────
function validar(meta, params) {
  const vista = meta.vistas.find((v) => v.nombre === meta.__actual);
  const limpio = {};
  for (const f of vista.filtros) {
    const crudo = params[f.nombre];
    if (typeof crudo !== 'string' || crudo.trim() === '') continue;
    const v = crudo.trim();
    if (f.tipo === 'enum') {
      const ok = f.valores.find((x) => x.toLowerCase() === v.toLowerCase());
      if (!ok) throw new ErrorApi(400, `Parámetro «${f.nombre}» no válido: valores permitidos: ${f.valores.join(', ')}`);
      limpio[f.nombre] = ok;
    } else if (f.tipo === 'numero') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < f.min || n > f.max) throw new ErrorApi(400, `Parámetro «${f.nombre}» no válido: debe ser un número entre ${f.min} y ${f.max}`);
      limpio[f.nombre] = n;
    } else if (f.tipo === 'fecha') {
      const d = new Date(`${v}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new ErrorApi(400, `Parámetro «${f.nombre}» no válido: use una fecha AAAA-MM-DD válida`);
      limpio[f.nombre] = v;
    } else limpio[f.nombre] = v.slice(0, 60);
  }
  let limite = vista.limite;
  if (vista.limiteMax && typeof params.limite === 'string' && params.limite.trim() !== '') {
    const n = Number(params.limite.trim());
    if (!Number.isInteger(n) || n < 1 || n > vista.limiteMax) throw new ErrorApi(400, `Parámetro «limite» no válido: debe ser un entero entre 1 y ${vista.limiteMax}`);
    limite = n;
  }
  return { f: limpio, limite };
}

const porFecha = (a, b) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b));
const fecha10 = (v) => (typeof v === 'string' ? v.slice(0, 10) : null);

let tablas = null;
function datosDe(ahora) {
  const dia = aIso(ahora);
  if (!tablas || tablas.hoy !== dia) tablas = construirDemo(ahora);
  return tablas;
}

const medianaDe = (v) => { const o = [...v].sort((a, b) => a - b); const m = Math.floor(o.length / 2); return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2; };

/** Agrega las propiedades por distrito y operación, como la vista de la API. */
function distritos(props) {
  const g = new Map();
  for (const p of props) {
    if (!p.distrito) continue;
    const k = `${p.distrito}|${p.operacion}`;
    const x = g.get(k) ?? { distrito: p.distrito, operacion: p.operacion, avisos: 0, precios: [] };
    x.avisos++;
    if (Number(p.precio_usd) > 0) x.precios.push(Number(p.precio_usd));
    g.set(k, x);
  }
  return [...g.values()].map((x) => ({
    distrito: x.distrito, operacion: x.operacion, avisos: x.avisos,
    precio_mediano_usd: x.precios.length ? Math.round(medianaDe(x.precios)) : null,
    precio_min_usd: x.precios.length ? Math.min(...x.precios) : null,
    precio_max_usd: x.precios.length ? Math.max(...x.precios) : null,
  })).sort((a, b) => b.avisos - a.avisos || a.distrito.localeCompare(b.distrito)).slice(0, 40);
}

/**
 * consultar('propiedades', { operacion: 'VENTA' }) -> { vista, generado_en, total, datos }
 * `meta` (el contenido de vistas.json) se carga solo; las pruebas lo pasan directamente.
 */
export async function consultar(vista, params = {}, meta = null, ahora = new Date()) {
  const m = { ...(meta ?? await metadatos()), __actual: vista };
  if (!m.vistas.some((v) => v.nombre === vista)) throw new ErrorApi(404, 'Vista desconocida');
  await new Promise((res) => setTimeout(res, meta ? 0 : 60 + Math.random() * 120)); // latencia simulada solo en el navegador
  const { f, limite } = validar(m, params);
  const T = datosDe(ahora);
  let datos;

  switch (vista) {
    case 'proyectos': {
      datos = T.proyectos.filter((p) => (!f.estado || p.estado === f.estado) && (!f.q || contiene(p.nombre, f.q.replace(/%/g, '')) || contiene(p.responsable, f.q.replace(/%/g, ''))))
        .map(({ _i, ...p }) => p)
        .sort((a, b) => (b.estado === 'atrasado') - (a.estado === 'atrasado') || a.nombre.localeCompare(b.nombre, 'es'));
      break;
    }
    case 'hitos': {
      datos = T.hitos.filter((h) => (!f.proyecto || contiene(h.proyecto, f.proyecto.replace(/%/g, ''))) && (!f.desde || fecha10(h.fecha) >= f.desde) && (!f.hasta || fecha10(h.fecha) <= f.hasta))
        .map((h) => ({ fecha: h.fecha, descripcion: h.descripcion, proyecto: h.proyecto }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
      break;
    }
    case 'stock-bajo': {
      datos = T.materiales.filter((x) => x.stock_bajo && (!f.categoria || contiene(x.categoria, f.categoria.replace(/%/g, ''))) && (!f.q || contiene(x.material, f.q.replace(/%/g, ''))))
        .map((x) => ({ material: x.material, categoria: x.categoria, cantidad: dosDec(x.cantidad), unidad: x.unidad, minimo: dosDec(x.minimo), faltante: dosDec(x.faltante) }))
        .sort((a, b) => Number(b.faltante) - Number(a.faltante) || a.material.localeCompare(b.material, 'es'));
      break;
    }
    case 'pedidos': {
      datos = T.pedidos.filter((p) => (!f.estado || p.estado === f.estado) && (!f.q || [p.proveedor, p.obra, p.pedido_id].some((t) => contiene(t, f.q.replace(/%/g, '')))))
        .sort((a, b) => porFecha(a.llegada_estimada, b.llegada_estimada) || a.pedido_id.localeCompare(b.pedido_id));
      break;
    }
    case 'propiedades': {
      datos = T.propiedades.filter((p) => {
        const q = f.q?.replace(/%/g, '');
        return (!q || [p.titulo, p.distrito, p.inmueble].some((t) => contiene(t, q)))
          && (!f.operacion || p.operacion === f.operacion)
          && (!f.inmueble || contiene(p.inmueble, f.inmueble.replace(/%/g, '')))
          && (!f.distrito || contiene(p.distrito, f.distrito.replace(/%/g, '')))
          && (!f.portal || p.portal === f.portal)
          && (f.precio_min_usd === undefined || Number(p.precio_usd) >= f.precio_min_usd)
          && (f.precio_max_usd === undefined || (Number(p.precio_usd) > 0 && Number(p.precio_usd) <= f.precio_max_usd));
      }).sort((a, b) => b.encontrada_en.localeCompare(a.encontrada_en));
      break;
    }
    case 'propiedades-resumen': {
      datos = T.resumenPortal.filter((x) => (!f.portal || x.portal === f.portal) && (!f.operacion || x.operacion === f.operacion))
        .sort((a, b) => a.portal.localeCompare(b.portal) || a.operacion.localeCompare(b.operacion));
      break;
    }
    case 'frescura': datos = [...T.frescura].sort((a, b) => a.app.localeCompare(b.app)); break;
    case 'stock-categorias': {
      const g = new Map();
      for (const x of T.materiales) {
        const c = g.get(x.categoria) ?? { categoria: x.categoria, materiales: 0, en_stock_bajo: 0, sin_existencias: 0, faltante_total: 0 };
        c.materiales++; if (x.stock_bajo) c.en_stock_bajo++; if (x.cantidad === 0) c.sin_existencias++; c.faltante_total += x.faltante;
        g.set(x.categoria, c);
      }
      datos = [...g.values()].sort((a, b) => b.faltante_total - a.faltante_total || a.categoria.localeCompare(b.categoria, 'es'));
      break;
    }
    case 'propiedades-distritos': datos = distritos(T.propiedades); break;
    case 'resumen-general': {
      const pr = T.proyectos;
      const bajos = T.materiales.filter((x) => x.stock_bajo).sort((a, b) => b.faltante - a.faltante);
      datos = [{
        proyectos: { total: pr.length, atrasados: pr.filter((p) => p.estado === 'atrasado').length, en_curso: pr.filter((p) => p.estado === 'en curso').length, por_iniciar: pr.filter((p) => p.estado === 'por iniciar').length, terminados: pr.filter((p) => p.estado === 'terminado').length, tareas_atrasadas: pr.reduce((a, p) => a + p.tareas_atrasadas, 0) },
        proyectos_atrasados: pr.filter((p) => p.estado === 'atrasado').sort((a, b) => a.fin.localeCompare(b.fin)).slice(0, 5).map((p) => ({ nombre: p.nombre, responsable: p.responsable, avance_pct: Number(p.avance_pct), fin: fecha10(p.fin), tareas_atrasadas: p.tareas_atrasadas })),
        proximos_hitos: T.hitos.filter((h) => fecha10(h.fecha) >= T.hoy).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 5).map((h) => ({ fecha: fecha10(h.fecha), descripcion: h.descripcion, proyecto: h.proyecto })),
        stock: { materiales_con_minimo: T.materiales.length, en_stock_bajo: bajos.length, sin_existencias: T.materiales.filter((x) => x.cantidad === 0).length },
        mayor_faltante: bajos.slice(0, 5).map((x) => ({ material: x.material, categoria: x.categoria, unidad: x.unidad, cantidad: x.cantidad, minimo: x.minimo, faltante: x.faltante })),
        pedidos: { abiertos: T.pedidos.length },
        proximos_pedidos: [...T.pedidos].sort((a, b) => porFecha(a.llegada_estimada, b.llegada_estimada) || a.pedido_id.localeCompare(b.pedido_id)).slice(0, 5).map((p) => ({ pedido_id: p.pedido_id, proveedor: p.proveedor, obra: p.obra, estado: p.estado, llegada_estimada: fecha10(p.llegada_estimada) })),
        propiedades: { total_catalogo: T.resumenPortal.reduce((a, x) => a + x.total, 0), copiadas: Math.min(200, T.propiedades.length) },
        propiedades_por_portal: [...T.resumenPortal].sort((a, b) => b.total - a.total || a.portal.localeCompare(b.portal)).map((x) => ({ portal: x.portal, operacion: x.operacion, total: x.total })),
        frescura: [...T.frescura].sort((a, b) => a.app.localeCompare(b.app)).map((x) => ({ app: x.app, ultima_sync: x.ultima_sync, hace_horas: x.hace_horas })),
      }];
      return { vista, generado_en: new Date(T.ahora).toISOString(), total: 1, datos };
    }
    default: throw new ErrorApi(404, 'Vista desconocida');
  }

  const vistaMeta = m.vistas.find((v) => v.nombre === vista);
  if (vistaMeta.limite) datos = datos.slice(0, limite);
  return { vista, generado_en: new Date(T.ahora).toISOString(), total: datos.length, datos };
}
