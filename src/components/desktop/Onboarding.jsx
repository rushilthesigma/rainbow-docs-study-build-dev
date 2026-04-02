import { useState } from 'react';
import { BookOpen, ChevronRight, Moon, Sun, Monitor, Layout } from 'lucide-react';

const WALLPAPER_LIST = [
  { id: 'nebula', label: 'Nebula', preview: 'linear-gradient(135deg, #1a0533, #0d1117, #0f0a1e)' },
  { id: 'carina', label: 'Carina', preview: 'url(https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=300&q=40)' },
  { id: 'pillars', label: 'Pillars', preview: 'url(https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=300&q=40)' },
  { id: 'galaxy', label: 'Galaxy', preview: 'url(https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=300&q=40)' },
  { id: 'milkyway', label: 'Milky Way', preview: 'url(https://images.unsplash.com/photo-1509773896068-7fd415d91e2e?w=300&q=40)' },
  { id: 'cosmos', label: 'Cosmos', preview: 'url(https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=300&q=40)' },
];

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [dark, setDark] = useState(true);
  const [wallpaper, setWallpaper] = useState('nebula');
  const [uiMode, setUiMode] = useState('desktop');

  function pickDark() {
    setDark(true);
    document.documentElement.classList.add('dark');
    localStorage.setItem('covalent-theme', 'dark');
  }

  function pickLight() {
    setDark(false);
    document.documentElement.classList.remove('dark');
    localStorage.setItem('covalent-theme', 'light');
  }

  function finish() {
    localStorage.setItem('covalent-wallpaper', wallpaper);
    localStorage.setItem('covalent-ui-mode', uiMode);
    localStorage.setItem('covalent-onboarded', 'true');
    onComplete();
  }

  // Dynamic background based on chosen theme
  const bg = dark
    ? 'linear-gradient(135deg, #0a0a1a, #0d1117, #0f0a1e)'
    : 'linear-gradient(135deg, #e0e7ff, #ede9fe, #e0e7ff)';
  const textPrimary = dark ? 'text-white' : 'text-gray-900';
  const textSecondary = dark ? 'text-white/50' : 'text-gray-500';
  const textMuted = dark ? 'text-white/40' : 'text-gray-400';
  const borderActive = 'border-blue-500 ' + (dark ? 'bg-white/5' : 'bg-blue-50');
  const borderInactive = dark ? 'border-white/10 hover:border-white/20' : 'border-gray-200 hover:border-gray-300';
  const btnBg = 'bg-blue-600 text-white hover:bg-blue-700';

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center transition-colors duration-300" style={{ background: bg }}>
      <div className="w-full max-w-lg">

        {step === 0 && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-500/20">
              <BookOpen size={40} className="text-white" />
            </div>
            <h1 className={`text-3xl font-bold ${textPrimary} mb-2`}>Welcome to Covalent</h1>
            <p className={`${textSecondary} mb-8`}>Let's set things up.</p>
            <button onClick={() => setStep(1)} className={`px-8 py-3 rounded-xl ${btnBg} font-medium transition-colors`}>
              Continue <ChevronRight size={16} className="inline ml-1" />
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="text-center">
            <h2 className={`text-2xl font-bold ${textPrimary} mb-2`}>Choose your look</h2>
            <p className={`${textMuted} text-sm mb-8`}>You can change this later in Settings.</p>

            <div className="flex gap-4 justify-center mb-8">
              <button onClick={pickDark} className={`w-36 rounded-2xl p-4 border-2 transition-all ${dark ? borderActive : borderInactive}`}>
                <div className="w-full aspect-video rounded-lg bg-[#0D0D14] mb-3 flex items-center justify-center">
                  <Moon size={20} className="text-white/50" />
                </div>
                <p className={`text-sm font-medium ${textPrimary}`}>Dark</p>
              </button>
              <button onClick={pickLight} className={`w-36 rounded-2xl p-4 border-2 transition-all ${!dark ? borderActive : borderInactive}`}>
                <div className="w-full aspect-video rounded-lg bg-[#f0f4ff] mb-3 flex items-center justify-center">
                  <Sun size={20} className="text-gray-400" />
                </div>
                <p className={`text-sm font-medium ${textPrimary}`}>Light</p>
              </button>
            </div>

            <button onClick={() => setStep(2)} className={`px-8 py-3 rounded-xl ${btnBg} font-medium transition-colors`}>
              Continue <ChevronRight size={16} className="inline ml-1" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="text-center">
            <h2 className={`text-2xl font-bold ${textPrimary} mb-2`}>Choose your layout</h2>
            <p className={`${textMuted} text-sm mb-8`}>You can switch anytime in Settings.</p>

            <div className="flex gap-4 justify-center mb-8">
              <button onClick={() => setUiMode('desktop')} className={`w-40 rounded-2xl p-4 border-2 transition-all ${uiMode === 'desktop' ? borderActive : borderInactive}`}>
                <div className={`w-full aspect-video rounded-lg mb-3 flex items-center justify-center ${dark ? 'bg-[#0D0D14]' : 'bg-gray-100'}`}>
                  <Monitor size={20} className={dark ? 'text-white/50' : 'text-gray-400'} />
                </div>
                <p className={`text-sm font-semibold ${textPrimary}`}>Desktop</p>
                <p className={`text-[10px] ${textMuted} mt-0.5`}>macOS-style windows & dock</p>
              </button>
              <button onClick={() => setUiMode('classic')} className={`w-40 rounded-2xl p-4 border-2 transition-all ${uiMode === 'classic' ? borderActive : borderInactive}`}>
                <div className={`w-full aspect-video rounded-lg mb-3 flex items-center justify-center ${dark ? 'bg-[#161622]' : 'bg-white'}`}>
                  <Layout size={20} className={dark ? 'text-white/50' : 'text-gray-400'} />
                </div>
                <p className={`text-sm font-semibold ${textPrimary}`}>Classic</p>
                <p className={`text-[10px] ${textMuted} mt-0.5`}>Sidebar & tabs</p>
              </button>
            </div>

            <button onClick={() => setStep(uiMode === 'desktop' ? 3 : 4)} className={`px-8 py-3 rounded-xl ${btnBg} font-medium transition-colors`}>
              Continue <ChevronRight size={16} className="inline ml-1" />
            </button>
          </div>
        )}

        {step === 3 && uiMode === 'desktop' && (
          <div className="text-center">
            <h2 className={`text-2xl font-bold ${textPrimary} mb-2`}>Pick a wallpaper</h2>
            <p className={`${textMuted} text-sm mb-6`}>Choose your desktop background.</p>

            <select
              value={wallpaper}
              onChange={e => setWallpaper(e.target.value)}
              className={`w-full max-w-xs mx-auto block px-4 py-3 rounded-xl border text-sm mb-8 ${dark ? 'bg-[#161622] border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
            >
              {WALLPAPER_LIST.map(wp => (
                <option key={wp.id} value={wp.id}>{wp.label}</option>
              ))}
            </select>

            <button onClick={() => setStep(4)} className={`px-8 py-3 rounded-xl ${btnBg} font-medium transition-colors`}>
              Continue <ChevronRight size={16} className="inline ml-1" />
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="text-center">
            <div className="text-5xl mb-4">🚀</div>
            <h2 className={`text-2xl font-bold ${textPrimary} mb-2`}>You're all set</h2>
            <p className={`${textMuted} text-sm mb-8`}>Click apps in the dock to get started.</p>
            <button onClick={finish} className={`px-8 py-3 rounded-xl ${btnBg} font-medium transition-colors`}>
              Get Started
            </button>
          </div>
        )}

        <div className="flex justify-center gap-2 mt-8">
          {(uiMode === 'desktop' ? [0,1,2,3,4] : [0,1,2,4]).map(i => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${step === i ? `w-4 ${dark ? 'bg-white' : 'bg-gray-900'}` : `w-1.5 ${dark ? 'bg-white/20' : 'bg-gray-300'}`}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
