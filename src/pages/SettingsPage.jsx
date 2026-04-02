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

const WALLPAPER_PREVIEWS = [
  { id: 'nebula', label: 'Nebula', preview: 'linear-gradient(135deg, #1a0533, #0d1117, #0f0a1e)' },
  { id: 'deepspace', label: 'Deep Space', preview: 'linear-gradient(135deg, #030712, #0a0a1a, #050510)' },
  { id: 'carina', label: 'Carina Nebula', preview: 'url(https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=200&q=40)' },
  { id: 'pillars', label: 'Pillars', preview: 'url(https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=200&q=40)' },
  { id: 'galaxy', label: 'Galaxy', preview: 'url(https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=200&q=40)' },
  { id: 'orion', label: 'Orion', preview: 'url(https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=200&q=40)' },
  { id: 'milkyway', label: 'Milky Way', preview: 'url(https://images.unsplash.com/photo-1509773896068-7fd415d91e2e?w=200&q=40)' },
  { id: 'cosmos', label: 'Cosmos', preview: 'url(https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=200&q=40)' },
];

function InterfaceSection() {
  const { uiMode, rawUiMode, setUiMode, wallpaper, setWallpaper, dockSize, setDockSize, iconStyle, setIconStyle } = useUIPreference();
  const currentMode = rawUiMode || uiMode;

  function setPref(key, val) {
    if (key === 'covalent-wallpaper') setWallpaper(val);
    else if (key === 'covalent-dock-size') setDockSize(val);
    else if (key === 'covalent-icon-style') setIconStyle(val);
  }

  function switchMode(mode) {
    setUiMode(mode);
    window.location.reload();
  }

  return (
    <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-6 space-y-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">Interface</h3>

      {/* UI Mode */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Layout</label>
        <div className="flex gap-2">
          <button onClick={() => switchMode('desktop')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${currentMode === 'desktop' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-600 dark:text-gray-300'}`}>Desktop</button>
          <button onClick={() => switchMode('classic')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${currentMode === 'classic' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-600 dark:text-gray-300'}`}>Classic</button>
        </div>
      </div>

      {/* Wallpaper — only for desktop mode */}
      {currentMode === 'desktop' && (<>
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Wallpaper</label>
        <div className="grid grid-cols-4 gap-2">
          {WALLPAPER_PREVIEWS.map(wp => (
            <button
              key={wp.id}
              onClick={() => setPref('covalent-wallpaper', wp.id)}
              className={`aspect-video rounded-lg overflow-hidden border-2 transition-colors relative ${wallpaper === wp.id ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'}`}
            >
              <div className="w-full h-full bg-cover bg-center" style={{ background: wp.preview.startsWith('url') ? undefined : wp.preview, backgroundImage: wp.preview.startsWith('url') ? wp.preview : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              <span className="absolute bottom-0.5 left-0 right-0 text-[8px] text-white/80 text-center drop-shadow">{wp.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Dock Size */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Dock Size</label>
        <div className="flex gap-2">
          {['small', 'medium', 'large'].map(s => (
            <button key={s} onClick={() => setPref('covalent-dock-size', s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${dockSize === s ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2A2A40]'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Icon Style */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Icon Style</label>
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'gradient', label: 'Colorful' },
            { id: 'mono', label: 'Monochrome' },
            { id: 'glass', label: 'Glass' },
            { id: 'accent', label: 'Accent Tint' },
          ].map(s => (
            <button key={s.id} onClick={() => setPref('covalent-icon-style', s.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${iconStyle === s.id ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2A2A40]'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      </>)}
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
