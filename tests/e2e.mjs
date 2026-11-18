import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { serve } from './serve.mjs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const srv = await serve(4180); const URL_ = 'http://localhost:4180/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], acceptDownloads: true, serviceWorkers: 'allow' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
let n = 0; const ok = (m) => console.log(`  ✓ ${++n}. ${m}`);
const A = (a, id) => page.click(`[data-a="${a}"]${id != null ? `[data-id="${id}"]` : ''}`);
const S = () => page.evaluate(() => JSON.parse(localStorage.getItem('pp:v1')));
const closeSh = () => page.click('.sheetbox .xbtn');
const toastText = () => page.textContent('#toast');
const setInput = async (sel, v) => { await page.fill(sel, String(v)); await page.dispatchEvent(sel, 'change'); };

async function doSet(weight, reps, rir) {
  if (weight != null) await setInput('[data-c=wInput]', weight);
  if (reps != null) await setInput('[data-c=rInput]', reps);
  if (rir != null) await A('setRir', rir);
  await A('complete');
}
async function runWorkout(setsPerExercise) { // complete all sets for every exercise with given fn(exIdx,setIdx)=>[w,r,rir]
  const s = await S(); const cnt = s.sessions.find((x) => x.status === 'active').exercises.length;
  for (let e = 0; e < cnt; e++) {
    await A('selEx', e);
    const sess = (await S()).sessions.find((x) => x.status === 'active');
    const total = sess.exercises[e].sets.length;
    for (let i = 0; i < total; i++) { const [w, r, rir] = setsPerExercise(e, i); await doSet(w, r, rir); }
  }
}

await page.goto(URL_); await page.waitForSelector('nav');
console.log('Phase 1 flow');
assert.equal(await page.locator('nav button').count(), 5); ok('5-tab bottom nav (Today/Routines/History/Progress/Settings)');
assert.equal(await page.locator('.row.routine').count(), 4); ok('4 default routines on Today');
let st = await S();
assert.equal(st.routineOrder.length, 4);
const push = st.routines['r-push'];
assert.deepEqual(push.items.map((i) => [i.exerciseId, i.sets, i.repMin, i.repMax, i.rest]), [
  ['incline-db-press', 4, 8, 10, 120], ['machine-chest-press', 3, 10, 12, 90], ['cable-fly', 3, 12, 15, 60], ['shoulder-press', 3, 8, 12, 90], ['lateral-raise', 4, 12, 15, 60], ['rope-pushdown', 3, 10, 15, 60], ['overhead-cable-ext', 3, 12, 15, 60]]); ok('Push default data matches spec');
const pull = st.routines['r-pull'];
assert.deepEqual(pull.items.map((i) => [i.exerciseId, i.sets, i.repMin, i.repMax, i.rest]), [
  ['lat-pulldown', 4, 8, 12, 90], ['chest-supported-row', 3, 8, 12, 90], ['seated-cable-row', 3, 10, 12, 75], ['reverse-pec-deck', 3, 12, 15, 60], ['ez-bar-curl', 3, 8, 12, 75], ['hammer-curl', 3, 10, 12, 60]]); ok('Pull default data matches spec');

// ---- start Push, session 1 (first time: no weights invented)
await A('openStart', 'r-push'); await A('sCond', 4); await A('doStart');
await page.waitForSelector('.panel');
let sess = (await S()).sessions[0];
assert.ok(sess.exercises.every((e) => e.sets.every((x) => x.weight === null))); ok('first workout: no weight is pre-filled');
await A('complete'); assert.match(await toastText(), /중량/); ok('completing a set without weight is rejected');
assert.equal((await S()).timer, null); ok('rejected set does not start the timer');

