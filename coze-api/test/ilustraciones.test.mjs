// Pruebas de las ilustraciones SVG del README (docs/assets): bien formadas, sin código ni recursos externos, animaciones
// coherentes, respetan «reducir movimiento» y sus cifras coinciden con lo que dice el repositorio.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VISTAS } from '../lib/vistas.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(raiz, 'docs', 'assets');
const readme = fs.readFileSync(path.join(raiz, 'README.md'), 'utf8');
const archivos = fs.readdirSync(dir, { recursive: true }).map((f) => f.replaceAll('\\', '/')).filter((f) => f.endsWith('.svg')).sort();

let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const igual = (a, b, m) => { n++; assert.deepEqual(a, b, m); };

ok(archivos.length >= 22, `hay ${archivos.length} ilustraciones`);

for (const f of archivos) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  const donde = `docs/assets/${f}`;

  // Bien formado: etiquetas balanceadas
  const pila = [];
  for (const m of s.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    if (m[4] === '/') continue;
    if (m[1] === '/') igual(pila.pop(), m[2], `${donde}: cierre inesperado </${m[2]}>`); else pila.push(m[2]);
  }
  igual(pila, [], `${donde}: etiquetas sin cerrar`);
  ok(/^<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(s.trim()) && /<\/svg>\s*$/.test(s), `${donde}: raíz <svg> con xmlns`);
  ok(/width="[\d.]+"/.test(s) && /height="[\d.]+"/.test(s), `${donde}: tamaño propio`);
  ok(/<title\b/.test(s) || /role="img"[^>]*aria-label="[^"]{3,}"/.test(s), `${donde}: tiene <title> o aria-label (accesibilidad)`);
  if (!f.startsWith('badges/')) ok(/viewBox="0 0 [\d.]+ [\d.]+"/.test(s), `${donde}: viewBox`);
  if (Number(/<svg[^>]*\swidth="([\d.]+)"/.exec(s)?.[1]) >= 1000) ok(/<desc\b/.test(s), `${donde}: las ilustraciones grandes llevan <desc> que explica el dibujo`);

  // Seguridad: GitHub las usa como imagen, pero igualmente no deben llevar código ni cargar nada de fuera
  ok(!/<script|<foreignObject|<iframe|<image\b|javascript:|\son[a-z]+\s*=/i.test(s), `${donde}: sin scripts, imágenes ni manejadores`);
  ok(!/@import|url\(\s*['"]?https?:|(?:href|src)\s*=\s*['"]https?:/i.test(s), `${donde}: sin recursos externos`);
  ok(!/<\?xml-stylesheet/.test(s), `${donde}: sin hojas de estilo externas`);

  // Animaciones
  const animada = /<animate|@keyframes/.test(s);
  if (animada) {
    ok(/prefers-reduced-motion:\s*reduce/.test(s), `${donde}: respeta «reducir movimiento»`);
    for (const m of s.matchAll(/<animate(?:Motion|Transform)?\b[^>]*>/g)) {
      const tag = m[0];
      const get = (a) => new RegExp(`\\s${a}="([^"]*)"`).exec(tag)?.[1];
      ok(get('dur') && /^[\d.]+s$/.test(get('dur')), `${donde}: dur válido en ${tag.slice(0, 60)}`);
      const kt = get('keyTimes')?.split(';').map(Number);
      if (kt) {
        ok(kt.every((x, i) => Number.isFinite(x) && x >= 0 && x <= 1 && (i === 0 || x >= kt[i - 1])), `${donde}: keyTimes crecientes en [0,1] (${get('keyTimes')})`);
        ok(kt[0] === 0 && kt[kt.length - 1] === 1, `${donde}: keyTimes empieza en 0 y termina en 1`);
        for (const otro of ['values', 'keyPoints']) { const lista = get(otro)?.split(';'); if (lista) igual(lista.length, kt.length, `${donde}: ${otro} y keyTimes con la misma cantidad (${get('keyTimes')})`); }
      }
    }
    // Todo @keyframes usado existe y toda animación CSS nombra un @keyframes definido
    const definidos = new Set([...s.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
    for (const m of s.matchAll(/animation:\s*([\w-]+)\s/g)) ok(m[1] === 'none' || definidos.has(m[1]), `${donde}: @keyframes «${m[1]}» sin definir`);
  }
}
// Los elementos animados con SMIL que se ocultan con «reducir movimiento» llevan la clase .anim, que el CSS oculta
for (const f of archivos) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  if (/<animateMotion/.test(s)) ok(/\.anim\s*\{\s*display:\s*none/.test(s) && /class="anim"/.test(s), `docs/assets/${f}: los puntos que viajan se ocultan con «reducir movimiento»`);
}

// El README usa cada ilustración y todas las que enlaza existen
const usadas = [...readme.matchAll(/docs\/assets\/([\w./-]+\.svg)/g)].map((m) => m[1]);
for (const u of usadas) ok(archivos.includes(u), `el README enlaza docs/assets/${u}, que no existe`);
for (const f of archivos) ok(usadas.includes(f), `docs/assets/${f} no aparece en el README`);
for (const m of readme.matchAll(/<img src="docs\/assets\/[^"]+" alt="([^"]*)"/g)) ok(m[1].trim().length >= 8, `texto alternativo muy corto: «${m[1]}»`);

// Las cifras de las ilustraciones coinciden con la tabla de pruebas del README
const fila = (letra) => new RegExp(`\\*\\*${letra} · [^|]+\\|[^|]+\\|\\s*([^|]+?)\\s*\\|`).exec(readme)?.[1];
const cifras = ['A', 'B', 'C', 'D'].map((l) => (fila(l) ?? '').match(/\d+/g)?.map(Number));
ok(cifras.every(Boolean), 'la tabla de pruebas del README tiene las baterías A-D');
const [A, B, C, D] = [cifras[0][0], cifras[1][0], cifras[2].reduce((a, b) => a + b, 0), cifras[3][0]];
const total = A + B + C + D;
for (const [f, patron] of [['badges/pruebas.svg', new RegExp(`${total} OK`)], ['card-pruebas.svg', new RegExp(`${total} comprobaciones`)], ['pruebas-baterias.svg', new RegExp(`>${total}</text>`)]]) {
  ok(patron.test(fs.readFileSync(path.join(dir, f), 'utf8')), `docs/assets/${f} debería decir ${total} (A ${A} + B ${B} + C ${C} + D ${D})`);
}
ok(new RegExp(`${total} OK`).test(readme) && new RegExp(`${total} comprobaciones`).test(readme), `el texto alternativo del README dice ${total}`);
const pb = fs.readFileSync(path.join(dir, 'pruebas-baterias.svg'), 'utf8');
for (const x of [A, B, C, D]) ok(pb.includes(`${x} / ${x}`), `pruebas-baterias.svg muestra ${x} / ${x}`);

// La arquitectura muestra las herramientas reales de la API
const herramientas = Object.values(VISTAS).filter((v) => !v.panel);
const arq = fs.readFileSync(path.join(dir, 'arquitectura.svg'), 'utf8');
ok(arq.includes(`${herramientas.length} herramientas`), `arquitectura.svg dice ${herramientas.length} herramientas`);
for (const nombre of Object.entries(VISTAS).filter(([, v]) => !v.panel).map(([k]) => k)) ok(arq.includes(`/api/${nombre}`), `arquitectura.svg lista /api/${nombre}`);
ok(!arq.includes('/api/stock-categorias') && !arq.includes('/api/propiedades-distritos'), 'las vistas solo del panel no aparecen en la arquitectura del agente');
ok(readme.includes(`${herramientas.length} consultas fijas`), `el README dice ${herramientas.length} consultas fijas`);

console.log(`OK: ilustraciones — ${archivos.length} SVG revisados (${n} comprobaciones: formato, seguridad, animaciones, README y cifras)`);
