import { useState } from 'react';
import { BookOpen, ChevronRight, Moon, Sun } from 'lucide-react';
import { WALLPAPERS } from './DesktopBackground';

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

  function finish() {
    if (dark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('covalent-theme', dark ? 'dark' : 'light');
    localStorage.setItem('covalent-wallpaper', wallpaper);
    localStorage.setItem('covalent-onboarded', 'true');
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0a0a1a, #0d1117, #0f0a1e)' }}>
      <div className="w-full max-w-lg">
        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="text-center animate-in fade-in">
            <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-500/20">
              <BookOpen size={40} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Welcome to Covalent</h1>
            <p className="text-white/50 mb-8">Let's set things up.</p>
            <button onClick={() => setStep(1)} className="px-8 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
              Continue <ChevronRight size={16} className="inline ml-1" />
            </button>
          </div>
        )}

        {/* Step 1: Appearance */}
        {step === 1 && (
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Choose your look</h2>
            <p className="text-white/40 text-sm mb-8">You can change this later in Settings.</p>

            <div className="flex gap-4 justify-center mb-8">
              <button onClick={() => { setDark(true); document.documentElement.classList.add('dark'); localStorage.setItem('covalent-theme', 'dark'); }} className={`w-36 rounded-2xl p-4 border-2 transition-all ${dark ? 'border-blue-500 bg-white/5' : 'border-white/10 hover:border-white/20'}`}>
                <div className="w-full aspect-video rounded-lg bg-[#0D0D14] mb-3 flex items-center justify-center">
                  <Moon size={20} className="text-white/50" />
                </div>
                <p className="text-sm font-medium text-white">Dark</p>
              </button>
              <button onClick={() => { setDark(false); document.documentElement.classList.remove('dark'); localStorage.setItem('covalent-theme', 'light'); }} className={`w-36 rounded-2xl p-4 border-2 transition-all ${!dark ? 'border-blue-500 bg-white/5' : 'border-white/10 hover:border-white/20'}`}>
                <div className="w-full aspect-video rounded-lg bg-[#f0f4ff] mb-3 flex items-center justify-center">
                  <Sun size={20} className="text-gray-400" />
                </div>
                <p className="text-sm font-medium text-white">Light</p>
              </button>
            </div>

            <button onClick={() => setStep(2)} className="px-8 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
              Continue <ChevronRight size={16} className="inline ml-1" />
            </button>
          </div>
        )}

        {/* Step 2: Wallpaper */}
        {step === 2 && (
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Pick a wallpaper</h2>
            <p className="text-white/40 text-sm mb-6">Choose your desktop background.</p>

            <div className="grid grid-cols-3 gap-3 mb-8 px-4">
              {WALLPAPER_LIST.map(wp => (
                <button
                  key={wp.id}
                  onClick={() => setWallpaper(wp.id)}
                  className={`aspect-video rounded-xl overflow-hidden border-2 transition-all relative ${wallpaper === wp.id ? 'border-blue-500 ring-2 ring-blue-500/30 scale-105' : 'border-white/10 hover:border-white/20'}`}
                >
                  <div className="w-full h-full bg-cover bg-center" style={{
                    background: wp.preview.startsWith('url') ? undefined : wp.preview,
                    backgroundImage: wp.preview.startsWith('url') ? wp.preview : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }} />
                  <span className="absolute bottom-1 left-0 right-0 text-[10px] text-white/80 text-center drop-shadow font-medium">{wp.label}</span>
                </button>
              ))}
            </div>

            <button onClick={() => setStep(3)} className="px-8 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
              Continue <ChevronRight size={16} className="inline ml-1" />
            </button>
          </div>
        )}

        {/* Step 3: Ready */}
        {step === 3 && (
          <div className="text-center">
            <div className="text-5xl mb-4">🚀</div>
            <h2 className="text-2xl font-bold text-white mb-2">You're all set</h2>
            <p className="text-white/40 text-sm mb-8">Click apps in the dock to get started.</p>
            <button onClick={finish} className="px-8 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
              Get Started
            </button>
          </div>
        )}

        {/* Step dots */}
        <div className="flex justify-center gap-2 mt-8">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${step === i ? 'bg-white w-4' : 'bg-white/20'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
