import { useState } from 'react';
import { Moon, Sun, LogOut, ChevronRight, Shield, Sparkles, X, Check, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import { syncData } from '../../api/auth';
import MobilePage from './MobilePage';

// Mobile-native settings — plan banner removed (it's not actionable
// from this screen anyway). Model preference is now a real picker
// sheet. Theme toggle stays inline.
// Only Pro has the 1M-token context window; Flash + Flash Lite ship
// the standard short-context configuration.
const MODEL_OPTIONS = [
  { value: 'pro',        label: 'Pro',        description: 'Smartest · 1M-token context · best on hard problems' },
  { value: 'flash',      label: 'Flash',      description: 'Faster · solid for most lessons' },
  { value: 'flash-lite', label: 'Flash Lite', description: 'Fastest + cheapest · light tasks' },
];

export default function MobileSettings() {
  const { user, fetchUser, logout } = useAuth();
  const { theme, setTheme } = useUIPreference();
  const dark = theme === 'dark';
  const [modelTier, setModelTier] = useState(() => user?.data?.preferences?.modelTier || 'pro');
  const [pickerOpen, setPickerOpen] = useState(null); // null | 'model'

  async function handlePickModel(v) {
    setModelTier(v);
    setPickerOpen(null);
    try {
      const merged = { ...(user?.data?.preferences || {}), modelTier: v };
      await syncData({ preferences: merged });
      await fetchUser();
    } catch (err) { console.error('save modelTier failed:', err); }
  }

  const modelLabel = MODEL_OPTIONS.find((m) => m.value === modelTier)?.label || 'Auto';

  return (
    <MobilePage
      eyebrow="Settings"
      title={user?.name || 'Settings'}
      subtitle={user?.email}
    >
      {/* Profile card */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#13131f] p-4 mb-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center text-white text-[16px] font-bold">
          {(user?.name || user?.email || '?')[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-gray-900 dark:text-white truncate">{user?.name || 'Signed in'}</p>
          <p className="text-[11.5px] text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
        </div>
      </div>

      <SectionLabel>Appearance</SectionLabel>
      <Group>
        <Row
          icon={dark ? <Moon size={17} /> : <Sun size={17} />}
          tone="indigo"
          title="Theme"
          value={dark ? 'Dark' : 'Light'}
          onClick={() => setTheme(dark ? 'light' : 'dark')}
        />
      </Group>

      <SectionLabel>Account</SectionLabel>
      <Group>
        <Row
          icon={<Sparkles size={17} />}
          tone="violet"
          title="Model preference"
          value={modelLabel}
          onClick={() => setPickerOpen('model')}
        />
        <Row icon={<Shield size={17} />} tone="blue" title="Privacy" />
      </Group>

      <SectionLabel>Session</SectionLabel>
      <Group>
        <Row
          icon={<LogOut size={17} />}
          tone="rose"
          title="Sign out"
          onClick={() => logout?.()}
          destructive
        />
      </Group>

      <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-6">RushilAI · v0.1</p>

      {/* Model preference picker */}
      {pickerOpen === 'model' && (
        <PickerSheet title="Model preference" onClose={() => setPickerOpen(null)}>
          {MODEL_OPTIONS.map((m) => (
            <PickerRow
              key={m.value}
              active={modelTier === m.value}
              title={m.label}
              sub={m.description}
              onClick={() => handlePickModel(m.value)}
            />
          ))}
        </PickerSheet>
      )}
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
  indigo: 'text-indigo-500 bg-indigo-100/70 dark:bg-indigo-500/15',
  rose:   'text-rose-500   bg-rose-100/70   dark:bg-rose-500/15',
  violet: 'text-violet-500 bg-violet-100/70 dark:bg-violet-500/15',
  blue:   'text-blue-500   bg-blue-100/70   dark:bg-blue-500/15',
};

function Row({ icon, tone, title, value, onClick, destructive }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 active:bg-gray-50 dark:active:bg-white/[0.04] text-left ${destructive ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-white'}`}
    >
      <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${TONE[tone]}`}>
        {icon}
      </div>
      <p className="flex-1 text-[14px] font-medium tracking-tight">{title}</p>
      {value && <span className="text-[12.5px] text-gray-500 dark:text-gray-400">{value}</span>}
      {onClick && !destructive && <ChevronRight size={14} className="text-gray-300 dark:text-white/30 shrink-0" />}
    </button>
  );
}

function PickerSheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60]">
      <button onClick={onClose} aria-label="Close" className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-fade-in" />
      <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-white dark:bg-[#13131f] border-t border-gray-200 dark:border-white/[0.06] shadow-2xl pb-2 animate-slide-up"
           style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-1 rounded-full bg-gray-300 dark:bg-white/15" />
        </div>
        <div className="flex items-center justify-between px-5 pt-1 pb-3">
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-white tracking-tight">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X size={16} />
          </button>
        </div>
        <div className="px-3 pb-3 space-y-1.5">
          {children}
        </div>
      </div>
    </div>
  );
}

function PickerRow({ active, title, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left ${
        active ? 'bg-blue-500/10 border border-blue-500' : 'bg-gray-50 dark:bg-white/[0.03] border border-transparent'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-bold text-gray-900 dark:text-white">{title}</p>
        <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>
      </div>
      {active && <Check size={15} className="text-blue-500 shrink-0" />}
    </button>
  );
}
