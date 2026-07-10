// Fallback tier catalog. Server's /api/billing/tiers is authoritative;
// this renders when that endpoint is missing (old server build).
// NOTE: `dailyCredits` is a legacy field name — the credit pool is now WEEKLY
// (free 995/week, paid 9,500/week). Mirrors LIMITS in server.js.
const FALLBACK_TIERS = {
  free: { id: 'free', label: 'Free', amountUsd: 0, interval: 'month', mode: null, buyable: false,
          dailyCredits: 995,  limits: { dailyCredits: 995,  noteMaps: 3 } },
  paid: { id: 'paid', label: 'Paid', amountUsd: 4, interval: 'month', mode: 'subscription', buyable: true,
          dailyCredits: 9500, limits: { dailyCredits: 9500, noteMaps: Infinity } },
};

// Reroute / best-of / brute force charge a discounted share of the combined
// model cost (mirror of MULTI_MODEL_DISCOUNT_RATE in server.js). Used when the
// server's /api/billing/usage doesn't return multiModelDiscount.
export const FALLBACK_MULTI_MODEL_DISCOUNT = 0.5;

// Fallback per-model credit costs (mirror of server MODEL_CREDIT_COST), used
// when the server doesn't return modelCosts.
export const FALLBACK_MODEL_COSTS = {
  'flash-lite': 1, 'deepseek-flash': 1, 'grok': 1, 'gpt-5.6-luna': 1, 'flash': 2,
  'gpt-5.6-terra': 4, 'gpt-5.4-mini': 5, 'deepseek-pro': 7, 'haiku': 10,
  'gpt-5.6-sol': 15, 'gemini-pro': 20, 'sonnet': 35, 'gpt-5.4': 40,
};

// Flat per-feature credit costs (mirror of server featureCosts). Note AI
// actions aren't flat fees server-side — they charge the underlying model's
// per-message rate: summary/cue cards run on Flash Lite (1 cr), flashcards on
// Flash (2 cr). Surfaced here as fixed numbers so the Plans tab can list them.
export const FALLBACK_FEATURE_COSTS = {
  curriculum: 50,
  quizBowlTossup: 8,
  noteSummary: 1,
  noteFlashcards: 2,
  sourcedSurcharge: 2,
};

// Shared formatting + merge helpers (used by both the compact UpgradeChip meter
// and the advanced PlanDetails panel in Settings).
export function mergeTiers(base, live) {
  if (!live) return base;
  const out = {};
  const ids = new Set([...Object.keys(base), ...Object.keys(live)]);
  for (const id of ids) {
    const b = base[id] || {};
    const l = live[id] || {};
    out[id] = { ...b, ...l, limits: { ...(b.limits || {}), ...(l.limits || {}) } };
  }
  return out;
}

// JSON serializes Infinity to null, so null/undefined means "unlimited".
export function fmtCap(n) {
  if (n === null || n === undefined || n === Infinity || n > 9999) return '∞';
  return n;
}

export function fmtCredits(n) {
  if (n === null || n === undefined || n === Infinity) return '∞';
  return n.toLocaleString();
}

export default FALLBACK_TIERS;
