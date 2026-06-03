import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { syncData } from '../api/auth';
import { DIFFICULTY_OPTIONS, LEARNING_STYLE_OPTIONS, LESSON_LENGTH_OPTIONS, TONE_OPTIONS, RIGOR_OPTIONS, TEMPO_OPTIONS, PERSONALITY_OPTIONS, FLUFF_OPTIONS } from '../utils/constants';
import PillGroup from '../components/shared/PillGroup';
import Toggle from '../components/shared/Toggle';
import { Textarea } from '../components/shared/Input';
import Button from '../components/shared/Button';
import { Settings, Save, GraduationCap, ChevronDown, Check, Crown, Sparkles, Zap, Gift, Copy } from 'lucide-react';
import { useUIPreference } from '../context/UIPreferenceContext';
import { WALLPAPER_LIST } from '../components/desktop/DesktopBackground';
import { openBillingPortal } from '../api/billing';
import { planFromUser, canUseModel, requiredPlanFor, resolveModelTier } from '../components/billing/modelAccess';
import { getMyReferralCode } from '../api/referral';
import { useToast } from '../components/shared/Toast';

function Dropdown({ label, value, options, onChange }) {
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
    <div>
      {label && (
        <label className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/40 mb-2 block">
          {label}
        </label>
      )}
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-[13px] text-white/85 hover:bg-white/[0.07] hover:border-white/[0.12] transition-colors"
        >
          <span>{selected?.label || value}</span>
          <ChevronDown size={13} className={`text-white/35 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute z-20 mt-1.5 w-full max-h-52 overflow-y-auto rounded-xl border border-white/[0.08] bg-[#0c0c18]/95 backdrop-blur-xl shadow-2xl py-1">
            {options.map(o => (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors ${
                  value === o.value
                    ? 'text-white/95 font-medium bg-white/[0.08]'
                    : 'text-white/60 hover:bg-white/[0.05] hover:text-white/85'
                }`}
              >
                <span>{o.label}{o.desc ? <span className="text-[10px] text-white/30 ml-2">{o.desc}</span> : ''}</span>
                {value === o.value && <Check size={12} className="text-white/50 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OpacitySlider({ label, value, onChange, leftHint, rightHint }) {
  const clamped = Math.max(0, Math.min(100, value ?? 0));
  const [local, setLocal] = useState(clamped);
  const draggingRef = useRef(false);
  // Keep local in sync with the prop whenever the prop changes - but only
  // when we're not actively dragging. Otherwise an async server roundtrip
  // would yank the thumb back mid-drag.
  useEffect(() => {
    if (!draggingRef.current) setLocal(clamped);
  }, [clamped]);
  const v = local;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/40">{label}</label>
        <span className="text-[11px] text-white/55 tabular-nums font-medium">{100 - v}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={v}
        onPointerDown={() => { draggingRef.current = true; }}
        onPointerUp={() => { draggingRef.current = false; }}
        onPointerCancel={() => { draggingRef.current = false; }}
        onChange={e => {
          const next = Number(e.target.value);
          setLocal(next);
          onChange(next);
        }}
        style={{ background: `linear-gradient(to right, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.55) ${v}%, rgba(255,255,255,0.08) ${v}%, rgba(255,255,255,0.08) 100%)` }}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer outline-none
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black/15 [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.35)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing
          [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.35)]
          [&::-moz-range-track]:bg-transparent"
      />
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] text-white/25">{leftHint}</span>
        <span className="text-[10px] text-white/25">{rightHint}</span>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  // Sections are plain dividers, not frosted cards. The old card layered
  // a white tint + backdrop-blur on top of the already-frosted window,
  // which is what made Settings look washed-out grey vs every other app.
  return (
    <div className="py-6 space-y-5">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">{title}</h3>
      {children}
    </div>
  );
}

