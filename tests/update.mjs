// Deploy-update path: with GitHub Pages' HTTP caching (max-age=600), a phone that already has the app
// must switch to the new version on the next open, without reinstalling.
import { createRequire } from 'node:module'; import assert from 'node:assert/strict';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const site = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-site-'));
for (const f of ['index.html', 'sw.js', 'manifest.webmanifest']) fs.copyFileSync(path.join(root, f), path.join(site, f));
for (const d of ['css', 'js', 'icons', 'fonts']) fs.cpSync(path.join(root, d), path.join(site, d), { recursive: true });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(site, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' }); // like GitHub Pages
  res.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(4197, r));
let n = 0; const ok = (m) => console.log(`  ✓ U${++n}. ${m}`);
const b = await chromium.launch(); const ctx = await b.newContext({ locale: 'ko-KR', viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
const build = () => p.evaluate(() => { const m = document.getElementById('build')?.textContent.match(/pp-[\w-]+/); return m && m[0]; });
await p.goto('http://localhost:4197/'); await p.waitForSelector('nav'); await p.evaluate(() => navigator.serviceWorker.ready);
await p.reload(); await p.waitForSelector('nav'); await p.click('[data-a=tab][data-id=settings]');
const v1 = await build(); assert.ok(v1); ok(`installed and controlled by the service worker (${v1})`);
await p.click('[data-a=tab][data-id=today]'); await p.click('[data-a=openStart]'); await p.click('[data-a=doStart]'); await p.waitForSelector('.panel');
await p.fill('[data-c=wInput]', '20'); await p.dispatchEvent('[data-c=wInput]', 'change'); await p.click('[data-a=complete]');
// "deploy" a new version: new build id in app.js + sw.js (HTTP cache still holds the old files for 10 minutes)
for (const [f, a, z] of [['js/app.js', `const BUILD = '${v1}'`, "const BUILD = 'pp-next'"], ['sw.js', `const VERSION = '${v1}'`, "const VERSION = 'pp-next'"]]) {
  const fp = path.join(site, f); const s = fs.readFileSync(fp, 'utf8'); assert.ok(s.includes(a), f); fs.writeFileSync(fp, s.replace(a, z));
}
// next time the user opens the app (one navigation), it should end up on the new version by itself
await p.goto('http://localhost:4197/'); await p.waitForFunction(() => window.__pp, null, { timeout: 15000 });
await p.waitForFunction(async () => { const r = await fetch('js/app.js'); return (await r.text()).includes("'pp-next'"); }, null, { timeout: 15000 });
await p.waitForFunction(() => window.__pp && document.querySelector('nav, main'), null, { timeout: 15000 }); await p.waitForTimeout(1500);
await p.evaluate(() => { window.__pp.ui.inWorkout = false; window.__pp.ui.tab = 'settings'; window.__pp.render(); });
assert.equal(await build(), 'pp-next'); ok('after a deploy, opening the app once switches to the new version (no reinstall)');
assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('pp:v1')).sessions[0].exercises[0].sets[0].done), true); ok('workout in progress survives the update');
await b.close(); srv.close(); fs.rmSync(site, { recursive: true, force: true });
