import { DEFAULT_EXERCISES, DEFAULT_ROUTINES } from './data.js';
import { APP_ID, SCHEMA, validateBackup } from './logic.js';

const KEY = 'pp:v1';
export const uid = () => (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const clone = (o) => JSON.parse(JSON.stringify(o));

/** The whole persisted document. Shaped so a future cloud sync can diff by id + updatedAt. */
export const S = {
  schema: SCHEMA,
  settings: { sound: true, vibrate: true, wakeLock: true, barWeight: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], bodyweight: 0, warmupRest: 45 },
  exercises: {},      // id -> exercise definition (library)
  routines: {},       // id -> {id,name,desc,items:[{id,exerciseId,sets,repMin,repMax,rir,rest}]}
  routineOrder: [],
  sessions: [],       // finished + the one active session. Each holds snapshots => immune to routine edits
  activeId: null,
  timer: null,        // {endAt, duration, paused, remaining, label, fired}
  meta: { createdAt: Date.now(), updatedAt: Date.now() },
};

export const status = { memoryOnly: false, lastError: null, corrupt: false };
let onError = () => {};
export const setErrorHandler = (f) => (onError = f);

function seed() {
  S.exercises = {};
  for (const e of DEFAULT_EXERCISES) S.exercises[e.id] = clone(e);
  S.routines = {}; S.routineOrder = [];
  for (const r of DEFAULT_ROUTINES) {
    S.routines[r.id] = { id: r.id, name: r.name, desc: r.desc, builtin: true, updatedAt: Date.now(), items: r.items.map((i) => ({ id: uid(), ...i })) };
    S.routineOrder.push(r.id);
  }
}

/** Add missing built-in exercises/routines without touching user edits. Returns #added. */
export function restoreDefaults() {
  let n = 0;
  for (const e of DEFAULT_EXERCISES) if (!S.exercises[e.id]) { S.exercises[e.id] = clone(e); n++; }
  for (const r of DEFAULT_ROUTINES) if (!S.routines[r.id]) {
    S.routines[r.id] = { id: r.id, name: r.name, desc: r.desc, builtin: true, updatedAt: Date.now(), items: r.items.map((i) => ({ id: uid(), ...i })) };
    S.routineOrder.push(r.id); n++;
  }
  save();
  return n;
}

function adopt(d) {
  const keep = { settings: { ...S.settings, ...(d.settings || {}) } };
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, {
    schema: SCHEMA, exercises: {}, routines: {}, routineOrder: [], sessions: [], activeId: null, timer: null,
    meta: { createdAt: Date.now(), updatedAt: Date.now() }, ...d, ...keep,
  });
  S.routineOrder = (S.routineOrder || []).filter((id) => S.routines[id]);
  for (const id of Object.keys(S.routines)) if (!S.routineOrder.includes(id)) S.routineOrder.push(id);
  if (S.activeId && !S.sessions.find((s) => s.id === S.activeId && s.status === 'active')) S.activeId = null;
  S.schema = SCHEMA;
}

export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { status.memoryOnly = true; }
  if (raw) {
    try {
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || !d.exercises || !d.routines || !Array.isArray(d.sessions)) throw new Error('shape');
      adopt(d);
      return;
    } catch (e) {
      // Never silently discard: keep the unreadable blob under another key.
      status.corrupt = true;
      try { localStorage.setItem(KEY + ':corrupt-' + Date.now(), raw); } catch (_) {}
    }
  }
  seed();
  save();
}

export function save() {
  S.meta.updatedAt = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
    status.lastError = null;
    return true;
  } catch (e) {
    status.lastError = e;
    onError(e);
    return false;
  }
}

export function exportJSON() {
  return JSON.stringify({ app: APP_ID, schema: SCHEMA, exportedAt: new Date().toISOString(), data: S }, null, 1);
}

/** Replace all data from a backup string. Returns error message or null. Keeps a safety copy of current data. */
export function importJSON(text) {
  let o;
  try { o = JSON.parse(text); } catch { return '파일을 읽을 수 없습니다. JSON 형식이 아닙니다.'; }
  const err = validateBackup(o);
  if (err) return err;
  try { localStorage.setItem(KEY + ':before-restore', JSON.stringify(S)); } catch (_) {}
  adopt(clone(o.data));
  if (!Object.keys(S.exercises).length) restoreDefaults();
  return save() ? null : '저장 공간이 부족해 복원에 실패했습니다.';
}

export function resetAll() {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, { schema: SCHEMA, settings: { sound: true, vibrate: true, wakeLock: true, barWeight: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], bodyweight: 0, warmupRest: 45 }, sessions: [], activeId: null, timer: null, meta: { createdAt: Date.now(), updatedAt: Date.now() } });
  seed();
  save();
}

// ---------- Rest timer (timestamp based => survives lock screen / app switch / reload) ----------
export const timer = {
  start(seconds, label) { S.timer = { endAt: Date.now() + seconds * 1000, duration: seconds, paused: false, remaining: seconds, label, fired: false }; save(); },
  remaining() {
    const t = S.timer; if (!t) return 0;
    return t.paused ? t.remaining : Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000));
  },
  /** seconds past zero (0 while running/paused) */
  overtime() { const t = S.timer; return t && !t.paused && Date.now() > t.endAt ? Math.floor((Date.now() - t.endAt) / 1000) : 0; },
  pause() { const t = S.timer; if (!t || t.paused) return; t.remaining = this.remaining(); t.paused = true; save(); },
  resume() { const t = S.timer; if (!t || !t.paused) return; t.endAt = Date.now() + t.remaining * 1000; t.paused = false; t.fired = t.remaining <= 0; save(); },
  adjust(delta) {
    const t = S.timer; if (!t) return;
    const rem = Math.max(0, this.remaining() + delta);
    t.duration = Math.max(1, t.duration + delta);
    if (t.paused) t.remaining = rem; else t.endAt = Date.now() + rem * 1000;
    if (rem > 0) t.fired = false;
    save();
  },
  reset() { const t = S.timer; if (!t) return; t.paused = false; t.endAt = Date.now() + t.duration * 1000; t.remaining = t.duration; t.fired = false; save(); },
  stop() { S.timer = null; save(); },
};