function InterfaceSection() {
  // Window Style toggle was removed - the shell is now Windows 11 only.
  // No more osStyle preference, no Mac / ChromeOS / Linux paths.
  const { wallpaper, setWallpaper, dockSize, setDockSize, iconStyle, setIconStyle, windowOpacity, setWindowOpacity, titlebarOpacity, setTitlebarOpacity } = useUIPreference();
  const wallpaperOpts = WALLPAPER_LIST.map(w => ({ value: w.id, label: w.label }));
  const dockOpts = [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }];
  const iconOpts = [{ value: 'gradient', label: 'Colorful' }, { value: 'mono', label: 'Monochrome' }, { value: 'glass', label: 'Glass' }, { value: 'accent', label: 'Accent Tint' }];
  const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < 768;
  const opacity = windowOpacity ?? 55;

  return (
    <Section title={isMobileScreen ? 'Appearance' : 'Desktop'}>
      {!isMobileScreen && (
        <>
          <Dropdown label="Wallpaper" value={wallpaper} options={wallpaperOpts} onChange={setWallpaper} />
          <Dropdown label="Dock Size" value={dockSize} options={dockOpts} onChange={setDockSize} />
          <Dropdown label="Icon Style" value={iconStyle} options={iconOpts} onChange={setIconStyle} />
          <OpacitySlider
            label="Title Bar Transparency"
            value={titlebarOpacity ?? 80}
            onChange={setTitlebarOpacity}
            leftHint="Fully glass"
            rightHint="Solid"
          />
          <OpacitySlider
            label="Window Transparency"
            value={opacity}
            onChange={setWindowOpacity}
            leftHint="Fully glass"
            rightHint="Fully solid"
          />
        </>
      )}
    </Section>
  );
}

function isDemoEmail(email) {
  const e = String(email || '').toLowerCase();
  return e.startsWith('demo-landing-') || e.endsWith('@covalent.test');
}

const PREFS_LS_KEY = 'cov-prefs';
function loadPrefsMirror() {
  try { return JSON.parse(localStorage.getItem(PREFS_LS_KEY) || '{}') || {}; }
  catch { return {}; }
}
function savePrefsMirror(prefs) {
  try { localStorage.setItem(PREFS_LS_KEY, JSON.stringify(prefs || {})); } catch {}
}

