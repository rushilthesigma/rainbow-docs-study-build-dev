// Client mirror of STUDY_MODELS in server.js. The server is the real
// enforcer (plan gating + the rolling Haiku cap); this drives the Study Mode
// picker UI and pre-empts obviously-locked selections. Keep the two in sync.
//
// Non-paid users may only pick the two "floor" models (Flash Lite + Haiku).
// Haiku is additionally capped at HAIKU_FREE_DAILY messages per day for non-paid
// users; when the cap is hit the server locks Haiku until UTC midnight and
// auto-switches to Flash Lite for the rest of the day.
// Every paid plan (Plus / Lifetime / Pro) unlocks all models with no cap.
export const HAIKU_FREE_DAILY = 12;
const PAID_PLANS = ['plus', 'lifetime', 'pro'];

export const STUDY_MODELS = [
  { key: 'flash-lite', label: 'Flash Lite', provider: 'Gemini', blurb: 'Fastest · everyday study', paidOnly: false },
  { key: 'haiku',      label: 'Haiku 4.5',  provider: 'Claude', blurb: `Quick + sharp · ${HAIKU_FREE_DAILY}/day free`, paidOnly: false },
  { key: 'flash',      label: 'Flash',      provider: 'Gemini', blurb: 'Balanced reasoning', paidOnly: true },
  { key: 'sonnet',     label: 'Sonnet 4.6', provider: 'Claude', blurb: 'Deepest writing + explanation', paidOnly: true },
  { key: 'gemini-pro', label: 'Gemini Pro', provider: 'Gemini', blurb: 'Hardest math + code', paidOnly: true },
];
// Haiku is the default for everyone. Non-paid users keep it until the daily
// cap is hit, at which point the server locks Haiku until UTC midnight and
// auto-switches to Sonnet for the rest of the day.
export const DEFAULT_STUDY_MODEL = 'haiku';
export const FALLBACK_STUDY_MODEL = 'flash-lite'; // plan-locked fallback (not haiku-limit)
export const HAIKU_LIMIT_FALLBACK = 'flash-lite';  // served when daily Haiku cap is hit

const BY_KEY = Object.fromEntries(STUDY_MODELS.map((m) => [m.key, m]));

export function isPaidPlan(plan) { return PAID_PLANS.includes(plan); }

export function canUseStudyModel(key, plan) {
  const m = BY_KEY[key];
  if (!m) return false;
  return m.paidOnly ? isPaidPlan(plan) : true;
}

// Lowest plan that unlocks a locked model (any paid plan → "Plus"), else null.
export function requiredPlanLabelFor(key) {
  const m = BY_KEY[key];
  return m?.paidOnly ? 'Plus' : null;
}

// The study model the user can actually use — falls back to the default when
// the saved pick is unknown or plan-locked. The Haiku daily auto-switch snaps
// the picker to Flash Lite via the onMeta callback in StudyModePanel.
export function resolveStudyModel(savedKey, plan) {
  if (savedKey && canUseStudyModel(savedKey, plan)) return savedKey;
  return DEFAULT_STUDY_MODEL;
}

export function studyModelLabel(key) { return BY_KEY[key]?.label || 'Flash Lite'; }

export function studyModelBlurb(key, plan) {
  const m = BY_KEY[key];
  if (!m) return '';
  if (key === 'haiku' && isPaidPlan(plan)) return 'Quick + sharp · Unlimited';
  return m.blurb;
}

// Whether the given study model is the daily-capped Haiku for a non-paid plan.
// Paid plans have no cap, so the limit indicator is only relevant when this is
// true. The server is still the real enforcer of the rolling-window count.
export function studyModelHasFreeCap(key, plan) {
  return key === 'haiku' && !isPaidPlan(plan);
}

// Models whose reasoning can stream into the Thinking panel.
export function studyModelSupportsThinking(key) {
  return ['haiku', 'sonnet', 'gemini-pro'].includes(key);
}
