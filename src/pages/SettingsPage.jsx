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
import { GraduationCap, ChevronDown, Check, RotateCcw } from 'lucide-react';
import { DEFAULT_ACCENT_HUE, TOOL_ACCENT_DEFAULTS, useUIPreference } from '../context/UIPreferenceContext';
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

// Accent presets spaced across the OKLCH hue wheel — quick picks alongside
// the free spectrum. Hue degrees map directly to the slider value.
const ACCENT_PRESETS = [
  { hue: 259.8, label: 'Blue' },
  { hue: 220,   label: 'Sky' },
  { hue: 190,   label: 'Cyan' },
  { hue: 160,   label: 'Teal' },
  { hue: 145,   label: 'Green' },
  { hue: 95,    label: 'Lime' },
  { hue: 70,    label: 'Amber' },
  { hue: 40,    label: 'Orange' },
  { hue: 25,    label: 'Red' },
  { hue: 0,     label: 'Rose' },
  { hue: 330,   label: 'Pink' },
  { hue: 300,   label: 'Violet' },
];

// Spectrum accent picker. Recolors the whole UI live as you drag (via
// onPreview, which writes CSS vars without a server round-trip) and only
// persists the chosen hue on release / preset click (onCommit).
function AccentSpectrum({ value, defaultHue = DEFAULT_ACCENT_HUE, onCommit, onPreview }) {
  const fallbackHue = defaultHue ?? DEFAULT_ACCENT_HUE;
  const [local, setLocal] = useState(value ?? fallbackHue);
  const dragging = useRef(false);

  useEffect(() => { if (!dragging.current) setLocal(value ?? fallbackHue); }, [value, fallbackHue]);

  // Rainbow built from the SAME oklch space the accent uses, so the bar is a
  // faithful preview of every shade you can land on.
  const stops = [];
  for (let h = 0; h <= 360; h += 15) stops.push(`oklch(0.62 0.19 ${h})`);
  const grad = `linear-gradient(to right, ${stops.join(', ')})`;
  const swatch = `oklch(0.623 0.214 ${local})`;

  const preview = (v) => { setLocal(v); onPreview?.(v); };
  const commit  = ()  => { dragging.current = false; onCommit?.(local); };
  const resetToDefault = () => {
    setLocal(fallbackHue);
    onPreview?.(fallbackHue);
    onCommit?.(fallbackHue);
  };
  const defaultActive = Math.round(local) === Math.round(fallbackHue);

  return (
    <div className="w-full max-w-xs space-y-3">
      <div className="flex items-center gap-3">
        <span
          className="h-7 w-7 rounded-full border border-white/15 shrink-0"
          style={{ background: swatch, boxShadow: `0 0 14px oklch(0.623 0.214 ${local} / 0.55)` }}
        />
        <input
          type="range" min={0} max={360} step={1} value={Math.round(local)}
          aria-label="Accent color hue"
          onPointerDown={() => { dragging.current = true; }}
          onPointerUp={commit}
          onPointerCancel={commit}
          onKeyUp={() => onCommit?.(local)}
          onChange={e => preview(Number(e.target.value))}
          style={{ background: grad }}
          className="flex-1 h-2.5 rounded-full appearance-none cursor-pointer outline-none
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black/25
            [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.55)]
            [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0"
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={resetToDefault}
          className={`inline-flex h-6 items-center gap-1 rounded-lg border px-2 text-[10px] font-semibold transition-colors ${
            defaultActive
              ? 'border-white/25 bg-white/[0.08] text-white/80'
              : 'border-white/[0.08] bg-white/[0.03] text-white/45 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white/70'
          }`}
        >
          <RotateCcw size={10} />
          Default
        </button>
        {ACCENT_PRESETS.map(p => {
          const active = Math.round(local) === Math.round(p.hue);
          return (
            <button
              key={p.label}
              type="button"
              title={p.label}
              onClick={() => { setLocal(p.hue); onPreview?.(p.hue); onCommit?.(p.hue); }}
              className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${
                active ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-[#0c0c18]' : 'ring-1 ring-white/10'
              }`}
              style={{ background: `oklch(0.623 0.214 ${p.hue})` }}
            />
          );
        })}
      </div>
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

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-3 transition-colors hover:border-white/[0.14] hover:bg-white/[0.055]">
      <Toggle
        label={label}
        description={description}
        checked={checked}
        onChange={onChange}
      />
    </div>
  );
}

function AutosaveStatus({ saving, saved, error }) {
  return (
    <div className="pt-4 flex items-center gap-2 text-[11px] text-white/35">
      {saving ? (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-blue-300/70 animate-pulse" />
          Saving changes...
        </>
      ) : error ? (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-rose-300/80" />
          Could not auto-save. Your changes are still here.
        </>
      ) : saved ? (
        <>
          <Check size={12} className="text-emerald-300/80" />
          Saved
        </>
      ) : (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
          Changes save automatically
        </>
      )}
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
    accentHue, setAccentHue, previewAccent,
    canvasAccentHue, setCanvasAccentHue, previewCanvasAccent,
    voiceAccentHue, setVoiceAccentHue, previewVoiceAccent,
    humanizeAccentHue, setHumanizeAccentHue, previewHumanizeAccent,
    webSearchAccentHue, setWebSearchAccentHue, previewWebSearchAccent,
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
      <Block label="Accent color" hint="Drag the spectrum to recolor the entire interface.">
        <AccentSpectrum value={accentHue} defaultHue={DEFAULT_ACCENT_HUE} onCommit={setAccentHue} onPreview={previewAccent} />
      </Block>
      <Block label="Canvas accent color" hint="Controls the Study math canvas button, chip, and pane icon.">
        <AccentSpectrum value={canvasAccentHue} defaultHue={TOOL_ACCENT_DEFAULTS.canvasAccentHue} onCommit={setCanvasAccentHue} onPreview={previewCanvasAccent} />
      </Block>
      <Block label="Voice accent color" hint="Controls dictation, voice mode, and the voice orb.">
        <AccentSpectrum value={voiceAccentHue} defaultHue={TOOL_ACCENT_DEFAULTS.voiceAccentHue} onCommit={setVoiceAccentHue} onPreview={previewVoiceAccent} />
      </Block>
      <Block label="Humanize accent color">
        <AccentSpectrum value={humanizeAccentHue} defaultHue={TOOL_ACCENT_DEFAULTS.humanizeAccentHue} onCommit={setHumanizeAccentHue} onPreview={previewHumanizeAccent} />
      </Block>
      <Block label="Web search accent color">
        <AccentSpectrum value={webSearchAccentHue} defaultHue={TOOL_ACCENT_DEFAULTS.webSearchAccentHue} onCommit={setWebSearchAccentHue} onPreview={previewWebSearchAccent} />
      </Block>
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

function AITab({ prefs, update, flushAutosave, saving, saved, saveError }) {
  return (
    <div>
      <Block label="Personality">
        <PillGroup options={PERSONALITY_OPTIONS} value={prefs.aiPersonality} onChange={v => update('aiPersonality', v)} />
      </Block>
      <Block label="Fluff level">
        <PillGroup options={FLUFF_OPTIONS} value={prefs.fluffLevel} onChange={v => update('fluffLevel', v)} />
      </Block>
      <Block label="Response style" hint="On: short, high-signal phrases (default). Off: normal, conversational AI prose.">
        <Toggle accent="blue" checked={prefs.succinctMode ?? true} onChange={v => update('succinctMode', v)} />
      </Block>
      <Block label="DeepSeek routing" hint="When on, DeepSeek uses Gemini for China/Taiwan topics and relevant geopolitical follow-ups.">
        <Toggle accent="blue" checked={prefs.deepseekReroute ?? true} onChange={v => update('deepseekReroute', v)} />
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
          onBlur={flushAutosave}
          rows={3}
        />
      </Block>
      <AutosaveStatus saving={saving} saved={saved} error={saveError} />
    </div>
  );
}

// ─── Curriculum tab ───────────────────────────────────────────────────────────

function CurriculumTab({ prefs, update, saving, saved, saveError }) {
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
      <Block label="Lesson content" hint="Choose what new curricula include automatically.">
        <div className="grid max-w-md gap-2">
          <ToggleRow
            label="Examples"
            description="Add worked examples to generated lessons."
            checked={prefs.includeExamples ?? true}
            onChange={v => update('includeExamples', v)}
          />
          <ToggleRow
            label="Exercises"
            description="Add practice prompts and checks for understanding."
            checked={prefs.includeExercises ?? true}
            onChange={v => update('includeExercises', v)}
          />
        </div>
      </Block>
      <AutosaveStatus saving={saving} saved={saved} error={saveError} />
    </div>
  );
}

// ─── Account tab ──────────────────────────────────────────────────────────────

const PLAN_LABELS = {
  free: 'Free',
  paid: 'Paid',
};

function AccountTab({ user, onRestart }) {
  const toast = useToast();
  const [portalBusy, setPortalBusy] = useState(false);
  const plan = planFromUser(user);
  const isLifetime = !!user?.data?.lifetimePurchasedAt;
  const isPaid = plan === 'paid';
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
  const [saveError, setSaveError] = useState(false);
  const dirtyKeys = useRef(new Set());
  const prefsRef = useRef(prefs);
  const pendingPrefsRef = useRef(null);
  const savingRef = useRef(false);
  const saveTimerRef = useRef(null);
  const savedTimerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => () => {
    mountedRef.current = false;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    if (pendingPrefsRef.current) {
      syncData({ preferences: pendingPrefsRef.current }).catch(() => {});
    }
  }, []);

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

  function markSaved() {
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
  }

  async function flushAutosave() {
    if (savingRef.current) {
      saveTimerRef.current = setTimeout(flushAutosave, 250);
      return;
    }
    const snapshot = pendingPrefsRef.current;
    if (!snapshot) {
      if (mountedRef.current) setSaving(false);
      return;
    }
    pendingPrefsRef.current = null;
    savingRef.current = true;
    if (mountedRef.current) {
      setSaving(true);
      setSaved(false);
      setSaveError(false);
    }
    let failed = false;
    try {
      await syncData({ preferences: snapshot });
      if (!pendingPrefsRef.current) {
        for (const key of Array.from(dirtyKeys.current)) {
          if (prefsRef.current[key] === snapshot[key]) dirtyKeys.current.delete(key);
        }
      }
      await fetchUser();
      if (mountedRef.current) markSaved();
    } catch (err) {
      console.error('Failed to auto-save settings:', err);
      pendingPrefsRef.current = pendingPrefsRef.current || snapshot;
      if (mountedRef.current) setSaveError(true);
      failed = true;
    }
    savingRef.current = false;
    if (failed) {
      if (mountedRef.current) setSaving(false);
    } else if (pendingPrefsRef.current) {
      saveTimerRef.current = setTimeout(flushAutosave, 300);
    } else {
      if (mountedRef.current) setSaving(false);
    }
  }

  function scheduleAutosave(nextPrefs, value) {
    pendingPrefsRef.current = nextPrefs;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setSaving(true);
    setSaved(false);
    setSaveError(false);
    saveTimerRef.current = setTimeout(flushAutosave, typeof value === 'string' ? 500 : 100);
  }

  function flushAutosaveNow() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushAutosave, 0);
  }

  function update(key, value) {
    dirtyKeys.current.add(key);
    const next = { ...prefsRef.current, [key]: value };
    prefsRef.current = next;
    setPrefs(next);
    scheduleAutosave(next, value);
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
        {tab === 'ai'         && <AITab prefs={prefs} update={update} flushAutosave={flushAutosaveNow} saving={saving} saved={saved} saveError={saveError} />}
        {tab === 'curriculum' && <CurriculumTab prefs={prefs} update={update} saving={saving} saved={saved} saveError={saveError} />}
        {tab === 'account'    && <AccountTab user={user} onRestart={handleRestart} />}
      </div>
    </div>
  );
}
