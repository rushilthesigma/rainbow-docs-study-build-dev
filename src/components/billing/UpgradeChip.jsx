import { useEffect, useRef, useState } from 'react';
import { Crown, ArrowRight, RotateCcw } from 'lucide-react';
import { Z } from '../../styles/tokens';
import { useAuth } from '../../context/AuthContext';
import { useWindowManager } from '../../context/WindowManagerContext';
import { getTiers, getMyUsage, resetWeeklyCredits } from '../../api/billing';
import FALLBACK_TIERS, { mergeTiers, fmtCredits } from './tiersCatalog';

// Compact pill in the MenuBar. Reads as "Upgrade" (blue) for Free users and
// "Plan" (gray) for Paid. The popover shows only a compact credit meter; the
// full plan + per-model cost breakdown ("advanced look") lives in Settings.
export default function UpgradeChip() {
  const { user } = useAuth();
  const { openApp } = useWindowManager();
  // Server is the source of truth for plan; the cached AuthContext user can be
  // stale, so prefer the live usage payload once loaded.
  const cachedPlan = user?.data?.plan || 'free';

  const [open, setOpen] = useState(false);
  const [tiers, setTiers] = useState(FALLBACK_TIERS);
  const [usage, setUsage] = useState(null);  // { plan, credits, modelCosts }
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
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

  const plan = usage?.plan || (['paid', 'plus', 'pro', 'lifetime'].includes(cachedPlan) ? 'paid' : 'free');
  const isPaid = plan === 'paid' || !!user?.data?.lifetimePurchasedAt;
  const credits = usage?.credits || null;

  function openSettings() {
    setOpen(false);
    openApp('settings', 'Settings');
  }

  async function useReset() {
    if (resetBusy || !window.confirm('Use one banked reset to refill this week’s credits?')) return;
    setResetBusy(true);
    setResetError('');
    try {
      const next = await resetWeeklyCredits();
      setUsage(current => ({ ...current, ...next }));
    } catch (e) {
      setResetError(e?.data?.message || e?.message || 'Could not reset credits.');
    } finally {
      setResetBusy(false);
    }
  }

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
          className="absolute right-0 top-7 w-[260px] rounded-xl overflow-hidden shadow-2xl border border-white/[0.07] animate-modal-in"
          style={{ zIndex: Z.menubarMenu, background: '#181818' }}
        >
          <CreditMeter
            credits={credits}
            creditResets={usage?.creditResets}
            plan={plan}
            tiers={tiers}
            onReset={useReset}
            resetBusy={resetBusy}
            resetError={resetError}
            onOpenSettings={openSettings}
          />
        </div>
      )}
    </div>
  );
}

// Compact credit meter: an accent-colored progress bar showing the percentage
// of this week's credits used, with the figure underneath. The full breakdown
// (plans + per-model costs) lives one click away in Settings.
function CreditMeter({ credits, creditResets, plan, tiers, onReset, resetBusy, resetError, onOpenSettings }) {
  const unlimited = !credits || credits.unlimited || credits.allowance == null;
  const allowance = credits?.allowance ?? (tiers?.[plan]?.dailyCredits ?? tiers?.[plan]?.limits?.dailyCredits ?? 500);
  const used = credits?.used ?? 0;
  const pct = unlimited ? 100 : Math.min(100, Math.round((used / Math.max(1, allowance)) * 100));
  const resetsAvailable = creditResets?.available ?? 0;
  const canReset = resetsAvailable > 0 && used > 0 && !unlimited;

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[9px] font-semibold uppercase tracking-widest text-white/30">Credits this week</div>
        <div className="text-[10px] text-white/35">rolling 7 days</div>
      </div>

      {/* Accent progress bar — fills with the share of credits used. */}
      <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] ${unlimited ? 'bg-white/20' : 'bg-blue-400'}`}
          style={{ width: `${unlimited ? 100 : Math.max(2, pct)}%` }}
        />
      </div>

      <div className="mt-2 text-[11px] text-white/55 tabular-nums">
        {unlimited
          ? 'Unlimited credits'
          : `${fmtCredits(used)} / ${fmtCredits(allowance)} credits (${pct}%)`}
      </div>

      <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between gap-3">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-widest text-white/30">Banked resets</div>
          <div className={`text-[11px] tabular-nums ${resetsAvailable > 0 ? 'text-emerald-300' : 'text-white/40'}`}>
            {resetsAvailable} available
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={!canReset || resetBusy}
          className="inline-flex items-center gap-1 rounded-md border border-white/[0.10] bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-white/70 transition-colors hover:border-white/[0.18] hover:bg-white/[0.10] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
        >
          <RotateCcw size={10} /> {resetBusy ? 'Resetting…' : 'Use reset'}
        </button>
      </div>
      {resetError && <p role="alert" className="mt-1.5 text-[10px] text-rose-300">{resetError}</p>}
      {!resetError && resetsAvailable === 0 && (
        <p className="mt-1.5 text-[10px] text-white/30">Refer a friend to bank one reset.</p>
      )}

      <button
        onClick={onOpenSettings}
        className="mt-1 inline-flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
      >
        For an advanced look, open Settings <ArrowRight size={9} />
      </button>
    </div>
  );
}
