import { useEffect, useState } from 'react';
import { LogOut, ChevronRight, Shield, GraduationCap, PanelBottom, Users, Coins, Gift, RotateCcw, TicketCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import { syncData } from '../../api/auth';
import { getMyUsage, resetWeeklyCredits } from '../../api/billing';
import { getMyReferralCode, redeemReferralCode } from '../../api/referral';
import MobilePage from './MobilePage';

export default function MobileSettings() {
  const { user, fetchUser, logout } = useAuth();
  const parent = user?.data?.parent;
  const hasProfiles = parent?.enabled && parent?.students?.length > 0;
  const activeChild = hasProfiles && parent.activeStudentId
    ? parent.students.find(s => s.id === parent.activeStudentId)
    : null;

  function handleSwitchProfile() {
    try { sessionStorage.removeItem('cov-profile-picked'); } catch {}
    window.location.reload();
  }
  const { bottomBarTransparent, setBottomBarTransparent } = useUIPreference();
  const [restartingOnboarding, setRestartingOnboarding] = useState(false);
  const [restartError, setRestartError] = useState('');
  const [usage, setUsage] = useState(null);
  const [referral, setReferral] = useState(null);
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditMessage, setCreditMessage] = useState('');
  const [creditError, setCreditError] = useState('');

  useEffect(() => {
    getMyUsage().then(setUsage).catch(() => setCreditError('Could not load credit usage.'));
    getMyReferralCode().then(setReferral).catch(() => {});
  }, []);

  async function handleCreditReset() {
    if (creditBusy || !window.confirm('Use one banked reset to refill this week’s credits?')) return;
    setCreditBusy(true);
    setCreditMessage('');
    setCreditError('');
    try {
      const next = await resetWeeklyCredits();
      setUsage(current => ({ ...current, ...next }));
      setReferral(current => current ? ({ ...current, creditResets: next.creditResets }) : current);
      setCreditMessage(`Credits refilled. ${next.creditResets?.available ?? 0} resets remain.`);
    } catch (err) {
      setCreditError(err?.data?.message || err?.message || 'Could not reset credits.');
    } finally {
      setCreditBusy(false);
    }
  }

  async function handleCopyReferral() {
    if (!referral?.code) return;
    try {
      await navigator.clipboard.writeText(referral.code);
      setCreditError('');
      setCreditMessage('Referral code copied.');
    } catch {
      setCreditError('Could not copy the referral code.');
    }
  }

  async function handleRedeemReferral() {
    const code = window.prompt('Enter an 8-character referral code:')?.toUpperCase().trim();
    if (!code) return;
    setCreditMessage('');
    setCreditError('');
    try {
      await redeemReferralCode(code);
      setReferral(await getMyReferralCode());
      setCreditMessage('Code redeemed. Your friend banked one credit reset.');
    } catch (err) {
      setCreditError(err?.data?.message || err?.message || 'Could not redeem that code.');
    }
  }

  async function handleRestartOnboarding() {
    if (!window.confirm('Replay the welcome flow from the beginning?')) return;
    setRestartingOnboarding(true);
    setRestartError('');
    try {
      await syncData({
        preferences: {
          ...(user?.data?.preferences || {}),
          onboarded: false,
          tourStep: null,
        },
      });
      try {
        localStorage.removeItem('covalent-onboarded');
        localStorage.removeItem('cov-launch-app');
      } catch {}
      await fetchUser();
    } catch (err) {
      console.error('restart mobile onboarding failed:', err);
      setRestartError('Could not restart onboarding right now. Please try again.');
      setRestartingOnboarding(false);
    }
  }

  return (
    <MobilePage
      title={user?.name || 'Settings'}
    >
      {/* Profile card */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#13131f] p-4 mb-4 flex items-center gap-3">
        {activeChild ? (
          <div
            className="w-12 h-12 rounded-full grid place-items-center text-white text-[16px] font-bold"
            style={{ backgroundColor: activeChild.color || '#3B82F6' }}
          >
            {activeChild.avatar || activeChild.name[0]?.toUpperCase()}
          </div>
        ) : (
          <div className="w-12 h-12 rounded-full bg-blue-500 grid place-items-center text-white text-[16px] font-bold">
            {(user?.name || user?.email || '?')[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-gray-900 dark:text-white truncate">
            {activeChild ? activeChild.name : (user?.name || 'Signed in')}
          </p>
          <p className="text-[11.5px] text-gray-500 dark:text-gray-400 truncate">
            {activeChild ? 'Student profile' : user?.email}
          </p>
        </div>
      </div>

      <SectionLabel>Appearance</SectionLabel>
      <Group>
        <Row
          icon={<PanelBottom size={17} />}
          tone="blue"
          title="Bottom bar blur"
          value={bottomBarTransparent ? 'On' : 'Off'}
          onClick={() => setBottomBarTransparent(!bottomBarTransparent)}
        />
      </Group>

      <SectionLabel>Account</SectionLabel>
      <Group>
        <Row icon={<Shield size={17} />} tone="blue" title="Privacy" />
      </Group>

      <SectionLabel>Credits &amp; referrals</SectionLabel>
      <Group>
        <Row
          icon={<Coins size={17} />}
          tone="blue"
          title="Weekly credits"
          value={usage?.credits ? `${usage.credits.remaining} / ${usage.credits.allowance}` : 'Loading…'}
        />
        <Row
          icon={<RotateCcw size={17} />}
          tone="violet"
          title="Banked resets"
          value={creditBusy ? 'Resetting…' : `${usage?.creditResets?.available ?? referral?.creditResets?.available ?? 0} available`}
          onClick={(usage?.creditResets?.available ?? referral?.creditResets?.available ?? 0) > 0 && (usage?.credits?.used ?? 0) > 0 ? handleCreditReset : undefined}
          disabled={creditBusy}
        />
        <Row
          icon={<Gift size={17} />}
          tone="indigo"
          title="Referral code"
          value={referral?.code || 'Loading…'}
          onClick={referral?.code ? handleCopyReferral : undefined}
        />
        {!referral?.redeemedCode && (
          <Row
            icon={<TicketCheck size={17} />}
            tone="blue"
            title="Redeem a code"
            onClick={handleRedeemReferral}
          />
        )}
      </Group>
      <p className="mt-2 px-1 text-[10.5px] leading-relaxed text-gray-500 dark:text-gray-400">
        Each friend who joins with your code banks one reset. Banked resets do not expire.
      </p>
      {creditMessage && (
        <p role="status" className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          {creditMessage}
        </p>
      )}
      {creditError && (
        <p role="alert" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300">
          {creditError}
        </p>
      )}

      <SectionLabel>Tutorial</SectionLabel>
      <Group>
        <Row
          icon={<GraduationCap size={17} />}
          tone="violet"
          title="Restart onboarding"
          value={restartingOnboarding ? 'Starting…' : undefined}
          onClick={handleRestartOnboarding}
          disabled={restartingOnboarding}
        />
      </Group>
      {restartError && (
        <p role="alert" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300">
          {restartError}
        </p>
      )}

      <SectionLabel>Session</SectionLabel>
      <Group>
        {hasProfiles && (
          <Row
            icon={<Users size={17} />}
            tone="blue"
            title="Switch Profile"
            value={activeChild ? activeChild.name : 'Parent'}
            onClick={handleSwitchProfile}
          />
        )}
        <Row
          icon={<LogOut size={17} />}
          tone="rose"
          title="Sign out"
          onClick={() => logout?.()}
          destructive
        />
      </Group>

      <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-6">RushilAI · v0.1</p>
    </MobilePage>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400 mb-2 mt-4 px-1">
      {children}
    </p>
  );
}

function Group({ children }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#13131f] divide-y divide-gray-200 dark:divide-white/[0.06] overflow-hidden">
      {children}
    </div>
  );
}

const TONE = {
  indigo: 'bg-indigo-500 dark:bg-indigo-500/30',
  rose:   'bg-rose-500 dark:bg-rose-500/30',
  violet: 'bg-violet-500 dark:bg-violet-500/30',
  blue:   'bg-blue-500 dark:bg-blue-500/30',
};

function Row({ icon, tone, title, value, onClick, destructive, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-3 active:bg-gray-50 dark:active:bg-white/[0.04] text-left disabled:cursor-wait disabled:opacity-55 ${destructive ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-white'}`}
    >
      <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 text-white ${TONE[tone]}`}>
        {icon}
      </div>
      <p className="flex-1 text-[14px] font-medium tracking-tight">{title}</p>
      {value && <span className="text-[12.5px] text-gray-500 dark:text-gray-400">{value}</span>}
      {onClick && !destructive && !disabled && <ChevronRight size={14} className="text-gray-300 dark:text-white/30 shrink-0" />}
    </button>
  );
}
