// English mode must not leak a single Korean character anywhere in the UI (except the native "한국어" option).
import { createRequire } from 'node:module'; import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const srv = await serve(4195); const U = 'http://localhost:4195/';
const b = await chromium.launch(); let n = 0; const ok = (m) => console.log(`  ✓ I${++n}. ${m}`); const errs = [];
const HANGUL = /[가-힣ㄱ-ㆎ]/;
async function noKorean(p, where) {
  const leak = await p.evaluate((src) => {
    const re = new RegExp(src);
    const out = [];
    const all = [document.getElementById('app'), document.getElementById('sheet'), document.getElementById('toast')];
    for (const root of all) {
      if (!root) continue;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { const t = w.currentNode.nodeValue; if (re.test(t) && !w.currentNode.parentElement.closest('[lang="ko"]')) out.push(t.trim().slice(0, 60)); }
      for (const el of root.querySelectorAll('[aria-label],[placeholder],[title]')) for (const a of ['aria-label', 'placeholder', 'title']) { const v = el.getAttribute(a); if (v && re.test(v)) out.push(`@${a}: ${v.slice(0, 60)}`); }
    }
    return [...new Set(out)];
  }, HANGUL.source);
  assert.deepEqual(leak, [], `Korean left on ${where}: ${JSON.stringify(leak)}`);
}
const ctx = await b.newContext({ ...devices['iPhone 14'], locale: 'en-US' }); const p = await ctx.newPage();
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(U); await p.waitForSelector('nav');
assert.equal(await p.evaluate(() => document.documentElement.lang), 'en'); ok('first run on an English phone starts in English');
await noKorean(p, 'Today (empty)'); ok('Today: no Korean');
const A = (a, id) => p.click(`[data-a="${a}"]${id != null ? `[data-id="${id}"]` : ''}`);
const close = () => p.click('.sheetbox .xbtn');
// workout + every sheet
await A('openStart', 'r-push'); await A('sMin', 30); await A('sCond', 1); await noKorean(p, 'start sheet'); await A('doStart'); await p.waitForSelector('.panel');
await noKorean(p, 'workout (first time)'); ok('workout screen + start sheet: no Korean');
await p.click('details.acc >> nth=0'); await noKorean(p, 'form guide'); ok('form guide translated (built-in exercise)');
await A('pickW', 20); await A('complete'); await noKorean(p, 'workout after set + timer'); ok('timer bar + carry-over: no Korean');
await A('timerInfo'); await noKorean(p, 'timer info sheet'); await close();
await A('openExList'); await noKorean(p, 'exercise list sheet'); await A('addToSession'); await noKorean(p, 'picker'); await close();
await A('openAlt'); await noKorean(p, 'alternatives sheet'); await close();
await p.click('summary:has-text("Notes")'); await A('openPain'); await A('pickPart', 'Shoulders'); await noKorean(p, 'pain sheet'); await close();
await A('openFinish'); await noKorean(p, 'finish sheet'); await A('doFinish'); await noKorean(p, 'summary sheet'); await close(); ok('all workout sheets: no Korean');
// second workout: suggestions + last-time bar
// a third push day after hitting the top of every range -> "Go heavier" suggestion must be English too
await A('openStart', 'r-push'); await A('doStart'); await p.waitForSelector('.panel'); await noKorean(p, 'workout with history');
for (let i = 0; i < 4; i++) { await p.fill('[data-c=rInput]', '10'); await p.dispatchEvent('[data-c=rInput]', 'change'); await A('complete'); }
await A('tStop'); await A('openFinish'); await A('doFinish'); await close();
await A('openStart', 'r-push'); await A('doStart'); await p.waitForSelector('.sug.increase');
assert.match(await p.textContent('.sug'), /All sets hit the top/); await noKorean(p, 'increase suggestion'); ok('last-time bar + "Go heavier" suggestion text: English');
await A('complete'); await A('openFinish'); await A('doFinish'); await close();
// pull day with a barbell exercise for the plate calculator
await A('openStart', 'r-pull'); await A('doStart'); await p.waitForSelector('.panel');
const ez = await p.evaluate(() => window.__pp.S.sessions.at(-1).exercises.findIndex((e) => e.exerciseId === 'ez-bar-curl'));
await A('selEx', ez); await A('openPlate'); await p.fill('#plW', '61'); await p.dispatchEvent('#plW', 'input'); await noKorean(p, 'plate calculator'); await close(); ok('plate calculator: no Korean');
await A('openFinish'); await A('discard'); await A('confirmOk');
for (const tb of ['routines', 'history', 'progress', 'settings']) { await A('tab', tb); await noKorean(p, tb); }
ok('Routines / History / Progress / Settings tabs: no Korean');
await A('tab', 'routines'); await A('openRoutine', 'r-push'); await noKorean(p, 'routine editor'); await A('editItem', 0); await noKorean(p, 'item sheet'); await A('editExFromItem'); await noKorean(p, 'exercise editor'); await close(); await A('backRoutines');
await A('openLib'); await noKorean(p, 'library'); await A('newExercise'); await noKorean(p, 'new exercise'); await close(); ok('routine editor, library, exercise editor: no Korean');
await A('tab', 'history'); await p.click('.list .row >> nth=0'); await noKorean(p, 'session detail'); ok('history detail: no Korean');
await A('tab', 'progress'); for (const m of ['maxW', 'volume', 'totalReps']) await A('metric', m); await noKorean(p, 'progress metrics'); ok('progress (all metrics): no Korean');
await A('tab', 'settings'); await A('resetAll'); await noKorean(p, 'reset confirm'); await close();
// switch back to Korean and verify, then back to English
await A('setLang', 'ko'); await p.waitForSelector('nav'); assert.equal(await p.evaluate(() => document.documentElement.lang), 'ko');
assert.match(await p.textContent('main'), /루틴 선택/); ok('switching to 한국어 reloads in Korean');
assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('pp:v1')).sessions.filter((s) => s.status === 'done').length), 3); ok('workout log kept across language switch');
await A('tab', 'settings'); await A('setLang', 'en'); await p.waitForSelector('nav'); assert.equal(await p.evaluate(() => document.documentElement.lang), 'en'); ok('switching back to English works');
const ko = await b.newContext({ ...devices['iPhone 14'], locale: 'ko-KR' }); const q = await ko.newPage(); await q.goto(U); await q.waitForSelector('nav');
assert.equal(await q.evaluate(() => document.documentElement.lang), 'ko'); ok('first run on a Korean phone starts in Korean');
await b.close(); srv.close();
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : '  ✓ no page errors'); process.exit(errs.length ? 1 : 0);
