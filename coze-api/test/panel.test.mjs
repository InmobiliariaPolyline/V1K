// Pruebas de las funciones de formato del panel (public/formato.js) y comprobaciones estáticas de la página.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dinero, estadoFrescura, fechaCorta, fechaHora, haceHoras, numero, porcentaje, urlSegura } from '../public/formato.js';

// Fechas de calendario: sin conversión de zona horaria
assert.equal(fechaCorta('2026-11-07'), '07/11/2026');
assert.equal(fechaCorta('2026-11-07T00:00:00.000Z'), '07/11/2026');
assert.equal(fechaCorta('2026-12-31T23:59:59Z'), '31/12/2026');
for (const malo of [null, undefined, '', 'ayer', 12345, {}]) assert.equal(fechaCorta(malo), '—', String(malo));
assert.match(fechaHora('2026-11-13T18:37:56.393Z'), /^\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/);
assert.equal(fechaHora('no es fecha'), '—');

// «Hace X»
assert.equal(haceHoras(0), 'hace 1 min');
assert.equal(haceHoras(0.2), 'hace 12 min');
assert.equal(haceHoras(0.99), 'hace 59 min');
assert.equal(haceHoras(1.5), 'hace 1.5 h');
assert.equal(haceHoras(1), 'hace 1 h');
assert.equal(haceHoras(23.9), 'hace 23.9 h');
assert.equal(haceHoras(24), 'hace 1 día');
assert.equal(haceHoras(100), 'hace 4 días');
for (const malo of [-1, NaN, Infinity, '3', null, undefined]) assert.equal(haceHoras(malo), '—', String(malo));

// Semáforo de frescura
assert.equal(estadoFrescura(0.1), 'ok');
assert.equal(estadoFrescura(23.9), 'ok');
assert.equal(estadoFrescura(24), 'aviso');
assert.equal(estadoFrescura(71.9), 'aviso');
assert.equal(estadoFrescura(72), 'viejo');
assert.equal(estadoFrescura(undefined), 'desconocido');
assert.equal(estadoFrescura(NaN), 'desconocido');

// Números y dinero (es-PE: coma para miles, punto para decimales)
assert.equal(numero(1234567.5), '1,234,567.5');
assert.equal(numero('4185.00'), '4,185');
assert.equal(numero(null), '0'.replace('0', numero(0)), 'null se interpreta como 0');
assert.equal(numero('abc'), '—');
assert.equal(dinero('268000.00', 'USD'), 'US$ 268,000');
assert.equal(dinero('3800000', 'PEN'), 'S/ 3,800,000');
assert.equal(dinero('1500', 'EUR'), 'EUR 1,500');
assert.equal(dinero('0', 'USD'), 'Sin precio');
assert.equal(dinero(null, 'USD'), 'Sin precio');
assert.equal(dinero('-5', 'USD'), 'Sin precio');

// Solo enlaces http(s): nada de javascript:, data: ni esquemas raros
assert.equal(urlSegura('https://www.infocasas.com.pe/aviso/1'), 'https://www.infocasas.com.pe/aviso/1');
assert.equal(urlSegura('http://x.com/a'), 'http://x.com/a');
for (const malo of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///c:/x', '//x.com', 'x.com', '', null, undefined, 42]) {
  assert.equal(urlSegura(malo), null, String(malo));
}

// Barras de progreso acotadas
assert.equal(porcentaje(40), 40);
assert.equal(porcentaje(-5), 0);
assert.equal(porcentaje(150), 100);
assert.equal(porcentaje('abc'), 0);
assert.equal(porcentaje(null), 0, 'null => 0');

// ── Comprobaciones estáticas de la página ───────────────────────────────────────────
const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(pub, 'panel.js'), 'utf8');

// CSP: sin scripts ni estilos en línea, ni manejadores onclick=
assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'ningún <script> en línea');
assert.ok(!/<style[\s>]/i.test(html), 'ningún <style> en línea');
assert.ok(!/\sstyle\s*=/i.test(html), 'ningún atributo style= en el HTML');
assert.ok(!/\son[a-z]+\s*=/i.test(html), 'ningún manejador on…= en el HTML');
assert.ok(!/(https?:)?\/\/(cdn|unpkg|fonts)\./i.test(html + js), 'sin recursos externos');

// XSS: el panel nunca inserta datos de la API como HTML
const codigo = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // sin comentarios de línea completa
assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(codigo), 'panel.js no usa APIs que interpreten HTML');
assert.ok(!/setAttribute\(\s*['"]style/.test(codigo), 'no se usa setAttribute("style") (bloqueado por la CSP)');

// Todo id que usa el JS existe en el HTML
const ids = [...js.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]);
for (const id of new Set(ids)) assert.ok(html.includes(`id="${id}"`), `el HTML no tiene id="${id}"`);

// Los archivos que referencia la página existen
for (const f of ['panel.css', 'panel.js', 'favicon.svg', 'hero.svg', 'formato.js']) assert.ok(fs.existsSync(path.join(pub, f)), f);

console.log('OK: formato del panel y comprobaciones de seguridad de la página');
