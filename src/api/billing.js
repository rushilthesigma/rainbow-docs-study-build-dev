import { apiFetch } from './client';

export const getBillingStatus = () => apiFetch('/api/billing/status');
export const createCheckoutSession = () =>
  apiFetch('/api/billing/create-checkout-session', { method: 'POST' });
export const openBillingPortal = () => apiFetch('/api/billing/portal', { method: 'POST' });
// Pull latest subscription state from Stripe and mirror to user.data —
// use after redirecting back from Checkout so Pro activates immediately
// without relying on the webhook.
export const syncBilling = () => apiFetch('/api/billing/sync', { method: 'POST' });

export const ownerGrantPro = (email) => apiFetch('/api/owner/grant-pro', {
  method: 'POST', body: JSON.stringify({ email }),
});
export const ownerRevokePro = (email) => apiFetch('/api/owner/revoke-pro', {
  method: 'POST', body: JSON.stringify({ email }),
});
