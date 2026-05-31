// Fallback tier catalog. Server's /api/billing/tiers is authoritative;
// this renders when that endpoint is missing (old server build).
const FALLBACK_TIERS = {
  free:        { id: 'free',        label: 'Free',       amountUsd: 0,  interval: 'month', mode: null,           buyable: false,
                 limits: { dailyMessages: 30,  dailyQB: 1,  weeklyCurricula: 1,  weeklyDebates: 1,  noteMaps: 1 } },
  'plus-lite': { id: 'plus-lite',   label: 'Plus-Lite',  amountUsd: 2,  interval: 'month', mode: null,           buyable: false, unlock: 'referral', referralsRequired: 2,
                 limits: { dailyMessages: 75,  dailyQB: 3,  weeklyCurricula: 2,  weeklyDebates: 2,  noteMaps: 2 } },
  plus:        { id: 'plus',        label: 'Plus',       amountUsd: 4,  interval: 'month', mode: 'subscription', buyable: true,
                 limits: { dailyMessages: 150, dailyQB: 6,  weeklyCurricula: 3,  weeklyDebates: 4,  noteMaps: 6 } },
  lifetime:    { id: 'lifetime',    label: 'Lifetime',   amountUsd: 20, interval: 'once',  mode: 'payment',      buyable: true,
                 limits: { dailyMessages: 350, dailyQB: 15, weeklyCurricula: 8,  weeklyDebates: 10, noteMaps: 15 } },
  pro:         { id: 'pro',         label: 'Pro',        amountUsd: 10, interval: 'month', mode: 'subscription', buyable: true,
                 limits: { dailyMessages: Infinity, dailyQB: Infinity, weeklyCurricula: Infinity, weeklyDebates: Infinity, noteMaps: Infinity } },
};
export default FALLBACK_TIERS;
