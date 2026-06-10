import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { syncData } from '../api/auth';
import {
  DIFFICULTY_OPTIONS, LEARNING_STYLE_OPTIONS, LESSON_LENGTH_OPTIONS,
  TONE_OPTIONS, RIGOR_OPTIONS, TEMPO_OPTIONS, PERSONALITY_OPTIONS, FLUFF_OPTIONS,
} from '../utils/constants';
import PillGroup from '../components/shared/PillGroup';
import Toggle from '../components/shared/Toggle';
import { Textarea } from '../components/shared/Input';
import Button from '../components/shared/Button';
import { GraduationCap, ChevronDown, Check, Save } from 'lucide-react';
import { useUIPreference } from '../context/UIPreferenceContext';
import { WALLPAPER_LIST } from '../components/desktop/DesktopBackground';
import { openBillingPortal } from '../api/billing';
import { planFromUser } from '../components/billing/modelAccess';
import { useToast } from '../components/shared/Toast';

// ─── Shared primitives ────────────────────────────────────────────────────────

function CompactDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div className="relative w-full max-w-xs" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[13px] text-white/80 hover:bg-white/[0.07] transition-colors"
      >
        <span>{selected?.label || value}</span>
        <ChevronDown size={12} className={`text-white/30 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-30 right-0 mt-1 w-full rounded-xl border border-white/[0.08] bg-[#0c0c18]/95 backdrop-blur-xl shadow-2xl py-1">
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-[12.5px] flex items-center justify-between transition-colors ${
                value === o.value
                  ? 'text-white/95 font-medium bg-white/[0.07]'
                  : 'text-white/55 hover:bg-white/[0.05] hover:text-white/80'
              }`}
            >
              {o.label}
              {value === o.value && <Check size={11} className="text-white/40 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineSlider({ value, onChange }) {
  const clamped = Math.max(0, Math.min(100, value ?? 0));
  const [local, setLocal] = useState(clamped);
  const dragging = useRef(false);

  useEffect(() => {
    if (!dragging.current) setLocal(clamped);
  }, [clamped]);

  return (
    <div className="flex items-center gap-3 w-full max-w-xs">
      <input
        type="range" min={0} max={100} step={5} value={local}
        onPointerDown={() => { dragging.current = true; }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        onChange={e => { const v = Number(e.target.value); setLocal(v); onChange(v); }}
        style={{ background: `linear-gradient(to right, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.45) ${local}%, rgba(255,255,255,0.08) ${local}%, rgba(255,255,255,0.08) 100%)` }}
        className="flex-1 h-1 rounded-full appearance-none cursor-pointer outline-none
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
          [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.4)]
          [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0"
      />
      <span className="text-[11px] text-white/35 tabular-nums w-7 text-right">{100 - local}%</span>
    </div>
  );
}

// Block: label above, content below — used everywhere for consistency
function Block({ label, hint, children }) {
  return (
    <div className="py-3 border-b border-white/[0.05] last:border-0 space-y-2">
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/30">{label}</p>
        {hint && <p className="text-[11px] text-white/30 mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

// InlineRow: two items side by side within a Block (for toggle rows)
function InlineRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-[13px] text-white/75">{label}</span>
      {children}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'ai',         label: 'AI Tutor' },
  { id: 'curriculum', label: 'Curriculum' },
  { id: 'account',    label: 'Account' },
];

// ─── Appearance tab ───────────────────────────────────────────────────────────

function AppearanceTab() {
  const {
    wallpaper, setWallpaper,
    dockSize, setDockSize,
    iconStyle, setIconStyle,
    windowOpacity, setWindowOpacity,
    titlebarOpacity, setTitlebarOpacity,
  } = useUIPreference();

  const wallpaperOpts = WALLPAPER_LIST.map(w => ({ value: w.id, label: w.label }));
  const dockOpts   = [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }];
  const iconOpts   = [{ value: 'gradient', label: 'Colorful' }, { value: 'mono', label: 'Monochrome' }, { value: 'glass', label: 'Glass' }, { value: 'accent', label: 'Accent Tint' }];

  return (
    <div>
      <Block label="Wallpaper">
        <CompactDropdown value={wallpaper} options={wallpaperOpts} onChange={setWallpaper} />
      </Block>
      <Block label="Dock size">
        <CompactDropdown value={dockSize} options={dockOpts} onChange={setDockSize} />
      </Block>
      <Block label="Icon style">
        <CompactDropdown value={iconStyle} options={iconOpts} onChange={setIconStyle} />
      </Block>
      <Block label="Title bar transparency">
        <InlineSlider value={titlebarOpacity ?? 80} onChange={setTitlebarOpacity} />
      </Block>
      <Block label="Window transparency">
        <InlineSlider value={windowOpacity ?? 55} onChange={setWindowOpacity} />
      </Block>
    </div>
  );
}

// ─── AI Tutor tab ─────────────────────────────────────────────────────────────

function AITab({ prefs, update, onSave, saving, saved }) {
  return (
    <div>
      <Block label="Personality">
        <PillGroup options={PERSONALITY_OPTIONS} value={prefs.aiPersonality} onChange={v => update('aiPersonality', v)} />
      </Block>
      <Block label="Fluff level">
        <PillGroup options={FLUFF_OPTIONS} value={prefs.fluffLevel} onChange={v => update('fluffLevel', v)} />
      </Block>
      <Block label="Rigor">
        <PillGroup options={RIGOR_OPTIONS} value={prefs.rigor} onChange={v => update('rigor', v)} />
      </Block>
      <Block label="Lesson tempo">
        <PillGroup options={TEMPO_OPTIONS} value={prefs.lessonTempo} onChange={v => update('lessonTempo', v)} />
      </Block>
      <Block label="Custom instructions">
        <Textarea
          placeholder="e.g. Always respond in bullet points. Never explain what you're about to do — just do it."
          value={prefs.customInstructions || ''}
          onChange={e => update('customInstructions', e.target.value)}
          rows={3}
        />
      </Block>
      <div className="pt-4">
        <Button onClick={onSave} loading={saving}>
          <Save size={14} />{saved ? 'Saved' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

// ─── Curriculum tab ───────────────────────────────────────────────────────────

function CurriculumTab({ prefs, update, onSave, saving, saved }) {
  return (
    <div>
      <Block label="Default difficulty">
        <PillGroup options={DIFFICULTY_OPTIONS} value={prefs.defaultDifficulty} onChange={v => update('defaultDifficulty', v)} />
      </Block>
      <Block label="Default learning style">
        <PillGroup options={LEARNING_STYLE_OPTIONS} value={prefs.defaultStyle} onChange={v => update('defaultStyle', v)} />
      </Block>
      <Block label="Default tone">
        <PillGroup options={TONE_OPTIONS} value={prefs.defaultTone} onChange={v => update('defaultTone', v)} />
      </Block>
      <Block label="Default lesson length">
        <PillGroup options={LESSON_LENGTH_OPTIONS} value={prefs.defaultLength} onChange={v => update('defaultLength', v)} />
      </Block>
      <Block label="Defaults">
        <InlineRow label="Include examples by default">
          <Toggle checked={prefs.includeExamples ?? true} onChange={v => update('includeExamples', v)} />
        </InlineRow>
        <InlineRow label="Include exercises by default">
          <Toggle checked={prefs.includeExercises ?? true} onChange={v => update('includeExercises', v)} />
        </InlineRow>
      </Block>
      <div className="pt-4">
        <Button onClick={onSave} loading={saving}>
          <Save size={14} />{saved ? 'Saved' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

// ─── Account tab ──────────────────────────────────────────────────────────────

const PLAN_LABELS = {
  free:     'Free',
  plus:     'Plus',
  pro:      'Pro',
  lifetime: 'Lifetime',
};

function AccountTab({ user, onRestart }) {
  const toast = useToast();
  const [portalBusy, setPortalBusy] = useState(false);
  const plan = planFromUser(user);
  const isLifetime = plan === 'lifetime' || !!user?.data?.lifetimePurchasedAt;
  const isPaid = ['plus', 'pro'].includes(plan) || isLifetime;
  const proUntil = user?.data?.proUntil;

  async function handleManage() {
    if (portalBusy) return;
    setPortalBusy(true);
    try {
      const { url } = await openBillingPortal();
      if (url) window.location.href = url;
    } catch (e) {
      toast.error(e?.message || 'Could not open billing portal.');
    }
    setPortalBusy(false);
  }

  return (
    <div>
      <Block label="Profile">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.10] flex items-center justify-center text-[13px] font-bold text-white/60 shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-[13px] font-medium text-white/85">{user?.name || '—'}</p>
            <p className="text-[11px] text-white/35">{user?.email}</p>
          </div>
        </div>
      </Block>

      <Block label="Plan" hint={isLifetime ? 'Paid once, never expires' : proUntil ? `Renews ${new Date(proUntil).toLocaleDateString()}` : undefined}>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-white/70 font-medium">{PLAN_LABELS[plan] || 'Free'}</span>
          {isPaid && !isLifetime && (
            <Button size="sm" variant="ghost" onClick={handleManage} loading={portalBusy}>Manage</Button>
          )}
          {!isPaid && <span className="text-[12px] text-white/30">Upgrade from the top bar</span>}
        </div>
      </Block>

      <Block label="Tutorial" hint="Replay the welcome flow from the beginning">
        <button
          onClick={onRestart}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.09] hover:bg-white/[0.10] text-white/55 hover:text-white/80 text-[12px] font-medium transition-colors"
        >
          <GraduationCap size={13} /> Restart onboarding
        </button>
      </Block>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const PREFS_LS_KEY = 'cov-prefs';
function loadPrefsMirror() {
  try { return JSON.parse(localStorage.getItem(PREFS_LS_KEY) || '{}') || {}; } catch { return {}; }
}
function savePrefsMirror(prefs) {
  try { localStorage.setItem(PREFS_LS_KEY, JSON.stringify(prefs || {})); } catch {}
}
function isDemoEmail(email) {
  const e = String(email || '').toLowerCase();
  return e.startsWith('demo-landing-') || e.endsWith('@covalent.test');
}

export default function SettingsPage() {
  const { user, fetchUser } = useAuth();
  const toast = useToast();
  const isDemo = isDemoEmail(user?.email);
  const [tab, setTab] = useState('appearance');

  useEffect(() => {
    if (isDemo) { try { localStorage.removeItem(PREFS_LS_KEY); } catch {} }
  }, [isDemo]);

  const [prefs, setPrefs] = useState(() => ({
    ...(isDemo ? {} : loadPrefsMirror()),
    ...(user?.data?.preferences || {}),
  }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirtyKeys = useRef(new Set());

  useEffect(() => {
    if (!user?.data?.preferences) return;
    const fromServer = user.data.preferences;
    const mirror = isDemo ? {} : loadPrefsMirror();
    setPrefs(prev => {
      const next = { ...mirror, ...fromServer };
      for (const k of dirtyKeys.current) {
        if (prev[k] !== undefined) next[k] = prev[k];
      }
      return next;
    });
    if (!isDemo) {
      const missing = {};
      for (const k of Object.keys(mirror)) {
        if (fromServer[k] === undefined && mirror[k] !== undefined) missing[k] = mirror[k];
      }
      if (Object.keys(missing).length) {
        syncData({ preferences: { ...fromServer, ...missing } }).catch(() => {});
      }
    }
  }, [user, isDemo]);

  useEffect(() => {
    if (isDemo) return;
    savePrefsMirror(prefs);
  }, [prefs, isDemo]);

  function update(key, value) {
    dirtyKeys.current.add(key);
    setPrefs(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await syncData({ preferences: prefs });
      dirtyKeys.current.clear();
      await fetchUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { console.error('Failed to save:', err); }
    setSaving(false);
  }

  async function handleRestart() {
    if (!confirm('Replay the welcome tutorial now?')) return;
    try {
      await syncData({ preferences: { ...(user?.data?.preferences || {}), onboarded: false, tourStep: null } });
      await fetchUser();
    } catch (err) {
      toast.error('Could not restart onboarding right now.');
      return;
    }
    try { localStorage.removeItem('covalent-onboarded'); localStorage.removeItem('cov-launch-app'); } catch {}
    window.location.reload();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex gap-0.5 px-4 pt-4 pb-2 border-b border-white/[0.06] shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors ${
              tab === t.id
                ? 'bg-white/[0.09] text-white/90'
                : 'text-white/40 hover:text-white/65 hover:bg-white/[0.05]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'ai'         && <AITab prefs={prefs} update={update} onSave={handleSave} saving={saving} saved={saved} />}
        {tab === 'curriculum' && <CurriculumTab prefs={prefs} update={update} onSave={handleSave} saving={saving} saved={saved} />}
        {tab === 'account'    && <AccountTab user={user} onRestart={handleRestart} />}
      </div>
    </div>
  );
}
