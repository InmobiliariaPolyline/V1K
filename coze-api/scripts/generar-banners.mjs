// Genera las bienvenidas animadas de los bots de Telegram (MP4) a partir de scripts/banner/banner.html.
//   node scripts/generar-banners.mjs            -> public/bot/bienvenida.mp4, privado.mp4 y resumen.mp4
//   node scripts/generar-banners.mjs privado    -> solo esa variante
//
// Herramienta de DESARROLLO (no corre en Vercel ni en el CI): usa Chrome o Edge sin pantalla para dibujar cada fotograma (una captura
// por fotograma, varias a la vez) y ffmpeg para unirlos. Los MP4 resultantes se versionan en public/bot/ y Vercel los sirve; Telegram
// los muestra como un GIF (sendAnimation). Variables opcionales: CHROME (ruta del navegador) y FFMPEG (ruta de ffmpeg).
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const VARIANTES = ['bienvenida', 'privado', 'resumen', 'revocado'];
export const PERIODO = 4.8;
export const FPS = 15;
const aqui = path.dirname(fileURLToPath(import.meta.url));
const plantilla = path.join(aqui, 'banner', 'banner.html');
const salida = path.join(aqui, '..', 'public', 'bot');

const NAVEGADORES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];

/** Segundos de cada fotograma del ciclo: 0, 1/15, 2/15… */
export const tiempos = () => Array.from({ length: Math.round(PERIODO * FPS) }, (_, i) => i / FPS);

const captura = (navegador, url, png, perfil) => new Promise((resolve, reject) => {
  execFile(navegador, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${perfil}`, '--window-size=1280,640', `--screenshot=${png}`, url], { stdio: 'ignore', timeout: 60000 }, (e) => (fs.existsSync(png) ? resolve() : reject(e ?? new Error('sin captura'))));
});

export async function generar(variante, { concurrencia = 4 } = {}) {
  const navegador = process.env.CHROME || NAVEGADORES.find((p) => fs.existsSync(p));
  if (!navegador) throw new Error('No encontré Chrome ni Edge: define la variable CHROME con su ruta.');
  const ffmpeg = process.env.FFMPEG || 'ffmpeg';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `banner-${variante}-`));
  try {
    const trabajos = tiempos().map((t, i) => ({ i, t }));
    const hilo = async (n) => {
      const perfil = path.join(tmp, `perfil${n}`);
      for (let j = n; j < trabajos.length; j += concurrencia) {
        const { i, t } = trabajos[j];
        await captura(navegador, `${pathToFileURL(plantilla).href}#v=${variante}&t=${t.toFixed(4)}`, path.join(tmp, `f${String(i).padStart(3, '0')}.png`), perfil);
      }
    };
    await Promise.all(Array.from({ length: concurrencia }, (_, n) => hilo(n)));
    fs.mkdirSync(salida, { recursive: true });
    const destino = path.join(salida, `${variante}.mp4`);
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, 'f%03d.png'), '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-crf', '26', '-preset', 'slow', '-movflags', '+faststart', '-an', destino], { stdio: 'inherit' });
    return { destino, fotogramas: trabajos.length, bytes: fs.statSync(destino).size };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pedidas = process.argv.slice(2).filter((a) => VARIANTES.includes(a));
  for (const v of pedidas.length ? pedidas : VARIANTES) {
    const r = await generar(v);
    console.log(`${v}: ${r.fotogramas} fotogramas, ${(r.bytes / 1024).toFixed(0)} KB -> ${path.relative(process.cwd(), r.destino)}`);
  }
}
