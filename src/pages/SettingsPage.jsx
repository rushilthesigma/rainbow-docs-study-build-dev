import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { syncData } from '../api/auth';
import { DIFFICULTY_OPTIONS, LEARNING_STYLE_OPTIONS, LESSON_LENGTH_OPTIONS, TONE_OPTIONS, RIGOR_OPTIONS, TEMPO_OPTIONS, PERSONALITY_OPTIONS, FLUFF_OPTIONS } from '../utils/constants';
import PillGroup from '../components/shared/PillGroup';
import Toggle from '../components/shared/Toggle';
import { Textarea } from '../components/shared/Input';
import Button from '../components/shared/Button';
import { Settings, Save, User } from 'lucide-react';
import { useUIPreference } from '../context/UIPreferenceContext';

import { WALLPAPER_LIST } from '../components/desktop/DesktopBackground';

function Dropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">{label}</label>
      <div className="relative">
        <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-white">
          <span>{selected?.label || value}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" className={`transition-transform ${open ? 'rotate-180' : ''}`}><path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] shadow-xl py-1">
              {options.map(o => (
                <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }} className={`w-full text-left px-3 py-2 text-sm ${value === o.value ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1e1e2e]'}`}>
                  {o.label}{o.desc ? <span className="text-[10px] text-gray-400 ml-2">{o.desc}</span> : ''}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function InterfaceSection() {
  const { wallpaper, setWallpaper, dockSize, setDockSize, iconStyle, setIconStyle } = useUIPreference();

  const wallpaperOpts = WALLPAPER_LIST.map(w => ({ value: w.id, label: w.label }));
  const dockOpts = [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }];
  const iconOpts = [{ value: 'gradient', label: 'Colorful' }, { value: 'mono', label: 'Monochrome' }, { value: 'glass', label: 'Glass' }, { value: 'accent', label: 'Accent Tint' }];
  const styleOpts = [
    { value: 'macos', label: 'macOS', desc: 'Dock + Menu Bar' },
    { value: 'windows', label: 'Windows', desc: 'Taskbar + Start Menu' },
    { value: 'chromeos', label: 'ChromeOS', desc: 'Centered Shelf' },
    { value: 'linux', label: 'Linux (GNOME)', desc: 'Top Panel + Dash' },
    { value: 'mobile', label: 'Mobile (Dev)', desc: 'Bottom tabs, touch UI' },
  ];

  const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < 768;
  const currentStyle = (typeof window !== 'undefined' && localStorage.getItem('cov-desktop-style')) || 'macos';
  // Dock Size / Icon Style only matter on macOS (it's the only shell using Dock.jsx with these controls)
  const isMacos = currentStyle === 'macos';

  return (
    <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-6 space-y-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">{isMobileScreen ? 'Appearance' : 'Desktop'}</h3>

      {!isMobileScreen && (
        <>
          <Dropdown label="Desktop Style" value={currentStyle} options={styleOpts} onChange={v => { localStorage.setItem('cov-desktop-style', v); window.location.reload(); }} />
          <Dropdown label="Wallpaper" value={wallpaper} options={wallpaperOpts} onChange={setWallpaper} />
          {isMacos && <Dropdown label="Dock Size" value={dockSize} options={dockOpts} onChange={setDockSize} />}
          {isMacos && <Dropdown label="Icon Style" value={iconStyle} options={iconOpts} onChange={setIconStyle} />}
        </>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { user, fetchUser } = useAuth();
  const [prefs, setPrefs] = useState(user?.data?.preferences || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user?.data?.preferences) setPrefs(user.data.preferences);
  }, [user]);

  function update(key, value) {
    setPrefs(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await syncData({ preferences: prefs });
      await fetchUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { console.error('Failed to save:', err); }
    setSaving(false);
  }

  const profile = user?.data?.profile;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
          <Settings size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Customize your learning experience</p>
        </div>
      </div>

      {/* Interface Mode */}
      <InterfaceSection />

      {/* AI Behavior */}
      <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">AI Behavior</h3>

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
      </div>

      {/* Curriculum Defaults */}
      <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">Curriculum Defaults</h3>

        <PillGroup label="Default Difficulty" options={DIFFICULTY_OPTIONS} value={prefs.defaultDifficulty} onChange={v => update('defaultDifficulty', v)} />
        <PillGroup label="Default Learning Style" options={LEARNING_STYLE_OPTIONS} value={prefs.defaultStyle} onChange={v => update('defaultStyle', v)} />
        <PillGroup label="Default Tone" options={TONE_OPTIONS} value={prefs.defaultTone} onChange={v => update('defaultTone', v)} />
        <PillGroup label="Default Lesson Length" options={LESSON_LENGTH_OPTIONS} value={prefs.defaultLength} onChange={v => update('defaultLength', v)} />

        <div className="space-y-3 pt-2">
          <Toggle label="Include examples by default" checked={prefs.includeExamples ?? true} onChange={v => update('includeExamples', v)} />
          <Toggle label="Include exercises by default" checked={prefs.includeExercises ?? true} onChange={v => update('includeExercises', v)} />
        </div>
      </div>

      <div className="pt-2">
        <Button onClick={handleSave} loading={saving}>
          <Save size={16} />
          {saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>

      {/* Account & Profile */}
      <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-3">Account</h3>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-semibold text-blue-600">
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.name}</p>
            <p className="text-xs text-gray-400">{user?.email}</p>
          </div>
        </div>
        {profile && (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-50 dark:bg-[#0D0D14] rounded-lg p-3">
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{profile.level}</p>
              <p className="text-xs text-gray-500">Level</p>
            </div>
            <div className="bg-gray-50 dark:bg-[#0D0D14] rounded-lg p-3">
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{profile.xp}</p>
              <p className="text-xs text-gray-500">XP</p>
            </div>
            <div className="bg-gray-50 dark:bg-[#0D0D14] rounded-lg p-3">
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{Object.keys(profile.topicScores || {}).length}</p>
              <p className="text-xs text-gray-500">Topics</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
