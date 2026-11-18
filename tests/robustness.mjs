// Adversarial checks: two tabs, failing storage, quota errors, corrupt session shapes.
import { createRequire } from 'node:module'; import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const srv = await serve(4185); const U = 'http://localhost:4185/';
const b = await chromium.launch(); let n = 0; const ok = (m) => console.log(`  ✓ R${++n}. ${m}`);
const errs = [];

// ---- 1. two tabs share data; a stale tab must not clobber newer data
{
  const ctx = await b.newContext(devices['iPhone 14']); const a = await ctx.newPage(), c = await ctx.newPage();
  for (const p of [a, c]) p.on('pageerror', (e) => errs.push(e.message));
  await a.goto(U); await c.goto(U);
  await a.click('[data-a=openStart]'); await a.click('[data-a=doStart]');
  await a.fill('[data-c=wInput]', '30'); await a.dispatchEvent('[data-c=wInput]', 'change'); await a.click('[data-a=complete]');
  await c.waitForTimeout(400);
  assert.equal(await c.evaluate(() => !!window.__pp.S.activeId), true); ok('second tab adopts the active session started in the first tab');
  const done = await c.evaluate(() => window.__pp.S.sessions[0].exercises[0].sets[0].done); assert.equal(done, true);
  // stale tab writes something: must include tab A's set (not revert it)
  await c.evaluate(() => { window.__pp.S.settings.barWeight = 25; });
  await c.click('[data-a=resume]').catch(() => {}); await c.evaluate(() => { const s = window.__pp.S; s.settings.barWeight = 25; localStorage.setItem('pp:v1', JSON.stringify(s)); });
  await a.waitForTimeout(400);
  const bw = await a.evaluate(() => window.__pp.S.settings.barWeight); assert.equal(bw, 25);
  assert.equal(await a.evaluate(() => window.__pp.S.sessions[0].exercises[0].sets[0].done), true); ok('changes propagate both ways without losing the logged set');
  await ctx.close();
}

// ---- 2. storage throws on read (private mode / blocked): app still works, shows warning
{
  const ctx = await b.newContext(devices['iPhone 14']); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { const bad = () => { throw new DOMException('blocked', 'SecurityError'); }; Storage.prototype.getItem = bad; Storage.prototype.setItem = bad; });
  await p.goto(U); await p.waitForSelector('nav');
  assert.match(await p.textContent('main'), /저장소를 막고 있어/); assert.equal(await p.locator('.row.routine').count(), 4); ok('storage blocked: app still opens with default routines + visible warning');
  await p.click('[data-a=openStart]'); await p.click('[data-a=doStart]'); await p.fill('[data-c=wInput]', '20'); await p.dispatchEvent('[data-c=wInput]', 'change'); await p.click('[data-a=complete]');
  assert.equal(await p.evaluate(() => window.__pp.S.sessions[0].exercises[0].sets[0].done), true); ok('workout logging still works in memory when storage is blocked');
  await ctx.close();
}

// ---- 3. quota exceeded on write: user is told, nothing crashes
{
  const ctx = await b.newContext(devices['iPhone 14']); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(U); await p.waitForSelector('nav');
  await p.evaluate(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'pp:v1') throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, k, v); }; });
  await p.click('[data-a=openStart]'); await p.click('[data-a=doStart]');
  assert.match(await p.textContent('#toast'), /저장 실패/); ok('quota error shows an explicit "save failed" toast'); await ctx.close();
}

// ---- 4. malformed-but-parseable stored data: app must not white-screen
{
  const ctx = await b.newContext(devices['iPhone 14']); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push('P4:' + e.message));
  await p.goto(U); await p.waitForSelector('nav');
  await p.evaluate(() => localStorage.setItem('pp:v1', JSON.stringify({ exercises: {}, routines: {}, sessions: [] })));
  await p.reload(); await p.waitForSelector('nav'); ok('empty-but-valid data loads (no routines) without crashing');
  assert.match(await p.textContent('main'), /루틴이 없습니다/); ok('empty state tells the user what to do');
  await p.click('[data-a=tab][data-id=settings]'); await p.click('[data-a=restoreDef]'); await p.click('[data-a=tab][data-id=today]');
  assert.equal(await p.locator('.row.routine').count(), 4); ok('"기본 운동/루틴 복원" brings the defaults back');
  await ctx.close();
}

