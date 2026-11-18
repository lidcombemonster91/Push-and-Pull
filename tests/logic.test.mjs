import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';
import { DEFAULT_EXERCISES } from '../js/data.js';

const mkSet = (weight, reps, rir = 2, type = 'work') => ({ id: Math.random() + '', type, weight, reps, rir, done: true });
const mkSess = (id, t, exId, sets, extra = {}, mode = 'machine') => ({
  id, startedAt: t, endedAt: t + 3600e3, status: 'done', routineName: 'R',
  exercises: [{ exerciseId: exId, snap: { name: 'X', ko: '엑스', mode, primary: ['가슴'], secondary: ['삼두'] }, sets, ...extra }],
});
const T = { repMin: 8, repMax: 10, rir: 2, inc: 2.5 };

test('e1rm / volume by weight mode', () => {
  assert.equal(L.e1rm(100, 10), 133.33);
  assert.equal(L.e1rm(100, 20), 0); // too many reps -> not estimated
  assert.equal(L.e1rm(0, 5), 0);
  assert.equal(L.setVolume({ weight: 20, reps: 10 }, 'perHand'), 400);
  assert.equal(L.setVolume({ weight: 20, reps: 10 }, 'total'), 200);
  assert.equal(L.setVolume({ weight: 10, reps: 5 }, 'bodyweight', 70), 400);
  assert.equal(L.setVolume({ weight: 0, reps: 5 }, 'bodyweight', 0), 0);
});

test('suggest: increase when all sets hit top of range with good RIR', () => {
  const h = [mkSess('a', 1, 'e', [mkSet(20, 10), mkSet(20, 10), mkSet(20, 10, 1)]).exercises[0]];
  const s = L.suggest(h, T);
  assert.equal(s.type, 'increase'); assert.equal(s.to, 22.5);
});
test('suggest: no increase if form broke or RIR too low', () => {
  assert.equal(L.suggest([{ ...mkSess('a', 1, 'e', [mkSet(20, 10)]).exercises[0], formBreak: true }], T).type, 'hold');
  assert.equal(L.suggest([mkSess('a', 1, 'e', [mkSet(20, 10, 0)]).exercises[0]], T).type, 'hold');
});
test('suggest: hold when under range, reduce after two failures, null with no history', () => {
  const fail = (id, t) => mkSess(id, t, 'e', [mkSet(20, 6), mkSet(20, 5)]).exercises[0];
  assert.equal(L.suggest([fail('a', 2)], T).type, 'hold');
  const r = L.suggest([fail('a', 2), fail('b', 1)], T);
  assert.equal(r.type, 'reduce'); assert.equal(r.to, 17.5);
  assert.equal(L.suggest([], T), null);
  assert.equal(L.suggest([mkSess('a', 1, 'e', [mkSet(20, 9), mkSet(20, 8)]).exercises[0]], T).type, 'hold');
});
test('suggest ignores warmups and undone sets', () => {
  const ex = mkSess('a', 1, 'e', [mkSet(10, 15, 4, 'warmup'), mkSet(20, 10), { ...mkSet(99, 1), done: false }]).exercises[0];
  assert.equal(L.suggest([ex], T).from, 20);
});

test('history: only same exercise id AND same weight mode; never mixes exercises', () => {
  const ss = [mkSess('a', 1, 'press', [mkSet(20, 10)], {}, 'perHand'), mkSess('b', 2, 'other', [mkSet(50, 10)])];
  assert.equal(L.history(ss, 'press', 'perHand').length, 1);
  assert.equal(L.history(ss, 'press', 'total').length, 0, 'mode change => not comparable');
  assert.equal(L.history(ss, 'other', 'perHand').length, 0);
  assert.equal(L.history(ss, 'press', 'perHand', 'a').length, 0, 'exclude current');
  const skipped = [{ ...mkSess('c', 3, 'press', [mkSet(20, 10)], { skipped: true }, 'perHand') }];
  assert.equal(L.history(skipped, 'press', 'perHand').length, 0);
});

test('fitToTime trims sets first, then drops trailing exercises, never mutates input', () => {
  const items = [{ sets: 4, rest: 120 }, { sets: 3, rest: 90 }, { sets: 3, rest: 60 }];
  const full = L.estimateSec(items);
  const r = L.fitToTime(items, 0);
  assert.equal(r.items.length, 3); assert.equal(r.removedSets, 0);
  const r2 = L.fitToTime(items, Math.floor(full / 60) - 5);
  assert.ok(L.estimateSec(r2.items) <= (Math.floor(full / 60) - 5) * 60);
  assert.ok(r2.removedSets > 0);
  assert.equal(items[0].sets, 4);
  const r3 = L.fitToTime(items, 3);
  assert.ok(r3.items.length >= 1);
  assert.ok(r3.dropped.length > 0);
});