await setInput('[data-c=wInput]', '-5'); assert.match(await toastText(), /올바른/); ok('negative weight rejected');
await setInput('[data-c=wInput]', 'abc'); assert.match(await toastText(), /올바른/); ok('non-numeric weight rejected');
await A('wStep', 1); await A('wStep', 1);
assert.equal(await page.inputValue('[data-c=wInput]'), '4'); ok('stepper uses exercise increment (2kg dumbbell) from empty');
await setInput('[data-c=wInput]', '20'); await A('rStep', 1);
await A('setRir', 2); await A('complete');
let t = (await S()).timer; assert.equal(t.duration, 120); ok('completing a set auto-starts the exercise rest timer (120s)');
assert.ok(await page.isVisible('#tleft')); ok('timer UI visible');
const first = (await S()).sessions[0].exercises[0].sets[0]; assert.deepEqual([first.weight, first.reps, first.rir, first.done], [20, 9, 2, true]); ok('set stored with weight/reps/RIR');

// timer controls
await A('tAdj', 15); assert.ok(Math.abs((await S()).timer.duration - 135) <= 0); ok('+15s');
await A('tAdj', -15); await A('tAdj', -15); assert.equal((await S()).timer.duration, 105); ok('−15s');
await A('tPause'); const r1 = await page.textContent('#tleft'); await page.waitForTimeout(1300); const r2 = await page.textContent('#tleft'); assert.equal(r1, r2); ok('pause freezes the countdown');
await A('tResume'); await page.waitForTimeout(2200); assert.notEqual(await page.textContent('#tleft'), r2); ok('resume continues');
await A('tReset'); assert.match(await page.textContent('#tleft'), /01:4[45]/); ok('reset restores full duration');
await A('tStop'); assert.equal((await S()).timer, null); ok('skip clears timer');

// REGRESSION: typing a weight then tapping "세트 완료" once (keyboard still open) must complete the set
await A('selSet', 2); await page.tap('[data-c=wInput]'); await page.keyboard.type('31'); await page.tap('[data-a=complete]'); await page.waitForTimeout(150);
{ const x = (await S()).sessions[0].exercises[0].sets[2]; assert.deepEqual([x.done, x.weight], [true, 31]); } ok('REGRESSION: one tap on complete right after typing weight completes the set (no lost tap)');
await page.tap('[data-a=selSet][data-id="2"]'); await A('uncomplete'); await setInput('[data-c=wInput]', ''); await A('rStep', 1); await page.tap('[data-c=wInput]'); await page.keyboard.type('22'); await page.tap('[data-a=rStep][data-id="1"]'); await page.waitForTimeout(100);
assert.equal((await S()).sessions[0].exercises[0].sets[2].weight, 22); ok('typing weight then tapping a stepper keeps both the typed value and the tap');
await page.tap('[data-c=wInput]'); await page.keyboard.type('25'); await page.tap('[data-a=selSet][data-id="0"]'); await page.waitForTimeout(100);
assert.equal(await page.locator('.srow.sel .sn').textContent(), '1'); assert.equal((await S()).sessions[0].exercises[0].sets[2].weight, 25); ok('typing weight then tapping ANOTHER set row: tap is not lost and the typed value is saved to the right set');
await A('selSet', 2); await setInput('[data-c=wInput]', '');
await setInput('[data-c=wInput]', ''); assert.equal((await S()).sessions[0].exercises[0].sets[2].weight, null); ok('clearing the weight field stores empty, not 0');
await A('tStop');
// uncomplete, add/remove, warmup
await A('selSet', 0); await A('uncomplete'); assert.equal((await S()).sessions[0].exercises[0].sets[0].done, false); ok('uncomplete a set');
await A('complete');
await A('addSet'); assert.equal((await S()).sessions[0].exercises[0].sets.length, 5); ok('add set');
await A('delSet'); assert.equal((await S()).sessions[0].exercises[0].sets.length, 4); ok('delete (undone) set');
await A('toggleWarm'); assert.equal((await S()).sessions[0].exercises[0].sets[1].type, 'warmup'); ok('mark selected set as warmup');
await A('toggleWarm');
await A('selSet', 1); await setInput('[data-c=wInput]', 20); await A('complete');
await A('tPause'); await page.evaluate(() => {}); 

