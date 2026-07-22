// Client mirror of STUDY_MODELS + MODEL_CREDIT_COST in server.js. The server
// is the real enforcer (it charges credits per request); this drives the
// Study Mode picker UI. Keep credit costs in sync with server.js.
//
// Credit model: every model is selectable by everyone. Each message spends
// the model's credit cost from the user's weekly pool (free 500/week, paid
// 9,500/week). There are no per-model caps and no plan locks.

// Accounts that should not see Claude/OpenAI options. DeepSeek remains
// selectable and is rejected or fallen back only by its own server-side checks.
// Real address lives in .env (VITE_GEMINI_ONLY_EMAILS), not tracked source -
// mirrors GEMINI_ONLY_EMAILS in server.js.
export const GEMINI_ONLY_EMAILS = new Set(
  (import.meta.env.VITE_GEMINI_ONLY_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
);
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
  'gpt-5.6-luna': 1,
  'flash': 2,
  'gpt-5.6-terra': 4,
  'gpt-5.4-mini': 5,
  'deepseek-pro': 7,
  'haiku': 10,
  'gpt-5.6-sol': 15,
  'gemini-pro': 20,
  'sonnet': 35,
  'gpt-5.4': 40,
};
export function studyModelCredits(key) {
  return STUDY_MODEL_CREDITS[key] ?? 1;
}

// Models costing strictly more than this drain a free user's weekly pool
// fast enough to warrant a heads-up right above the chat box.
export const CREDIT_HEAVY_THRESHOLD = 5;
export function studyModelEatsCreditsFast(key) {
  return studyModelCredits(key) > CREDIT_HEAVY_THRESHOLD;
}

// When a heavy model is picked we point the user at a cheap-but-capable
// alternative (4 credits or fewer). Ordered by capability so we suggest the
// strongest light model first. Respects per-account visibility and never
// suggests the model they're already on.
export const CREDIT_LIGHT_CEILING = 4;
const CHEAP_MODEL_PREFERENCE = ['gpt-5.6-terra', 'grok', 'flash', 'gpt-5.6-luna', 'flash-lite', 'deepseek-flash'];
export function recommendedCheapModel(email, excludeKey) {
  const cheap = visibleStudyModels(email).filter(
    (m) => studyModelCredits(m.key) <= CREDIT_LIGHT_CEILING && m.key !== excludeKey
  );
  if (!cheap.length) return null;
  cheap.sort((a, b) => {
    const pa = CHEAP_MODEL_PREFERENCE.indexOf(a.key);
    const pb = CHEAP_MODEL_PREFERENCE.indexOf(b.key);
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
  });
  return cheap[0].key;
}

export const STUDY_MODELS = [
  { key: 'flash-lite',     label: 'Gemini 3.5 Flash-Lite', provider: 'Gemini',   blurb: 'Fastest · everyday study' },
  { key: 'gpt-5.4',        label: 'GPT-5.4',         provider: 'OpenAI',   blurb: 'Versatile + capable' },
  { key: 'gpt-5.4-mini',   label: 'GPT-5.4 mini',    provider: 'OpenAI',   blurb: 'Fast + capable' },
  { key: 'gpt-5.6-sol',    label: 'GPT-5.6 Sol',     provider: 'OpenAI',   blurb: 'OpenAI flagship' },
  { key: 'gpt-5.6-terra',  label: 'GPT-5.6 Terra',   provider: 'OpenAI',   blurb: 'Balanced everyday work' },
  { key: 'gpt-5.6-luna',   label: 'GPT-5.6 Luna',    provider: 'OpenAI',   blurb: 'Fast + affordable' },
  { key: 'deepseek-flash', label: 'DeepSeek V4',     provider: 'DeepSeek', blurb: 'Fast + free' },
  { key: 'deepseek-pro',   label: 'DeepSeek V4 Pro', provider: 'DeepSeek', blurb: 'Step-by-step reasoning' },
  { key: 'grok',           label: 'Grok 4.3',        provider: 'xAI',      blurb: 'Frontier reasoning' },
  { key: 'flash',          label: 'Gemini 3.6 Flash', provider: 'Gemini',   blurb: 'Balanced reasoning' },
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

// ===== Best of 3 / Superimpose selection =====
// Desktop StudyModePanel keeps a local copy of this normalization; keep the
// fill order and rules in sync if either changes.

export const BEST_OF_DEFAULT_ORDER = [
  'gpt-5.4-mini',
  'deepseek-flash',
  'flash-lite',
  'gpt-5.6-luna',
  'deepseek-pro',
  'gpt-5.6-terra',
  'flash',
  'gpt-5.6-sol',
  'gpt-5.4',
  'gemini-pro',
];

export function unlockedStudyModelKeys(email, plan) {
  return visibleStudyModels(email)
    .filter((m) => canUseStudyModel(m.key, plan))
    .map((m) => m.key);
}

// Normalizes a saved Best of / Superimpose selection: keeps up to 3 valid,
// distinct response models (never the judge), tops the list up from the
// default order, and picks a judge from whatever is left when the saved one
// is unusable.
export function normalizeBestOfSelection(savedModels, savedJudge, email, plan) {
  const unlocked = unlockedStudyModelKeys(email, plan);
  const preferred = [
    ...BEST_OF_DEFAULT_ORDER.filter((key) => unlocked.includes(key)),
    ...unlocked.filter((key) => !BEST_OF_DEFAULT_ORDER.includes(key)),
  ];
  let judge = unlocked.includes(savedJudge) ? savedJudge : null;
  const models = [];
  for (const key of Array.isArray(savedModels) ? savedModels : []) {
    if (!unlocked.includes(key) || key === judge || models.includes(key)) continue;
    models.push(key);
    if (models.length === 3) break;
  }
  for (const key of preferred) {
    if (models.length === 3) break;
    if (key === judge || models.includes(key)) continue;
    models.push(key);
  }
  if (!judge) {
    judge = preferred.find((key) => !models.includes(key)) || null;
  }
  return { models, judge };
}
