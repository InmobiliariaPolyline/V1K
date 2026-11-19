// Convierte un SVG en una imagen PNG (para enviar gráficos por Telegram, que no muestra SVG). Usa resvg (un motor de SVG sin navegador) y la fuente
// Inter, que va dentro del proyecto (assets/fonts/) para que el resultado sea el mismo en cualquier equipo y en Vercel.
// Los SVG de los gráficos (lib/graficos.js) no usan emojis ni recursos externos: resvg no los carga.
import { Resvg } from '@resvg/resvg-js';
import { fileURLToPath } from 'node:url';

export const FUENTES = ['Inter_400Regular.ttf', 'Inter_600SemiBold.ttf', 'Inter_700Bold.ttf'].map((f) => fileURLToPath(new URL(`../assets/fonts/${f}`, import.meta.url)));

/** svg → Buffer PNG, con el ancho pedido (por defecto 1280, el máximo que conserva Telegram). */
export function renderizarPng(svg, { ancho = 1280 } = {}) {
  const r = new Resvg(String(svg), { fitTo: { mode: 'width', value: ancho }, font: { fontFiles: FUENTES, loadSystemFonts: false, defaultFontFamily: 'Inter' } });
  return r.render().asPng();
}