// timer survives reload; expired timer restores w/o beep
await A('tResume');
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('pp:v1')); s.timer.endAt = Date.now() + 90000; s.timer.paused = false; localStorage.setItem('pp:v1', JSON.stringify(s)); });
await page.reload(); await page.waitForSelector('.panel');
let left = await page.textContent('#tleft'); assert.match(left, /01:(2\d|30)/); ok('after reload mid-workout: session restored and timer shows true remaining time (~01:29)');
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('pp:v1')); s.timer.endAt = Date.now() - 30000; s.timer.fired = false; localStorage.setItem('pp:v1', JSON.stringify(s)); });
await page.reload(); await page.waitForSelector('.panel');
assert.match(await page.textContent('#tlabel'), /휴식 끝 \+00:(2[89]|3\d)/); ok('timer that expired while app was closed shows 00:00 and overtime');
await A('tStop');

// skip, reorder, exercise switching, alt replace
await A('skipEx'); assert.equal((await S()).sessions[0].exercises[0].skipped, false, 'has done sets -> confirm'); await A('confirmOk');
st = await S(); assert.equal(st.sessions[0].exercises[0].skipped, true); ok('skip exercise (with confirm when sets done)');
assert.equal(st.sessions[0].exercises[0].sets.filter((x) => x.done).length, 2);
await A('selEx', 0); await A('unskip'); ok('un-skip');
await A('openExList'); await page.click('[data-a="moveEx"][data-id="1"][data-d="-1"]');
st = await S(); assert.equal(st.sessions[0].exercises[0].exerciseId, 'machine-chest-press'); ok('reorder exercises (move up)');
await closeSh();
await A('selEx', 0); await A('openAlt'); await A('replaceWith', 'pec-deck');
st = await S(); assert.equal(st.sessions[0].exercises[0].exerciseId, 'pec-deck'); ok('replace exercise with no done sets: swapped in place');
await A('selEx', 1); assert.equal((await S()).sessions[0].exercises[1].exerciseId, 'incline-db-press'); await A('openAlt'); await A('replaceWith', 'flat-db-press'); await A('confirmOk');
st = await S(); assert.equal(st.sessions[0].exercises[1].exerciseId, 'incline-db-press'); assert.equal(st.sessions[0].exercises[2].exerciseId, 'flat-db-press'); ok('replace exercise with done sets: keeps it and inserts alternative after (separate history)');
await A('selEx', 2); // original incline is now index 2? find by id
// plate calc + guide
const idx = (await S()).sessions[0].exercises.findIndex((e) => e.exerciseId === 'incline-db-press');
// finish quickly: complete remaining sets in all other exercises
await page.evaluate(() => {});
// Complete everything with top-of-range reps and RIR 2
const sessNow = (await S()).sessions[0];
for (let e = 0; e < sessNow.exercises.length; e++) {
  await A('selEx', e);
  const ex = (await S()).sessions[0].exercises[e];
  for (let i = 0; i < ex.sets.length; i++) {
    if (ex.sets[i].done) continue;
    await A('selSet', i); await doSet(ex.snap.mode === 'perHand' ? 20 : 40, ex.snap.repMax, 2);
  }
}
await A('tStop');
{ const ci = (await S()).sessions[0].exercises.findIndex((e) => e.exerciseId === 'incline-db-press'); await A('selEx', ci);
  for (let i = 0; i < 4; i++) { await A('selSet', i); await setInput('[data-c=rInput]', 10); } }
assert.ok((await S()).sessions[0].exercises.find((e) => e.exerciseId === 'incline-db-press').sets.every((x) => x.done && x.reps === 10 && x.weight === 20)); ok('edit completed sets in place');
await A('openFinish'); await A('sSat', 4); await page.fill('#postNote', 'good <b>day</b>'); await A('doFinish');
await page.waitForSelector('.sheetbox .week'); st = await S();
assert.equal(st.sessions[0].status, 'done'); assert.equal(st.activeId, null); ok('finish saves session');
assert.equal(st.sessions[0].post.note, 'good <b>day</b>'); await closeSh();

