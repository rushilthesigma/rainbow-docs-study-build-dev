import { useEffect, useState } from 'react';
import { Zap, Crown, Loader2, Check, ExternalLink, AlertTriangle, X } from 'lucide-react';
import AdvisorBadge from './AdvisorBadge';
import {
  getBillingStatus, openBillingPortal,
  ownerGrantPro, ownerRevokePro, syncBilling,
} from '../../api/billing';
import { useAuth } from '../../context/AuthContext';

const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/14A4gt7v70782E59jRdby01';

export default function PlanSection() {
  const { user } = useAuth();
  const [showPayWarning, setShowPayWarning] = useState(false);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function refresh() {
    try { const d = await getBillingStatus(); setStatus(d); } catch {}
    setLoading(false);
  }
  useEffect(() => {
    // If we just came back from Stripe Checkout, pull the sub status
    // directly from Stripe before showing the plan card.
    const params = new URLSearchParams(window.location.search);
    const justUpgraded = params.has('upgraded');
    (async () => {
      if (justUpgraded) { try { await syncBilling(); } catch {} }
      refresh();
    })();
    // Extra refresh 3s later — subscriptions can lag a moment to appear
    const t = justUpgraded ? setTimeout(refresh, 3000) : null;
    return () => { if (t) clearTimeout(t); };
  }, []);

  async function handleSyncNow() {
    setBusy(true); setErr(null);
    try { await syncBilling(); await refresh(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }

  function upgrade() {
    // Show the payment-safety warning first; actual redirect happens on confirm.
    setShowPayWarning(true);
  }
  function confirmUpgrade() {
    const email = user?.email || '';
    const url = email
      ? `${STRIPE_PAYMENT_LINK}?prefilled_email=${encodeURIComponent(email)}`
      : STRIPE_PAYMENT_LINK;
    window.location.href = url;
  }
  async function managePortal() {
    setBusy(true);
    try {
      const d = await openBillingPortal();
      if (d.url) window.location.href = d.url;
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  if (loading) return (
    <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-6 flex items-center gap-2">
      <Loader2 size={16} className="animate-spin text-gray-400" /> <span className="text-xs text-gray-400">Loading plan…</span>
    </div>
  );
  if (!status) return null;

  const pro = status.plan === 'pro';
  const msgUsed = status.usage?.messages || 0;
  const msgLimit = status.limits?.messagesPerDay;
  const qbUsed = status.usage?.quizBowlGames || 0;
  const qbLimit = status.limits?.quizBowlGamesPerDay;
  const cUsed = status.usage?.curricula || 0;
  const cLimit = status.limits?.curriculaPerWeek;
  const dUsed = status.usage?.debates || 0;
  const dLimit = status.limits?.debatesPerWeek;

  return (
    <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">Plan</h3>
            {status.isAdvisor && <AdvisorBadge />}
            {pro && !status.isAdvisor && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-white shadow-sm">
                <Crown size={10} /> PRO
              </span>
            )}
            {!pro && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#1e1e2e] text-gray-500">FREE</span>}
          </div>
          {pro && status.proUntil && (
            <p className="text-xs text-gray-500 mt-1">Renews/expires {new Date(status.proUntil).toLocaleDateString()}</p>
          )}
          {pro && !status.proUntil && status.proGrantedBy && (
            <p className="text-xs text-gray-500 mt-1">Granted by {status.proGrantedBy === 'owner' ? 'the owner' : status.proGrantedBy}</p>
          )}
        </div>
        {!pro && (
          <div className="flex items-center gap-2">
            <button onClick={handleSyncNow} disabled={busy} title="Already paid? Sync status from Stripe" className="text-[11px] text-gray-400 hover:text-blue-500 underline disabled:opacity-50">
              Refresh
            </button>
            <button onClick={upgrade} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white text-xs font-semibold shadow disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              Upgrade to Pro
            </button>
          </div>
        )}
        {pro && status.proGrantedBy !== 'owner' && (
          <button onClick={managePortal} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] text-xs font-medium text-gray-700 dark:text-gray-300 disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
            Manage
          </button>
        )}
      </div>

      {/* Usage (free only) */}
      {!pro && (
        <div className="space-y-2">
          <UsageBar label="AI messages today" used={msgUsed} limit={msgLimit} />
          <UsageBar label="Quiz Bowl games today" used={qbUsed} limit={qbLimit} />
          <UsageBar label="Curricula this week" used={cUsed} limit={cLimit} />
          <UsageBar label="Debates this week" used={dUsed} limit={dLimit} />
        </div>
      )}

      {/* Pro features list */}
      <div className="rounded-lg border border-gray-200 dark:border-[#2A2A40] p-3 space-y-1.5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Pro includes</p>
        <Feat>Unlimited AI messages (free is 20/day)</Feat>
        <Feat>Unlimited curricula + debates (free is 1 each per week)</Feat>
        <Feat>Gemini 3.1 Pro on lessons + study (vs Gemini 3 Flash on free)</Feat>
        <Feat>Unlimited multiplayer Quiz Bowl games</Feat>
        <Feat>Pro badge next to your handle</Feat>
      </div>

      {err && <p className="text-xs text-rose-500">{err}</p>}

      {status.isOwner && <OwnerGrantPanel onChanged={refresh} />}

      {showPayWarning && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
          onClick={() => setShowPayWarning(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] shadow-2xl p-6"
          >
            <button
              onClick={() => setShowPayWarning(false)}
              className="absolute top-3 right-3 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1e1e2e]"
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
              <AlertTriangle size={22} />
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-2">
              Before you continue
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              We do <strong>NOT</strong> collect your credit card. Stripe handles all of the payments.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowPayWarning(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#2A2A40] text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-[#1e1e2e]"
              >
                Cancel
              </button>
              <button
                onClick={confirmUpgrade}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white text-sm font-semibold"
              >
                Continue to Stripe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UsageBar({ label, used, limit }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const near = pct >= 80;
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-gray-500">{label}</span>
        <span className={`tabular-nums ${near ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{used}/{limit}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-[#1e1e2e] overflow-hidden">
        <div className={`h-full rounded-full ${near ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Feat({ children }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200">
      <Check size={11} className="text-emerald-500 flex-shrink-0" /> {children}
    </div>
  );
}

function OwnerGrantPanel({ onChanged }) {
  const [target, setTarget] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  async function grant() {
    if (!target.trim()) return;
    setBusy(true); setMsg(null);
    try { await ownerGrantPro(target.trim()); setMsg('✓ Granted Pro to ' + target); setTarget(''); onChanged?.(); }
    catch (e) { setMsg('⚠ ' + e.message); }
    setBusy(false);
  }
  async function revoke() {
    if (!target.trim()) return;
    setBusy(true); setMsg(null);
    try { await ownerRevokePro(target.trim()); setMsg('✓ Revoked Pro from ' + target); setTarget(''); onChanged?.(); }
    catch (e) { setMsg('⚠ ' + e.message); }
    setBusy(false);
  }
  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3 space-y-2">
      <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1"><Crown size={10} /> Owner Controls</p>
      <p className="text-[11px] text-gray-500">Grant or revoke Pro for any user by email.</p>
      <div className="flex gap-2">
        <input
          value={target}
          onChange={e => setTarget(e.target.value)}
          placeholder="user@example.com"
          className="flex-1 px-2 py-1.5 rounded border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-xs outline-none"
        />
        <button onClick={grant} disabled={busy} className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-50">Grant</button>
        <button onClick={revoke} disabled={busy} className="px-3 py-1.5 rounded border border-gray-200 dark:border-[#2A2A40] text-xs font-medium text-gray-700 dark:text-gray-300 disabled:opacity-50">Revoke</button>
      </div>
      {msg && <p className="text-[11px] text-gray-600 dark:text-gray-300">{msg}</p>}
    </div>
  );
}