export default function SettingsPage() {
  const { user, fetchUser } = useAuth();
  const toast = useToast();
  const isDemo = isDemoEmail(user?.email);

  useEffect(() => {
    if (isDemo) {
      try { localStorage.removeItem(PREFS_LS_KEY); } catch {}
    }
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
      const missingFromServer = {};
      for (const k of Object.keys(mirror)) {
        if (fromServer[k] === undefined && mirror[k] !== undefined) {
          missingFromServer[k] = mirror[k];
        }
      }
      if (Object.keys(missingFromServer).length) {
        const merged = { ...fromServer, ...missingFromServer };
        syncData({ preferences: merged }).catch(() => {});
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

  const profile = user?.data?.profile;

  return (
    <div className="max-w-2xl mx-auto px-1">

      {/* Header */}
      <div className="flex items-center gap-3 mb-2 pt-1">
        <div className="w-11 h-11 rounded-2xl bg-white/[0.08] border border-white/[0.10] flex items-center justify-center text-white/55">
          <Settings size={20} />
        </div>
        <h1 className="text-[20px] font-bold text-white/90 tracking-tight">Settings</h1>
      </div>

      {/* Groups are separated by hairline dividers rather than boxed in
          cards - keeps the page on the window glass like every other app. */}
      <div className="divide-y divide-white/[0.06]">

      {/* Desktop / Interface */}
      <InterfaceSection />

      {/* AI Behavior */}
      <Section title="AI Behavior">
        {(() => {
          const plan = planFromUser(user);
          async function setTier(v) {
            if (!canUseModel(v, plan)) return; // locked tiers aren't selectable
            const next = { ...prefs, modelTier: v };
            setPrefs(next);
            dirtyKeys.current.add('modelTier');
            try {
              await syncData({ preferences: next });
              dirtyKeys.current.delete('modelTier');
              await fetchUser();
            } catch (err) { console.error('Failed to save model tier:', err); }
          }
          const options = [
            { value: 'pro',        label: '3.1 Pro',        description: '· advanced math & code' },
            { value: 'flash',      label: '3.5 Flash',      description: '· all-around help' },
            { value: 'flash-lite', label: '3.1 Flash-Lite', description: '· fastest answers' },
          ].map((o) => {
            if (canUseModel(o.value, plan)) return o;
            return { ...o, locked: true, lockLabel: requiredPlanFor(o.value)?.label };
          });
          const effectiveValue = resolveModelTier(prefs.modelTier, plan);
          return (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/40">Model</label>
                <span className="text-[10px] text-white/20">· auto-saves</span>
              </div>
              <PillGroup
                options={options}
                value={effectiveValue}
                onChange={setTier}
              />
              <p className="text-[10px] text-white/25 mt-2 leading-relaxed">
                All Gemini 3. 3.1 Pro for proofs, 3.5 Flash for default, 3.1 Flash-Lite for short Q&amp;A.
              </p>
            </div>
          );
        })()}

        <PillGroup label="Personality" options={PERSONALITY_OPTIONS} value={prefs.aiPersonality} onChange={v => update('aiPersonality', v)} />
        <PillGroup label="Fluff Level" options={FLUFF_OPTIONS} value={prefs.fluffLevel} onChange={v => update('fluffLevel', v)} />
        <PillGroup label="Rigor" options={RIGOR_OPTIONS} value={prefs.rigor} onChange={v => update('rigor', v)} />
        <PillGroup label="Lesson Tempo" options={TEMPO_OPTIONS} value={prefs.lessonTempo} onChange={v => update('lessonTempo', v)} />

        <Textarea
          label="Custom instructions"
          placeholder="e.g. Always respond in bullet points. Never explain what you're about to do - just do it."
          value={prefs.customInstructions || ''}
          onChange={e => update('customInstructions', e.target.value)}
          rows={4}
        />
      </Section>

      {/* Curriculum Defaults */}
      <Section title="Curriculum Defaults">
        <PillGroup label="Default Difficulty" options={DIFFICULTY_OPTIONS} value={prefs.defaultDifficulty} onChange={v => update('defaultDifficulty', v)} />
        <PillGroup label="Default Learning Style" options={LEARNING_STYLE_OPTIONS} value={prefs.defaultStyle} onChange={v => update('defaultStyle', v)} />
        <PillGroup label="Default Tone" options={TONE_OPTIONS} value={prefs.defaultTone} onChange={v => update('defaultTone', v)} />
        <PillGroup label="Default Lesson Length" options={LESSON_LENGTH_OPTIONS} value={prefs.defaultLength} onChange={v => update('defaultLength', v)} />

        <div className="space-y-3 pt-1">
          <Toggle label="Include examples by default" checked={prefs.includeExamples ?? true} onChange={v => update('includeExamples', v)} />
          <Toggle label="Include exercises by default" checked={prefs.includeExercises ?? true} onChange={v => update('includeExercises', v)} />
        </div>
      </Section>

      {/* Save */}
      <div className="py-6">
        <Button onClick={handleSave} loading={saving}>
          <Save size={15} />
          {saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>

      {/* Plan */}
      <PlanSection user={user} />

      {/* Account */}
      <Section title="Account">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-full bg-white/[0.08] border border-white/[0.10] flex items-center justify-center text-[13px] font-bold text-white/70">
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-[13px] font-semibold text-white/90">{user?.name}</p>
            <p className="text-[11px] text-white/35">{user?.email}</p>
          </div>
        </div>
        {profile && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[
              { label: 'Level', value: profile.level },
              { label: 'XP', value: profile.xp },
              { label: 'Topics', value: Object.keys(profile.topicScores || {}).length },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-center">
                <p className="text-[18px] font-bold text-white/90 tabular-nums">{value}</p>
                <p className="text-[10px] text-white/35 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Tutorial */}
      <Section title="Tutorial">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white/85">Restart onboarding</p>
            <p className="text-[11px] text-white/35 mt-0.5 leading-relaxed">
              Replay the welcome flow - appearance, wallpaper, handle, guided tour.
            </p>
          </div>
          <button
            onClick={async () => {
              if (!confirm('Replay the welcome tutorial now?')) return;
              // Onboarding state lives in user.data.preferences on the
              // server. Clearing the flag + tourStep there is what
              // actually flips the gate; the old localStorage keys are
              // dead code from a previous design - kept the removeItem
              // calls as a defensive cleanup for any stale browsers.
              try {
                const nextPrefs = {
                  ...(user?.data?.preferences || {}),
                  onboarded: false,
                  tourStep: null,
                };
                await syncData({ preferences: nextPrefs });
                await fetchUser();
              } catch (err) {
                console.error('Failed to clear onboarded flag:', err);
                toast.error('Could not restart onboarding right now. Please try again.');
                return;
              }
              try {
                localStorage.removeItem('covalent-onboarded');
                localStorage.removeItem('cov-launch-app');
              } catch {}
              // Reload so the App router re-evaluates the onboarded gate
              // and renders <Onboarding> instead of <DesktopShell>.
              window.location.reload();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white/[0.07] border border-white/[0.10] hover:bg-white/[0.12] text-white/65 hover:text-white/85 text-[12px] font-semibold transition-colors flex-shrink-0"
          >
            <GraduationCap size={13} /> Restart
          </button>
        </div>
      </Section>
      </div>

    </div>
  );
}

// Plan / billing block - current tier badge + Manage Billing + referral
// code. Plan comparison lives in the top-bar Upgrade popover.
function PlanSection({ user }) {
  const toast = useToast();
  const [portalBusy, setPortalBusy] = useState(false);
  const [refInfo, setRefInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  const plan = user?.data?.plan || 'free';
  const proUntil = user?.data?.proUntil;
  const isLifetime = plan === 'lifetime' || !!user?.data?.lifetimePurchasedAt;
  const isPaid = ['plus', 'pro'].includes(plan) || isLifetime;
  // Refs from server take precedence - they include real-time
  // referralsUsed in case the user's data prop is stale.
  const effectivePlan = refInfo?.unlocked && !isPaid ? 'plus-lite' : plan;

  useEffect(() => {
    getMyReferralCode().then(setRefInfo).catch(() => {});
  }, []);

  const TIER_META = {
    free:         { label: 'Free',       Icon: Zap,      tone: 'text-white/55 bg-white/[0.05] border-white/[0.10]' },
    'plus-lite':  { label: 'Plus-Lite',  Icon: Gift,     tone: 'text-emerald-200 bg-emerald-500/15 border-emerald-400/30' },
    plus:         { label: 'Plus',       Icon: Zap,      tone: 'text-violet-200 bg-violet-500/15 border-violet-400/30' },
    lifetime:     { label: 'Lifetime',   Icon: Sparkles, tone: 'text-blue-200  bg-blue-500/15  border-blue-400/35' },
    pro:          { label: 'Pro',        Icon: Crown,    tone: 'text-amber-200 bg-amber-500/15 border-amber-400/35' },
  };
  const meta = TIER_META[effectivePlan] || TIER_META.free;
  const Icon = meta.Icon;

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

  function copyCode() {
    if (!refInfo?.code) return;
    try {
      navigator.clipboard.writeText(refInfo.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const refsUsed = refInfo?.referralsUsed ?? 0;
  const refsNeeded = refInfo?.referralsRequired ?? 2;
  const refsUnlocked = refsUsed >= refsNeeded;

  return (
    <Section title="Plan">
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold uppercase tracking-wider ${meta.tone}`}>
          <Icon size={11} /> {meta.label}
        </div>
        {proUntil && !isLifetime && (
          <span className="text-[11px] text-white/45">
            Renews {new Date(proUntil).toLocaleDateString()}
          </span>
        )}
        {isLifetime && (
          <span className="text-[11px] text-white/45">Permanent · paid once</span>
        )}
        {isPaid && !isLifetime && (
          <Button size="sm" variant="ghost" onClick={handleManage} loading={portalBusy}>
            Manage billing
          </Button>
        )}
        {!isPaid && (
          <span className="text-[11px] text-white/40">Upgrade from the top bar.</span>
        )}
      </div>

      {/* Referral block - same data the top-bar chip uses, but a fuller
          view with copy + a contextual line. */}
      {refInfo && (
        <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          <div className="flex items-center gap-2 mb-2">
            <Gift size={12} className="text-emerald-300" />
            <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/45">Your referral code</p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-[15px] font-bold text-white tracking-[0.18em] bg-white/[0.05] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-center">
              {refInfo.code}
            </code>
            <button
              onClick={copyCode}
              title="Copy"
              className="p-1.5 rounded-md text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              {copied ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}
            </button>
          </div>
          <p className={`text-[11px] mt-2 ${refsUnlocked ? 'text-emerald-300' : 'text-white/55'}`}>
            {refsUnlocked
              ? `Plus-Lite unlocked · ${refsUsed} friends joined.`
              : `${refsUsed} / ${refsNeeded} friends joined. Share your code to unlock Plus-Lite (≈$2/mo of usage, free forever).`}
          </p>
          {refInfo.redeemedCode && (
            <p className="text-[10.5px] text-white/35 mt-1.5">
              You redeemed <span className="font-mono text-white/65">{refInfo.redeemedCode}</span>.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