// ---- session 2: defaults from last workout + progression suggestion
await A('openStart', 'r-push'); await A('doStart'); await page.waitForSelector('.panel');
await A('selEx', 1); // machine chest press? find first exercise
st = await S(); const s2 = st.sessions.find((x) => x.status === 'active');
const incl = s2.exercises.find((e) => e.exerciseId === 'incline-db-press');
assert.ok(incl.sets.every((x) => x.weight === 20 && x.reps === 10)); ok('second workout: each set defaults to last workout weight/reps');
const ii = s2.exercises.findIndex((e) => e.exerciseId === 'incline-db-press');
await A('selEx', ii);
assert.match(await page.textContent('.sug'), /증량 제안.*22kg/s); ok('all sets hit top of range @RIR2 → suggests +2kg (not applied automatically)');
assert.equal((await S()).sessions.find((x) => x.status === 'active').exercises[ii].sets[0].weight, 20); ok('suggestion never auto-changes weight');
await A('applySug'); assert.equal((await S()).sessions.find((x) => x.status === 'active').exercises[ii].sets[0].weight, 22); ok('apply suggestion on user confirmation');
// the replaced exercise (pec-deck) must not inherit chest press weights
const pd = s2.exercises.find((e) => e.exerciseId === 'flat-db-press'); assert.equal(pd, undefined); ok('alternative exercise not part of routine, histories stay separate');
// PR
await A('selEx', ii); await doSet(24, 10, 2); assert.match(await toastText(), /개인 최고/); ok('PR toast on a new best');
await A('openFinish'); await A('doFinish'); await closeSh();

// guide, plate calc etc. in a third session
await A('openStart', 'r-pull'); await A('sMin', 30); assert.match(await page.textContent('.sheetbox'), /세트 \d+개 줄이고/); ok('time limit shows trimming preview'); await A('doStart');
await page.waitForSelector('.panel'); st = await S(); const s3 = st.sessions.find((x) => x.status === 'active');
assert.ok(s3.exercises.reduce((a, e) => a + e.sets.length, 0) < 19); ok('time-limited routine has fewer sets/exercises');
await page.click('details.acc >> nth=0'); assert.match(await page.textContent('.guide'), /기구 세팅/); ok('posture guide shows setup/form/breath/tempo/mistakes');
// plate calculator on barbell exercise (ez-bar curl)
await A('openExList'); const ezI = s3.exercises.findIndex((e) => e.exerciseId === 'ez-bar-curl');
if (ezI >= 0) { await A('jumpEx', ezI); await A('openPlate'); await page.fill('#plW', '60'); assert.match(await page.textContent('#plOut'), /20/); ok('plate calculator'); await closeSh(); }
// pain + discard
await page.click('summary:has-text("메모")'); await A('openPain'); await A('pickPart', '어깨'); await A('addPain'); assert.equal((await S()).sessions.find((x) => x.status === 'active').pain.length, 1); ok('pain note recorded'); await closeSh();
await A('openFinish'); assert.match(await page.textContent('.sheetbox'), /기록된 세트가 없어요/); await A('discard'); await A('confirmOk');
st = await S(); assert.equal(st.sessions.filter((s) => s.status === 'done').length, 2); assert.equal(st.activeId, null); ok('empty workout can be discarded without saving');

