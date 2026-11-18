// Pure logic: no DOM, no storage. Unit-tested in tests/logic.test.mjs
export const MODES = {
  perHand: '덤벨 개당',
  total: '바벨 총중량',
  machine: '머신 표시 중량',
  bodyweight: '맨몸 (+추가 중량)',
};

export const round025 = (n) => Math.round(n * 4) / 4;
export const fmtNum = (n) => (n == null || n === '' || Number.isNaN(+n) ? '–' : String(+(+n).toFixed(2)));
export const pad = (n) => String(n).padStart(2, '0');
export const fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};
export function ymd(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function weekStart(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.getTime();
}

// Epley. Only meaningful for 1..12 reps.
export const e1rm = (w, r) => (w > 0 && r >= 1 && r <= 12 ? +(w * (1 + r / 30)).toFixed(2) : 0);

export function setVolume(set, mode, bodyweight = 0) {
  const w = +set.weight || 0, r = +set.reps || 0;
  if (mode === 'perHand') return w * 2 * r;
  if (mode === 'bodyweight') return (bodyweight + w) * r;
  return w * r;
}
export const doneWork = (ex) => (ex.sets || []).filter((s) => s.done && s.type === 'work' && s.reps > 0);

export function sessionStats(sess, bodyweight = 0) {
  let volume = 0, sets = 0, prs = 0;
  for (const ex of sess.exercises) {
    if (ex.skipped) continue;
    for (const s of ex.sets) {
      if (!s.done) continue;
      if (s.type === 'work') { sets++; volume += setVolume(s, ex.snap.mode, bodyweight); }
      if (s.pr) prs++;
    }
  }
  const end = sess.endedAt || Date.now();
  return { volume, sets, prs, durationSec: Math.max(0, Math.round((end - sess.startedAt) / 1000)) };
}

// Completed sessions that contain this exact exercise (same id AND same weight mode), newest first.
export function history(sessions, exerciseId, mode, excludeId) {
  return sessions
    .filter((s) => s.status === 'done' && s.id !== excludeId)
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((s) => s.exercises.find((e) => e.exerciseId === exerciseId && !e.skipped && e.snap.mode === mode && doneWork(e).length))
    .filter(Boolean);
}

/**
 * Rule-based progressive-overload suggestion. Never mutates anything.
 * hist: history() result. target: {repMin, repMax, rir, inc}
 */
export function suggest(hist, target) {
  if (!hist.length) return null;
  const last = hist[0], ws = doneWork(last);
  const top = Math.max(...ws.map((s) => s.weight));
  const minRir = Math.max(0, (target.rir ?? 2) - 1);
  const allTop = ws.every((s) => s.reps >= target.repMax);
  const rirOk = ws.every((s) => s.rir == null || s.rir >= minRir);
  const form = !last.formBreak;
  if (allTop && rirOk && form) {
    const delta = target.inc;
    return { type: 'increase', delta, to: round025(top + delta), from: top,
      msg: `모든 세트가 ${target.repMax}회 달성 · RIR 양호 → ${fmtNum(top + delta)}kg로 증가 제안` };
  }
  if (allTop && (!rirOk || !form)) {
    return { type: 'hold', delta: 0, to: top, from: top,
      msg: `상한 도달했지만 ${!form ? '자세가 흔들렸어요' : 'RIR이 낮았어요'} → ${fmtNum(top)}kg 유지` };
  }
  const below = (h) => doneWork(h).some((s) => s.reps < target.repMin);
  if (below(last) && hist[1] && below(hist[1]) && Math.max(...doneWork(hist[1]).map((s) => s.weight)) >= top) {
    const to = Math.max(0, round025(top - target.inc));
    return { type: 'reduce', delta: -target.inc, to, from: top,
      msg: `2회 연속 ${target.repMin}회 미달 → ${fmtNum(to)}kg로 조정 제안` };
  }
  if (below(last)) {
    return { type: 'hold', delta: 0, to: top, from: top, msg: `${target.repMin}회 미달 → ${fmtNum(top)}kg 유지하고 반복수 채우기` };
  }
  return { type: 'hold', delta: 0, to: top, from: top, msg: `${fmtNum(top)}kg 유지 · 모든 세트 ${target.repMax}회 도전` };
}

// Trim a routine to fit a time budget. items: [{sets, rest}]. Returns new items (copies) + info.
export function estimateSec(items, workSec = 40) {
  return items.reduce((a, it) => a + it.sets * (workSec + it.rest), 0);
}
export function fitToTime(items, minutes, workSec = 40) {
  const out = items.map((i) => ({ ...i }));
  if (!minutes) return { items: out, removedSets: 0, dropped: [] };
  const budget = minutes * 60;
  let removedSets = 0;
  const dropped = [];
  while (estimateSec(out, workSec) > budget && out.length) {
    let idx = -1;
    for (let i = out.length - 1; i >= 0; i--) if (out[i].sets > 2) { idx = i; break; }
    if (idx >= 0) { out[idx].sets--; removedSets++; continue; }
    if (out.length === 1) break;
    dropped.push(out.pop());
  }
  return { items: out, removedSets, dropped };
}

// Barbell plate calculator. plates in kg.
export function plateCalc(target, bar, plates) {
  const side = (target - bar) / 2;
  if (!(target > 0) || side < 0) return { ok: false, perSide: [], achieved: bar, remainder: Math.max(0, side), error: target < bar ? '바 무게보다 가벼워요' : '무게를 입력하세요' };
  let rem = Math.round(side * 1000) / 1000;
  const perSide = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    const c = Math.floor(rem / p + 1e-9);
    if (c > 0) { perSide.push({ plate: p, count: c }); rem = Math.round((rem - c * p) * 1000) / 1000; }
  }
  return { ok: rem === 0, perSide, remainder: rem, achieved: +(target - rem * 2).toFixed(3) };
}

