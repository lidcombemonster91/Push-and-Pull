import { S, uid, load, save, status, setErrorHandler, timer, exportJSON, importJSON, resetAll, restoreDefaults } from './store.js';
import * as L from './logic.js';
import { MUSCLES, EQUIPMENT } from './data.js';
import { icon } from './icons.js';

const { MODES, fmtNum, fmtTime, ymd } = L;
const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet');
const $toast = document.getElementById('toast');
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

const ui = {
  tab: 'today', inWorkout: false, routineId: null, sessionId: null, sheet: null,
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(), day: null,
  period: '3m', metric: 'e1rm', progEx: null, setIdx: null,
};

// ================= helpers =================
const active = () => S.sessions.find((s) => s.id === S.activeId && s.status === 'active') || null;
const exName = (e) => `${esc(e.ko)}<small class="en">${esc(e.name)}</small>`;
const snapName = (snap) => `${esc(snap.ko || snap.name)}<small class="en">${esc(snap.name)}</small>`;
const doneSets = (sess) => sess.exercises.reduce((a, e) => a + (e.skipped ? 0 : e.sets.filter((s) => s.done).length), 0);
const totalSets = (sess) => sess.exercises.reduce((a, e) => a + (e.skipped ? 0 : e.sets.length), 0);
const finished = () => S.sessions.filter((s) => s.status === 'done').sort((a, b) => b.startedAt - a.startedAt);
const fmtDate = (t) => { const d = new Date(t); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS[(d.getDay() + 6) % 7]})`; };
const fmtClock = (t) => new Date(t).toTimeString().slice(0, 5);
const fmtVol = (v) => (v >= 10000 ? (v / 1000).toFixed(1) + 't' : Math.round(v) + 'kg');
const range = (e) => `${e.repMin}~${e.repMax}`;

function toast(msg, kind = '') {
  $toast.textContent = msg; $toast.className = 'show ' + kind;
  clearTimeout(toast.t); toast.t = setTimeout(() => ($toast.className = ''), 2600);
}
setErrorHandler(() => toast('저장 실패: 저장 공간이 부족합니다. 설정에서 백업 후 정리하세요.', 'bad'));

// ================= audio / vibration / wake lock =================
let actx = null;
function unlockAudio() {
  try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (_) {}
}
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, unlockAudio, { passive: true }));
function beep() {
  if (!S.settings.sound || !actx) return;
  try {
    [0, 0.22, 0.44].forEach((d, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = i === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, actx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.35, actx.currentTime + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d + 0.18);
      o.connect(g).connect(actx.destination); o.start(actx.currentTime + d); o.stop(actx.currentTime + d + 0.2);
    });
  } catch (_) {}
}
const buzz = (p) => { if (S.settings.vibrate && navigator.vibrate) try { navigator.vibrate(p); } catch (_) {} };
let wake = null;
async function wakeLock(on) {
  try {
    if (on && S.settings.wakeLock && 'wakeLock' in navigator && !wake && !document.hidden) {
      wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => (wake = null));
    } else if (!on && wake) { await wake.release(); wake = null; }
  } catch (_) { wake = null; }
}

// ================= session engine =================
function snapOf(ex, cfg) {
  return { name: ex.name, ko: ex.ko, mode: ex.mode, primary: [...ex.primary], secondary: [...(ex.secondary || [])], repMin: cfg.repMin, repMax: cfg.repMax, rir: cfg.rir, rest: cfg.rest, inc: ex.inc, rule: ex.rule || 'strict' };
}
const lastHist = (exerciseId, mode) => L.history(S.sessions, exerciseId, mode, S.activeId);

function newSet(type, weight, reps, rir) { return { id: uid(), type, weight, reps, rir, done: false, def: weight }; }
function buildExercise(exerciseId, cfg) {
  const ex = S.exercises[exerciseId];
  const snap = snapOf(ex, cfg);
  const h = lastHist(exerciseId, ex.mode)[0];
  const pw = h ? L.doneWork(h) : [];
  const sets = [];
  for (let i = 0; i < cfg.sets; i++) {
    const p = pw.length ? pw[Math.min(i, pw.length - 1)] : null;
    // First time: weight stays empty (never invent a weight). Reps default to previous reps / range floor.
    sets.push(newSet('work', p ? p.weight : null, p ? p.reps : cfg.repMin, cfg.rir));
  }
  return { id: uid(), exerciseId, snap, skipped: false, formBreak: false, note: '', sets };
}

function startSession(routineId, o) {
  if (active()) { ui.inWorkout = true; return render(); }
  const r = S.routines[routineId];
  if (!r || !r.items.length) return toast('루틴에 운동이 없습니다. 먼저 운동을 추가하세요.', 'bad');
  const items = r.items.filter((i) => S.exercises[i.exerciseId]);
  if (!items.length) return toast('루틴의 운동 정보를 찾을 수 없습니다.', 'bad');
  const fit = L.fitToTime(items, o.minutes);
  const sess = {
    id: uid(), routineId, routineName: r.name, startedAt: Date.now(), endedAt: null, status: 'active',
    pre: { condition: o.cond, fatigue: o.fat }, post: null, pain: [], curEx: 0, timeLimit: o.minutes || 0,
    exercises: fit.items.map((i) => buildExercise(i.exerciseId, i)),
  };
  S.sessions.push(sess); S.activeId = sess.id; S.timer = null; save();
  ui.inWorkout = true; ui.setIdx = null; ui.sheet = null;
  wakeLock(true);
  if (fit.removedSets || fit.dropped.length) toast(`${o.minutes}분 제한: 세트 ${fit.removedSets}개 감소${fit.dropped.length ? `, 운동 ${fit.dropped.length}개 제외` : ''}`);
  render();
}

function selectedSet(ex) {
  if (ui.setIdx != null && ex.sets[ui.setIdx]) return ui.setIdx;
  const i = ex.sets.findIndex((s) => !s.done);
  return i >= 0 ? i : -1;
}
function prevFor(ex, idx) {
  const st = ex.sets[idx];
  const h = lastHist(ex.exerciseId, ex.snap.mode)[0];
  if (!h) return null;
  const list = h.sets.filter((s) => s.done && s.type === st.type && s.reps > 0);
  const k = ex.sets.slice(0, idx).filter((s) => s.type === st.type).length;
  return list[k] || null;
}
function suggestionFor(ex) {
  const h = lastHist(ex.exerciseId, ex.snap.mode);
  return L.suggest(h, { repMin: ex.snap.repMin, repMax: ex.snap.repMax, rir: ex.snap.rir, inc: ex.snap.inc, ladder: ladderOf(ex) }, ex.snap.rule || 'strict');
}

const ladderOf = (ex) => (ex.snap.mode === 'perHand' && S.settings.dumbbells?.length ? S.settings.dumbbells : null);
const restFor = (ex, st) => (Number.isFinite(st.rest) ? st.rest : st.type === 'warmup' ? Math.min(ex.snap.rest, S.settings.warmupRest) : ex.snap.rest);
function completeSet(ex, idx) {
  const st = ex.sets[idx], sess = active();
  const bw = ex.snap.mode === 'bodyweight';
  if (!(st.reps > 0)) return toast('반복수를 입력하세요', 'bad');
  if (!bw && !(st.weight > 0)) return toast('중량을 입력하세요', 'bad');
  if (bw && st.weight == null) st.weight = 0;
  st.done = true; st.doneAt = Date.now(); st.pr = false;
  if (st.type === 'work') {
    const b = L.bestBefore(S.sessions, ex.exerciseId, ex.snap.mode, sess.id);
    let maxW = b.maxW, best1 = b.best1;
    for (const o of sess.exercises) if (o.exerciseId === ex.exerciseId) for (const s of o.sets) if (s !== st && s.done && s.type === 'work') { maxW = Math.max(maxW, s.weight || 0); best1 = Math.max(best1, L.e1rm(s.weight, s.reps)); }
    if (b.any && st.weight > 0 && (st.weight > maxW || L.e1rm(st.weight, st.reps) > best1)) { st.pr = true; toast('개인 최고 기록 달성!', 'pr'); buzz([40, 60, 40]); }
  }
  // Carry the weight you just used to later, untouched work sets (empty first-timers, or flat history defaults),
  // so you only adjust up/down from the last weight instead of starting from 0 again.
  if (st.type === 'work' && st.weight > 0) {
    for (let j = idx + 1; j < ex.sets.length; j++) {
      const n = ex.sets[j];
      if (n.done || n.type !== 'work') continue;
      const nd = n.def ?? null, sd = st.def ?? null;
      if ((n.weight ?? null) === nd && nd === sd && st.weight !== sd) n.weight = st.weight;
    }
  }
  const rest = restFor(ex, st);
  // Superset: no rest between the two linked exercises; rest only after the second one.
  const sess2 = active(), i = sess2.exercises.indexOf(ex);
  const first = !!ex.link, pIdx = first ? i + 1 : sess2.exercises[i - 1]?.link ? i - 1 : -1;
  const partner = sess2.exercises[pIdx];
  const pending = partner && !partner.skipped && partner.sets.some((x) => x.done === false);
  if (first && pending) { sess2.curEx = pIdx; toast('슈퍼세트 · 바로 다음 운동으로'); }
  else { timer.start(rest, ex.snap.ko); if (pending) sess2.curEx = pIdx; }
  ui.setIdx = null; ui.focusPanel = true;
  save(); render();
}

function finishSession(post) {
  const sess = active(); if (!sess) return null;
  for (const ex of sess.exercises) {
    ex.sets = ex.sets.filter((s) => s.done);
    if (!ex.sets.length) ex.skipped = true;
  }
  sess.status = 'done'; sess.endedAt = Date.now(); sess.post = post;
  S.activeId = null; S.timer = null; save();
  ui.inWorkout = false; wakeLock(false);
  return sess;
}

// ================= rendering: shell =================
const NAV = [['today', 'Today', '오늘'], ['routines', 'Routines', '루틴'], ['history', 'History', '기록'], ['progress', 'Progress', '성장'], ['settings', 'Settings', '설정']];

function render() {
  const sc = document.querySelector('main')?.scrollTop || 0;
  let body;
  if (ui.inWorkout && active()) body = workoutView();
  else {
    ui.inWorkout = false;
    body = ({ today: todayView, routines: routinesView, history: historyView, progress: progressView, settings: settingsView }[ui.tab])();
  }
  const inW = ui.inWorkout;
  $app.innerHTML = `<main class="${inW ? 'wo' : ''}">${status.memoryOnly ? '<div class="banner bad">이 브라우저는 저장소를 막고 있어 새로고침하면 기록이 사라집니다.</div>' : ''}${body}</main>
  ${inW ? '' : `<nav>${NAV.map(([k, en, ko]) => `<button data-a="tab" data-id="${k}" class="${ui.tab === k ? 'on' : ''}" aria-label="${en}">${icon(k)}<span>${en}</span><em>${ko}</em></button>`).join('')}</nav>`}`;
  const m = document.querySelector('main'); if (m) m.scrollTop = sc;
  if (ui.focusPanel) { ui.focusPanel = false; const pn = document.querySelector('.panel') || document.querySelector('.exhead'); pn?.scrollIntoView({ block: pn.classList.contains('panel') ? 'end' : 'start' }); }
  renderSheet();
  const lad = document.getElementById('ladder'), on = lad?.querySelector('.on');
  if (lad && on) lad.scrollLeft = on.offsetLeft - lad.clientWidth / 2 + on.clientWidth / 2;
  fillPersist();
  tick(true);
}
async function fillPersist() {
  const el = document.getElementById('persist'); if (!el) return;
  let t = '저장소 상태를 확인할 수 없는 브라우저예요. 주기적으로 JSON 백업을 하세요.';
  try {
    if (status.memoryOnly) t = '저장소: 사용할 수 없음 — 이 브라우저는 저장을 막고 있어요. 새로고침하면 기록이 사라집니다.';
    else if (navigator.storage?.persisted) t = (await navigator.storage.persisted()) ? '저장소: 영구 보존이 허용되어 있어요 (브라우저가 임의로 지우지 않아요).' : '저장소: 브라우저가 공간이 부족하면 지울 수 있어요. 홈 화면에 추가하고 주기적으로 JSON 백업을 하세요.';
    else t = '저장소: 이 기기의 브라우저에 저장 중이에요. 영구 보존 여부는 이 브라우저에서 확인할 수 없어요. 주기적으로 JSON 백업을 하세요.';
  } catch (_) {}
  const again = document.getElementById('persist'); if (again) again.textContent = t;
}

// ================= Today =================
function nextRoutineId() {
  const last = finished()[0];
  const order = S.routineOrder;
  if (!order.length) return null;
  if (!last) return order[0];
  const i = order.indexOf(last.routineId);
  return order[(i + 1) % order.length];
}
function todayView() {
  const a = active();
  const now = Date.now(), ws = L.weekStart(now);
  const week = finished().filter((s) => s.startedAt >= ws);
  const wk = week.reduce((acc, s) => { const t = L.sessionStats(s, S.settings.bodyweight); acc.v += t.volume; acc.s += t.sets; return acc; }, { v: 0, s: 0 });
  const next = nextRoutineId();
  const last = finished()[0];
  const d = new Date();
  return `<header class="top"><div><h1>${d.getMonth() + 1}월 ${d.getDate()}일</h1><p class="mu">${DAYS[(d.getDay() + 6) % 7]}요일</p></div></header>
  ${a ? `<section class="card resume"><div><b>진행 중인 운동</b><p class="mu">${esc(a.routineName)} · ${doneSets(a)}/${totalSets(a)}세트 · ${fmtClock(a.startedAt)} 시작</p></div><button class="btn primary" data-a="resume">이어하기</button></section>` : ''}
  ${L.recoveryAdvice(S.sessions).map((r) => `<div class="advice ${r.level}"><b>${r.level === 'rest' ? '휴식 제안' : '디로드 제안'}</b><p>${esc(r.msg)}</p></div>`).join('')}
  <section class="week">
    <div><span class="big">${week.length}</span><span class="mu">이번 주 운동</span></div>
    <div><span class="big">${wk.s}</span><span class="mu">완료 세트</span></div>
    <div><span class="big">${fmtVol(wk.v)}</span><span class="mu">총 볼륨</span></div>
  </section>
  <h2>루틴 선택</h2>
  <div class="list">${S.routineOrder.map((id) => { const r = S.routines[id]; return `<button class="row routine ${id === next ? 'next' : ''}" data-a="openStart" data-id="${esc(id)}" ${a ? 'disabled' : ''}>
      <div><b>${esc(r.name)}</b><p class="mu">${esc(r.desc || '')} · ${r.items.length}종목 · 약 ${Math.round(L.estimateSec(r.items) / 60)}분</p></div>
      ${id === next ? '<span class="tag">다음 순서</span>' : icon('chev')}</button>`; }).join('') || '<p class="empty">루틴이 없습니다. Routines 탭에서 새 루틴을 만드세요.</p>'}</div>
  ${a ? '<p class="mu small">진행 중인 운동을 끝내면 새 운동을 시작할 수 있습니다.</p>' : ''}
  ${last ? `<h2>최근 운동</h2><button class="row" data-a="openSession" data-id="${esc(last.id)}"><div><b>${esc(last.routineName)}</b><p class="mu">${fmtDate(last.startedAt)} · ${fmtVol(L.sessionStats(last, S.settings.bodyweight).volume)}</p></div>${icon('chev')}</button>` : '<p class="empty">아직 기록이 없습니다. 루틴을 선택해 첫 운동을 시작하세요.<br>첫 운동에서는 중량을 직접 입력하고, 다음부터 지난 기록이 자동으로 채워집니다.</p>'}`;
}

// ================= Workout =================
function workoutView() {
  const s = active();
  const ci = clamp(s.curEx, 0, s.exercises.length - 1); s.curEx = ci;
  const ex = s.exercises[ci];
  const done = doneSets(s), total = totalSets(s);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const lib = S.exercises[ex.exerciseId];
  const sel = selectedSet(ex);
  const sug = ex.skipped ? null : suggestionFor(ex);
  const hist = lastHist(ex.exerciseId, ex.snap.mode);
  const anyHistOtherMode = !hist.length && S.sessions.some((x) => x.status === 'done' && x.exercises.some((e) => e.exerciseId === ex.exerciseId && e.snap.mode !== ex.snap.mode));
  return `<header class="wtop">
    <button class="icon-btn" data-a="exitWorkout" aria-label="닫기 (기록은 저장됨)">${icon('down')}</button>
    <div class="wtitle"><b>${esc(s.routineName)}</b><span class="mu" id="elapsed">${fmtTime((Date.now() - s.startedAt) / 1000)}</span></div>
    <button class="btn small" data-a="openFinish">종료</button></header>
  <div class="prog"><i style="width:${pct}%"></i></div>
  <div class="strip" role="tablist">${s.exercises.map((e, i) => { const d = e.sets.filter((x) => x.done).length; const cls = e.skipped ? 'skip' : d === e.sets.length && d ? 'full' : d ? 'part' : ''; return `<button class="chip ${i === ci ? 'on' : ''} ${cls} ${e.link ? 'lnk' : ''}" data-a="selEx" data-id="${i}">${i + 1}</button>`; }).join('')}
    <button class="chip" data-a="openExList" aria-label="운동 순서/추가">${icon('list')}</button></div>
  <section class="ex">
    <div class="exhead"><h2>${snapName(ex.snap)}</h2>
      <p class="mu">${ex.snap.primary.map(esc).join(', ')}${ex.snap.secondary.length ? ` <span class="dim">· ${ex.snap.secondary.map(esc).join(', ')}</span>` : ''}</p>
      <p class="target">${ex.sets.filter((x) => x.type === 'work').length}세트 × ${range(ex.snap)}회 · RIR ${ex.snap.rir} · 휴식 ${ex.snap.rest}초 <span class="tag">${MODES[ex.snap.mode]}</span></p></div>
    ${ex.skipped ? `<div class="card center"><p class="mu">이 운동은 건너뛰었습니다.</p><button class="btn" data-a="unskip">건너뛰기 취소</button></div>` : `
    ${sug ? `<div class="sug ${sug.type}"><div><b>${sug.type === 'increase' ? '증량 제안' : sug.type === 'reduce' ? '중량 조정 제안' : sug.type === 'manual' ? '수동 모드' : '이번엔 유지'}</b><p>${esc(sug.msg)}</p></div>${sug.type === 'increase' || sug.type === 'reduce' ? `<button class="btn small" data-a="applySug">${ex.sugApplied ? '적용됨' : '적용'}</button>` : ''}</div>` : `<p class="mu small nohist">${anyHistOtherMode ? '운동 방식(중량 기준)이 바뀌어 지난 기록과 비교하지 않습니다.' : '지난 기록이 없습니다. 중량을 직접 입력하면 다음 운동부터 기준이 됩니다.'}</p>`}
    <div class="sets">${ex.sets.map((st, i) => setRow(ex, st, i, sel)).join('')}</div>
    ${sel >= 0 ? setPanel(ex, sel) : `<div class="card center"><p><b>모든 세트 완료</b></p>${s.exercises.some((e, i) => i > ci && !e.skipped && e.sets.some((x) => !x.done)) ? '<button class="btn primary big" data-a="nextEx">다음 운동</button>' : '<button class="btn primary big" data-a="openFinish">운동 마무리</button>'}</div>`}
    <div class="tools">
      <button class="btn" data-a="addSet">${icon('plus')} 세트</button>
      <button class="btn" data-a="delSet" ${ex.sets.length < 2 ? 'disabled' : ''}>${icon('minus')} 세트</button>
      <button class="btn ${sel >= 0 && ex.sets[sel].type === 'warmup' ? 'on' : ''}" data-a="toggleWarm" ${sel < 0 ? 'disabled' : ''}>워밍업</button>
      <button class="btn" data-a="skipEx">건너뛰기</button></div>`}
    <details class="acc" ${ui.guideOpen ? 'open' : ''} data-i="guide"><summary>자세 가이드</summary>${lib ? guideHTML(lib) : '<p class="mu">운동 정보가 삭제되었습니다.</p>'}</details>
    <details class="acc"><summary>메모 · 컨디션</summary>
      <textarea data-i="note" rows="3" placeholder="이 운동 메모 (세팅, 느낀 점)">${esc(ex.note)}</textarea>
      <label class="check"><input type="checkbox" data-c="formBreak" ${ex.formBreak ? 'checked' : ''}> 자세가 흔들렸어요 <span class="mu small">(증량 제안에서 제외)</span></label>
      <div class="tools"><button class="btn" data-a="openPain">통증/불편함 기록 ${s.pain.length ? `(${s.pain.length})` : ''}</button></div></details>
    <div class="tools">
      <button class="btn" data-a="openAlt">${icon('swap')} 대체 운동</button>
      ${ex.snap.mode === 'total' ? `<button class="btn" data-a="openPlate">플레이트 계산</button>` : ''}
      <button class="btn" data-a="nextEx" ${ci >= s.exercises.length - 1 ? 'disabled' : ''}>다음 ${icon('chev')}</button></div>
  </section>
  <div class="tbar" id="tbar">${timerBarHTML()}</div>`;
}

function guideHTML(e) {
  const rows = [['기구 세팅', e.setup], ['올바른 자세', e.form], ['호흡', e.breath], ['반복 속도', e.tempo], ['자주 하는 실수', e.mistakes]].filter((r) => r[1]);
  const alts = (e.alts || []).map((id) => S.exercises[id]).filter(Boolean);
  return `<dl class="guide">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}${alts.length ? `<dt>대체 운동</dt><dd>${alts.map((a) => esc(a.ko)).join(' · ')}</dd>` : ''}</dl>`;
}

const setCur = (st) => `${st.weight != null ? `${fmtNum(st.weight)}<i>kg</i>` : '<i>–</i>'} × ${st.reps || '–'}${st.rir != null ? `<i> @${st.rir}</i>` : ''}`;
function setRow(ex, st, i, sel) {
  const p = prevFor(ex, i);
  const wi = ex.sets.slice(0, i).filter((s) => s.type === 'work').length + 1;
  const label = st.type === 'warmup' ? 'W' : wi;
    return `<button class="srow ${st.done ? 'done' : ''} ${i === sel ? 'sel' : ''} ${st.type}" data-a="selSet" data-id="${i}">
    <span class="sn">${label}</span>
    <span class="prev">${p ? `${fmtNum(p.weight)}×${p.reps}` : '–'}</span>
    <span class="cur">${setCur(st)}</span>
    <span class="ck">${st.done ? (st.pr ? 'PR' : icon('check')) : ''}</span></button>`;
}

function setPanel(ex, idx) {
  const st = ex.sets[idx];
  const step = ex.snap.inc;
  const p = prevFor(ex, idx);
  const bw = ex.snap.mode === 'bodyweight';
  return `<div class="panel">
    <div class="pl">${st.type === 'warmup' ? '워밍업 세트' : `세트 ${ex.sets.slice(0, idx + 1).filter((s) => s.type === 'work').length}`} <span class="mu">${p ? `· 지난번 ${fmtNum(p.weight)}kg × ${p.reps}` : ''}</span></div>
    <div class="stepper"><button class="step" data-a="wStep" data-id="-1" aria-label="중량 감소">${icon('minus')}</button>
      <label class="val"><input data-c="wInput" inputmode="decimal" value="${st.weight != null ? fmtNum(st.weight) : ''}" placeholder="${bw ? '0' : '–'}" aria-label="중량 kg"><span>kg · ${MODES[ex.snap.mode]}</span></label>
      <button class="step" data-a="wStep" data-id="1" aria-label="중량 증가">${icon('plus')}</button></div>
    ${ladderOf(ex) ? `<div class="ladder" id="ladder" role="listbox" aria-label="보유 덤벨 무게 선택">${[...new Set(ladderOf(ex))].sort((a, b) => a - b).map((w) => `<button class="chip ${st.weight === w ? 'on' : ''}" data-a="pickW" data-id="${w}" role="option" aria-selected="${st.weight === w}">${fmtNum(w)}</button>`).join('')}</div>` : ''}
    <div class="stepper small"><button class="step" data-a="rStep" data-id="-1" aria-label="반복 감소">${icon('minus')}</button>
      <label class="val"><input data-c="rInput" inputmode="numeric" value="${st.reps ?? ''}" aria-label="반복수"><span>회</span></label>
      <button class="step" data-a="rStep" data-id="1" aria-label="반복 증가">${icon('plus')}</button></div>
    <div class="rir"><span class="mu">RIR</span>${[0, 1, 2, 3, 4].map((v) => `<button class="chip ${st.rir === v ? 'on' : ''}" data-a="setRir" data-id="${v}">${v === 4 ? '4+' : v}</button>`).join('')}</div>
    ${st.done ? `<button class="btn big" data-a="uncomplete">완료 취소</button>` : `<div class="restrow"><span class="mu">이 세트 휴식</span><button class="chip" data-a="restAdj" data-id="-15" aria-label="휴식 15초 감소">−15</button><b>${restFor(ex, st)}초</b><button class="chip" data-a="restAdj" data-id="15" aria-label="휴식 15초 증가">+15</button></div><button class="btn primary big" data-a="complete">${ex.link || active().exercises[active().exercises.indexOf(ex) - 1]?.link ? '세트 완료 · 슈퍼세트' : '세트 완료'}</button>`}
    <p class="mu small center">${ladderOf(ex) ? '보유 덤벨 목록에서 선택 · 설정에서 변경' : `증감 단위 ${fmtNum(step)}kg · 운동 정보에서 변경`}</p></div>`;
}

// ---- timer bar ----
const RING = 2 * Math.PI * 22;
function timerBarHTML() {
  const t = S.timer;
  const warn = `<button class="info" data-a="timerInfo" aria-label="타이머 알림 제한 안내">${icon('info')}</button>`;
  if (!t) return `<div class="tidle"><span class="mu">세트를 완료하면 휴식 타이머가 자동으로 시작됩니다</span>${warn}</div>`;
  const rem = timer.remaining();
  return `<div class="tmr ${rem === 0 ? 'end' : ''}"><svg class="ringsvg" viewBox="0 0 52 52" width="46" height="46"><circle cx="26" cy="26" r="22" class="bg"/><circle cx="26" cy="26" r="22" class="fg" id="ring" stroke-dasharray="${RING}" stroke-dashoffset="${RING * (1 - rem / Math.max(1, t.duration))}"/></svg>
    <div class="tt"><b id="tleft">${fmtTime(rem)}</b><span class="mu small" id="tlabel">${rem === 0 ? '휴식 끝 ' + (timer.overtime() ? '+' + fmtTime(timer.overtime()) : '') : esc(t.label || '휴식')}${t.paused ? ' · 일시정지' : ''}</span></div>
    <div class="tbtn"><button data-a="tAdj" data-id="-15" aria-label="15초 감소">−15</button><button data-a="${t.paused ? 'tResume' : 'tPause'}" aria-label="${t.paused ? '재개' : '일시정지'}">${icon(t.paused ? 'play' : 'pause')}</button><button data-a="tReset" aria-label="초기화">${icon('reset')}</button><button data-a="tAdj" data-id="15" aria-label="15초 추가">+15</button><button data-a="tStop" aria-label="건너뛰기">${icon('skip')}</button></div></div>
  <button class="tinfo" data-a="timerInfo">잠금 중에는 알림이 울리지 않아요 · 자세히</button>`;
}
let lastShown = null;
function tick(force) {
  const el = document.getElementById('tleft');
  const t = S.timer;
  const el2 = document.getElementById('elapsed');
  const s = active();
  if (el2 && s) el2.textContent = fmtTime((Date.now() - s.startedAt) / 1000);
  if (!t) return;
  const rem = timer.remaining();
  if (rem === 0 && !t.paused && !t.fired) {
    t.fired = true; save();
    if (timer.overtime() <= 5 && !document.hidden) { beep(); buzz([200, 100, 200]); toast('휴식 끝! 다음 세트를 시작하세요', 'pr'); }
    if (document.getElementById('tbar')) document.getElementById('tbar').innerHTML = timerBarHTML();
    return;
  }
  if (!el) return;
  if (!force && lastShown === rem + ':' + t.paused + ':' + (rem === 0 ? timer.overtime() : 0)) return;
  lastShown = rem + ':' + t.paused + ':' + (rem === 0 ? timer.overtime() : 0);
  el.textContent = fmtTime(rem);
  const ring = document.getElementById('ring');
  if (ring) ring.setAttribute('stroke-dashoffset', RING * (1 - rem / Math.max(1, t.duration)));
  const lab = document.getElementById('tlabel');
  if (lab) lab.textContent = (rem === 0 ? '휴식 끝 ' + (timer.overtime() ? '+' + fmtTime(timer.overtime()) : '') : t.label || '휴식') + (t.paused ? ' · 일시정지' : '');
  document.querySelector('.tmr')?.classList.toggle('end', rem === 0);
}
setInterval(() => tick(false), 250);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { if (ui.inWorkout) { wakeLock(true); render(); } else tick(true); }
});

// ================= Routines =================
function routinesView() {
  if (ui.routineId && S.routines[ui.routineId]) return routineEditor(S.routines[ui.routineId]);
  return `<header class="top"><h1>Routines</h1><button class="btn small" data-a="newRoutine">${icon('plus')} 새 루틴</button></header>
  <div class="list">${S.routineOrder.map((id) => { const r = S.routines[id]; return `<button class="row" data-a="openRoutine" data-id="${esc(id)}"><div><b>${esc(r.name)}</b><p class="mu">${esc(r.desc || '')} · ${r.items.length}종목</p><p class="mu small">${r.items.slice(0, 4).map((i) => esc(S.exercises[i.exerciseId]?.ko || '?')).join(' · ')}${r.items.length > 4 ? ' …' : ''}</p></div>${icon('chev')}</button>`; }).join('') || '<p class="empty">루틴이 없습니다.</p>'}</div>
  <h2>운동 라이브러리</h2>
  <div class="list"><button class="row" data-a="openLib"><div><b>운동 정보 보기 · 편집</b><p class="mu">${Object.keys(S.exercises).length}개 운동 · 직접 만든 운동 ${Object.values(S.exercises).filter((e) => e.custom).length}개</p></div>${icon('chev')}</button></div>`;
}
function routineEditor(r) {
  return `<header class="top"><button class="icon-btn" data-a="backRoutines" aria-label="뒤로">${icon('back')}</button><h1>루틴 편집</h1><button class="btn small danger" data-a="delRoutine">삭제</button></header>
  <label class="field">이름<input data-c="rName" value="${esc(r.name)}" maxlength="40"></label>
  <label class="field">설명<input data-c="rDesc" value="${esc(r.desc || '')}" maxlength="60"></label>
  <h2>운동 ${r.items.length}개 <span class="mu small">· 약 ${Math.round(L.estimateSec(r.items) / 60)}분</span></h2>
  <div class="list">${r.items.map((it, i) => { const e = S.exercises[it.exerciseId]; return `<div class="row item"><div class="grow" data-a="editItem" data-id="${i}"><b>${e ? exName(e) : '삭제된 운동'}</b><p class="mu">${it.sets} × ${it.repMin}~${it.repMax}회 · RIR ${it.rir} · 휴식 ${it.rest}초</p></div>
    <div class="mv"><button data-a="itemUp" data-id="${i}" ${i === 0 ? 'disabled' : ''} aria-label="위로">${icon('up')}</button><button data-a="itemDown" data-id="${i}" ${i === r.items.length - 1 ? 'disabled' : ''} aria-label="아래로">${icon('down')}</button><button data-a="itemDel" data-id="${i}" aria-label="삭제">${icon('x')}</button></div></div>`; }).join('') || '<p class="empty">운동을 추가하세요.</p>'}</div>
  <button class="btn primary big" data-a="addToRoutine">${icon('plus')} 운동 추가</button>
  <p class="mu small center">루틴을 수정해도 이미 저장된 운동 기록은 바뀌지 않습니다.</p>`;
}

// ================= History =================
function historyView() {
  if (ui.sessionId) return sessionDetail();
  const all = finished();
  const m = new Date(ui.month), y = m.getFullYear(), mo = m.getMonth();
  const first = new Date(y, mo, 1), startOff = (first.getDay() + 6) % 7, dim = new Date(y, mo + 1, 0).getDate();
  const byDay = {};
  for (const s of all) (byDay[ymd(s.startedAt)] ||= []).push(s);
  let cells = '';
  for (let i = 0; i < startOff; i++) cells += '<i></i>';
  for (let d = 1; d <= dim; d++) {
    const key = `${y}-${L.pad(mo + 1)}-${L.pad(d)}`, n = byDay[key]?.length || 0;
    cells += `<button class="day ${n ? 'has' : ''} ${ui.day === key ? 'sel' : ''} ${key === ymd(Date.now()) ? 'today' : ''}" data-a="pickDay" data-id="${key}" ${n ? '' : 'tabindex="-1"'}>${d}${n ? '<b></b>' : ''}</button>`;
  }
  const list = ui.day ? byDay[ui.day] || [] : all.filter((s) => { const d = new Date(s.startedAt); return d.getFullYear() === y && d.getMonth() === mo; });
  const monthCount = all.filter((s) => { const d = new Date(s.startedAt); return d.getFullYear() === y && d.getMonth() === mo; }).length;
  return `<header class="top"><h1>History</h1></header>
  <section class="cal"><div class="calh"><button class="icon-btn" data-a="calMonth" data-id="-1" aria-label="이전 달">${icon('back')}</button><b>${y}년 ${mo + 1}월 <span class="mu">· ${monthCount}회</span></b><button class="icon-btn" data-a="calMonth" data-id="1" aria-label="다음 달">${icon('chev')}</button></div>
  <div class="cg">${DAYS.map((d) => `<span>${d}</span>`).join('')}${cells}</div></section>
  ${ui.day ? `<p class="mu small">${ui.day} <button class="link" data-a="pickDay" data-id="">전체 보기</button></p>` : ''}
  <div class="list">${list.map((s) => { const t = L.sessionStats(s, S.settings.bodyweight); return `<button class="row" data-a="openSession" data-id="${esc(s.id)}"><div><b>${esc(s.routineName)}</b> ${t.prs ? `<span class="tag pr">PR ${t.prs}</span>` : ''}<p class="mu">${fmtDate(s.startedAt)} ${fmtClock(s.startedAt)} · ${Math.round(t.durationSec / 60)}분 · ${t.sets}세트 · ${fmtVol(t.volume)}</p></div>${icon('chev')}</button>`; }).join('') || `<p class="empty">${all.length ? '이 기간에 기록이 없습니다.' : '아직 완료한 운동이 없습니다.'}</p>`}</div>`;
}
function sessionDetail() {
  const s = S.sessions.find((x) => x.id === ui.sessionId);
  if (!s) { ui.sessionId = null; return historyView(); }
  const t = L.sessionStats(s, S.settings.bodyweight);
  return `<header class="top"><button class="icon-btn" data-a="backHistory" aria-label="뒤로">${icon('back')}</button><h1>${esc(s.routineName)}</h1><button class="btn small danger" data-a="delSession" data-id="${esc(s.id)}">삭제</button></header>
  <p class="mu">${fmtDate(s.startedAt)} ${fmtClock(s.startedAt)} – ${s.endedAt ? fmtClock(s.endedAt) : ''}</p>
  <section class="week"><div><span class="big">${Math.round(t.durationSec / 60)}분</span><span class="mu">운동 시간</span></div><div><span class="big">${t.sets}</span><span class="mu">세트</span></div><div><span class="big">${fmtVol(t.volume)}</span><span class="mu">총 볼륨</span></div></section>
  ${s.pre ? `<p class="mu small">운동 전 컨디션 ${s.pre.condition}/5 · 피로도 ${s.pre.fatigue}/5${s.timeLimit ? ` · 시간 제한 ${s.timeLimit}분` : ''}${s.post?.satisfaction ? ` · 만족도 ${s.post.satisfaction}/5` : ''}</p>` : ''}
  ${s.post?.note ? `<p class="note">${esc(s.post.note)}</p>` : ''}
  ${(s.pain || []).length ? `<div class="card warn"><b>통증/불편함</b>${s.pain.map((p) => `<p>${esc(p.part)} · 강도 ${p.level}/3${p.note ? ' · ' + esc(p.note) : ''}</p>`).join('')}</div>` : ''}
  ${s.exercises.map((e) => `<section class="card"><h3>${snapName(e.snap)} <span class="tag">${MODES[e.snap.mode]}</span></h3>${e.skipped ? '<p class="mu">건너뜀</p>' : `<table class="tbl"><tr><th>세트</th><th>중량</th><th>반복</th><th>RIR</th><th>추정 1RM</th></tr>${e.sets.map((st, i) => `<tr class="${st.type}"><td>${st.type === 'warmup' ? 'W' : e.sets.slice(0, i + 1).filter((x) => x.type === 'work').length}</td><td>${fmtNum(st.weight)}kg</td><td>${st.reps}</td><td>${st.rir ?? '–'}</td><td>${L.e1rm(st.weight, st.reps) ? fmtNum(L.e1rm(st.weight, st.reps)) : '–'}${st.pr ? ' <b class="pr">PR</b>' : ''}</td></tr>`).join('')}</table>`}${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}${e.formBreak ? '<p class="mu small">자세 흔들림 표시됨</p>' : ''}</section>`).join('')}`;
}

// ================= Progress =================
function lineChart(pts, key, unit) {
  if (pts.length < 2) return `<p class="empty">${pts.length ? '기록이 2회 이상 쌓이면 그래프가 표시됩니다.' : '이 기간에 기록이 없습니다.'}</p>`;
  const W = 320, H = 150, P = 28;
  const vals = pts.map((p) => p[key]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const X = (t) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - P - 8);
  const Y = (v) => H - 22 - ((v - lo) / (hi - lo)) * (H - 40);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p[key]).toFixed(1)}`).join(' ');
  const md = (t) => { const x = new Date(t); return `${x.getMonth() + 1}/${x.getDate()}`; };
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${key} 추이 그래프"><text x="2" y="${Y(hi) + 4}">${fmtNum(hi)}</text><text x="2" y="${Y(lo) + 4}">${fmtNum(lo)}</text>
  <line x1="${P}" x2="${W - 8}" y1="${Y(hi)}" y2="${Y(hi)}" class="grid"/><line x1="${P}" x2="${W - 8}" y1="${Y(lo)}" y2="${Y(lo)}" class="grid"/>
  <path d="${d}" class="ln"/>${pts.map((p) => `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p[key]).toFixed(1)}" r="3.5" class="pt"/>`).join('')}
  <text x="${P}" y="${H - 4}" class="ax">${md(t0)}</text><text x="${W - 8}" y="${H - 4}" class="ax" text-anchor="end">${md(t1)}</text></svg><p class="mu small center">단위: ${unit}</p>`;
}
function progressView() {
  const sessions = L.inPeriod(S.sessions, ui.period);
  const allDone = finished();
  const counts = {};
  for (const s of allDone) for (const e of s.exercises) if (!e.skipped && e.sets.length) counts[e.exerciseId] = (counts[e.exerciseId] || 0) + 1;
  const exIds = Object.keys(counts).sort((a, b) => counts[b] - counts[a]); // most-logged first
  if (!ui.progEx || !exIds.includes(ui.progEx)) ui.progEx = exIds[0] || null;
  const label = (id) => S.exercises[id]?.ko || allDone.flatMap((s) => s.exercises).find((e) => e.exerciseId === id)?.snap.ko || id;
  const total = sessions.reduce((a, s) => { const t = L.sessionStats(s, S.settings.bodyweight); a.v += t.volume; a.s += t.sets; a.d += t.durationSec; return a; }, { v: 0, s: 0, d: 0 });
  const pts = ui.progEx ? L.exerciseSeries(sessions, ui.progEx, S.settings.bodyweight) : [];
  const M = { e1rm: ['추정 1RM', 'kg'], maxW: ['최고 중량', 'kg'], volume: ['볼륨', 'kg'], totalReps: ['총 반복수', '회'] };
  const wk = L.weeklyMuscleSets(allDone);
  const thisWk = wk[L.weekStart(Date.now())] || {};
  const prevWk = wk[L.weekStart(Date.now()) - 7 * 86400000] || {};
  const musc = MUSCLES.filter((m) => thisWk[m] || prevWk[m]);
  const maxSets = Math.max(10, ...musc.map((m) => Math.max(thisWk[m] || 0, prevWk[m] || 0)));
  const prs = allDone.flatMap((s) => s.exercises.flatMap((e) => e.sets.filter((x) => x.pr).map((x) => ({ s, e, x })))).slice(0, 8);
  const best = pts.length ? { w: Math.max(...pts.map((p) => p.maxW)), r: Math.max(...pts.map((p) => p.e1rm)) } : null;
  return `<header class="top"><h1>Progress</h1></header>
  <div class="seg">${[['1m', '1개월'], ['3m', '3개월'], ['6m', '6개월'], ['all', '전체']].map(([k, n]) => `<button class="${ui.period === k ? 'on' : ''}" data-a="period" data-id="${k}">${n}</button>`).join('')}</div>
  <section class="week"><div><span class="big">${sessions.length}</span><span class="mu">운동 횟수</span></div><div><span class="big">${fmtVol(total.v)}</span><span class="mu">총 볼륨</span></div><div><span class="big">${Math.round(total.d / 60)}분</span><span class="mu">총 운동 시간</span></div></section>
  ${exIds.length ? `<h2>운동별 추이</h2>
  <select data-c="progEx" aria-label="운동 선택">${exIds.map((id) => `<option value="${esc(id)}" ${id === ui.progEx ? 'selected' : ''}>${esc(label(id))}</option>`).join('')}</select>
  <div class="seg small">${Object.entries(M).map(([k, [n]]) => `<button class="${ui.metric === k ? 'on' : ''}" data-a="metric" data-id="${k}">${n}</button>`).join('')}</div>
  <section class="card">${lineChart(pts, ui.metric, M[ui.metric][1])}${best ? `<p class="mu small center">기간 내 최고 중량 ${fmtNum(best.w)}kg · 최고 추정 1RM ${best.r ? fmtNum(best.r) + 'kg' : '–'}</p>` : ''}</section>
  ${pts.length ? `<table class="tbl"><tr><th>날짜</th><th>최고 중량</th><th>최고 반복</th><th>총 반복</th></tr>${[...pts].reverse().slice(0, 8).map((p) => `<tr><td>${fmtDate(p.t).split(' (')[0]}</td><td>${fmtNum(p.maxW)}kg</td><td>${p.reps}</td><td>${p.totalReps}</td></tr>`).join('')}</table>` : ''}
  <h2>부위별 주간 세트 수</h2>
  <section class="card">${musc.length ? musc.map((m) => `<div class="bar"><span>${m}</span><div><i class="a" style="width:${((thisWk[m] || 0) / maxSets) * 100}%"></i><i class="b" style="width:${((prevWk[m] || 0) / maxSets) * 100}%"></i></div><b>${fmtNum(thisWk[m] || 0)}<small class="mu"> / ${fmtNum(prevWk[m] || 0)}</small></b></div>`).join('') + '<p class="mu small">이번 주(밝은 막대) / 지난주 · 주요 근육 1세트, 보조 근육 0.5세트로 계산</p>' : '<p class="empty">이번 주/지난주 기록이 없습니다.</p>'}</section>
  ${prs.length ? `<h2>개인 최고 기록</h2><div class="list">${prs.map(({ s, e, x }) => `<div class="row"><div><b>${snapName(e.snap)}</b><p class="mu">${fmtNum(x.weight)}kg × ${x.reps} · ${fmtDate(s.startedAt)}</p></div><span class="tag pr">PR</span></div>`).join('')}</div>` : ''}`
    : '<p class="empty">운동을 완료하면 성장 그래프가 여기에 표시됩니다.</p>'}`;
}

// ================= Settings =================
function settingsView() {
  const st = S.settings;
  const nS = S.sessions.filter((s) => s.status === 'done').length;
  return `<header class="top"><h1>Settings</h1></header>
  <h2>타이머 · 화면</h2>
  <div class="list">
    ${toggle('sound', '휴식 종료 알림음')}${toggle('vibrate', '휴식 종료 진동', navigator.vibrate ? '' : '이 기기/브라우저는 진동을 지원하지 않습니다 (iPhone Safari 등)')}${toggle('wakeLock', '운동 중 화면 켜짐 유지', 'wakeLock' in navigator ? '' : '이 브라우저는 지원하지 않습니다')}
    <div class="row"><div><b>워밍업 휴식(최대)</b></div><input class="mini" data-c="sWarm" inputmode="numeric" value="${st.warmupRest}"><span class="mu">초</span></div></div>
  <p class="mu small pad">웹앱 제한: 화면이 잠기거나 앱이 백그라운드에 있으면 소리·진동·알림이 울리지 않을 수 있습니다. 대신 앱으로 돌아오면 남은 시간이 정확히 복원되고, 종료된 경우 경과 시간이 표시됩니다.</p>
  <h2>바벨 · 체중</h2>
  <div class="list"><div class="row"><div><b>바 무게</b></div><input class="mini" data-c="sBar" inputmode="decimal" value="${st.barWeight}"><span class="mu">kg</span></div>
    <div class="row"><div><b>보유 플레이트 (한쪽, kg)</b><p class="mu small">쉼표로 구분</p></div><input class="mid" data-c="sPlates" value="${st.plates.join(', ')}"></div>
    <div class="row"><div><b>보유 덤벨 (개당, kg)</b><p class="mu small">쉼표로 구분 · 덤벨 운동에서 이 목록으로 선택하고 ± 도 이 목록을 따라 이동</p></div><input class="mid" data-c="sDb" value="${(st.dumbbells || []).join(', ')}"></div>
    <div class="row"><div><b>체중 (선택)</b><p class="mu small">맨몸 운동 볼륨 계산용 · 0이면 추가 중량만</p></div><input class="mini" data-c="sBw" inputmode="decimal" value="${st.bodyweight || ''}" placeholder="0"><span class="mu">kg</span></div></div>
  <h2>데이터</h2>
  <p class="mu small pad">운동 ${nS}회 · 이 기기의 브라우저에만 저장됩니다. 기기 변경·브라우저 데이터 삭제 전에 꼭 백업하세요.</p>
  <div class="list"><button class="row" data-a="exportJson"><div><b>JSON 백업 내보내기</b><p class="mu small">모든 데이터 (복원 가능)</p></div>${icon('chev')}</button>
    <button class="row" data-a="importPick"><div><b>JSON 백업 복원</b><p class="mu small">현재 데이터를 백업 파일로 교체</p></div>${icon('chev')}</button>
    <button class="row" data-a="exportCsv"><div><b>CSV 기록 내보내기</b><p class="mu small">세트 단위, Excel/Numbers에서 열기</p></div>${icon('chev')}</button>
    <button class="row" data-a="restoreDef"><div><b>기본 운동/루틴 복원</b><p class="mu small">삭제한 기본 항목만 다시 추가 (수정한 항목은 유지)</p></div>${icon('chev')}</button>
    <button class="row danger" data-a="resetAll"><div><b>모든 데이터 초기화</b></div>${icon('chev')}</button></div>
  <input type="file" id="file" accept="application/json,.json" hidden>
  <p class="mu small pad" id="persist"></p>
  <p class="mu small pad">Push &amp; Pull v1 · kg 단위</p>`;
}
function toggle(k, label, note) {
  return `<label class="row tg"><div><b>${label}</b>${note ? `<p class="mu small">${note}</p>` : ''}</div><input type="checkbox" data-c="tg" data-k="${k}" ${S.settings[k] ? 'checked' : ''}><span class="sw"></span></label>`;
}

// ================= Sheets =================
function closeSheet() { ui.sheet = null; renderSheet(); }
function renderSheet() {
  const sh = ui.sheet;
  if (!sh) { $sheet.className = ''; $sheet.innerHTML = ''; document.body.classList.remove('locked'); return; }
  const f = SHEETS[sh.type];
  $sheet.className = 'open';
  document.body.classList.add('locked');
  $sheet.innerHTML = `<div class="scrim" data-a="closeSheet"></div><div class="sheetbox" role="dialog" aria-modal="true"><div class="grab"></div><button class="xbtn" data-a="closeSheet" aria-label="닫기">${icon('x')}</button>${f(sh)}</div>`;
}
const chips = (name, n, cur, labels) => `<div class="chips">${Array.from({ length: n }, (_, i) => i + 1).map((v) => `<button class="chip ${cur === v ? 'on' : ''}" data-a="${name}" data-id="${v}">${labels ? labels[v - 1] : v}</button>`).join('')}</div>`;

const SHEETS = {
  start(sh) {
    const r = S.routines[sh.rid];
    return `<h3>${esc(r.name)} 시작</h3>
    <p class="mu small">${r.items.length}종목 · 약 ${Math.round(L.estimateSec(r.items) / 60)}분</p>
    <label class="lab">운동 전 컨디션 <span class="mu">(1 나쁨 – 5 최고)</span></label>${chips('sCond', 5, sh.cond)}
    <label class="lab">피로도 <span class="mu">(1 없음 – 5 매우 피곤)</span></label>${chips('sFat', 5, sh.fat)}
    <label class="lab">시간 제한</label><div class="chips">${[[0, '없음'], [30, '30분'], [45, '45분'], [60, '60분']].map(([v, n]) => `<button class="chip ${sh.min === v ? 'on' : ''}" data-a="sMin" data-id="${v}">${n}</button>`).join('')}</div>
    ${sh.min ? `<p class="mu small">${(() => { const f = L.fitToTime(r.items, sh.min); return f.removedSets || f.dropped.length ? `세트 ${f.removedSets}개 줄이고 운동 ${f.dropped.length}개 제외 (후반 운동부터)` : '조정 없이 시간 안에 끝낼 수 있어요'; })()}</p>` : ''}
    ${sh.cond <= 2 || sh.fat >= 4 ? '<p class="warnline">컨디션이 좋지 않아요. 무리한 증량은 피하고 RIR을 여유 있게 잡으세요.</p>' : ''}
    <button class="btn primary big" data-a="doStart">운동 시작</button>`;
  },
  finish(sh) {
    const s = active(); const t = L.sessionStats({ ...s, endedAt: Date.now() }, S.settings.bodyweight);
    const left = totalSets(s) - doneSets(s);
    if (!t.sets && !s.exercises.some((e) => e.sets.some((x) => x.done)))
      return `<h3>기록된 세트가 없어요</h3><p class="mu">완료한 세트가 없습니다. 운동을 계속하거나 기록 없이 종료할 수 있어요.</p><button class="btn big" data-a="closeSheet">계속하기</button><button class="btn big danger" data-a="discard">기록 없이 종료</button>`;
    return `<h3>운동 종료</h3>
    <section class="week"><div><span class="big">${t.sets}</span><span class="mu">세트</span></div><div><span class="big">${fmtVol(t.volume)}</span><span class="mu">볼륨</span></div><div><span class="big">${Math.round(t.durationSec / 60)}분</span><span class="mu">시간</span></div></section>
    ${left ? `<p class="mu small">완료하지 않은 ${left}세트는 기록에서 제외됩니다.</p>` : ''}
    <label class="lab">만족도</label>${chips('sSat', 5, sh.sat, ['별로', '아쉬움', '보통', '좋음', '최고'])}
    <textarea id="postNote" rows="3" placeholder="오늘 운동 메모 (선택)">${esc(sh.note || '')}</textarea>
    <button class="btn primary big" data-a="doFinish">저장하고 종료</button><button class="btn big" data-a="closeSheet">계속 운동하기</button>`;
  },
  summary(sh) {
    const s = S.sessions.find((x) => x.id === sh.sid); const t = L.sessionStats(s, S.settings.bodyweight);
    return `<h3>수고했어요</h3><section class="week"><div><span class="big">${t.sets}</span><span class="mu">세트</span></div><div><span class="big">${fmtVol(t.volume)}</span><span class="mu">볼륨</span></div><div><span class="big">${t.prs}</span><span class="mu">신기록</span></div></section>
    <p class="mu center">${Math.round(t.durationSec / 60)}분 · 기록이 저장되었습니다</p><button class="btn primary big" data-a="closeSheet">확인</button>`;
  },
  exlist() {
    const s = active();
    return `<h3>운동 순서</h3><p class="mu small">↔ 버튼으로 바로 다음 운동과 슈퍼세트를 묶으면 두 운동을 번갈아 하고 휴식은 둘째 운동 뒤에만 시작해요.</p><div class="list" style="margin-top:10px">${s.exercises.map((e, i) => `<div class="row item"><div class="grow" data-a="jumpEx" data-id="${i}"><b>${i + 1}. ${snapName(e.snap)}</b><p class="mu small">${e.skipped ? '건너뜀' : `${e.sets.filter((x) => x.done).length}/${e.sets.length}세트`}${e.link ? ' · 슈퍼세트 ↔ 다음' : ''}</p></div>
      <div class="mv">${i < s.exercises.length - 1 ? `<button class="lk ${e.link ? 'on' : ''}" data-a="linkEx" data-id="${i}" aria-label="다음 운동과 슈퍼세트" aria-pressed="${!!e.link}">${icon('swap')}</button>` : ''}<button data-a="moveEx" data-id="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="위로">${icon('up')}</button><button data-a="moveEx" data-id="${i}" data-d="1" ${i === s.exercises.length - 1 ? 'disabled' : ''} aria-label="아래로">${icon('down')}</button></div></div>`).join('')}</div>
    <button class="btn big" data-a="addToSession">${icon('plus')} 운동 추가</button>`;
  },
  alt(sh) {
    const s = active(), ex = s.exercises[s.curEx], lib = S.exercises[ex.exerciseId];
    const alts = (lib?.alts || []).map((id) => S.exercises[id]).filter(Boolean);
    return `<h3>대체 운동</h3><p class="mu small">기구가 혼잡하거나 불편할 때 교체하세요. 서로 다른 운동의 중량은 비교하지 않고, 각 운동의 기록을 따로 불러옵니다.</p>
    <div class="list">${alts.map((a) => `<button class="row" data-a="replaceWith" data-id="${esc(a.id)}"><div><b>${exName(a)}</b><p class="mu small">${MODES[a.mode]} · ${a.sets}×${range(a)}</p></div>${icon('chev')}</button>`).join('') || '<p class="empty">등록된 대체 운동이 없습니다.</p>'}</div>
    <button class="btn big" data-a="pickReplace">라이브러리에서 선택</button>`;
  },
  plate(sh) {
    const s = active(), ex = s.exercises[s.curEx];
    const w = sh.w ?? ex.sets[selectedSet(ex)]?.weight ?? '';
    const r = L.plateCalc(num(w), S.settings.barWeight, S.settings.plates);
    return `<h3>플레이트 계산기</h3><label class="field">목표 총중량 (kg)<input id="plW" inputmode="decimal" data-i="plate" value="${esc(w)}"></label>
    <div id="plOut">${plateOut(r)}</div><p class="mu small">바 ${S.settings.barWeight}kg · 한쪽 플레이트 ${S.settings.plates.join(', ')}kg (설정에서 변경)</p>`;
  },
  pain() {
    const s = active();
    const parts = ['목', '어깨', '팔꿈치', '손목', '등', '허리', '엉덩이', '무릎', '발목', '기타'];
    return `<h3>통증 · 불편함 기록</h3>${s.pain.map((p, i) => `<div class="row"><div><b>${esc(p.part)}</b> <span class="mu">강도 ${p.level}/3</span><p class="mu small">${esc(p.note || '')}</p></div><button class="icon-btn" data-a="delPain" data-id="${i}" aria-label="삭제">${icon('x')}</button></div>`).join('')}
    <label class="lab">부위</label><div class="chips wrap">${parts.map((p) => `<button class="chip ${sheetState.pp === p ? 'on' : ''}" data-a="pickPart" data-id="${p}">${p}</button>`).join('')}</div>
    <label class="lab">강도</label>${chips('pickLvl', 3, sheetState.pl, ['약간', '불편', '심함'])}
    <input id="painNote" placeholder="메모 (선택) 예: 내릴 때 찌릿함" maxlength="120"><button class="btn primary big" data-a="addPain">기록 추가</button>
    <p class="mu small">통증이 계속되거나 심하면 운동을 중단하고 전문가와 상담하세요.</p>`;
  },
  picker(sh) {
    return `<h3>운동 선택</h3><input id="pickQ" data-i="pickQ" placeholder="이름·근육·기구 검색" value="${esc(sh.q || '')}"><div class="list" id="pickList">${pickList(sh.q || '')}</div>
    <button class="btn big" data-a="newExercise">${icon('plus')} 새 운동 만들기</button>`;
  },
  item(sh) {
    const r = S.routines[sh.rid], it = r.items[sh.idx], e = S.exercises[it.exerciseId];
    return `<h3>${e ? exName(e) : '삭제된 운동'}</h3>
    <div class="grid2"><label class="field">세트 수<input id="fSets" inputmode="numeric" value="${it.sets}"></label><label class="field">휴식(초)<input id="fRest" inputmode="numeric" value="${it.rest}"></label>
    <label class="field">반복 최소<input id="fMin" inputmode="numeric" value="${it.repMin}"></label><label class="field">반복 최대<input id="fMax" inputmode="numeric" value="${it.repMax}"></label>
    <label class="field">목표 RIR<input id="fRir" inputmode="numeric" value="${it.rir}"></label></div>
    <button class="btn primary big" data-a="saveItem">저장</button>
    <div class="tools"><button class="btn" data-a="replaceItem">${icon('swap')} 운동 교체</button>${e ? '<button class="btn" data-a="editExFromItem">운동 정보 편집</button>' : ''}</div>`;
  },
  lib(sh) {
    return `<h3>운동 라이브러리</h3><input id="pickQ" data-i="libQ" placeholder="검색" value="${esc(sh.q || '')}"><div class="list" id="pickList">${pickList(sh.q || '', true)}</div><button class="btn big" data-a="newExercise">${icon('plus')} 새 운동 만들기</button>`;
  },
  exedit(sh) {
    const e = sh.ex;
    const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, n]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
    const mus = (id, arr) => `<div class="chips wrap" id="${id}">${MUSCLES.map((m) => `<button type="button" class="chip ${arr.includes(m) ? 'on' : ''}" data-a="togMuscle" data-id="${id}" data-m="${m}">${m}</button>`).join('')}</div>`;
    return `<h3>${e.isNew ? '새 운동' : '운동 정보'}</h3>
    <label class="field">한글 이름<input id="xKo" value="${esc(e.ko)}" maxlength="40"></label><label class="field">영문 이름<input id="xName" value="${esc(e.name)}" maxlength="50"></label>
    <div class="grid2"><label class="field">기구${sel('xEq', EQUIPMENT.map((q) => [q, q]), e.equipment)}</label><label class="field">중량 기준${sel('xMode', Object.entries(MODES), e.mode)}</label></div>
    <label class="lab">주요 근육</label>${mus('xP', e.primary)}<label class="lab">보조 근육</label>${mus('xS', e.secondary)}
    <div class="grid2"><label class="field">기본 세트<input id="xSets" inputmode="numeric" value="${e.sets}"></label><label class="field">휴식(초)<input id="xRest" inputmode="numeric" value="${e.rest}"></label>
    <label class="field">반복 최소<input id="xMin" inputmode="numeric" value="${e.repMin}"></label><label class="field">반복 최대<input id="xMax" inputmode="numeric" value="${e.repMax}"></label>
    <label class="field">목표 RIR<input id="xRir" inputmode="numeric" value="${e.rir}"></label><label class="field">증량 단위(kg)<input id="xInc" inputmode="decimal" value="${e.inc}"></label></div>
    <label class="field">증량 제안 방식${sel('xRule', Object.entries(L.RULES), e.rule || 'strict')}</label>
    ${[['xSetup', '기구 세팅 방법', 'setup'], ['xForm', '올바른 자세', 'form'], ['xBreath', '호흡법', 'breath'], ['xTempo', '반복 속도', 'tempo'], ['xMis', '자주 발생하는 실수', 'mistakes']].map(([id, n, k]) => `<label class="field">${n}<textarea id="${id}" rows="2">${esc(e[k] || '')}</textarea></label>`).join('')}
    <label class="lab">대체 운동</label><div class="chips wrap">${(e.alts || []).map((id) => `<button type="button" class="chip on" data-a="rmAlt" data-id="${esc(id)}">${esc(S.exercises[id]?.ko || id)} ✕</button>`).join('')}<button type="button" class="chip" data-a="addAlt">${icon('plus')}</button></div>
    <button class="btn primary big" data-a="saveEx">저장</button>${!e.isNew && e.custom ? '<button class="btn big danger" data-a="delEx">이 운동 삭제</button>' : ''}`;
  },
  confirm(sh) {
    return `<h3>${esc(sh.title)}</h3><p class="mu">${esc(sh.msg)}</p><button class="btn big ${sh.danger ? 'danger' : 'primary'}" data-a="confirmOk">${esc(sh.ok || '확인')}</button><button class="btn big" data-a="closeSheet">취소</button>`;
  },
  info() {
    return `<h3>타이머 알림 안내</h3><ul class="info"><li><b>화면이 켜져 있을 때</b>: 종료 시 알림음${navigator.vibrate ? '·진동' : ''}이 울립니다 (설정에서 끌 수 있어요).</li>
    <li><b>화면 잠금/앱 전환</b>: 웹앱은 백그라운드에서 소리를 낼 수 없습니다. 다시 열면 실제 경과 시간 기준으로 <b>남은 시간이 정확히 복원</b>됩니다.</li>
    <li>${navigator.vibrate ? '이 기기는 진동을 지원합니다.' : '이 기기(iPhone Safari 등)는 웹 진동을 지원하지 않습니다.'}</li>
    <li>운동 중에는 화면 켜짐 유지(Wake Lock)를 사용해 잠김을 줄입니다. ${'wakeLock' in navigator ? '' : '(이 브라우저는 미지원)'}</li></ul><button class="btn big" data-a="closeSheet">확인</button>`;
  },
};
const sheetState = { pp: null, pl: 2 };
function plateOut(r) {
  if (r.error) return `<p class="mu">${r.error}</p>`;
  const lst = r.perSide.length ? r.perSide.map((p) => `<span class="plate p${String(p.plate).replace('.', '_')}"><b>${fmtNum(p.plate)}</b> × ${p.count}</span>`).join('') : '<span class="mu">바만 사용</span>';
  return `<div class="plates">${lst}</div><p>${r.ok ? `한쪽 합계 ${fmtNum((r.achieved - S.settings.barWeight) / 2)}kg · 총 <b>${fmtNum(r.achieved)}kg</b>` : `<span class="warnline">정확히 맞출 수 없어요. 가장 가까운 무게는 <b>${fmtNum(r.achieved)}kg</b> (남는 ${fmtNum(r.remainder * 2)}kg)</span>`}</p>`;
}
function pickList(q, lib) {
  const k = q.trim().toLowerCase();
  const arr = Object.values(S.exercises).filter((e) => !k || [e.ko, e.name, e.equipment, ...e.primary].join(' ').toLowerCase().includes(k)).sort((a, b) => a.ko.localeCompare(b.ko, 'ko'));
  return arr.map((e) => `<button class="row" data-a="${lib ? 'editEx' : 'pick'}" data-id="${esc(e.id)}"><div><b>${exName(e)}</b><p class="mu small">${e.primary.join(', ')} · ${e.equipment}${e.custom ? ' · 직접 만듦' : ''}</p></div>${icon('chev')}</button>`).join('') || '<p class="empty">검색 결과가 없습니다.</p>';
}
const confirmSheet = (title, msg, ok, run, danger = true) => { ui.sheet = { type: 'confirm', title, msg, ok, run, danger }; renderSheet(); };

// ================= Actions =================
const cur = () => { const s = active(); return s ? s.exercises[clamp(s.curEx, 0, s.exercises.length - 1)] : null; };
function blankExercise() {
  return { isNew: true, id: 'c-' + uid(), custom: true, name: '', ko: '', primary: [], secondary: [], equipment: '덤벨', mode: 'total', sets: 3, repMin: 8, repMax: 12, rir: 2, rest: 90, inc: 2.5, rule: 'strict', setup: '', form: '', breath: '', tempo: '', mistakes: '', alts: [] };
}
function readMuscles(id) { return [...document.querySelectorAll(`#${id} .chip.on`)].map((b) => b.dataset.m); }
function pickerReturn(exId) {
  const p = ui.pickCtx;
  const s = active();
  if (p === 'session-add') {
    const ex = S.exercises[exId];
    s.exercises.push(buildExercise(exId, { sets: ex.sets, repMin: ex.repMin, repMax: ex.repMax, rir: ex.rir, rest: ex.rest }));
    s.curEx = s.exercises.length - 1; ui.setIdx = null; closeSheet(); save(); render(); toast('운동을 추가했습니다');
  } else if (p === 'session-replace') replaceCurrent(exId);
  else if (p === 'routine-add') {
    const r = S.routines[ui.routineId], ex = S.exercises[exId];
    r.items.push({ id: uid(), exerciseId: exId, sets: ex.sets, repMin: ex.repMin, repMax: ex.repMax, rir: ex.rir, rest: ex.rest }); r.updatedAt = Date.now();
    save(); closeSheet(); render();
  } else if (p === 'routine-replace') {
    const r = S.routines[ui.routineId], it = r.items[ui.itemIdx], ex = S.exercises[exId];
    Object.assign(it, { exerciseId: exId, sets: ex.sets, repMin: ex.repMin, repMax: ex.repMax, rir: ex.rir, rest: ex.rest }); r.updatedAt = Date.now();
    save(); closeSheet(); render();
  } else if (p === 'alt-add') {
    const parent = ui.parentEx; ui.pickCtx = ui.prevCtx || 'lib';
    ui.editEx = { ...parent, alts: [...new Set([...(parent.alts || []), exId])].filter((i) => i !== parent.id) };
    ui.sheet = { type: 'exedit', ex: ui.editEx }; renderSheet();
  }
}
function replaceCurrent(newId) {
  const s = active(), i = s.curEx, old = s.exercises[i], ex = S.exercises[newId];
  if (!ex) return;
  const fresh = buildExercise(newId, { sets: old.sets.filter((x) => x.type === 'work').length || ex.sets, repMin: ex.repMin, repMax: ex.repMax, rir: ex.rir, rest: ex.rest });
  if (old.sets.some((x) => x.done)) { old.link = false; s.exercises.splice(i + 1, 0, fresh); s.curEx = i + 1; fresh.replacedFrom = old.exerciseId; }
  else { s.exercises[i] = fresh; fresh.replacedFrom = old.exerciseId; }
  ui.setIdx = null; closeSheet(); save(); render(); toast(`${ex.ko}(으)로 변경`);
}
function saveExerciseFromSheet() {
  const sh = ui.sheet, e = sh.ex, g = (id) => document.getElementById(id).value.trim();
  const out = { ...e, ko: g('xKo'), name: g('xName'), equipment: g('xEq'), mode: g('xMode'), primary: readMuscles('xP'), secondary: readMuscles('xS'),
    sets: Math.round(num(g('xSets'))), rest: Math.round(num(g('xRest'))), repMin: Math.round(num(g('xMin'))), repMax: Math.round(num(g('xMax'))), rir: Math.round(num(g('xRir'))), inc: num(g('xInc')), rule: g('xRule') || 'strict',
    setup: g('xSetup'), form: g('xForm'), breath: g('xBreath'), tempo: g('xTempo'), mistakes: g('xMis') };
  if (!out.ko && !out.name) return toast('운동 이름을 입력하세요', 'bad');
  if (!out.ko) out.ko = out.name; if (!out.name) out.name = out.ko;
  if (!out.primary.length) return toast('주요 근육을 하나 이상 선택하세요', 'bad');
  if (![out.sets, out.rest, out.repMin, out.repMax, out.rir, out.inc].every(Number.isFinite) || out.sets < 1 || out.sets > 12 || out.rest < 0 || out.rest > 900 || out.repMin < 1 || out.repMax < out.repMin || out.repMax > 100 || out.rir < 0 || out.rir > 10 || out.inc <= 0 || out.inc > 100) return toast('세트·반복·RIR·휴식·증량 값을 확인하세요 (반복 최소 ≤ 최대)', 'bad');
  const isNew = out.isNew; delete out.isNew;
  S.exercises[out.id] = out; save();
  if (isNew && ui.pickCtx && ui.pickCtx !== 'lib') { pickerReturn(out.id); return; }
  ui.sheet = { type: 'lib', q: '' }; renderSheet(); toast('저장했습니다');
}