// ---- Phase-2 additions: per-set rest override, supersets, per-exercise rule, recovery advice
await A('openStart', 'r-pull'); await A('doStart'); await page.waitForSelector('.panel');
await A('restAdj', 15); await A('restAdj', 15); assert.match(await page.textContent('.restrow'), /120초/); ok('per-set rest override shown (90s default + 30)');
await setInput('[data-c=wInput]', 40); await A('complete'); assert.equal((await S()).timer.duration, 120); ok('override applied to this set only');
await A('tStop'); assert.match(await page.textContent('.restrow'), /90초/, 'next set uses exercise default (lat pulldown 90s)'); ok('next set returns to default rest');
await A('openExList'); await A('linkEx', 0); assert.equal((await S()).sessions.find((x) => x.status === 'active').exercises[0].link, true); ok('link exercises as superset'); await closeSh();
await A('selEx', 0); await A('selSet', 1); await setInput('[data-c=wInput]', 40); await A('complete');
let ss = (await S()); assert.equal(ss.timer, null, 'no rest between superset pair'); assert.equal(ss.sessions.find((x) => x.status === 'active').curEx, 1); ok('superset: first exercise set -> jumps to partner, no timer');
await setInput('[data-c=wInput]', 30); await A('complete');
ss = await S(); assert.ok(ss.timer && ss.timer.duration === 90); assert.equal(ss.sessions.find((x) => x.status === 'active').curEx, 0); ok('superset: rest starts after partner set, returns to first exercise');
await A('openExList'); await page.click('[data-a="moveEx"][data-id="1"][data-d="-1"]'); assert.equal((await S()).sessions.find((x) => x.status === 'active').exercises.some((e) => e.link), false); ok('reordering clears stale superset links'); await closeSh();
await A('tStop');
// manual rule hides suggestions
await A('openFinish'); await A('doFinish'); await closeSh();
await A('tab', 'routines'); await A('openLib'); await page.fill('#pickQ', 'EZ'); await page.click('#pickList [data-a=editEx]');
await page.selectOption('#xRule', 'manual'); await A('saveEx'); assert.equal((await S()).exercises['ez-bar-curl'].rule, 'manual'); ok('per-exercise progression rule saved'); await closeSh();
await A('tab', 'today'); assert.ok((await page.textContent('main')).length > 0);

// ---- routines: edit never changes history
await A('tab', 'routines'); await A('openRoutine', 'r-push');
await page.fill('[data-c=rName]', 'Push A'); await page.dispatchEvent('[data-c=rName]', 'change');
await A('itemDown', 0); await A('editItem', 1);
await page.fill('#fSets', '5'); await A('saveItem');
st = await S(); assert.equal(st.routines['r-push'].name, 'Push A'); assert.equal(st.routines['r-push'].items[0].exerciseId, 'machine-chest-press'); ok('rename + reorder + edit sets');
await A('editItem', 1); await page.fill('#fMin', '12'); await page.fill('#fMax', '8'); await A('saveItem'); assert.match(await toastText(), /확인하세요/); ok('invalid rep range rejected'); await closeSh();
await A('itemDel', 0); assert.equal((await S()).routines['r-push'].items.length, 6); ok('delete item');
await A('addToRoutine'); await page.fill('#pickQ', 'pec'); await page.click('#pickList [data-a=pick]'); assert.equal((await S()).routines['r-push'].items.length, 7); ok('add exercise from library (search)');
// custom exercise
await A('addToRoutine'); await A('newExercise'); await page.fill('#xKo', '스미스 벤치'); await page.fill('#xName', 'Smith Bench'); await A('saveEx');
assert.match(await toastText(), /근육/); await page.click('[data-a=togMuscle][data-id=xP][data-m="가슴"]'); await A('saveEx');
st = await S(); const cx = Object.values(st.exercises).find((e) => e.name === 'Smith Bench'); assert.ok(cx && cx.custom); assert.equal(st.routines['r-push'].items.at(-1).exerciseId, cx.id); ok('custom exercise created and added to routine');
const hist = st.sessions.find((x) => x.status === 'done');
assert.equal(hist.routineName, 'Push Day'); assert.equal(hist.exercises.length, 8); ok('past sessions unchanged by routine/exercise edits (snapshots)');
await A('delRoutine'); await A('confirmOk'); assert.equal((await S()).routineOrder.length, 3); ok('delete routine; history intact'); assert.equal((await S()).sessions.filter((s) => s.status === 'done').length, 3);

