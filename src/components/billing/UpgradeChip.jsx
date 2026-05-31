import { useEffect, useRef, useState } from 'react';
import { Crown, Check, Gift } from 'lucide-react';
import { Z } from '../../styles/tokens';
import { useAuth } from '../../context/AuthContext';
import { getTiers, createCheckoutSession, getMyUsage } from '../../api/billing';
import { getMyReferralCode } from '../../api/referral';
import FALLBACK_TIERS from './tiersCatalog';

// Compact "Upgrade" pill in the MenuBar. Click → popover listing every
// tier with its price + limits + a buy button. Hidden when the user is
// already on a paid tier.
export default function UpgradeChip() {
  const { user } = useAuth();
  const plan = user?.data?.plan || 'free';
  const isPaid = ['plus', 'pro', 'lifetime'].includes(plan) || !!user?.data?.lifetimePurchasedAt;
  if (isPaid) return null;

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
      if (url) window.location.href = url;
    } catch (e) {
      alert(e?.message || 'Checkout failed.');
      setBusy(null);
    }
  }

  const order = ['free', 'plus-lite', 'plus', 'lifetime', 'pro'];
  const refsUsed = referral?.referralsUsed ?? 0;
  const refsNeeded = referral?.referralsRequired ?? 2;
  const refsUnlocked = refsUsed >= refsNeeded;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500 hover:bg-blue-400 text-white text-[11px] font-semibold transition-colors"
      >
        <Crown size={11} /> Upgrade
      </button>

      {open && (
        <div
          className="absolute right-0 top-7 w-80 rounded-xl overflow-hidden shadow-xl border border-white/[0.10] animate-modal-in"
          style={{ zIndex: Z.menubarMenu, background: 'rgb(30, 30, 40)' }}
        >
          {/* Caller's current usage vs caps. If the live usage endpoint
              hasn't loaded yet (or 404s on an older server), fall back
              to "0 / cap" using the static limits from the user's tier
              so the block always renders. */}
          <UsageBlock usage={usage || fallbackUsage(plan, tiers)} />
          <ul className="divide-y divide-white/[0.05]">
            {order.map(id => {
              const t = tiers[id];
              if (!t) return null;
              const isFree = id === 'free';
              const isReferral = t.unlock === 'referral';
              const isCurrent = t.id === plan || (isReferral && refsUnlocked && plan === 'free');
              return (
                <li key={id} className="px-3 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[14px] font-bold text-white">{t.label}</span>
                    {/* Free tier: name already says "Free"; don't duplicate. */}
                    {isReferral ? (
                      <span className="text-[13px] font-bold text-emerald-300 inline-flex items-center gap-1">
                        <Gift size={11} /> Free
                      </span>
                    ) : !isFree && (
                      <>
                        <span className="text-[13px] font-bold text-white tabular-nums">${t.amountUsd}</span>
                        <span className="text-[11px] text-white/45">
                          {t.interval === 'once' ? 'once' : `/${t.interval}`}
                        </span>
                      </>
                    )}
                    {isCurrent && (
                      <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-emerald-300 font-semibold">
                        <Check size={9} /> Current
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/55 mt-1 tabular-nums">
                    {fmtLimits(t.limits)}
                  </p>
                  {isReferral ? (
                    <p className={`text-[10.5px] mt-1.5 ${refsUnlocked ? 'text-emerald-300' : 'text-white/45'}`}>
                      {refsUnlocked
                        ? `${refsUsed}/${refsNeeded} friends joined`
                        : `${refsUsed}/${refsNeeded} friends joined. Share from gift icon.`}
                    </p>
                  ) : !isFree && (
                    <button
                      onClick={() => buy(id)}
                      disabled={busy === id || !t.buyable || isCurrent}
                      className="mt-2 w-full px-2 py-1.5 rounded-md bg-blue-500 hover:bg-blue-400 text-white text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {busy === id ? 'Opening' : (isCurrent ? 'Current' : `Get ${t.label}`)}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
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
  const rows = [
    { label: 'Messages sent today',          used: U.dailyMessages,    cap: L.dailyMessages },
    { label: 'Quiz Bowl games played today', used: U.dailyQB,          cap: L.dailyQB },
    { label: 'Curricula generated this week',used: U.weeklyCurricula,  cap: L.weeklyCurricula },
    { label: 'Debates started this week',    used: U.weeklyDebates,    cap: L.weeklyDebates },
    { label: 'Note maps created',            used: U.noteMaps,         cap: L.noteMaps },
  ];
  return (
    <div className="px-3 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40 mb-2">Your usage</p>
      <div className="space-y-1.5">
        {rows.map(r => <UsageRow key={r.label} {...r} />)}
      </div>
    </div>
  );
}

function UsageRow({ label, used = 0, cap }) {
  // null / undefined cap from the server = serialized Infinity = unlimited.
  const isInf = cap === null || cap === undefined || cap === Infinity || cap > 9999;
  const pct = isInf ? 0 : Math.min(100, Math.round((used / Math.max(1, cap)) * 100));
  const tone = isInf ? 'bg-white/15'
    : pct >= 100 ? 'bg-rose-400'
    : pct >= 75 ? 'bg-amber-400'
    : 'bg-blue-400';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-white/70 flex-1 truncate">{label}</span>
      <span className="text-[11px] tabular-nums text-white/80 font-semibold w-14 text-right">
        {used}{isInf ? ' / ∞' : ` / ${cap}`}
      </span>
      <span className="w-12 h-1 rounded-full bg-white/[0.06] overflow-hidden flex-shrink-0">
        <span className={`block h-full ${tone}`} style={{ width: `${isInf ? 8 : pct}%` }} />
      </span>
    </div>
  );
}
