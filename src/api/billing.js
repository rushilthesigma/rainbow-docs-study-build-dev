import { apiFetch } from './client';

export const getBillingStatus = () => apiFetch('/api/billing/status');
// Tier-aware checkout. `tier` is 'plus' | 'pro' | 'lifetime'. Omitted
// tier falls back to 'pro' on the server (legacy back-compat).
export const createCheckoutSession = (tier) =>
  apiFetch('/api/billing/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify(tier ? { tier } : {}),
  });
// Tier catalog - what the server thinks the plans cost and what limits
// each one has. Used by the pricing modal.
export const getTiers = () => apiFetch('/api/billing/tiers');
// Caller's plan + per-resource usage vs limits, for the upgrade popover.
export const getMyUsage = () => apiFetch('/api/billing/usage');
export const openBillingPortal = () => apiFetch('/api/billing/portal', { method: 'POST' });
// Pull latest subscription state from Stripe and mirror to user.data -
// use after redirecting back from Checkout so the upgrade activates
// immediately without relying on the webhook.
export const syncBilling = () => apiFetch('/api/billing/sync', { method: 'POST' });

// Owner grant. `tier` defaults to 'pro' for back-compat.
export const ownerGrantPro = (email, tier = 'pro') => apiFetch('/api/owner/grant-pro', {
  method: 'POST', body: JSON.stringify({ email, tier }),
});
export const ownerRevokePro = (email) => apiFetch('/api/owner/revoke-pro', {
  method: 'POST', body: JSON.stringify({ email }),
});