const A = {
  tab: (id) => { ui.tab = id; ui.routineId = null; ui.sessionId = null; render(); },
  closeSheet: () => closeSheet(),
  // today
  openStart: (id) => { ui.sheet = { type: 'start', rid: id, cond: 3, fat: 3, min: 0 }; renderSheet(); },
  sCond: (id) => { ui.sheet.cond = +id; renderSheet(); }, sFat: (id) => { ui.sheet.fat = +id; renderSheet(); }, sMin: (id) => { ui.sheet.min = +id; renderSheet(); },
  doStart: () => { const sh = ui.sheet; startSession(sh.rid, { cond: sh.cond, fat: sh.fat, minutes: sh.min }); },
  resume: () => { ui.inWorkout = true; wakeLock(true); render(); },
  exitWorkout: () => { ui.inWorkout = false; wakeLock(false); render(); },
  // workout
  selEx: (id) => { ui.focusPanel = true; const s = active(); s.curEx = +id; ui.setIdx = null; save(); render(); },
  jumpEx: (id) => { ui.focusPanel = true; const s = active(); s.curEx = +id; ui.setIdx = null; save(); closeSheet(); render(); },
  nextEx: () => { ui.focusPanel = true; const s = active(); let i = s.curEx + 1; while (i < s.exercises.length && s.exercises[i].skipped) i++; if (i < s.exercises.length) s.curEx = i; ui.setIdx = null; save(); render(); },
  selSet: (id) => { ui.focusPanel = true; ui.setIdx = +id; render(); },
  wStep: (id) => {
    const ex = cur(), i = selectedSet(ex), st = ex.sets[i], lad = ladderOf(ex);
    if (lad) { const nw = L.ladderStep(lad, st.weight, +id > 0 ? 1 : -1); if (nw == null) return toast(+id > 0 ? '보유한 덤벨 중 가장 무거운 무게예요' : '보유한 덤벨 중 가장 가벼운 무게예요'); st.weight = nw; }
    else st.weight = Math.max(0, L.round025((st.weight ?? 0) + +id * ex.snap.inc));
    save(); render();
  },
  pickW: (id) => { const ex = cur(), st = ex.sets[selectedSet(ex)]; st.weight = +id; save(); render(); },
  rStep: (id) => { const ex = cur(), st = ex.sets[selectedSet(ex)]; st.reps = clamp((st.reps || 0) + +id, 0, 100); save(); render(); },
  setRir: (id) => { const ex = cur(), st = ex.sets[selectedSet(ex)]; st.rir = +id; save(); render(); },
  complete: () => { const ex = cur(); completeSet(ex, selectedSet(ex)); },
  restAdj: (id) => { const ex = cur(), st = ex.sets[selectedSet(ex)]; st.rest = clamp(restFor(ex, st) + +id, 0, 900); save(); render(); },
  linkEx: (id) => { const s = active(), i = +id; if (s.exercises[i + 1]) { s.exercises[i].link = !s.exercises[i].link; if (s.exercises[i].link && s.exercises[i + 1]) s.exercises[i + 1].link = false; if (s.exercises[i].link && s.exercises[i - 1]) s.exercises[i - 1].link = false; save(); renderSheet(); render(); } },
  uncomplete: () => { const ex = cur(), st = ex.sets[selectedSet(ex)]; st.done = false; st.pr = false; delete st.doneAt; save(); render(); },
  addSet: () => { const ex = cur(), l = ex.sets[ex.sets.length - 1]; ex.sets.push(newSet('work', l ? l.weight : null, l ? l.reps : ex.snap.repMin, l ? l.rir : ex.snap.rir)); ui.setIdx = ex.sets.length - 1; save(); render(); },
  delSet: () => {
    const ex = cur(); if (ex.sets.length < 2) return;
    const i = selectedSet(ex) >= 0 ? selectedSet(ex) : ex.sets.length - 1;
    const del = () => { ex.sets.splice(i, 1); ui.setIdx = null; save(); closeSheet(); render(); };
    if (ex.sets[i].done) confirmSheet('완료한 세트를 삭제할까요?', '기록된 중량과 반복수가 사라집니다.', '삭제', del); else del();
  },
  toggleWarm: () => { const ex = cur(), st = ex.sets[selectedSet(ex)]; if (st.done) return toast('완료 취소 후 변경하세요', 'bad'); st.type = st.type === 'warmup' ? 'work' : 'warmup'; save(); render(); },
  applySug: () => {
    const ex = cur(), sug = suggestionFor(ex); if (!sug || (sug.type !== 'increase' && sug.type !== 'reduce')) return;
    const h = lastHist(ex.exerciseId, ex.snap.mode)[0], pw = L.doneWork(h);
    let k = 0;
    const lad = ladderOf(ex);
    for (const st of ex.sets) if (st.type === 'work') {
      if (!st.done) {
        const base = pw[Math.min(k, pw.length - 1)].weight;
        const nw = lad ? L.ladderStep(lad, base, sug.delta > 0 ? 1 : -1) : null;
        st.weight = Math.max(0, nw ?? L.round025(base + sug.delta));
      }
      k++;
    }
    ex.sugApplied = true; save(); render(); toast('미완료 세트에 제안 중량을 적용했습니다');
  },
  skipEx: () => { const ex = cur(); const go = () => { ex.skipped = true; ui.setIdx = null; save(); closeSheet(); A.nextEx(); }; if (ex.sets.some((s) => s.done)) confirmSheet('운동을 건너뛸까요?', '이미 완료한 세트는 기록에 남습니다.', '건너뛰기', go, false); else go(); },
  unskip: () => { cur().skipped = false; save(); render(); },
  openExList: () => { ui.sheet = { type: 'exlist' }; renderSheet(); },
  moveEx: (id, el) => { const s = active(), i = +id, d = +el.dataset.d, j = i + d; if (j < 0 || j >= s.exercises.length) return; const curId = s.exercises[s.curEx].id; for (const k of [i - 1, i, j - 1, j]) if (s.exercises[k]) s.exercises[k].link = false; [s.exercises[i], s.exercises[j]] = [s.exercises[j], s.exercises[i]]; s.curEx = s.exercises.findIndex((e) => e.id === curId); save(); renderSheet(); render(); },
  addToSession: () => { ui.pickCtx = 'session-add'; ui.sheet = { type: 'picker', q: '' }; renderSheet(); },
  openAlt: () => { ui.sheet = { type: 'alt' }; renderSheet(); },
  replaceWith: (id) => { const ex = cur(); if (ex.sets.some((s) => s.done)) confirmSheet('대체 운동으로 바꿀까요?', '이미 완료한 세트가 있어 기존 운동은 유지하고, 선택한 운동을 바로 다음에 추가합니다.', '추가', () => replaceCurrent(id), false); else replaceCurrent(id); },
  pickReplace: () => { ui.pickCtx = 'session-replace'; ui.sheet = { type: 'picker', q: '' }; renderSheet(); },
  openPlate: () => { ui.sheet = { type: 'plate' }; renderSheet(); },
  timerInfo: () => { ui.sheet = { type: 'info' }; renderSheet(); },
  openPain: () => { sheetState.pp = null; sheetState.pl = 2; ui.sheet = { type: 'pain' }; renderSheet(); },
  pickPart: (id) => { sheetState.pp = id; renderSheet(); }, pickLvl: (id) => { sheetState.pl = +id; renderSheet(); },
  addPain: () => { if (!sheetState.pp) return toast('부위를 선택하세요', 'bad'); active().pain.push({ part: sheetState.pp, level: sheetState.pl, note: document.getElementById('painNote').value.trim(), at: Date.now() }); sheetState.pp = null; save(); renderSheet(); render(); },
  delPain: (id) => { active().pain.splice(+id, 1); save(); renderSheet(); render(); },
  openFinish: () => { ui.sheet = { type: 'finish', sat: 3, note: '' }; renderSheet(); },
  sSat: (id) => { ui.sheet.note = document.getElementById('postNote')?.value ?? ''; ui.sheet.sat = +id; renderSheet(); },
  doFinish: () => { const note = document.getElementById('postNote').value.trim(); const s = finishSession({ satisfaction: ui.sheet.sat, note }); if (s) { ui.sheet = { type: 'summary', sid: s.id }; render(); } },
  discard: () => confirmSheet('기록 없이 종료할까요?', '이번 운동은 저장되지 않습니다.', '종료', () => { S.sessions = S.sessions.filter((s) => s.id !== S.activeId); S.activeId = null; S.timer = null; save(); ui.inWorkout = false; wakeLock(false); closeSheet(); render(); }),
  // timer
  tPause: () => { timer.pause(); render(); }, tResume: () => { timer.resume(); render(); }, tReset: () => { timer.reset(); render(); },
  tAdj: (id) => { timer.adjust(+id); render(); }, tStop: () => { timer.stop(); render(); },
  // routines
  openRoutine: (id) => { ui.routineId = id; render(); }, backRoutines: () => { ui.routineId = null; render(); },
  newRoutine: () => { const id = 'r-' + uid(); S.routines[id] = { id, name: '새 루틴', desc: '', items: [], updatedAt: Date.now() }; S.routineOrder.push(id); save(); ui.routineId = id; render(); },
  delRoutine: () => { const id = ui.routineId; confirmSheet('루틴을 삭제할까요?', '과거 운동 기록은 그대로 유지됩니다.', '삭제', () => { delete S.routines[id]; S.routineOrder = S.routineOrder.filter((x) => x !== id); save(); ui.routineId = null; closeSheet(); render(); }); },
  itemUp: (id) => moveItem(+id, -1), itemDown: (id) => moveItem(+id, 1),
  itemDel: (id) => { const r = S.routines[ui.routineId]; r.items.splice(+id, 1); r.updatedAt = Date.now(); save(); render(); },
  addToRoutine: () => { ui.pickCtx = 'routine-add'; ui.sheet = { type: 'picker', q: '' }; renderSheet(); },
  editItem: (id) => { ui.itemIdx = +id; ui.sheet = { type: 'item', rid: ui.routineId, idx: +id }; renderSheet(); },
  saveItem: () => {
    const g = (id) => num(document.getElementById(id).value);
    const v = { sets: Math.round(g('fSets')), rest: Math.round(g('fRest')), repMin: Math.round(g('fMin')), repMax: Math.round(g('fMax')), rir: Math.round(g('fRir')) };
    if (!Object.values(v).every(Number.isFinite) || v.sets < 1 || v.sets > 12 || v.rest < 0 || v.rest > 900 || v.repMin < 1 || v.repMax < v.repMin || v.repMax > 100 || v.rir < 0 || v.rir > 10) return toast('값을 확인하세요 (세트 1~12, 반복 최소 ≤ 최대)', 'bad');
    const r = S.routines[ui.sheet.rid]; Object.assign(r.items[ui.sheet.idx], v); r.updatedAt = Date.now(); save(); closeSheet(); render();
  },
  replaceItem: () => { ui.pickCtx = 'routine-replace'; ui.sheet = { type: 'picker', q: '' }; renderSheet(); },
  editExFromItem: () => { const it = S.routines[ui.sheet.rid].items[ui.sheet.idx]; A.editEx(it.exerciseId); },
  pick: (id) => pickerReturn(id),
  // library
  openLib: () => { ui.pickCtx = 'lib'; ui.sheet = { type: 'lib', q: '' }; renderSheet(); },
  editEx: (id) => { if (ui.pickCtx !== 'lib' && ui.sheet?.type !== 'lib') ui.pickCtx = 'lib'; ui.editEx = JSON.parse(JSON.stringify(S.exercises[id])); ui.sheet = { type: 'exedit', ex: ui.editEx }; renderSheet(); },
  newExercise: () => { ui.editEx = blankExercise(); ui.sheet = { type: 'exedit', ex: ui.editEx }; renderSheet(); },
  togMuscle: (id, el) => el.classList.toggle('on'),
  addAlt: () => { ui.parentEx = { ...ui.sheet.ex, ...snapshotForm() }; ui.prevCtx = ui.pickCtx; ui.pickCtx = 'alt-add'; ui.sheet = { type: 'picker', q: '' }; renderSheet(); },
  rmAlt: (id) => { ui.sheet.ex = { ...ui.sheet.ex, ...snapshotForm(), alts: ui.sheet.ex.alts.filter((x) => x !== id) }; ui.editEx = ui.sheet.ex; renderSheet(); },
  saveEx: () => saveExerciseFromSheet(),
  delEx: () => { const e = ui.sheet.ex; confirmSheet('운동을 삭제할까요?', '루틴에서도 제거됩니다. 과거 기록은 유지됩니다.', '삭제', () => { delete S.exercises[e.id]; for (const r of Object.values(S.routines)) r.items = r.items.filter((i) => i.exerciseId !== e.id); for (const x of Object.values(S.exercises)) x.alts = (x.alts || []).filter((i) => i !== e.id); save(); ui.sheet = { type: 'lib', q: '' }; render(); }); },
  confirmOk: () => { const f = ui.sheet.run; if (typeof f === 'function') f(); },
  // history
  calMonth: (id) => { const d = new Date(ui.month); ui.month = new Date(d.getFullYear(), d.getMonth() + +id, 1).getTime(); ui.day = null; render(); },
  pickDay: (id) => { ui.day = id && ui.day !== id ? id : null; render(); },
  openSession: (id) => { ui.tab = 'history'; ui.sessionId = id; render(); }, backHistory: () => { ui.sessionId = null; render(); },
  delSession: (id) => confirmSheet('이 운동 기록을 삭제할까요?', '삭제하면 복구할 수 없습니다. (JSON 백업이 있다면 복원 가능)', '삭제', () => { S.sessions = S.sessions.filter((s) => s.id !== id); save(); ui.sessionId = null; closeSheet(); render(); }),
  // progress
  period: (id) => { ui.period = id; render(); }, metric: (id) => { ui.metric = id; render(); },
  // settings
  exportJson: () => download(exportJSON(), `push-and-pull-backup-${ymd(Date.now())}.json`, 'application/json'),
  exportCsv: () => { if (!finished().length) return toast('내보낼 운동 기록이 없습니다', 'bad'); download(L.toCSV(S.sessions, S.settings.bodyweight), `push-and-pull-${ymd(Date.now())}.csv`, 'text/csv;charset=utf-8'); },
  importPick: () => document.getElementById('file').click(),
  restoreDef: () => { const n = restoreDefaults(); toast(n ? `기본 항목 ${n}개를 복원했습니다` : '복원할 기본 항목이 없습니다'); render(); },
  resetAll: () => confirmSheet('모든 데이터를 초기화할까요?', '운동 기록, 루틴, 설정이 모두 삭제됩니다. 먼저 JSON 백업을 권장합니다.', '다음', () => confirmSheet('정말 삭제할까요?', '이 작업은 되돌릴 수 없습니다.', '모두 삭제', () => { resetAll(); ui.sheet = null; ui.inWorkout = false; ui.tab = 'today'; render(); toast('초기화했습니다'); })),
};
function snapshotForm() {
  const g = (id) => document.getElementById(id)?.value ?? '';
  if (!document.getElementById('xKo')) return {};
  const n = (id) => { const v = num(g(id)); return Number.isFinite(v) ? v : g(id); };
  return { ko: g('xKo'), name: g('xName'), equipment: g('xEq'), mode: g('xMode'), primary: readMuscles('xP'), secondary: readMuscles('xS'), sets: n('xSets'), rest: n('xRest'), repMin: n('xMin'), repMax: n('xMax'), rir: n('xRir'), inc: n('xInc'), rule: g('xRule'), setup: g('xSetup'), form: g('xForm'), breath: g('xBreath'), tempo: g('xTempo'), mistakes: g('xMis') };
}
function moveItem(i, d) { const r = S.routines[ui.routineId], j = i + d; if (j < 0 || j >= r.items.length) return; [r.items[i], r.items[j]] = [r.items[j], r.items[i]]; r.updatedAt = Date.now(); save(); render(); }
function download(text, name, type) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('파일을 내보냈습니다');
  } catch (e) { toast('내보내기에 실패했습니다', 'bad'); }
}

