import { useState } from 'react';
import { ChevronRight, ChevronLeft, Sparkles, Check, ArrowRight, BookOpen, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import { syncData } from '../../api/auth';
import { WALLPAPERS } from './DesktopBackground';
import { Z } from '../../styles/tokens';

// macOS Setup-Assistant-style onboarding. Steps:
//   1. Welcome    - big "Hello" + brand mark
//   2. Purpose    - school vs quiz bowl
//   3. Wallpaper  - pick a desktop background
//   4a. Tour      - guided tour offer (school path)
//   4b. QBSetup   - pick category + difficulty, then open the real QB app (quiz bowl path)

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [useCase, setUseCase] = useState(null); // 'school' | 'quizbowl'
  const { user, fetchUser } = useAuth();
  const { wallpaper, setWallpaper } = useUIPreference();
  const dark = document.documentElement.classList.contains('dark');

  const STEPS = useCase === 'quizbowl'
    ? ['welcome', 'purpose', 'wallpaper', 'qb-ready']
    : ['welcome', 'purpose', 'wallpaper', 'tour'];

  const PICKS = ['milkyway', 'aurora', 'ocean', 'galaxy', 'lavender', 'forest', 'cosmos', 'nebula'];

  function next() {
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }
  function back() { setStep((s) => Math.max(0, s - 1)); }

  async function finish(takeTour) {
    try {
      const prefs = {
        ...(user?.data?.preferences || {}),
        onboarded: true,
        useCase,
        tourStep: useCase === 'quizbowl' ? 0 : (takeTour ? 0 : null),
      };
      await syncData({ preferences: prefs });
      await fetchUser();
    } catch (err) {
      console.error('Failed to save onboarding state:', err);
    }
    if (useCase === 'quizbowl') sessionStorage.setItem('postOnboardOpen', 'quizbowl');
    onComplete();
  }

  const firstName = (user?.name || user?.email || 'there').split(/[\s@]/)[0];

  const bg = dark
    ? STEP_BG_DARK[STEPS[step]] || STEP_BG_DARK.welcome
    : STEP_BG_LIGHT[STEPS[step]] || STEP_BG_LIGHT.welcome;

  const continueDisabled = STEPS[step] === 'purpose' && !useCase;
  const hideChrome = STEPS[step] === 'tour' || STEPS[step] === 'qb-ready';

  return (
    <div
      className="fixed inset-0 flex flex-col transition-[background] duration-700 ease-out"
      style={{ zIndex: Z.tour, background: bg }}
    >
      <ProgressDots count={STEPS.length} active={step} dark={dark} />

      <main className="flex-1 min-h-0 flex items-center justify-center px-6">
        <div className="w-full max-w-xl">
          {STEPS[step] === 'welcome' && (
            <Welcome name={firstName} dark={dark} />
          )}
          {STEPS[step] === 'purpose' && (
            <PurposePick useCase={useCase} setUseCase={setUseCase} dark={dark} />
          )}
          {STEPS[step] === 'wallpaper' && (
            <WallpaperPick wallpaper={wallpaper} setWallpaper={setWallpaper} picks={PICKS} dark={dark} />
          )}
          {STEPS[step] === 'tour' && (
            <Tour onSkip={() => finish(false)} onTour={() => finish(true)} dark={dark} />
          )}
          {STEPS[step] === 'qb-ready' && (
            <QBReady onGo={() => finish(false)} dark={dark} />
          )}
        </div>
      </main>

      <div className="flex items-center justify-between px-8 py-6">
        {step > 0 ? (
          <button
            onClick={back}
            className={`inline-flex items-center gap-1 px-4 py-2 rounded-lg text-[13px] font-medium ${
              dark ? 'text-white/70 hover:bg-white/[0.08]' : 'text-gray-600 hover:bg-black/[0.04]'
            } transition-colors`}
          >
            <ChevronLeft size={14} /> Back
          </button>
        ) : <span />}

        {!hideChrome && (
          <button
            onClick={next}
            disabled={continueDisabled}
            className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-500 text-white text-[13.5px] font-semibold transition-all ${
              continueDisabled
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-blue-400 active:scale-[0.98]'
            }`}
          >
            Continue <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ===== Progress dots =====
function ProgressDots({ count, active, dark }) {
  return (
    <div className="pt-7 flex justify-center gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={`h-1 rounded-full transition-all duration-300 ${
            i === active
              ? `w-6 ${dark ? 'bg-white' : 'bg-gray-900'}`
              : i < active
                ? `w-1.5 ${dark ? 'bg-white/55' : 'bg-gray-700'}`
                : `w-1.5 ${dark ? 'bg-white/20' : 'bg-gray-300'}`
          }`}
        />
      ))}
    </div>
  );
}

// ===== Step 1: Welcome =====
function Welcome({ name, dark }) {
  return (
    <div className="text-center select-none">
      <div className="mb-6 flex justify-center">
        <div className="relative w-20 h-20 rounded-2xl bg-blue-500 grid place-items-center animate-fade-up">
          <Sparkles size={38} className="text-white" strokeWidth={2.2} />
        </div>
      </div>
      <h1
        className={`text-[64px] sm:text-[88px] leading-[0.95] font-bold tracking-[-0.04em] italic bg-gradient-to-br ${
          dark ? 'from-white via-blue-200 to-blue-400' : 'from-gray-900 via-blue-700 to-indigo-700'
        } bg-clip-text text-transparent animate-fade-up`}
        style={{ animationDelay: '0.15s', animationFillMode: 'both' }}
      >
        hello
      </h1>
      <p
        className={`mt-5 text-[16px] sm:text-[18px] ${dark ? 'text-white/80' : 'text-gray-700'} animate-fade-up`}
        style={{ animationDelay: '0.45s', animationFillMode: 'both' }}
      >
        Welcome{name && name !== 'there' ? `, ${name}` : ''}.
      </p>
      <p
        className={`mt-2 text-[13px] ${dark ? 'text-white/55' : 'text-gray-500'} animate-fade-up`}
        style={{ animationDelay: '0.6s', animationFillMode: 'both' }}
      >
        Let&apos;s set up your RushilAI in just a few steps.
      </p>
    </div>
  );
}

// ===== Step 2: Purpose =====
function PurposePick({ useCase, setUseCase, dark }) {
  return (
    <div>
      <Header
        title="What are you here for?"
        sub="Pick one to personalize your setup. You can use both features anytime."
        dark={dark}
      />
      <div className="mt-8 grid grid-cols-2 gap-4 max-w-md mx-auto">
        <PurposeCard
          icon={<BookOpen size={28} strokeWidth={2} />}
          label="School"
          desc="AI curricula, lessons, notes, and quizzes"
          active={useCase === 'school'}
          onClick={() => setUseCase('school')}
          dark={dark}
        />
        <PurposeCard
          icon={<Zap size={28} strokeWidth={2} />}
          label="Quiz Bowl"
          desc="AI tossups, bots, and match practice"
          active={useCase === 'quizbowl'}
          onClick={() => setUseCase('quizbowl')}
          dark={dark}
        />
      </div>
    </div>
  );
}

function PurposeCard({ icon, label, desc, active, onClick, dark }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center text-center gap-3 p-6 rounded-2xl border-2 transition-all duration-200 ${
        active
          ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/20 scale-[1.02]'
          : dark
            ? 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.08]'
            : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50'
      }`}
    >
      {active && (
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-blue-500 grid place-items-center">
          <Check size={11} strokeWidth={3} className="text-white" />
        </span>
      )}
      <span className={active ? 'text-blue-400' : dark ? 'text-white/70' : 'text-gray-600'}>
        {icon}
      </span>
      <div>
        <p className={`text-[15px] font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>{label}</p>
        <p className={`mt-1 text-[12px] leading-relaxed ${dark ? 'text-white/50' : 'text-gray-500'}`}>{desc}</p>
      </div>
    </button>
  );
}

// ===== Step 3: Wallpaper =====
function WallpaperPick({ wallpaper, setWallpaper, picks, dark }) {
  return (
    <div>
      <Header
        title="Pick a wallpaper"
        sub="Your desktop will look like this. Browse the full library later in Settings."
        dark={dark}
      />
      <div className="mt-8 grid grid-cols-4 gap-3 max-w-2xl mx-auto">
        {picks.map((id) => {
          const wp = WALLPAPERS[id];
          if (!wp) return null;
          const isActive = wallpaper === id;
          return (
            <button
              key={id}
              onClick={() => setWallpaper(id)}
              className={`group relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all ${
                isActive ? 'border-blue-500 ring-2 ring-blue-500/25 scale-[1.02]' : 'border-gray-300 hover:border-gray-400 dark:border-white/15 dark:hover:border-white/40'
              }`}
              title={wp.label}
            >
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${wp.url}&w=400&q=60)` }}
              />
              <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
              {isActive && (
                <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-blue-500 grid place-items-center text-white">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
              <span className="absolute bottom-1.5 left-2 right-2 text-[10.5px] font-bold tracking-tight text-white drop-shadow-md text-left">
                {wp.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===== Step 4a: Tour (school path) =====
function Tour({ onSkip, onTour, dark }) {
  return (
    <div className="text-center">
      <div className="mb-5 inline-grid place-items-center w-16 h-16 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
        <Check size={28} strokeWidth={2.4} className="text-emerald-500" />
      </div>
      <Header
        title="You&rsquo;re all set"
        sub="Want a quick tour of the desktop? It points at the dock + curriculum flow - about 60 seconds. You can replay anytime in Settings."
        dark={dark}
      />
      <div className="mt-8 flex items-center justify-center gap-2.5">
        <button
          onClick={onSkip}
          className="px-5 py-2.5 rounded-lg border border-blue-500 text-blue-400 text-[13.5px] font-semibold transition-colors hover:bg-blue-500/10 active:scale-[0.98]"
        >
          Skip
        </button>
        <button
          onClick={onTour}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-400 active:scale-[0.98] text-white text-[13.5px] font-semibold transition-colors"
        >
          Show me around <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ===== Step 4b: QB ready (quiz bowl path) =====
// No demo — just a launch pad. The GuidedTour walks them through the real app.
function QBReady({ onGo, dark }) {
  return (
    <div className="text-center">
      <Header
        title="Ready to play?"
        sub="We'll open Quiz Bowl and walk you through your first game against AI bots — pick a category, enter the lobby, and buzz."
        dark={dark}
      />
      <div className="mt-8 flex justify-center">
        <button
          onClick={onGo}
          className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 active:scale-[0.98] text-white text-[14px] font-semibold transition-all shadow-lg shadow-blue-500/20"
        >
          Let&apos;s go <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ===== shared header =====
function Header({ title, sub, dark }) {
  return (
    <div className="text-center max-w-xl mx-auto">
      <h2 className={`text-[34px] sm:text-[40px] leading-[1.05] font-bold tracking-[-0.025em] ${dark ? 'text-white' : 'text-gray-900'}`}>
        {title}
      </h2>
      {sub && (
        <p className={`mt-3 text-[14.5px] leading-relaxed ${dark ? 'text-white/65' : 'text-gray-600'}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ===== background palettes per step =====
const STEP_BG_DARK = {
  welcome:    'radial-gradient(at 25% 20%, #1e3a8a 0%, transparent 50%),' +
              'radial-gradient(at 75% 80%, #312e81 0%, transparent 50%),' +
              'linear-gradient(135deg, #050714 0%, #0a0f24 50%, #0d0f1f 100%)',
  purpose:    'radial-gradient(at 30% 25%, #4c1d95 0%, transparent 55%),' +
              'radial-gradient(at 70% 75%, #1e3a8a 0%, transparent 55%),' +
              'linear-gradient(135deg, #060412 0%, #0e0a24 50%, #080d1e 100%)',
  wallpaper:  'radial-gradient(at 20% 30%, #0e7490 0%, transparent 55%),' +
              'radial-gradient(at 80% 75%, #1e3a8a 0%, transparent 55%),' +
              'linear-gradient(135deg, #04081a 0%, #061227 50%, #0a0f1f 100%)',
  tour:       'radial-gradient(at 25% 30%, #047857 0%, transparent 55%),' +
              'radial-gradient(at 75% 75%, #1e40af 0%, transparent 55%),' +
              'linear-gradient(135deg, #051613 0%, #08182a 50%, #0a0e1f 100%)',
  'qb-ready': 'radial-gradient(at 25% 20%, #1e3a8a 0%, transparent 50%),' +
              'radial-gradient(at 75% 80%, #312e81 0%, transparent 50%),' +
              'linear-gradient(135deg, #050714 0%, #0a0f24 50%, #0d0f1f 100%)',
};
const STEP_BG_LIGHT = {
  welcome:    'radial-gradient(at 25% 20%, #dbeafe 0%, transparent 50%),' +
              'radial-gradient(at 75% 80%, #ede9fe 0%, transparent 50%),' +
              'linear-gradient(135deg, #f8fafc 0%, #f1f5ff 50%, #f5f3ff 100%)',
  purpose:    'radial-gradient(at 30% 25%, #ede9fe 0%, transparent 55%),' +
              'radial-gradient(at 70% 75%, #dbeafe 0%, transparent 55%),' +
              'linear-gradient(135deg, #f8f8ff 0%, #f3f0ff 50%, #eef2ff 100%)',
  wallpaper:  'radial-gradient(at 20% 30%, #cffafe 0%, transparent 55%),' +
              'radial-gradient(at 80% 75%, #c7d2fe 0%, transparent 55%),' +
              'linear-gradient(135deg, #f8fafc 0%, #ecfeff 50%, #eef2ff 100%)',
  tour:       'radial-gradient(at 25% 30%, #d1fae5 0%, transparent 55%),' +
              'radial-gradient(at 75% 75%, #c7d2fe 0%, transparent 55%),' +
              'linear-gradient(135deg, #f8fafc 0%, #ecfdf5 50%, #eef2ff 100%)',
  'qb-ready': 'radial-gradient(at 25% 20%, #dbeafe 0%, transparent 50%),' +
              'radial-gradient(at 75% 80%, #ede9fe 0%, transparent 50%),' +
              'linear-gradient(135deg, #f8fafc 0%, #f1f5ff 50%, #f5f3ff 100%)',
};
