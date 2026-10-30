// Gera os ícones PNG padrão do WebPlay a partir de um SVG (executar: npm run gen-icons -w frontend).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
await fs.mkdir(out, { recursive: true });

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <path d="M196 148v216l180-108z" fill="#ffffff"/>
</svg>`;

for (const size of [192, 512]) {
  await sharp(Buffer.from(svg(size))).png().toFile(path.join(out, `icon-${size}.png`));
}
console.log('Ícones gerados em', out);
