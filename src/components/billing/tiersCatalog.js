// Fallback tier catalog. Server's /api/billing/tiers is authoritative;
// this renders when that endpoint is missing (old server build).
const FALLBACK_TIERS = {
  free:        { id: 'free',        label: 'Free',       amountUsd: 0,  interval: 'month', mode: null,           buyable: false,
                 limits: { dailyMessages: 45,  dailyQB: 2,  weeklyCurricula: 2,  weeklyDebates: 4,  noteMaps: 2 } },
  'plus-lite': { id: 'plus-lite',   label: 'Plus-Lite',  amountUsd: 2,  interval: 'month', mode: null,           buyable: false, unlock: 'referral', referralsRequired: 2,
                 limits: { dailyMessages: 115, dailyQB: 5,  weeklyCurricula: 3,  weeklyDebates: 6,  noteMaps: 3 } },
  plus:        { id: 'plus',        label: 'Plus',       amountUsd: 4,  interval: 'month', mode: 'subscription', buyable: true,
                 limits: { dailyMessages: 225, dailyQB: 9,  weeklyCurricula: 5,  weeklyDebates: 12, noteMaps: 9 } },
  lifetime:    { id: 'lifetime',    label: 'Lifetime',   amountUsd: 20, interval: 'once',  mode: 'payment',      buyable: true,
                 limits: { dailyMessages: 525, dailyQB: 23, weeklyCurricula: 12, weeklyDebates: 30, noteMaps: 23 } },
  pro:         { id: 'pro',         label: 'Pro',        amountUsd: 10, interval: 'month', mode: 'subscription', buyable: true,
                 limits: { dailyMessages: Infinity, dailyQB: Infinity, weeklyCurricula: Infinity, weeklyDebates: Infinity, noteMaps: Infinity } },
};
export default FALLBACK_TIERS;