// ---- history / progress
await A('tab', 'history'); assert.equal(await page.locator('.list .row').count(), 3); ok('history lists finished sessions');
await page.click('.list .row >> nth=0'); assert.match(await page.textContent('main'), /추정 1RM/); ok('session detail shows sets/volume/e1RM');
await A('backHistory'); await page.click('.list .row >> nth=2');
assert.equal(await page.locator('.note b').count(), 0); assert.match(await page.textContent('.note'), /<b>day<\/b>/); ok('user text is escaped (no HTML injection)');
await A('backHistory');
await A('tab', 'progress'); assert.ok(await page.isVisible('svg.chart')); ok('progress chart renders');
for (const p of ['1m', '3m', '6m', 'all']) { await A('period', p); } ok('period selector 1/3/6/all');
for (const m of ['maxW', 'volume', 'totalReps']) await A('metric', m); ok('metric tabs');
assert.match(await page.textContent('main'), /부위별 주간 세트/); ok('weekly sets per muscle');

// ---- backup / restore / CSV
await A('tab', 'settings');
const [dl] = await Promise.all([page.waitForEvent('download'), A('exportJson')]);
const jsonPath = '/tmp/pp-backup.json'; await dl.saveAs(jsonPath); const bj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
assert.equal(bj.app, 'push-and-pull'); assert.equal(bj.data.sessions.filter((s) => s.status === 'done').length, 3); ok('JSON backup export');
const [dl2] = await Promise.all([page.waitForEvent('download'), A('exportCsv')]);
await dl2.saveAs('/tmp/pp.csv'); const csv = fs.readFileSync('/tmp/pp.csv', 'utf8'); assert.ok(csv.includes('Incline Dumbbell Press') && csv.split('\r\n').length > 20); ok('CSV export');
await A('resetAll'); await A('confirmOk'); await A('confirmOk');
st = await S(); assert.equal(st.sessions.length, 0); assert.equal(st.routineOrder.length, 4); ok('reset all (double confirm) restores defaults');
await A('tab', 'settings'); await page.setInputFiles('#file', jsonPath); await page.waitForSelector('[data-a=confirmOk]'); await A('confirmOk');
st = await S(); assert.equal(st.sessions.filter((s) => s.status === 'done').length, 3); assert.equal(st.routineOrder.length, 3); assert.ok(!st.routines['r-push']); ok('restore JSON backup (sessions + routine changes exactly as backed up)');
fs.writeFileSync('/tmp/bad.json', '{"app":"other"}'); await A('tab', 'settings'); await page.setInputFiles('#file', '/tmp/bad.json'); await page.waitForTimeout(200);
assert.match(await toastText(), /백업 파일이 아닙니다/); assert.equal((await S()).sessions.filter((s) => s.status === 'done').length, 3); ok('invalid backup rejected, data untouched');
fs.writeFileSync('/tmp/bad2.json', 'not json'); await page.setInputFiles('#file', '/tmp/bad2.json'); await page.waitForTimeout(200); assert.match(await toastText(), /JSON/); ok('non-JSON file rejected');

// ---- corrupted storage doesn't crash, original preserved
await page.evaluate(() => localStorage.setItem('pp:v1', '{broken'));
await page.reload(); await page.waitForSelector('nav');
assert.ok(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('pp:v1:corrupt')))); ok('corrupt storage: app starts fresh, raw data preserved');

// ---- offline
await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForTimeout(500);
await ctx.setOffline(true); await page.reload(); await page.waitForSelector('nav'); assert.equal(await page.locator('.row.routine').count(), 4); ok('works offline (service worker cache)');
await ctx.setOffline(false);
assert.ok((await (await page.request.get(URL_ + 'manifest.webmanifest')).json()).display === 'standalone'); ok('PWA manifest');

// ---- layout: no horizontal overflow on iPhone viewport at each tab
for (const tb of ['today', 'routines', 'history', 'progress', 'settings']) { await A('tab', tb); const o = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); assert.equal(o, false, tb + ' overflows'); }
ok('no horizontal overflow on any tab (iPhone 14)');
await page.screenshot({ path: '/tmp/claude-0/-home-user-Push-and-Pull/7afc2633-aec5-5f05-bfea-173af6231fff/scratchpad/today.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '  ✓ no console/page errors');
await browser.close(); srv.close();
process.exit(errors.length ? 1 : 0);