// ================= events =================
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.a];
  if (!fn) return;
  fn(el.dataset.id, el);
});

document.addEventListener('change', (ev) => {
  const el = ev.target, c = el.dataset.c;
  if (!c) return;
  if (c === 'wInput' || c === 'rInput') {
    // NOTE: no full render here. This handler runs on blur, i.e. between touchstart and click of whatever
    // the user tapped next (usually "세트 완료"); replacing the DOM would swallow that tap.
    const ex = cur(), i = selectedSet(ex); if (i < 0) return;
    const key = c === 'wInput' ? 'weight' : 'reps', v = num(el.value);
    if (el.value.trim() === '') ex.sets[i][key] = key === 'weight' ? null : 0;
    else if (!Number.isFinite(v) || v < 0 || v > (key === 'weight' ? 1000 : 200)) { toast('올바른 숫자를 입력하세요', 'bad'); el.value = ex.sets[i][key] != null && ex.sets[i][key] !== 0 ? fmtNum(ex.sets[i][key]) : ''; return; }
    else ex.sets[i][key] = key === 'weight' ? v : Math.round(v);
    save();
    // patch only the text of the selected row's value; never replace a tappable element
    const cell = document.querySelector('.srow.sel .cur'); if (cell) cell.innerHTML = setCur(ex.sets[i]);
  } else if (c === 'formBreak') { cur().formBreak = el.checked; save(); }
  else if (c === 'rName') { S.routines[ui.routineId].name = el.value.trim() || '이름 없는 루틴'; S.routines[ui.routineId].updatedAt = Date.now(); save(); }
  else if (c === 'rDesc') { S.routines[ui.routineId].desc = el.value.trim(); save(); }
  else if (c === 'progEx') { ui.progEx = el.value; render(); }
  else if (c === 'tg') { S.settings[el.dataset.k] = el.checked; save(); if (el.dataset.k === 'wakeLock') wakeLock(false); }
  else if (c === 'sBar') { const v = num(el.value); if (v >= 0 && v < 100) S.settings.barWeight = v; else toast('바 무게를 확인하세요', 'bad'); save(); render(); }
  else if (c === 'sBw') { const v = el.value.trim() === '' ? 0 : num(el.value); if (v >= 0 && v < 400) S.settings.bodyweight = v; else toast('체중을 확인하세요', 'bad'); save(); render(); }
  else if (c === 'sWarm') { const v = num(el.value); if (v >= 0 && v <= 600) S.settings.warmupRest = Math.round(v); save(); render(); }
  else if (c === 'sDb') { const p = el.value.split(/[,\s]+/).map(num).filter((n) => n > 0 && n <= 200); if (p.length) S.settings.dumbbells = [...new Set(p)].sort((a, b) => a - b); else toast('덤벨 무게를 한 개 이상 입력하세요', 'bad'); save(); render(); }
  else if (c === 'sPlates') { const p = el.value.split(/[,\s]+/).map(num).filter((n) => n > 0); if (p.length) S.settings.plates = [...new Set(p)].sort((a, b) => b - a); else toast('플레이트 무게를 입력하세요', 'bad'); save(); render(); }
  if (el.id === 'file') return;
});
document.addEventListener('change', async (ev) => {
  if (ev.target.id !== 'file') return;
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  if (f.size > 20e6) return toast('파일이 너무 큽니다', 'bad');
  const text = await f.text();
  let o; try { o = JSON.parse(text); } catch { return toast('JSON 파일을 읽을 수 없습니다', 'bad'); }
  const err = L.validateBackup(o); if (err) return toast(err, 'bad');
  const n = o.data.sessions.filter((s) => s.status === 'done').length;
  confirmSheet('백업으로 복원할까요?', `백업 파일: 운동 ${n}회, 루틴 ${Object.keys(o.data.routines).length}개. 현재 데이터는 교체됩니다.`, '복원', () => { const e = importJSON(text); if (e) return toast(e, 'bad'); ui.sheet = null; ui.inWorkout = !!active(); ui.tab = 'today'; render(); toast('복원했습니다'); });
});
document.addEventListener('input', (ev) => {
  const el = ev.target, i = el.dataset.i;
  if (i === 'note') { const ex = cur(); if (ex) { ex.note = el.value; save(); } }
  else if (i === 'pickQ' || i === 'libQ') { ui.sheet.q = el.value; document.getElementById('pickList').innerHTML = pickList(el.value, i === 'libQ'); }
  else if (i === 'plate') { ui.sheet.w = el.value; document.getElementById('plOut').innerHTML = plateOut(L.plateCalc(num(el.value), S.settings.barWeight, S.settings.plates)); }
});
// Number fields: first tap selects the whole value so typing replaces it (caret placement is suppressed once).
const NUMF = 'input[data-c=wInput], input[data-c=rInput]';
document.addEventListener('focusin', (ev) => { const el = ev.target; if (el.matches?.(NUMF)) { el.dataset.fresh = '1'; setTimeout(() => { try { el.select(); } catch (_) {} }, 0); } });
document.addEventListener('focusout', (ev) => { if (ev.target.matches?.(NUMF)) delete ev.target.dataset.fresh; });
for (const t of ['mouseup', 'touchend', 'click']) document.addEventListener(t, (ev) => { const el = ev.target; if (el.matches?.(NUMF) && el.dataset.fresh) { if (t !== 'click') ev.preventDefault(); try { el.select(); } catch (_) {} if (t === 'click') delete el.dataset.fresh; } }, { capture: true, passive: false });
document.addEventListener('toggle', (ev) => { if (ev.target.dataset?.i === 'guide') ui.guideOpen = ev.target.open; }, true);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && ui.sheet) closeSheet(); if (ev.key === 'Enter' && ev.target.matches('input[data-c]')) ev.target.blur(); });

// Another tab / the installed app changed the data: adopt it instead of overwriting it with our stale copy.
window.addEventListener('storage', (ev) => {
  if (ev.key !== 'pp:v1' || !ev.newValue) return;
  const typing = document.activeElement?.matches?.('input, textarea');
  load(); if (!typing) render(); else { const a = active(); ui.inWorkout = ui.inWorkout && !!a; }
});

// ================= boot =================
load();
// tell the user whether storage is durable
(async () => {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch (_) {}
})();
render();
if (active()) { ui.inWorkout = true; wakeLock(true); render(); }
if (status.corrupt) toast('저장된 데이터를 읽지 못해 새로 시작했습니다. 원본은 보관되어 있습니다.', 'bad');

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__pp = { S, ui, A, render }; // test hook
