// Tiny i18n: Korean source strings are the keys. Language is read once at startup
// (switching language reloads the app), so module-level constants translate correctly.
import { EN_DICT, GUIDE_EN } from './i18n-en.js';
import { DEFAULT_EXERCISES } from './data.js';

let lang = 'ko';
try {
  const raw = localStorage.getItem('pp:v1');
  const saved = raw ? JSON.parse(raw)?.settings?.lang : null;
  if (saved === 'ko' || saved === 'en') lang = saved;
  else lang = /^ko\b/i.test(navigator.language || 'ko') ? 'ko' : 'en'; // first run: follow the phone's language
} catch (_) { lang = /^ko\b/i.test(navigator.language || 'ko') ? 'ko' : 'en'; }
try { document.documentElement.lang = lang; } catch (_) {}

export const getLang = () => lang;
export const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** UI string. tr('{n}회', { n: 3 }) */
export function tr(key, params) {
  let s = lang === 'en' ? (EN_DICT[key] ?? key) : key;
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
  return s;
}
/** Data label (muscle, equipment, default text). Unknown / user-written text is returned unchanged. */
export const tx = (s) => (lang === 'en' && s && EN_DICT[s]) || s;

const DEF = Object.fromEntries(DEFAULT_EXERCISES.map((e) => [e.id, e]));
const GF = { setup: 0, form: 1, mistakes: 2 };
/** Guide text for an exercise field; English only while the text is still the built-in default. */
export function guideText(e, field) {
  const v = e?.[field];
  if (lang !== 'en' || !v) return v;
  if (field in GF && GUIDE_EN[e.id] && DEF[e.id]?.[field] === v) return GUIDE_EN[e.id][GF[field]];
  return EN_DICT[v] || v;
}
