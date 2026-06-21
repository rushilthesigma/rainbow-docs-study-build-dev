// Client mirror of STUDY_MODELS in server.js. The server is the real
// enforcer (plan gating + rolling caps); this drives the Study Mode
// picker UI and pre-empts obviously-locked selections. Keep in sync.
//
// Plan access matrix:
//   flash-lite   : everyone
//   haiku        : free / plus-lite (12/day cap) · lifetime / pro (unlimited)
//   gpt-5.4      : plus / lifetime / pro (unlimited) — paid only, no free access
//   gpt-5.4-mini : everyone (no per-model cap — only counts toward daily messages)
//   flash      : plus / lifetime / pro (unlimited)
//   sonnet     : plus (24/day cap) · lifetime / pro (unlimited)
//   gemini-pro : pro only (unlimited)

// Accounts that may only use Gemini models. Claude + OpenAI options are hidden
// from the picker and rejected server-side for these emails.
export const GEMINI_ONLY_EMAILS = new Set(['kelapure@gmail.com']);
export function isGeminiOnlyEmail(email) {
  return GEMINI_ONLY_EMAILS.has((email || '').toLowerCase());
}

export const HAIKU_FREE_DAILY = 12;
export const SONNET_PLUS_DAILY = 24;

export const STUDY_MODELS = [
  { key: 'flash-lite', label: 'Flash Lite', provider: 'Gemini', blurb: 'Fastest · everyday study',                                     plans: ['free', 'plus-lite', 'plus', 'lifetime', 'pro'] },
  { key: 'haiku',      label: 'Haiku 4.5',  provider: 'Claude', blurb: `Quick + sharp · ${HAIKU_FREE_DAILY}/day free`,                  plans: ['free', 'plus-lite', 'lifetime', 'pro'] },
  { key: 'gpt-5.4',    label: 'GPT-5.4',    provider: 'OpenAI', blurb: 'Versatile + capable · paid',                                    plans: ['plus', 'lifetime', 'pro'] },
  { key: 'gpt-5.4-mini', label: 'GPT-5.4 mini', provider: 'OpenAI', blurb: 'Fast + free · counts toward daily messages',                plans: ['free', 'plus-lite', 'plus', 'lifetime', 'pro'] },
  { key: 'flash',      label: 'Flash',      provider: 'Gemini', blurb: 'Balanced reasoning',                                            plans: ['plus', 'lifetime', 'pro'] },
  { key: 'sonnet',     label: 'Sonnet 4.6', provider: 'Claude', blurb: `Deepest writing + explanation · ${SONNET_PLUS_DAILY}/day`,      plans: ['plus', 'lifetime', 'pro'] },
  { key: 'gemini-pro', label: 'Gemini Pro', provider: 'Gemini', blurb: 'Hardest math + code',                                           plans: ['pro'] },
];

export const DEFAULT_STUDY_MODEL = 'haiku';
export const FALLBACK_STUDY_MODEL = 'flash-lite';
export const HAIKU_LIMIT_FALLBACK = 'flash-lite';

const BY_KEY = Object.fromEntries(STUDY_MODELS.map((m) => [m.key, m]));

export function isPaidPlan(plan) { return ['plus', 'lifetime', 'pro'].includes(plan); }

export function canUseStudyModel(key, plan) {
  const m = BY_KEY[key];
  if (!m) return false;
  return m.plans.includes(plan);
}

const PLAN_ORDER = ['free', 'plus-lite', 'plus', 'lifetime', 'pro'];
const PLAN_DISPLAY = { 'plus-lite': 'Plus-Lite', plus: 'Plus', lifetime: 'Lifetime', pro: 'Pro' };

// Returns the label of the lowest plan that unlocks the model for a user on
// currentPlan (e.g. a free user sees "Plus" for Flash, a plus user sees
// "Lifetime" for Haiku). Returns null if already accessible.
export function requiredPlanLabelFor(key, currentPlan = 'free') {
  const m = BY_KEY[key];
  if (!m || m.plans.includes(currentPlan)) return null;
  const currentIdx = PLAN_ORDER.indexOf(currentPlan);
  for (const p of PLAN_ORDER) {
    if (PLAN_ORDER.indexOf(p) > currentIdx && m.plans.includes(p)) {
      return PLAN_DISPLAY[p] || p;
    }
  }
  return 'Pro';
}

// The model the user can actually use — falls back when saved pick is unknown
// or plan-locked, preferring the best accessible model over always using haiku.
export function resolveStudyModel(savedKey, plan) {
  if (savedKey && canUseStudyModel(savedKey, plan)) return savedKey;
  if (canUseStudyModel('haiku', plan)) return 'haiku';
  if (canUseStudyModel('flash', plan)) return 'flash';
  return FALLBACK_STUDY_MODEL;
}

export function studyModelLabel(key) { return BY_KEY[key]?.label || 'Flash Lite'; }

export function studyModelBlurb(key, plan) {
  const m = BY_KEY[key];
  if (!m) return '';
  if (key === 'haiku') {
    if (['lifetime', 'pro'].includes(plan)) return 'Quick + sharp · Unlimited';
    return m.blurb; // "Quick + sharp · 12/day free"
  }
  if (key === 'gpt-5.4') {
    return 'Versatile + capable · Unlimited'; // paid only (plus/lifetime/pro), no cap
  }
  if (key === 'sonnet') {
    if (['lifetime', 'pro'].includes(plan)) return 'Deepest writing + explanation · Unlimited';
    return m.blurb; // "Deepest writing + explanation · 24/day" for plus
  }
  return m.blurb;
}

// Whether the given model has a per-day cap for this plan (drives the cap pill).
export function studyModelHasFreeCap(key, plan) {
  if (key === 'haiku') return ['free', 'plus-lite'].includes(plan);
  if (key === 'sonnet') return plan === 'plus';
  return false;
}

// The daily message cap for a capped model/plan combination, or null.
export function studyModelDailyCap(key, plan) {
  if (key === 'haiku' && ['free', 'plus-lite'].includes(plan)) return HAIKU_FREE_DAILY;
  if (key === 'sonnet' && plan === 'plus') return SONNET_PLUS_DAILY;
  return null;
}

export function studyModelSupportsThinking(key) {
  return ['haiku', 'sonnet', 'gemini-pro'].includes(key);
}

// Returns the subset of STUDY_MODELS visible to a given user. For
// Gemini-only accounts the Claude entries are filtered out entirely.
export function visibleStudyModels(email) {
  if (isGeminiOnlyEmail(email)) {
    return STUDY_MODELS.filter(m => m.provider === 'Gemini');
  }
  return STUDY_MODELS;
}

// Resolve the best accessible Gemini model for an account that is
// restricted to Gemini-only (falls back from flash to flash-lite for
// lower-tier plans).
export function resolveGeminiOnlyModel(plan) {
  if (canUseStudyModel('gemini-pro', plan)) return 'gemini-pro';
  if (canUseStudyModel('flash', plan)) return 'flash';
  return 'flash-lite';
}