// ---- 5. long idle session + midnight crossing do not break stats
{
  const ctx = await b.newContext(devices['iPhone 14']); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(U); await p.click('[data-a=openStart]'); await p.click('[data-a=doStart]');
  await p.evaluate(() => { const s = window.__pp.S; s.sessions[0].startedAt -= 30 * 3600 * 1000; });
  await p.fill('[data-c=wInput]', '20'); await p.dispatchEvent('[data-c=wInput]', 'change'); await p.click('[data-a=complete]');
  await p.click('[data-a=openFinish]'); await p.click('[data-a=doFinish]');
  const t = await p.textContent('.sheetbox'); assert.match(t, /수고했어요/); ok('30h-old session finishes cleanly');
  await ctx.close();
}
// ---- 6. weight carry-over rules with history + custom dumbbell list
{
  const ctx = await b.newContext(devices['iPhone 14']); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(U); await p.waitForSelector('nav');
  await p.evaluate(() => { const S = window.__pp.S; S.settings.dumbbells = [10, 15, 20, 25, 30];
    const snap = (m) => ({ name: 'Incline Dumbbell Press', ko: '인클라인 덤벨 프레스', mode: 'perHand', primary: ['가슴'], secondary: [], repMin: 8, repMax: 10, rir: 2, rest: 120, inc: 2 });
    const mk = (id, t, ws) => ({ id, routineId: 'r-push', routineName: 'Push Day', startedAt: t, endedAt: t + 3e6, status: 'done', pre: null, post: null, pain: [], curEx: 0, exercises: [{ id: id + 'e', exerciseId: 'incline-db-press', snap: snap(), skipped: false, formBreak: false, note: '', sets: ws.map((w, i) => ({ id: id + i, type: 'work', weight: w, reps: 9, rir: 2, done: true })) }] });
    S.sessions.push(mk('h1', Date.now() - 7 * 864e5, [20, 20, 20, 20])); localStorage.setItem('pp:v1', JSON.stringify(S)); });
  await p.reload(); await p.waitForSelector('nav');
  await p.click('[data-a=openStart][data-id="r-push"]'); await p.click('[data-a=doStart]'); await p.waitForSelector('.panel');
  assert.equal(await p.locator('#ladder .chip').count(), 5); ok('custom dumbbell list is used (5 owned weights)');
  assert.equal(await p.inputValue('[data-c=wInput]'), '20'); ok('history default 20 prefilled');
  await p.click('[data-a=pickW][data-id="25"]'); await p.click('[data-a=complete]');
  let w = await p.evaluate(() => window.__pp.S.sessions.at(-1).exercises[0].sets.map((x) => x.weight)); assert.deepEqual(w, [25, 25, 25, 25]); ok('raising set 1 from the flat history default carries to untouched later sets');
  await p.click('[data-a=wStep][data-id="-1"]'); assert.equal(await p.inputValue('[data-c=wInput]'), '20'); ok('− on 25 goes to the previous owned dumbbell (20)');
  await p.evaluate(() => { const S = window.__pp.S; const s = S.sessions.find((x) => x.status === 'done'); s.exercises[0].sets.forEach((x, i) => { x.weight = [20, 22, 24, 26][i]; }); localStorage.setItem('pp:v1', JSON.stringify(S)); });
  await ctx.close();
  const ctx2 = await b.newContext(devices['iPhone 14']); const q = await ctx2.newPage(); q.on('pageerror', (e) => errs.push(e.message));
  await q.goto(U); await q.waitForSelector('nav');
  await q.evaluate(() => { const S = window.__pp.S; const snap = { name: 'Incline Dumbbell Press', ko: '인클라인 덤벨 프레스', mode: 'perHand', primary: ['가슴'], secondary: [], repMin: 8, repMax: 10, rir: 2, rest: 120, inc: 2 };
    S.sessions.push({ id: 'h', routineId: 'r-push', routineName: 'Push Day', startedAt: Date.now() - 864e5, endedAt: Date.now() - 864e5 + 1e6, status: 'done', pre: null, post: null, pain: [], curEx: 0, exercises: [{ id: 'he', exerciseId: 'incline-db-press', snap, skipped: false, formBreak: false, note: '', sets: [20, 22, 24, 26].map((w, i) => ({ id: 'p' + i, type: 'work', weight: w, reps: 9, rir: 2, done: true })) }] }); localStorage.setItem('pp:v1', JSON.stringify(S)); });
  await q.reload(); await q.waitForSelector('nav'); await q.click('[data-a=openStart][data-id="r-push"]'); await q.click('[data-a=doStart]'); await q.waitForSelector('.panel');
  await q.fill('[data-c=wInput]', '30'); await q.dispatchEvent('[data-c=wInput]', 'change'); await q.click('[data-a=complete]');
  w = await q.evaluate(() => window.__pp.S.sessions.at(-1).exercises[0].sets.map((x) => x.weight)); assert.deepEqual(w, [30, 22, 24, 26]); ok('pyramid history (20/22/24/26): changing set 1 does NOT overwrite the other planned weights');
  await ctx2.close();
}
await b.close(); srv.close();
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : '  ✓ no page errors'); process.exit(errs.length ? 1 : 0);
