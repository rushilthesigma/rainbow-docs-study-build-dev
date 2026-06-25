// Client mirror of STUDY_MODELS + MODEL_CREDIT_COST in server.js. The server
// is the real enforcer (it charges credits per request); this drives the
// Study Mode picker UI. Keep credit costs in sync with server.js.
//
// Credit model: every model is selectable by everyone. Each message spends
// the model's credit cost from the user's daily pool (free 100/day, paid
// 9,500/day). There are no per-model day caps and no plan locks.

// Accounts that should not see Claude/OpenAI options. DeepSeek remains
// selectable and is rejected or fallen back only by its own server-side checks.
export const GEMINI_ONLY_EMAILS = new Set(['kelapure@gmail.com']);
export function isGeminiOnlyEmail(email) {
  return GEMINI_ONLY_EMAILS.has((email || '').toLowerCase());
}
export function isBlockedForGeminiOnly(provider) {
  return provider === 'Claude' || provider === 'OpenAI';
}

// Legacy constants kept for back-compat with older imports. No longer used to
// gate anything (per-model caps are retired under the credit model).
export const HAIKU_FREE_DAILY = 12;
export const SONNET_PLUS_DAILY = 24;
export const DEEPSEEK_FREE_DAILY = 12;

// Per-message credit cost by model key. MUST match MODEL_CREDIT_COST in
// server.js. Gemini scaled lower, Claude/OpenAI scaled toward true cost.
export const STUDY_MODEL_CREDITS = {
  'flash-lite': 1,
  'deepseek-flash': 1,
  'grok': 1,
  'flash': 2,
  'gpt-5.4-mini': 5,
  'deepseek-pro': 7,
  'haiku': 10,
  'gemini-pro': 20,
  'sonnet': 35,
  'gpt-5.4': 40,
};
export function studyModelCredits(key) {
  return STUDY_MODEL_CREDITS[key] ?? 1;
}

export const STUDY_MODELS = [
  { key: 'flash-lite',     label: 'Flash Lite',      provider: 'Gemini',   blurb: 'Fastest · everyday study' },
  { key: 'gpt-5.4',        label: 'GPT-5.4',         provider: 'OpenAI',   blurb: 'Versatile + capable' },
  { key: 'gpt-5.4-mini',   label: 'GPT-5.4 mini',    provider: 'OpenAI',   blurb: 'Fast + capable' },
  { key: 'deepseek-flash', label: 'DeepSeek V4',     provider: 'DeepSeek', blurb: 'Fast + free' },
  { key: 'deepseek-pro',   label: 'DeepSeek V4 Pro', provider: 'DeepSeek', blurb: 'Step-by-step reasoning' },
  { key: 'grok',           label: 'Grok 4.3',        provider: 'xAI',      blurb: 'Frontier reasoning' },
  { key: 'flash',          label: 'Flash',           provider: 'Gemini',   blurb: 'Balanced reasoning' },
  { key: 'gemini-pro',     label: 'Gemini Pro',      provider: 'Gemini',   blurb: 'Hardest math + code' },
];

export const DEFAULT_STUDY_MODEL = 'flash-lite';
export const FALLBACK_STUDY_MODEL = 'flash-lite';
export const HAIKU_LIMIT_FALLBACK = 'flash-lite';

const BY_KEY = Object.fromEntries(STUDY_MODELS.map((m) => [m.key, m]));

export function isPaidPlan(plan) { return plan === 'paid'; }

// Every known model is usable; credits are the gate (server-enforced).
export function canUseStudyModel(key, _plan) {
  return !!BY_KEY[key];
}

// No model is plan-locked anymore — credit cost is the gate.
export function requiredPlanLabelFor(_key, _currentPlan = 'free') {
  return null;
}

// The model the user will use — honors the saved pick, else the default.
export function resolveStudyModel(savedKey, _plan) {
  if (savedKey && BY_KEY[savedKey]) return savedKey;
  return DEFAULT_STUDY_MODEL;
}

export function studyModelLabel(key) { return BY_KEY[key]?.label || 'Flash Lite'; }

// Blurb now ends with the model's credit cost so every picker surfaces it.
export function studyModelBlurb(key, _plan) {
  const m = BY_KEY[key];
  if (!m) return '';
  const c = studyModelCredits(key);
  return `${m.blurb} · ${c} credit${c === 1 ? '' : 's'}`;
}

// Per-model day caps are retired under the credit model.
export function studyModelHasFreeCap(_key, _plan) { return false; }
export function studyModelDailyCap(_key, _plan) { return null; }

export function studyModelSupportsThinking(key) {
  return ['gemini-pro', 'deepseek-pro', 'grok'].includes(key);
}

// Returns the subset of STUDY_MODELS visible to a given user. For restricted
// accounts the Claude/OpenAI entries are filtered out entirely.
export function visibleStudyModels(email) {
  if (isGeminiOnlyEmail(email)) {
    return STUDY_MODELS.filter(m => !isBlockedForGeminiOnly(m.provider));
  }
  return STUDY_MODELS;
}

// Resolve the best accessible Gemini fallback for a Gemini-only account.
export function resolveGeminiOnlyModel(_plan) {
  return 'gemini-pro';
}
