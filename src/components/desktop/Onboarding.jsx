import { useState } from 'react';
import { BookOpen, ChevronRight, Moon, Sun, Monitor, ArrowRight } from 'lucide-react';

// Fast pre-OS setup — 3 steps, ~30 seconds. The CURRICULUM tutorial is
// NOT here; it's the GuidedTour overlay that runs after the desktop
// loads, anchored to real UI elements (Curricula dock icon, PAUSD Catalog
// button, etc.). This modal just handles the quick choices that need to
// happen before the desktop renders.
const TOTAL_STEPS = 3;

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

  function finish(takeTour) {
    localStorage.setItem('cov-desktop-style', desktopStyle);
    localStorage.setItem('covalent-onboarded', 'true');
    if (takeTour) {
      // Picked up by GuidedTour on first desktop render.
      localStorage.setItem('cov-tour-step', '0');
    }
    onComplete();
  }

  const bg = dark
    ? 'linear-gradient(135deg, #0a0a1a, #0d1117, #0f0a1e)'
    : 'linear-gradient(135deg, #e0e7ff, #ede9fe, #e0e7ff)';
  const textPrimary = dark ? 'text-white' : 'text-gray-900';
  const textSecondary = dark ? 'text-white/60' : 'text-gray-600';
  const textMuted = dark ? 'text-white/40' : 'text-gray-400';
  const borderActive = `border-blue-500 ${dark ? 'bg-white/5' : 'bg-blue-50'}`;
  const borderInactive = dark ? 'border-white/10 hover:border-white/20' : 'border-gray-200 hover:border-gray-300';
  const btnBg = 'bg-blue-600 text-white hover:bg-blue-700';

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center transition-colors duration-300" style={{ background: bg }}>
      <div className="w-full max-w-md px-6">

        {/* STEP 0 — Welcome + theme combined */}
        {step === 0 && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-blue-500/20">
              <BookOpen size={32} className="text-white" />
            </div>
            <h1 className={`text-2xl font-bold ${textPrimary} mb-1.5`}>RushilAI</h1>
            <p className={`${textSecondary} text-sm mb-6`}>Pick a look — you can change this later.</p>

            <div className="flex gap-3 justify-center mb-6">
              <button onClick={pickDark} className={`w-32 rounded-xl p-3 border-2 transition-all ${dark ? borderActive : borderInactive}`}>
                <div className="w-full aspect-video rounded-md bg-[#0D0D14] mb-2 flex items-center justify-center">
                  <Moon size={18} className="text-white/50" />
                </div>
                <p className={`text-[13px] font-medium ${textPrimary}`}>Dark</p>
              </button>
              <button onClick={pickLight} className={`w-32 rounded-xl p-3 border-2 transition-all ${!dark ? borderActive : borderInactive}`}>
                <div className="w-full aspect-video rounded-md bg-[#f0f4ff] mb-2 flex items-center justify-center">
                  <Sun size={18} className="text-gray-400" />
                </div>
                <p className={`text-[13px] font-medium ${textPrimary}`}>Light</p>
              </button>
            </div>

            <button onClick={() => setStep(1)} className={`px-7 py-2.5 rounded-xl ${btnBg} font-medium text-sm transition-colors inline-flex items-center gap-1.5`}>
              Continue <ChevronRight size={15} />
            </button>
          </div>
        )}

        {/* STEP 1 — Desktop style */}
        {step === 1 && (
          <div className="text-center">
            <h2 className={`text-xl font-bold ${textPrimary} mb-1.5`}>Pick a desktop</h2>
            <p className={`${textMuted} text-xs mb-6`}>Changes the chrome around your apps. Switch later in Settings.</p>
            <div className="grid grid-cols-2 gap-2.5 mb-6">
              {[
                { id: 'macos', label: 'macOS', desc: 'Dock + Menu Bar' },
                { id: 'windows', label: 'Windows', desc: 'Taskbar + Start' },
                { id: 'chromeos', label: 'ChromeOS', desc: 'Centered Shelf' },
                { id: 'linux', label: 'Linux', desc: 'GNOME Panel' },
              ].map(os => (
                <button key={os.id} onClick={() => setDesktopStyle(os.id)} className={`rounded-xl p-3 border-2 transition-all text-left ${desktopStyle === os.id ? borderActive : borderInactive}`}>
                  <Monitor size={16} className={desktopStyle === os.id ? 'text-blue-500 mb-1.5' : `${dark ? 'text-white/40' : 'text-gray-400'} mb-1.5`} />
                  <p className={`text-[13px] font-semibold ${textPrimary}`}>{os.label}</p>
                  <p className={`text-[10px] ${textMuted}`}>{os.desc}</p>
                </button>
              ))}
            </div>
            <button onClick={() => setStep(2)} className={`px-7 py-2.5 rounded-xl ${btnBg} font-medium text-sm transition-colors inline-flex items-center gap-1.5`}>
              Continue <ChevronRight size={15} />
            </button>
          </div>
        )}

        {/* STEP 2 — Ready, with tour offer */}
        {step === 2 && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 className={`text-xl font-bold ${textPrimary} mb-1.5`}>Ready</h2>
            <p className={`${textSecondary} text-sm mb-2 max-w-xs mx-auto`}>
              Want a quick guided tour? It points at things on the actual desktop — takes about a minute.
            </p>
            <p className={`${textMuted} text-xs mb-6`}>You can replay it anytime from Settings.</p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => finish(false)}
                className={`px-4 py-2.5 rounded-xl border ${dark ? 'border-white/15 text-white/70 hover:bg-white/5' : 'border-gray-200 text-gray-600 hover:bg-gray-50'} text-sm transition-colors`}
              >
                Skip
              </button>
              <button
                onClick={() => finish(true)}
                className={`px-6 py-2.5 rounded-xl ${btnBg} font-medium text-sm transition-colors inline-flex items-center gap-1.5`}
              >
                Show me around <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Step indicator */}
        <div className="flex justify-center gap-1.5 mt-7">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                step === i
                  ? `w-5 ${dark ? 'bg-white' : 'bg-gray-900'}`
                  : i < step
                    ? `w-1 ${dark ? 'bg-white/40' : 'bg-gray-500'}`
                    : `w-1 ${dark ? 'bg-white/15' : 'bg-gray-300'}`
              }`}
            />
          ))}
        </div>

        {step > 0 && (
          <div className="text-center mt-3">
            <button onClick={() => setStep(step - 1)} className={`text-xs ${textMuted} hover:${dark ? 'text-white/60' : 'text-gray-700'} transition-colors`}>← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
