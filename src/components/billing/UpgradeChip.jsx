import { useEffect, useRef, useState } from 'react';
import { Crown, Check, Gift } from 'lucide-react';
import { Z } from '../../styles/tokens';
import { useAuth } from '../../context/AuthContext';
import { getTiers, createCheckoutSession, getMyUsage } from '../../api/billing';
import { getMyReferralCode } from '../../api/referral';
import FALLBACK_TIERS from './tiersCatalog';

// Compact pill in the MenuBar. Reads as "Upgrade" (blue) for Free /
// Plus-Lite users and "Plan" (gray) for Plus / Lifetime / Pro - same
// popover either way so paid users can still see their usage + their
// current tier (with a checkmark).
export default function UpgradeChip() {
  const { user } = useAuth();
  // Server is the source of truth for plan. The AuthContext user can be
  // stale (admin grant/revoke doesn't push to the client), so we prefer
  // the live usage payload once it's loaded and only fall back to the
  // cached AuthContext while waiting.
  const cachedPlan = user?.data?.plan || 'free';

  const [open, setOpen] = useState(false);
  const [tiers, setTiers] = useState(FALLBACK_TIERS);
  const [referral, setReferral] = useState(null);
  const [usage, setUsage] = useState(null);  // { plan, limits, used }
  const [busy, setBusy] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    // Merge server tiers with the fallback so any missing fields
    // (e.g. an older server that doesn't expose noteMaps in `limits`)
    // fall through to the static numbers instead of rendering
    // "undefined".
    getTiers().then(d => setTiers(mergeTiers(FALLBACK_TIERS, d.tiers))).catch(() => {});
    getMyReferralCode().then(setReferral).catch(() => {});
    getMyUsage().then(setUsage).catch(() => {});
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('pointerdown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function buy(id) {
    if (busy) return;
    setBusy(id);
    try {
      const { url } = await createCheckoutSession(id);
      if (url) window.open(url, '_blank', 'noopener');
    } catch (e) {
      alert(e?.message || 'Checkout failed.');
    } finally {
      setBusy(null);
    }
  }

  // Server-resolved plan (lifetime override, referral unlock, etc.)
  // takes precedence; falls back to the cached AuthContext value before
  // /api/billing/usage resolves.
  const plan = usage?.plan || cachedPlan;
  const isPaid = ['plus', 'pro', 'lifetime'].includes(plan) || !!user?.data?.lifetimePurchasedAt;
  const order = ['free', 'plus-lite', 'plus', 'lifetime', 'pro'];
  const refsUsed = referral?.referralsUsed ?? 0;
  const refsNeeded = referral?.referralsRequired ?? 2;
  const refsUnlocked = refsUsed >= refsNeeded;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
          isPaid
            ? 'bg-white/[0.08] hover:bg-white/[0.14] text-white/70 hover:text-white/95 border border-white/[0.10]'
            : 'bg-blue-500 hover:bg-blue-400 text-white'
        }`}
      >
        <Crown size={11} /> {isPaid ? 'Plan' : 'Upgrade'}
      </button>

      {open && (
        <div
          className="absolute right-0 top-7 w-[520px] rounded-xl overflow-hidden shadow-2xl border border-white/[0.07] animate-modal-in"
          style={{ zIndex: Z.menubarMenu, background: '#181818' }}
        >
          <UsageBlock usage={usage || fallbackUsage(plan, tiers)} />
          <div className="grid grid-cols-5 divide-x divide-white/[0.05]">
            {order.map(id => {
              const t = tiers[id];
              if (!t) return null;
              const isFree = id === 'free';
              const isReferral = t.unlock === 'referral';
              const isCurrent = t.id === plan || (isReferral && refsUnlocked && plan === 'free');
              return (
                <div key={id} className="px-3 py-3 flex flex-col gap-2.5">
                  <div>
                    <div className="text-[12px] font-bold text-white leading-tight">{t.label}</div>
                    <div className="text-[11px] mt-0.5">
                      {isFree ? (
                        <span className="text-white/35">Free</span>
                      ) : isReferral ? (
                        <span className="text-emerald-400 inline-flex items-center gap-0.5"><Gift size={9} /> Gift</span>
                      ) : (
                        <span className="text-white/45 tabular-nums">
                          ${t.amountUsd}{t.interval !== 'once' && `/${t.interval}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-white/30 space-y-0.5 tabular-nums flex-1 leading-relaxed">
                    <div>{fmtCap(t.limits?.dailyMessages)} msgs</div>
                    <div>{fmtCap(t.limits?.dailyQB)} QB</div>
                    <div>{fmtCap(t.limits?.weeklyCurricula)} curr</div>
                    <div>{fmtCap(t.limits?.weeklyDebates)} debates</div>
                  </div>
                  {isCurrent ? (
                    <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5">
                      <Check size={9} /> Current
                    </div>
                  ) : isReferral ? (
                    <div className={`text-[10px] ${refsUnlocked ? 'text-emerald-400' : 'text-white/30'}`}>
                      {refsUsed}/{refsNeeded} joined
                    </div>
                  ) : !isFree && (
                    <button
                      onClick={() => buy(id)}
                      disabled={busy === id || !t.buyable}
                      className="w-full py-1 rounded bg-white/[0.08] hover:bg-white/[0.15] text-white/70 hover:text-white text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {busy === id ? '…' : 'Get'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Deep-merge server tiers over the static fallback. Both keys (tier id)
// and inner objects (`limits`) merge field-by-field so the client gets
// the freshest numbers but still has a value for fields the server
// hasn't been redeployed to include yet.
function mergeTiers(base, live) {
  if (!live) return base;
  const out = {};
  const ids = new Set([...Object.keys(base), ...Object.keys(live)]);
  for (const id of ids) {
    const b = base[id] || {};
    const l = live[id] || {};
    out[id] = { ...b, ...l, limits: { ...(b.limits || {}), ...(l.limits || {}) } };
  }
  return out;
}

// One-line summary of a tier's caps. Skips any field that came through
// as undefined / null (defensive: stale server payloads shouldn't paint
// the word "undefined").
// Fallback usage payload built from the tier catalog when the live
// /api/billing/usage endpoint isn't reachable. All used counters are
// 0 so the bars start empty - better than hiding the block.
function fallbackUsage(plan, tiers) {
  const tier = tiers?.[plan] || tiers?.free || {};
  return {
    plan,
    limits: tier.limits || {},
    used: { dailyMessages: 0, dailyQB: 0, weeklyCurricula: 0, weeklyDebates: 0, noteMaps: 0 },
  };
}

// JSON serializes Infinity to null, so null/undefined cap from the
// server means "unlimited" - render as infinity, never as blank or
// "undefined".
function fmtCap(n) {
  if (n === null || n === undefined || n === Infinity || n > 9999) return '∞';
  return n;
}
function fmtLimits(L = {}) {
  return [
    `${fmtCap(L.dailyMessages)} msgs/day`,
    `${fmtCap(L.dailyQB)} QB/day`,
    `${fmtCap(L.weeklyCurricula)} curr/wk`,
    `${fmtCap(L.weeklyDebates)} debates/wk`,
    `${fmtCap(L.noteMaps)} note maps`,
  ].join(' · ');
}

// Five mini "X / Y" gauges for the caller's current bucket. Bar fills
// red if at the cap, amber if near, blue otherwise. Hidden if the
// server doesn't return usage data.
function UsageBlock({ usage }) {
  const L = usage.limits || {};
  const U = usage.used || {};
  const cols = [
    { short: 'Msgs',   used: U.dailyMessages,   cap: L.dailyMessages },
    { short: 'QB',     used: U.dailyQB,         cap: L.dailyQB },
    { short: 'Curr',  used: U.weeklyCurricula, cap: L.weeklyCurricula },
    { short: 'Debates', used: U.weeklyDebates,  cap: L.weeklyDebates },
    { short: 'Maps',   used: U.noteMaps,        cap: L.noteMaps },
  ];
  return (
    <div className="flex divide-x divide-white/[0.06] border-b border-white/[0.06]">
      {cols.map(c => <UsageCol key={c.short} {...c} />)}
    </div>
  );
}

function UsageCol({ short, used = 0, cap }) {
  const isInf = cap === null || cap === undefined || cap === Infinity || cap > 9999;
  const pct = isInf ? 0 : Math.min(100, Math.round((used / Math.max(1, cap)) * 100));
  const tone = isInf ? 'bg-white/20'
    : pct >= 100 ? 'bg-rose-400'
    : pct >= 75 ? 'bg-amber-400'
    : 'bg-white/50';
  return (
    <div className="flex-1 px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-widest text-white/30 mb-1">{short}</div>
      <div className="text-[13px] font-semibold text-white tabular-nums leading-none">
        {used}<span className="text-white/25 text-[10px]"> /{isInf ? '∞' : cap}</span>
      </div>
      <div className="mt-1.5 h-px rounded-full bg-white/[0.07]">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${isInf ? 10 : pct}%` }} />
      </div>
    </div>
  );
}