test('plateCalc', () => {
  let r = L.plateCalc(100, 20, [25, 20, 10, 5, 2.5, 1.25]);
  assert.deepEqual(r.perSide, [{ plate: 25, count: 1 }, { plate: 10, count: 1 }, { plate: 5, count: 1 }]); assert.ok(r.ok);
  r = L.plateCalc(61, 20, [20, 10, 5, 2.5, 1.25]);
  assert.equal(r.ok, false); assert.equal(r.achieved, 60);
  assert.equal(L.plateCalc(10, 20, [10]).ok, false);
  assert.equal(L.plateCalc(20, 20, [10]).ok, true);
  assert.equal(L.plateCalc(42.5, 20, [10, 5, 1.25]).ok, true); // 11.25 per side
});

test('weekly muscle sets: primary 1x, secondary 0.5x, week boundaries Monday', () => {
  const t = new Date(2026, 10, 18, 10).getTime(); // Wed
  const out = L.weeklyMuscleSets([mkSess('a', t, 'e', [mkSet(20, 10), mkSet(20, 10), mkSet(20, 10, 2, 'warmup')])]);
  const wk = Object.values(out)[0];
  assert.equal(wk['가슴'], 2); assert.equal(wk['삼두'], 1);
  assert.equal(new Date(L.weekStart(t)).getDay(), 1);
  assert.equal(new Date(L.weekStart(new Date(2026, 10, 22, 23).getTime())).getDate(), 16); // Sunday -> prior Monday
});

test('series, best-before (PR basis) and period filter', () => {
  const ss = [mkSess('a', 1000, 'e', [mkSet(20, 10)]), mkSess('b', 2000, 'e', [mkSet(25, 8), mkSet(20, 10)])];
  const ser = L.exerciseSeries(ss, 'e');
  assert.equal(ser.length, 2); assert.equal(ser[1].maxW, 25); assert.equal(ser[1].totalReps, 18);
  const b = L.bestBefore(ss, 'e', 'machine', 'b');
  assert.equal(b.any, true); assert.equal(b.maxW, 20);
  assert.equal(L.bestBefore([], 'e', 'machine').any, false);
  const now = Date.now();
  const old = mkSess('o', now - 200 * 86400e3, 'e', [mkSet(1, 1)]), recent = mkSess('r', now - 5 * 86400e3, 'e', [mkSet(1, 1)]);
  assert.equal(L.inPeriod([old, recent], '1m', now).length, 1);
  assert.equal(L.inPeriod([old, recent], '6m', now).length, 1);
  assert.equal(L.inPeriod([old, recent], 'all', now).length, 2);
});

test('CSV: BOM, escaping, formula neutralisation, only finished sessions', () => {
  const s = mkSess('a', new Date(2026, 0, 5, 7, 30).getTime(), 'e', [mkSet(20, 10)], { note: '=cmd|x, "hi"' });
  s.exercises[0].snap.name = 'Press, "Incline"';
  const draft = { ...mkSess('d', 5, 'e', [mkSet(1, 1)]), status: 'active' };
  const csv = L.toCSV([s, draft]);
  assert.ok(csv.startsWith('﻿date,'));
  assert.equal(csv.split('\r\n').length, 2);
  assert.ok(csv.includes('"Press, ""Incline"""'));
  assert.ok(csv.includes(`"'=cmd|x, ""hi"""`));
  assert.ok(csv.includes('2026-01-05'));
});

test('validateBackup rejects bad input', () => {
  const ok = { app: L.APP_ID, schema: 1, data: { exercises: {}, routines: {}, sessions: [] } };
  assert.equal(L.validateBackup(ok), null);
  assert.ok(L.validateBackup(null));
  assert.ok(L.validateBackup({ ...ok, app: 'x' }));
  assert.ok(L.validateBackup({ ...ok, schema: 99 }));
  assert.ok(L.validateBackup({ ...ok, data: { ...ok.data, sessions: [{ id: 1 }] } }));
  assert.ok(L.validateBackup({ ...ok, data: { exercises: [], routines: {}, sessions: [] } }));
});

test('formatting helpers', () => {
  assert.equal(L.fmtTime(75), '01:15'); assert.equal(L.fmtTime(3725), '1:02:05'); assert.equal(L.fmtTime(-5), '00:00');
  assert.equal(L.fmtNum(22.50), '22.5'); assert.equal(L.fmtNum(null), '–');
});

test('default library sanity: every exercise complete, alternatives resolve', () => {
  const ids = new Set(DEFAULT_EXERCISES.map((e) => e.id));
  assert.equal(ids.size, DEFAULT_EXERCISES.length);
  for (const e of DEFAULT_EXERCISES) {
    for (const k of ['name', 'ko', 'setup', 'form', 'breath', 'tempo', 'mistakes']) assert.ok(e[k], `${e.id}.${k}`);
    assert.ok(e.primary.length && e.sets > 0 && e.repMin <= e.repMax && e.rest > 0 && e.inc > 0, e.id);
    assert.ok(L.MODES[e.mode], e.id);
    e.alts.forEach((a) => assert.ok(ids.has(a), `${e.id} alt ${a}`));
  }
});
