import { useState } from 'react';
import { BookOpen, ChevronRight, Moon, Sun, Monitor, Smartphone } from 'lucide-react';

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [dark, setDark] = useState(true);
  const [desktopStyle, setDesktopStyle] = useState('macos');

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
    localStorage.setItem('cov-desktop-style', desktopStyle);
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
            <h1 className={`text-3xl font-bold ${textPrimary} mb-2`}>Welcome to RushilAI</h1>
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
            <h2 className={`text-2xl font-bold ${textPrimary} mb-6`}>Select UI</h2>
            <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto mb-8">
              {[
                { id: 'macos', label: 'macOS', desc: 'Dock + Menu Bar' },
                { id: 'windows', label: 'Windows', desc: 'Taskbar + Start Menu' },
                { id: 'chromeos', label: 'ChromeOS', desc: 'Centered Shelf' },
                { id: 'linux', label: 'Linux', desc: 'GNOME Panel + Dash' },
              ].map(os => (
                <button key={os.id} onClick={() => setDesktopStyle(os.id)} className={`rounded-xl p-4 border-2 transition-all text-left ${desktopStyle === os.id ? borderActive : borderInactive}`}>
                  <Monitor size={20} className={desktopStyle === os.id ? 'text-blue-500 mb-2' : `${dark ? 'text-white/40' : 'text-gray-400'} mb-2`} />
                  <p className={`text-sm font-semibold ${textPrimary}`}>{os.label}</p>
                  <p className={`text-[10px] ${textMuted} mt-0.5`}>{os.desc}</p>
                </button>
              ))}
            </div>
            <p className={`text-[10px] ${textMuted} mb-4`}>Recommended: macOS for most users, Windows if you prefer a taskbar</p>
            <button onClick={() => setStep(3)} className={`px-8 py-3 rounded-xl ${btnBg} font-medium transition-colors`}>
              Continue <ChevronRight size={16} className="inline ml-1" />
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 className={`text-2xl font-bold ${textPrimary} mb-2`}>You're all set</h2>
            <p className={`${textMuted} text-sm mb-8`}>Your {desktopStyle === 'macos' ? 'macOS' : desktopStyle === 'windows' ? 'Windows' : desktopStyle === 'chromeos' ? 'ChromeOS' : 'Linux'} desktop is ready.</p>
            <button onClick={finish} className={`px-8 py-3 rounded-xl ${btnBg} font-medium transition-colors`}>
              Get Started
            </button>
          </div>
        )}

        <div className="flex justify-center gap-2 mt-8">
          {[0,1,2,3].map(i => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${step === i ? `w-4 ${dark ? 'bg-white' : 'bg-gray-900'}` : `w-1.5 ${dark ? 'bg-white/20' : 'bg-gray-300'}`}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
