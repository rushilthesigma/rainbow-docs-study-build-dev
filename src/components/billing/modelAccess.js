// Plan gating for the model-tier picker. Mirrors server.js modelForUser():
//   speed     → everyone           (Gemini Flash-Lite / Claude Haiku)
//   balanced  → plus / lifetime / pro (Gemini Flash / Claude Sonnet)
//   pro       → pro plan only      (Gemini Pro / Claude Sonnet)
// Each tier spans two models; the server picks the provider per-user. Keep
// this in sync with the server — the server is the real enforcer and will
// silently downgrade a tier the plan can't actually use.
export const MODEL_REQUIRES = { pro: 'pro', balanced: 'plus', speed: null };
const PLAN_LABEL = { plus: 'Plus', pro: 'Pro' };
const PLUS_OR_UP = ['plus', 'lifetime', 'pro'];

// Old tier names are still stored on some accounts; normalize on read.
export function normalizeTier(tier) {
  if (tier === 'flash-lite') return 'speed';
  if (tier === 'flash') return 'balanced';
  return tier;
}

// Effective plan from the cached user object. Lifetime trumps the stored
// plan (it's a permanent grant); everything else is taken at face value.
// The server's getPlan() handles owner/referral edge cases — we only need
// the gate to match its allow-lists for the common case.
export function planFromUser(user) {
  const plan = user?.data?.plan || 'free';
  if (plan === 'lifetime' || user?.data?.lifetimePurchasedAt) return 'lifetime';
  return plan;
}

export function canUseModel(tier, plan) {
  const req = MODEL_REQUIRES[normalizeTier(tier)];
  if (!req) return true;
  if (req === 'pro') return plan === 'pro';
  return PLUS_OR_UP.includes(plan); // req === 'plus'
}

// { tier, label } of the plan a locked model needs, or null if it's free.
export function requiredPlanFor(tier) {
  const req = MODEL_REQUIRES[normalizeTier(tier)];
  return req ? { tier: req, label: PLAN_LABEL[req] } : null;
}

// Tiers ordered best → worst. speed is the universal floor.
const TIER_PREFERENCE = ['pro', 'balanced', 'speed'];

// The most capable tier a plan is actually allowed to use. Used to downgrade
// an unset or plan-locked preference to something usable instead of always
// dropping to Speed. speed has no requirement, so a result is guaranteed.
function bestTierForPlan(plan) {
  return TIER_PREFERENCE.find((t) => canUseModel(t, plan)) || 'speed';
}

// The tier the user will actually be served, so the picker highlights
// reality instead of an unusable selection. Mirrors server.js
// modelForUser(): honor an explicit, allowed preference; otherwise downgrade
// to the best tier the plan can still use (Pro→pro, Plus/Lifetime→balanced,
// Free/Plus-Lite→speed) rather than always dropping to Speed.
export function resolveModelTier(savedTier, plan) {
  const tier = normalizeTier(savedTier);
  if (tier && canUseModel(tier, plan)) return tier;
  return bestTierForPlan(plan);
}

// ---- Thinking support ----
// Only the Pro tier streams chain-of-thought. The API constraint that
// rejected thinkingBudget:0 on Pro is worked around server-side by omitting
// the config entirely when thinking is off.
export const THINKING_CAPABLE = new Set(['pro']);
export function modelSupportsThinking(tier) { return THINKING_CAPABLE.has(normalizeTier(tier)); }
export function thinkingAlwaysOn(_tier) { return false; }
