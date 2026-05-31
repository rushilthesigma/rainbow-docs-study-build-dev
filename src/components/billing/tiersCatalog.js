// Fallback tier catalog. Server's /api/billing/tiers is authoritative;
// this renders when that endpoint is missing (old server build).
const FALLBACK_TIERS = {
  free:        { id: 'free',        label: 'Free',       amountUsd: 0,  interval: 'month', mode: null,           buyable: false,
                 limits: { dailyMessages: 50,  dailyQB: 2,  weeklyCurricula: 1,  weeklyDebates: 1,  noteMaps: 1 } },
  'plus-lite': { id: 'plus-lite',   label: 'Plus-Lite',  amountUsd: 2,  interval: 'month', mode: null,           buyable: false, unlock: 'referral', referralsRequired: 2,
                 limits: { dailyMessages: 120, dailyQB: 5,  weeklyCurricula: 2,  weeklyDebates: 2,  noteMaps: 3 } },
  plus:        { id: 'plus',        label: 'Plus',       amountUsd: 4,  interval: 'month', mode: 'subscription', buyable: true,
                 limits: { dailyMessages: 250, dailyQB: 10, weeklyCurricula: 5,  weeklyDebates: 5,  noteMaps: 10 } },
  lifetime:    { id: 'lifetime',    label: 'Lifetime',   amountUsd: 20, interval: 'once',  mode: 'payment',      buyable: true,
                 limits: { dailyMessages: 600, dailyQB: 25, weeklyCurricula: 12, weeklyDebates: 15, noteMaps: 25 } },
  pro:         { id: 'pro',         label: 'Pro',        amountUsd: 10, interval: 'month', mode: 'subscription', buyable: true,
                 limits: { dailyMessages: Infinity, dailyQB: Infinity, weeklyCurricula: Infinity, weeklyDebates: Infinity, noteMaps: Infinity } },
};
export default FALLBACK_TIERS;
