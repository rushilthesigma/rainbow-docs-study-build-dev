import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getTiers, createCheckoutSession, getMyUsage } from '../../api/billing';
import FALLBACK_TIERS, { FALLBACK_MODEL_COSTS, mergeTiers, fmtCap, fmtCredits } from './tiersCatalog';

// The full "advanced look" at plans + credits. Lives in Settings → Account.
// The MenuBar UpgradeChip now shows only a compact meter and links here.
export default function PlanDetails() {
  const { user } = useAuth();
  const cachedPlan = user?.data?.plan || 'free';

  const [tiers, setTiers] = useState(FALLBACK_TIERS);
  const [usage, setUsage] = useState(null);  // { plan, credits, modelCosts }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getTiers().then(d => setTiers(mergeTiers(FALLBACK_TIERS, d.tiers))).catch(() => {});
    getMyUsage().then(setUsage).catch(() => {});
  }, []);

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
  const credits = usage?.credits || null;
  const modelCosts = usage?.modelCosts || FALLBACK_MODEL_COSTS;

  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.07] bg-white/[0.02]">
      <CreditBalance credits={credits} plan={plan} tiers={tiers} />
      <PlanList tiers={tiers} plan={plan} onBuy={buy} busy={busy} />
      <ModelCostList modelCosts={modelCosts} />
    </div>
  );
}

// Plans as a flat list (no side-by-side comparison boxes). Current plan gets a
// badge; the paid row carries the Upgrade button.
function PlanList({ tiers, plan, onBuy, busy }) {
  return (
    <div className="px-4 py-2.5 border-b border-white/[0.06]">
      <div className="text-[9px] font-semibold uppercase tracking-widest text-white/30 mb-1">Plans</div>
      <ul className="divide-y divide-white/[0.05]">
        {['free', 'paid'].map(id => {
          const t = tiers[id];
          if (!t) return null;
          const isCurrent = plan === id;
          const daily = t.dailyCredits ?? t.limits?.dailyCredits;
          const price = id === 'free' ? 'Free' : `$${t.amountUsd}/${t.interval || 'month'}`;
          return (
            <li key={id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-white leading-tight">
                  {t.label}
                  <span className="text-[11px] font-normal text-white/40 ml-2 tabular-nums">{price}</span>
                </div>
                <div className="text-[11px] text-white/45 tabular-nums mt-0.5">
                  {fmtCredits(daily)} credits/day · {fmtCap(t.limits?.noteMaps)} note maps
                </div>
              </div>
              {isCurrent ? (
                <span className="shrink-0 text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5">
                  <Check size={9} /> Current
                </span>
              ) : id === 'paid' ? (
                <button
                  onClick={onBuy}
                  disabled={busy || !t.buyable}
                  className="shrink-0 px-3 py-1 rounded bg-blue-500 hover:bg-blue-400 text-white text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? '…' : 'Upgrade'}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Daily credit balance gauge. Bar fills red near empty.
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
      <ul className="text-[12px] leading-relaxed">
        {entries.map(([key, cost]) => (
          <li key={key} className="text-white/60">
            {LABELS[key] || key}
            <span className="text-white/35"> — </span>
            <span className="tabular-nums text-white/80">{cost} cr</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
