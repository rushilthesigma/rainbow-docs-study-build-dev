import { useEffect, useRef, useState } from 'react';
import { Gift, Check, X, Copy, Eye, EyeOff } from 'lucide-react';
import { Z } from '../../styles/tokens';
import { getMyReferralCode, redeemReferralCode } from '../../api/referral';

// Tiny gift-icon chip in the desktop MenuBar. Click → popover with:
//   • The user's own shareable code (copy button)
//   • Referral progress (n / 2 unlocks Plus-Lite)
//   • An input to redeem someone else's code (if they haven't already)
//
// Server enforces single-use + no self-referral; this UI just routes the
// errors back to inline copy.
export default function ReferralChip() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);        // { code, referralsUsed, referralsRequired, unlocked, redeemedCode }
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);  // mask the code by default
  const popoverRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (!info) refresh();
    function onClick(e) { if (popoverRef.current && !popoverRef.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('pointerdown', onClick);
    document.addEventListener('keydown', onKey);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      document.removeEventListener('pointerdown', onClick);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function refresh() {
    try {
      const d = await getMyReferralCode();
      setInfo(d);
    } catch {}
  }

  async function handleRedeem(e) {
    e?.preventDefault?.();
    const code = input.toUpperCase().trim();
    if (!/^[A-Z0-9]{8}$/.test(code)) {
      setError('Code must be 8 letters or numbers.');
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await redeemReferralCode(code);
      setSuccess(r.ownerUnlocked
        ? 'Code redeemed - they just unlocked Plus-Lite.'
        : `Code redeemed. Thanks!`);
      setInput('');
      await refresh();
    } catch (e) {
      const msg = e?.message || e?.code || 'Could not redeem that code.';
      setError(msg);
    }
    setBusy(false);
  }

  function copyCode() {
    if (!info?.code) return;
    try {
      navigator.clipboard.writeText(info.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const alreadyRedeemed = !!info?.redeemedCode;
  const myProgress = info ? `${info.referralsUsed}/${info.referralsRequired}` : '-/-';
  const unlocked = !!info?.unlocked;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Referral code"
        className="p-1 rounded text-gray-500 hover:text-gray-800 dark:text-white/55 dark:hover:text-white/90 transition-colors inline-flex items-center gap-1"
      >
        <Gift size={13} />
        {info && (
          <span className={`text-[10px] tabular-nums font-semibold ${unlocked ? 'text-emerald-500 dark:text-emerald-300' : 'text-gray-500 dark:text-white/55'}`}>
            {myProgress}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-7 w-72 rounded-xl overflow-hidden shadow-xl border border-gray-200 dark:border-white/[0.10] animate-modal-in"
          style={{
            zIndex: Z.menubarMenu,
            background: document.documentElement.classList.contains('dark') ? 'rgb(30, 30, 40)' : 'rgb(255, 255, 255)',
          }}
        >
          {/* My code + progress */}
          <div className="px-3 py-3 border-b border-gray-200 dark:border-white/[0.06]">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-white/40 mb-1.5">Your referral code</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-[15px] font-bold text-gray-900 dark:text-white tracking-[0.2em] bg-gray-100 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.10] rounded-md px-2.5 py-1.5 text-center select-all">
                {info?.code ? (revealed ? info.code : '•'.repeat(info.code.length)) : '••••••••'}
              </code>
              <button
                onClick={() => setRevealed(v => !v)}
                disabled={!info?.code}
                title={revealed ? 'Hide' : 'Show'}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 dark:text-white/55 dark:hover:text-white dark:hover:bg-white/[0.08] transition-colors disabled:opacity-40"
              >
                {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button
                onClick={copyCode}
                disabled={!info?.code}
                title="Copy"
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 dark:text-white/55 dark:hover:text-white dark:hover:bg-white/[0.08] transition-colors disabled:opacity-40"
              >
                {copied ? <Check size={13} className="text-emerald-500 dark:text-emerald-300" /> : <Copy size={13} />}
              </button>
            </div>
            <p className={`text-[11px] mt-2 ${unlocked ? 'text-emerald-500 dark:text-emerald-300' : 'text-gray-500 dark:text-white/55'}`}>
              {unlocked
                ? `Plus-Lite unlocked · ${info.referralsUsed} friends joined`
                : `${info ? info.referralsUsed : 0} / ${info?.referralsRequired ?? 2} friends joined - unlock Plus-Lite at ${info?.referralsRequired ?? 2}.`}
            </p>
          </div>

          {/* Redeem someone else's code */}
          <div className="px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-white/40 mb-1.5">
              {alreadyRedeemed ? 'Redeemed code' : 'Got a code?'}
            </p>
            {alreadyRedeemed ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-[13px] font-semibold text-emerald-700 dark:text-emerald-200 tracking-[0.18em] bg-emerald-500/[0.10] border border-emerald-400/25 rounded-md px-2.5 py-1.5 text-center">
                  {info.redeemedCode}
                </code>
                <Check size={14} className="text-emerald-500 dark:text-emerald-300" />
              </div>
            ) : (
              <form onSubmit={handleRedeem} className="flex items-center gap-1.5">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
                    if (error) setError(null);
                    if (success) setSuccess(null);
                  }}
                  placeholder="XXXXXXXX"
                  maxLength={8}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                  className="flex-1 min-w-0 font-mono text-[13px] text-gray-900 dark:text-white tracking-[0.18em] text-center bg-gray-100 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.10] rounded-md px-2 py-1.5 outline-none focus:border-blue-400 dark:focus:border-white/[0.22] focus:bg-white dark:focus:bg-white/[0.07] transition-colors uppercase placeholder:text-gray-300 dark:placeholder:text-white/20"
                />
                <button
                  type="submit"
                  disabled={busy || input.length !== 8}
                  className="px-3 py-1.5 rounded-md bg-gray-900/[0.06] hover:bg-gray-900/[0.12] text-gray-700 dark:bg-white/[0.10] dark:hover:bg-white/[0.16] dark:text-white/80 text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                >
                  Apply
                </button>
              </form>
            )}
            {error && (
              <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-300 inline-flex items-start gap-1">
                <X size={11} className="mt-px flex-shrink-0" /> {error}
              </p>
            )}
            {success && (
              <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-300 inline-flex items-start gap-1">
                <Check size={11} className="mt-px flex-shrink-0" /> {success}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
