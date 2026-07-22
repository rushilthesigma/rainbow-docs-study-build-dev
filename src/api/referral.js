import { apiFetch } from './client';

// Fetch the caller's own referral code + banked credit reset balance.
// Shape: { code, referralsUsed, creditResets: { earned, used, available }, redeemedCode }
export const getMyReferralCode = () => apiFetch('/api/referral/my-code');

// Redeem someone else's code. Server enforces: format (8 alphanumeric),
// one-per-user, no self-referral. Throws on failure with err.code set
// to one of: invalid_format | already_redeemed | self_referral | not_found.
export const redeemReferralCode = (code) =>
  apiFetch('/api/referral/redeem', {
    method: 'POST',
    body: JSON.stringify({ code: (code || '').toString().toUpperCase().trim() }),
  });
