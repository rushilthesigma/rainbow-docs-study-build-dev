// Fallback tier catalog. Server's /api/billing/tiers is authoritative;
// this renders when that endpoint is missing (old server build).
const FALLBACK_TIERS = {
  free: { id: 'free', label: 'Free', amountUsd: 0, interval: 'month', mode: null, buyable: false,
          dailyCredits: 100,  limits: { dailyCredits: 100,  noteMaps: 3 } },
  paid: { id: 'paid', label: 'Paid', amountUsd: 4, interval: 'month', mode: 'subscription', buyable: true,
          dailyCredits: 9500, limits: { dailyCredits: 9500, noteMaps: Infinity } },
};

// Fallback per-model credit costs (mirror of server MODEL_CREDIT_COST), used
// when the server doesn't return modelCosts.
export const FALLBACK_MODEL_COSTS = {
  'flash-lite': 1, 'deepseek-flash': 1, 'grok': 1, 'flash': 2, 'gpt-5.4-mini': 5,
  'deepseek-pro': 7, 'haiku': 10, 'gemini-pro': 20, 'sonnet': 35, 'gpt-5.4': 40,
};

export const FALLBACK_FEATURE_COSTS = { curriculum: 50, quizBowlTossup: 8, sourcedSurcharge: 2 };

export default FALLBACK_TIERS;
