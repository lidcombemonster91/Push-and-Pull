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

// ---- "업데이트 확인" button: one tap installs a newer server version; same version says "up to date"
{
  const site2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-site2-'));
  for (const f of ['index.html', 'sw.js', 'manifest.webmanifest']) fs.copyFileSync(path.join(root, f), path.join(site2, f));
  for (const d of ['css', 'js', 'icons', 'fonts']) fs.cpSync(path.join(root, d), path.join(site2, d), { recursive: true });
  const srv2 = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(site2, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' }); res.end(fs.readFileSync(f));
  });
  await new Promise((r) => srv2.listen(4199, r));
  const b2 = await chromium.launch(); const c2 = await b2.newContext({ locale: 'ko-KR', viewport: { width: 390, height: 844 } }); const q = await c2.newPage();
  const bld = () => q.evaluate(() => document.getElementById('build')?.textContent.match(/pp-[\w-]+/)?.[0]);
  await q.goto('http://localhost:4199/'); await q.waitForSelector('nav'); await q.evaluate(() => navigator.serviceWorker.ready); await q.reload(); await q.waitForSelector('nav');
  await q.click('[data-a=tab][data-id=settings]'); const cur = await bld();
  await q.click('[data-a=checkUpdate]'); await q.waitForFunction(() => /최신 버전이에요/.test(document.getElementById('toast').textContent));
  ok(`button on the newest version says "최신 버전이에요 (${cur})"`);
  await q.click('[data-a=tab][data-id=today]'); await q.click('[data-a=openStart]'); await q.click('[data-a=doStart]'); await q.waitForSelector('.panel');
  await q.fill('[data-c=wInput]', '22'); await q.dispatchEvent('[data-c=wInput]', 'change'); await q.click('[data-a=complete]');
  for (const [f, a, z] of [['js/app.js', `const BUILD = '${cur}'`, "const BUILD = 'pp-button'"], ['sw.js', `const VERSION = '${cur}'`, "const VERSION = 'pp-button'"]]) {
    const fp = path.join(site2, f); fs.writeFileSync(fp, fs.readFileSync(fp, 'utf8').replace(a, z));
  }
  await q.click('[data-a=exitWorkout]'); await q.click('[data-a=tab][data-id=settings]');
  await Promise.all([q.waitForNavigation(), q.click('[data-a=checkUpdate]')]); await q.waitForSelector('main'); await q.waitForFunction(() => window.__pp);
  await q.evaluate(() => { window.__pp.ui.inWorkout = false; window.__pp.ui.tab = 'settings'; window.__pp.render(); });
  assert.equal(await bld(), 'pp-button'); ok('newer version on the server: ONE tap installs it (even inside the 10-min HTTP cache window)');
  assert.equal(await q.evaluate(() => JSON.parse(localStorage.getItem('pp:v1')).sessions[0].exercises[0].sets[0].weight), 22); ok('workout data untouched by the update button');
  await q.evaluate(() => navigator.serviceWorker.ready); assert.ok(await q.evaluate(async () => (await caches.keys()).includes('pp-button'))); ok('offline cache rebuilt for the new version');
  await b2.close(); srv2.close(); fs.rmSync(site2, { recursive: true, force: true });
}
