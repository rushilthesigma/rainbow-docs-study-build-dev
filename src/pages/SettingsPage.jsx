import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { syncData } from '../api/auth';
import { DIFFICULTY_OPTIONS, LEARNING_STYLE_OPTIONS, LESSON_LENGTH_OPTIONS, TONE_OPTIONS, RIGOR_OPTIONS, TEMPO_OPTIONS, PERSONALITY_OPTIONS, FLUFF_OPTIONS } from '../utils/constants';
import PillGroup from '../components/shared/PillGroup';
import Toggle from '../components/shared/Toggle';
import { Textarea } from '../components/shared/Input';
import Button from '../components/shared/Button';
import { Settings, Save, GraduationCap, ChevronDown, Check } from 'lucide-react';
import { useUIPreference } from '../context/UIPreferenceContext';
import { WALLPAPER_LIST } from '../components/desktop/DesktopBackground';

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

function Section({ title, children }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-6 space-y-5">
      <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">{title}</h3>
      {children}
    </div>
  );
}

function InterfaceSection() {
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
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/40">Title Bar Transparency</label>
              <span className="text-[11px] text-white/30 tabular-nums">{100 - (titlebarOpacity ?? 80)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={titlebarOpacity ?? 80}
              onChange={e => setTitlebarOpacity(Number(e.target.value))}
              className="w-full accent-white/60 h-1.5 rounded-full cursor-pointer"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-white/20">Fully glass</span>
              <span className="text-[10px] text-white/20">Solid</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/40">Window Transparency</label>
              <span className="text-[11px] text-white/30 tabular-nums">{100 - opacity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={opacity}
              onChange={e => setWindowOpacity(Number(e.target.value))}
              className="w-full accent-white/60 h-1.5 rounded-full cursor-pointer"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-white/20">Fully glass</span>
              <span className="text-[10px] text-white/20">Fully solid</span>
            </div>
          </div>
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
    <div className="max-w-2xl mx-auto space-y-3 px-1">

      {/* Header */}
      <div className="flex items-center gap-3 mb-7 pt-1">
        <div className="w-11 h-11 rounded-2xl bg-white/[0.08] border border-white/[0.10] flex items-center justify-center text-white/55">
          <Settings size={20} />
        </div>
        <div>
          <h1 className="text-[20px] font-bold text-white/90 tracking-tight">Settings</h1>
          <p className="text-[12px] text-white/35">Customize your learning experience</p>
        </div>
      </div>

      {/* Desktop / Interface */}
      <InterfaceSection />

      {/* AI Behavior */}
      <Section title="AI Behavior">
        {(() => {
          async function setTier(v) {
            const next = { ...prefs, modelTier: v };
            setPrefs(next);
            dirtyKeys.current.add('modelTier');
            try {
              await syncData({ preferences: next });
              dirtyKeys.current.delete('modelTier');
              await fetchUser();
            } catch (err) { console.error('Failed to save model tier:', err); }
          }
          const effectiveValue = prefs.modelTier || 'pro';
          return (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/40">Model</label>
                <span className="text-[10px] text-white/20">· auto-saves</span>
              </div>
              <PillGroup
                options={[
                  { value: 'pro',        label: 'Pro',        description: '· smartest' },
                  { value: 'flash',      label: 'Flash',      description: '· faster' },
                  { value: 'flash-lite', label: 'Flash Lite', description: '· fastest' },
                ]}
                value={effectiveValue}
                onChange={setTier}
              />
              <p className="text-[10px] text-white/25 mt-2 leading-relaxed">
                All three tiers share the same 1M-token context. Pro is best for proofs; Flash is the balanced default; Flash Lite is fastest for short Q&amp;A.
              </p>
            </div>
          );
        })()}

        <PillGroup label="Personality" options={PERSONALITY_OPTIONS} value={prefs.aiPersonality} onChange={v => update('aiPersonality', v)} />
        <PillGroup label="Fluff Level" options={FLUFF_OPTIONS} value={prefs.fluffLevel} onChange={v => update('fluffLevel', v)} />
        <PillGroup label="Rigor" options={RIGOR_OPTIONS} value={prefs.rigor} onChange={v => update('rigor', v)} />
        <PillGroup label="Lesson Tempo" options={TEMPO_OPTIONS} value={prefs.lessonTempo} onChange={v => update('lessonTempo', v)} />

        <Textarea
          label="Custom Instructions"
          placeholder="e.g., Always relate concepts to real-world examples. I'm a visual learner..."
          value={prefs.customInstructions || ''}
          onChange={e => update('customInstructions', e.target.value)}
          rows={3}
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
      <div className="pt-1">
        <Button onClick={handleSave} loading={saving}>
          <Save size={15} />
          {saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>

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
              Replay the 8-step welcome tutorial — pedagogy, catalog, lesson flow, progress.
            </p>
          </div>
          <button
            onClick={() => {
              if (!confirm('Replay the welcome tutorial now?')) return;
              localStorage.removeItem('covalent-onboarded');
              localStorage.removeItem('cov-launch-app');
              window.location.reload();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.07] border border-white/[0.10] hover:bg-white/[0.12] text-white/65 hover:text-white/85 text-[12px] font-semibold transition-colors flex-shrink-0"
          >
            <GraduationCap size={13} /> Restart
          </button>
        </div>
      </Section>

    </div>
  );
}
