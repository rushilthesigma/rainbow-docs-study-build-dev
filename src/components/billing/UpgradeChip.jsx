import { useEffect, useRef, useState } from 'react';
import { Crown, Check } from 'lucide-react';
import { Z } from '../../styles/tokens';
import { useAuth } from '../../context/AuthContext';
import { getTiers, createCheckoutSession, getMyUsage } from '../../api/billing';
import FALLBACK_TIERS, { FALLBACK_MODEL_COSTS } from './tiersCatalog';

// Compact pill in the MenuBar. Reads as "Upgrade" (blue) for Free users and
// "Plan" (gray) for Paid - same popover either way, showing the credit balance
// and the two plans.
export default function UpgradeChip() {
  const { user } = useAuth();
  // Server is the source of truth for plan; the cached AuthContext user can be
  // stale, so prefer the live usage payload once loaded.
  const cachedPlan = user?.data?.plan || 'free';

  const [open, setOpen] = useState(false);
  const [tiers, setTiers] = useState(FALLBACK_TIERS);
  const [usage, setUsage] = useState(null);  // { plan, credits, modelCosts }
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    getTiers().then(d => setTiers(mergeTiers(FALLBACK_TIERS, d.tiers))).catch(() => {});
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

  async function buy() {
    if (busy) return;
    setBusy(true);
    try {
      const { url } = await createCheckoutSession('paid');
      if (url) window.open(url, '_blank', 'noopener');
    } catch (e) {
      alert(e?.message || 'Checkout failed.');
    } finally {
      setBusy(false);
    }
  }

  const plan = usage?.plan || (['paid', 'plus', 'pro', 'lifetime'].includes(cachedPlan) ? 'paid' : 'free');
  const isPaid = plan === 'paid' || !!user?.data?.lifetimePurchasedAt;
  const credits = usage?.credits || null;
  const modelCosts = usage?.modelCosts || FALLBACK_MODEL_COSTS;

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
          className="absolute right-0 top-7 w-[420px] rounded-xl overflow-hidden shadow-2xl border border-white/[0.07] animate-modal-in"
          style={{ zIndex: Z.menubarMenu, background: '#181818' }}
        >
          <CreditBalance credits={credits} plan={plan} tiers={tiers} />
          <div className="grid grid-cols-2 divide-x divide-white/[0.05]">
            {['free', 'paid'].map(id => {
              const t = tiers[id];
              if (!t) return null;
              const isCurrent = plan === id;
              const daily = t.dailyCredits ?? t.limits?.dailyCredits;
              return (
                <div key={id} className="px-4 py-3.5 flex flex-col gap-2.5">
                  <div>
                    <div className="text-[13px] font-bold text-white leading-tight">{t.label}</div>
                    <div className="text-[11px] mt-0.5">
                      {id === 'free'
                        ? <span className="text-white/35">Free</span>
                        : <span className="text-white/45 tabular-nums">${t.amountUsd}/{t.interval || 'month'}</span>}
                    </div>
                  </div>
                  <div className="text-[11px] text-white/45 space-y-1 flex-1 leading-relaxed">
                    <div className="text-white font-semibold tabular-nums">{fmtCredits(daily)} credits/day</div>
                    <div>All models — pay per use</div>
                    <div className="text-white/30">{fmtCap(t.limits?.noteMaps)} note maps</div>
                  </div>
                  {isCurrent ? (
                    <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5">
                      <Check size={9} /> Current
                    </div>
                  ) : id === 'paid' ? (
                    <button
                      onClick={buy}
                      disabled={busy || !t.buyable}
                      className="w-full py-1.5 rounded bg-blue-500 hover:bg-blue-400 text-white text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {busy ? '…' : 'Upgrade'}
                    </button>
                  ) : <div className="h-[26px]" />}
                </div>
              );
            })}
          </div>
          <ModelCostList modelCosts={modelCosts} />
        </div>
      )}
    </div>
  );
}

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

// JSON serializes Infinity to null, so null/undefined means "unlimited".
function fmtCap(n) {
  if (n === null || n === undefined || n === Infinity || n > 9999) return '∞';
  return n;
}
function fmtCredits(n) {
  if (n === null || n === undefined || n === Infinity) return '∞';
  return n.toLocaleString();
}

// Daily credit balance gauge for the caller. Bar fills red near empty.
function CreditBalance({ credits, plan, tiers }) {
  const unlimited = !credits || credits.unlimited || credits.allowance == null;
  const allowance = credits?.allowance ?? (tiers?.[plan]?.dailyCredits ?? tiers?.[plan]?.limits?.dailyCredits ?? 100);
  const used = credits?.used ?? 0;
  const remaining = unlimited ? null : (credits?.remaining ?? Math.max(0, allowance - used));
  const pct = unlimited ? 10 : Math.min(100, Math.round((used / Math.max(1, allowance)) * 100));
  const tone = unlimited ? 'bg-white/20'
    : pct >= 100 ? 'bg-rose-400'
    : pct >= 85 ? 'bg-amber-400'
    : 'bg-blue-400';
  return (
    <div className="px-4 py-3 border-b border-white/[0.06]">
      <div className="flex items-baseline justify-between">
        <div className="text-[9px] font-semibold uppercase tracking-widest text-white/30">Credits today</div>
        <div className="text-[10px] text-white/35">resets every 24h</div>
      </div>
      <div className="text-[15px] font-semibold text-white tabular-nums mt-0.5 leading-none">
        {unlimited ? 'Unlimited' : <>{fmtCredits(remaining)}<span className="text-white/25 text-[11px]"> / {fmtCredits(allowance)} left</span></>}
      </div>
      <div className="mt-2 h-1 rounded-full bg-white/[0.07]">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${unlimited ? 100 : Math.max(2, 100 - pct)}%` }} />
      </div>
    </div>
  );
}

// Compact per-model credit-cost reference so users know what each model spends.
function ModelCostList({ modelCosts }) {
  const LABELS = {
    'flash-lite': 'Flash Lite', 'deepseek-flash': 'DeepSeek V4', 'grok': 'Grok 4.3', 'flash': 'Flash',
    'gpt-5.4-mini': 'GPT-5.4 mini', 'deepseek-pro': 'DeepSeek Pro', 'haiku': 'Haiku 4.5',
    'gemini-pro': 'Gemini Pro', 'sonnet': 'Sonnet 4.6', 'gpt-5.4': 'GPT-5.4',
  };
  const entries = Object.entries(modelCosts || {}).sort((a, b) => a[1] - b[1]);
  if (!entries.length) return null;
  return (
    <div className="px-4 py-3 border-t border-white/[0.06]">
      <div className="text-[9px] font-semibold uppercase tracking-widest text-white/30 mb-1.5">Cost per message</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {entries.map(([key, cost]) => (
          <div key={key} className="flex items-center justify-between text-[11px]">
            <span className="text-white/55 truncate">{LABELS[key] || key}</span>
            <span className="text-white/80 tabular-nums font-medium">{cost} cr</span>
          </div>
        ))}
      </div>
    </div>
  );
}
