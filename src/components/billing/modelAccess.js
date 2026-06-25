// Plan gating for the model-tier picker. Under the credit model every tier is
// selectable by everyone — the per-action credit cost is the only gate — so
// canUseModel() always returns true and nothing is plan-locked. planFromUser()
// reports the two-plan state ('free' | 'paid'). The server is the real
// enforcer (it charges credits per request).
export const MODEL_REQUIRES = { pro: null, balanced: null, speed: null };

// Old tier names are still stored on some accounts; normalize on read.
export function normalizeTier(tier) {
  if (tier === 'flash-lite') return 'speed';
  if (tier === 'flash') return 'balanced';
  return tier;
}

// Effective plan from the cached user object: 'free' | 'paid'. Any legacy paid
// tier (plus / pro / lifetime, incl. a lifetimePurchasedAt stamp) maps to
// 'paid'; the old free referral tier 'plus-lite' maps to 'free'.
export function planFromUser(user) {
  const plan = user?.data?.plan || 'free';
  if (user?.data?.lifetimePurchasedAt) return 'paid';
  if (['paid', 'plus', 'pro', 'lifetime'].includes(plan)) return 'paid';
  return 'free';
}

// Every model tier is selectable now; credits are the gate (server-enforced).
export function canUseModel(_tier, _plan) { return true; }

// No model tier is plan-locked anymore.
export function requiredPlanFor(_tier) { return null; }

// Tiers ordered best → worst. speed is the universal floor.
const TIER_PREFERENCE = ['pro', 'balanced', 'speed'];

// The saved tier is always usable now; just validate it and fall back to the
// floor if unset/unknown.
export function resolveModelTier(savedTier, _plan) {
  const tier = normalizeTier(savedTier);
  return TIER_PREFERENCE.includes(tier) ? tier : 'speed';
}

// ---- Thinking support ----
// Only the Pro tier streams chain-of-thought. The API constraint that
// rejected thinkingBudget:0 on Pro is worked around server-side by omitting
// the config entirely when thinking is off.
export const THINKING_CAPABLE = new Set(['pro']);
export function modelSupportsThinking(tier) { return THINKING_CAPABLE.has(normalizeTier(tier)); }
export function thinkingAlwaysOn(_tier) { return false; }
