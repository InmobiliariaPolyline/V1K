// Servidor local del panel (solo desarrollo): sirve `public/` con las mismas cabeceras de seguridad que Vercel
// (vercel.json), para comprobar que la CSP no bloquea nada. No sirve /api: en local se usa el modo demostración.
//   npm run panel          -> http://localhost:4173
//   RETARDO=400 npm run panel  -> cada archivo tarda 400 ms más (para ver la pantalla de carga con una conexión lenta)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publico = path.join(raiz, 'public');
const puerto = Number(process.env.PORT ?? 4173);
const retardo = Math.max(0, Number(process.env.RETARDO ?? 0) || 0);
const vercel = JSON.parse(fs.readFileSync(path.join(raiz, 'vercel.json'), 'utf8'));
const cabeceras = Object.fromEntries((vercel.headers ?? []).flatMap((r) => r.headers.map((x) => [x.key, x.value])));

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let ruta = decodeURIComponent(url.pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = path.normalize(path.join(publico, ruta));
  if (!archivo.startsWith(publico + path.sep) || !fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
    return;
  }
  setTimeout(() => {
    res.writeHead(200, { ...cabeceras, 'Content-Type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(archivo).pipe(res);
  }, retardo);
}).listen(puerto, '127.0.0.1', () => console.log(`Panel en http://localhost:${puerto} (CSP de vercel.json activa)`));
