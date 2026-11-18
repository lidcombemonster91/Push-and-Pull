import { createRequire } from 'node:module'; import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const svg = fs.readFileSync(new URL('../icons/icon.svg', import.meta.url), 'utf8');
const b = await chromium.launch(); const pg = await b.newPage();
async function shot(size, out, scale = 1) {
  await pg.setViewportSize({ width: size, height: size });
  await pg.setContent(`<body style="margin:0;background:#0c0d0f;display:grid;place-items:center;height:100vh"><div style="width:${size * scale}px;height:${size * scale}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`);
  await pg.screenshot({ path: new URL(`../icons/${out}`, import.meta.url).pathname });
}
await shot(512, 'icon-512.png'); await shot(192, 'icon-192.png'); await shot(180, 'apple-touch-icon.png'); await shot(512, 'icon-maskable-512.png', 0.72);
await b.close(); console.log('icons ok');
