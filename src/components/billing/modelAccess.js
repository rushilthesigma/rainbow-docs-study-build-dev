// Plan gating for the model-tier picker. Mirrors server.js modelForUser():
//   flash-lite → everyone
//   flash      → plus / lifetime / pro
//   pro        → pro plan only
// Keep this in sync with the server; the server is the real enforcer and
// will silently downgrade a tier the plan can't actually use.
export const MODEL_REQUIRES = { pro: 'pro', flash: 'plus', 'flash-lite': null };
const PLAN_LABEL = { plus: 'Plus', pro: 'Pro' };
const PLUS_OR_UP = ['plus', 'lifetime', 'pro'];

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
  const req = MODEL_REQUIRES[tier];
  if (!req) return true;
  if (req === 'pro') return plan === 'pro';
  return PLUS_OR_UP.includes(plan); // req === 'plus'
}

// { tier, label } of the plan a locked model needs, or null if it's free.
export function requiredPlanFor(tier) {
  const req = MODEL_REQUIRES[tier];
  return req ? { tier: req, label: PLAN_LABEL[req] } : null;
}

// The tier the user will actually be served, so the picker highlights
// reality instead of an unusable selection. Mirrors server.js
// modelForUser() exactly: an unset or plan-locked preference falls straight
// through to Flash Lite (the server does NOT auto-promote a stale 'pro'
// preference to Flash for Plus users).
export function resolveModelTier(savedTier, plan) {
  if (savedTier && canUseModel(savedTier, plan)) return savedTier;
  return 'flash-lite';
}