export function inPeriod(sessions, period, now = Date.now()) {
  const days = { '1m': 30, '3m': 91, '6m': 182 }[period];
  return sessions.filter((s) => s.status === 'done' && (!days || s.startedAt >= now - days * 86400000));
}

// Weekly sets per muscle: primary = 1 set, secondary = 0.5 set. Returns {weekStartTs: {muscle: sets}}
export function weeklyMuscleSets(sessions) {
  const out = {};
  for (const s of sessions) {
    if (s.status !== 'done') continue;
    const wk = weekStart(s.startedAt);
    out[wk] ||= {};
    for (const ex of s.exercises) {
      if (ex.skipped) continue;
      const n = doneWork(ex).length;
      if (!n) continue;
      for (const m of ex.snap.primary || []) out[wk][m] = (out[wk][m] || 0) + n;
      for (const m of ex.snap.secondary || []) out[wk][m] = (out[wk][m] || 0) + n * 0.5;
    }
  }
  return out;
}

// Per-session series for one exercise: [{t, maxW, e1rm, volume, bestReps, topSet}]
export function exerciseSeries(sessions, exerciseId, bodyweight = 0) {
  const pts = [];
  for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId && !e.skipped);
    if (!ex) continue;
    const ws = doneWork(ex);
    if (!ws.length) continue;
    pts.push({
      t: s.startedAt,
      maxW: Math.max(...ws.map((x) => x.weight || 0)),
      e1rm: Math.max(0, ...ws.map((x) => e1rm(x.weight, x.reps))),
      volume: ws.reduce((a, x) => a + setVolume(x, ex.snap.mode, bodyweight), 0),
      reps: Math.max(...ws.map((x) => x.reps)),
      totalReps: ws.reduce((a, x) => a + x.reps, 0),
    });
  }
  return pts;
}

// Best records among finished sessions (excluding one session id) for PR detection.
export function bestBefore(sessions, exerciseId, mode, excludeId) {
  let any = false, maxW = 0, best1 = 0;
  for (const h of history(sessions, exerciseId, mode, excludeId)) {
    any = true;
    for (const s of doneWork(h)) { maxW = Math.max(maxW, s.weight || 0); best1 = Math.max(best1, e1rm(s.weight, s.reps)); }
  }
  return { any, maxW, best1 };
}

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = "'" + s; // neutralise spreadsheet formulas
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export function toCSV(sessions, bodyweight = 0) {
  const head = ['date', 'start', 'routine', 'exercise', 'exercise_ko', 'weight_mode', 'set', 'type', 'weight_kg', 'reps', 'rir', 'completed', 'volume_kg', 'est_1rm', 'pr', 'exercise_note', 'session_note', 'condition', 'fatigue', 'satisfaction'];
  const rows = [head];
  for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    if (s.status !== 'done') continue;
    for (const ex of s.exercises) {
      ex.sets.forEach((st, i) => {
        rows.push([ymd(s.startedAt), new Date(s.startedAt).toTimeString().slice(0, 5), s.routineName, ex.snap.name, ex.snap.ko, ex.snap.mode, i + 1, st.type, st.weight ?? '', st.reps ?? '', st.rir ?? '', st.done ? 1 : 0, st.done && st.type === 'work' ? +setVolume(st, ex.snap.mode, bodyweight).toFixed(2) : '', st.done ? e1rm(st.weight, st.reps) || '' : '', st.pr ? 1 : '', ex.note || '', s.post?.note || '', s.pre?.condition ?? '', s.pre?.fatigue ?? '', s.post?.satisfaction ?? '']);
      });
    }
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export const APP_ID = 'push-and-pull';
export const SCHEMA = 1;
export function validateBackup(o) {
  if (!o || typeof o !== 'object') return '파일 형식이 올바르지 않습니다.';
  if (o.app !== APP_ID) return '이 앱의 백업 파일이 아닙니다.';
  if (typeof o.schema !== 'number' || o.schema > SCHEMA) return '더 새로운 버전의 백업 파일입니다. 앱을 업데이트하세요.';
  const d = o.data;
  if (!d || typeof d !== 'object') return '백업 데이터가 비어 있습니다.';
  if (!d.exercises || typeof d.exercises !== 'object' || Array.isArray(d.exercises)) return '운동 라이브러리 데이터가 손상되었습니다.';
  if (!d.routines || typeof d.routines !== 'object' || Array.isArray(d.routines)) return '루틴 데이터가 손상되었습니다.';
  if (!Array.isArray(d.sessions)) return '운동 기록 데이터가 손상되었습니다.';
  for (const s of d.sessions) {
    if (!s || typeof s.id !== 'string' || typeof s.startedAt !== 'number' || !Array.isArray(s.exercises)) return '운동 기록 중 손상된 항목이 있습니다.';
    for (const e of s.exercises) if (!e || !e.snap || !Array.isArray(e.sets)) return '운동 기록 중 손상된 항목이 있습니다.';
  }
  return null;
}
