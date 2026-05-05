import { useState } from 'react';
import { ChevronRight, ChevronLeft, Moon, Sun, Sparkles, Check, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import { syncData } from '../../api/auth';
import { WALLPAPERS } from './DesktopBackground';

// macOS Setup-Assistant-style onboarding. Four steps with full-screen
// transitions, Apple-flavored typography, and a back / continue chrome
// at the bottom.
//
//   1. Welcome   — big "Hello" + brand mark, sets the tone.
//   2. Appearance — Light / Dark theme picker with live previews.
//   3. Wallpaper — pick a desktop background (uses the same WALLPAPERS
//      catalog the desktop shell renders from, so what you pick here
//      is what you'll see when the desktop loads).
//   4. Tour      — offer the guided tour; skip lands directly in the
//      desktop, accept queues the GuidedTour to start on first paint.
const STEPS = ['welcome', 'appearance', 'wallpaper', 'tour'];

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const { user, fetchUser } = useAuth();
  const { theme, setTheme, wallpaper, setWallpaper } = useUIPreference();
  const dark = theme === 'dark';

  // Wallpaper picks for the onboarding grid — subset of the full
  // catalog so the choice doesn't feel overwhelming. Includes the
  // canonical default (lavender) at the top.
  const PICKS = ['lavender', 'forest', 'aurora', 'ocean', 'galaxy', 'milkyway', 'cosmos', 'nebula'];

  function next() { setStep((s) => Math.min(STEPS.length - 1, s + 1)); }
  function back() { setStep((s) => Math.max(0, s - 1)); }

  // Mark onboarded on the server (no localStorage). Tour-step also
  // moves into preferences — the GuidedTour component reads it.
  async function finish(takeTour) {
    try {
      const next = {
        ...(user?.data?.preferences || {}),
        onboarded: true,
        tourStep: takeTour ? 0 : null,
      };
      await syncData({ preferences: next });
      await fetchUser();
    } catch (err) {
      console.error('Failed to save onboarding state:', err);
    }
    onComplete();
  }

  const firstName = (user?.name || user?.email || 'there').split(/[\s@]/)[0];

  // Background gradient — slow color shift between steps so each panel
  // feels like its own "scene" without being jarring.
  const bg = dark
    ? STEP_BG_DARK[STEPS[step]] || STEP_BG_DARK.welcome
    : STEP_BG_LIGHT[STEPS[step]] || STEP_BG_LIGHT.welcome;

  return (
    <div
      className="fixed inset-0 z-[3000] flex flex-col transition-[background] duration-700 ease-out"
      style={{ background: bg }}
    >
      <ProgressDots count={STEPS.length} active={step} dark={dark} />

      <main className="flex-1 min-h-0 flex items-center justify-center px-6">
        <div className="w-full max-w-xl">
          {STEPS[step] === 'welcome' && (
            <Welcome name={firstName} dark={dark} />
          )}
          {STEPS[step] === 'appearance' && (
            <Appearance theme={theme} setTheme={setTheme} dark={dark} />
          )}
          {STEPS[step] === 'wallpaper' && (
            <WallpaperPick wallpaper={wallpaper} setWallpaper={setWallpaper} picks={PICKS} dark={dark} />
          )}
          {STEPS[step] === 'tour' && (
            <Tour onSkip={() => finish(false)} onTour={() => finish(true)} dark={dark} />
          )}
        </div>
      </main>

      {/* Bottom chrome — Back / Continue */}
      <div className="flex items-center justify-between px-8 py-6">
        {step > 0 ? (
          <button
            onClick={back}
            className={`inline-flex items-center gap-1 px-4 py-2 rounded-full text-[13px] font-medium ${
              dark ? 'text-white/70 hover:bg-white/[0.08]' : 'text-gray-600 hover:bg-black/[0.04]'
            } transition-colors`}
          >
            <ChevronLeft size={14} /> Back
          </button>
        ) : <span />}

        {STEPS[step] !== 'tour' && (
          <button
            onClick={next}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 hover:brightness-110 active:scale-[0.98] text-white text-[13.5px] font-bold transition-all"
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
//
// Animated "Hello" — fades + slides up, then the RushilAI brand
// settles in below it. Apple's setup assistant uses calligraphic
// "Hello" handwriting; we use Inter italics with a subtle gradient
// (no custom fonts to load).
function Welcome({ name, dark }) {
  return (
    <div className="text-center select-none">
      <div className="mb-6 flex justify-center">
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 grid place-items-center shadow-2xl shadow-blue-500/30 animate-fade-up">
          <Sparkles size={38} className="text-white drop-shadow-lg" strokeWidth={2.2} />
          <span className="pointer-events-none absolute inset-1 rounded-3xl bg-gradient-to-b from-white/25 to-transparent" />
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

// ===== Step 2: Appearance =====
function Appearance({ theme, setTheme, dark }) {
  return (
    <div>
      <Header
        title="Choose your look"
        sub="Light is crisp, dark is calm. You can change this any time in Settings."
        dark={dark}
      />
      <div className="mt-8 grid grid-cols-2 gap-4 max-w-md mx-auto">
        <ThemeCard
          active={theme === 'light'}
          onClick={() => setTheme('light')}
          label="Light"
          icon={<Sun size={20} className="text-amber-500" strokeWidth={2.2} />}
          preview={
            <div className="w-full aspect-[4/3] rounded-xl bg-[#f0f4ff] border border-gray-200 grid place-items-center">
              <div className="w-2/3 h-2 rounded-full bg-gray-300" />
            </div>
          }
        />
        <ThemeCard
          active={theme === 'dark'}
          onClick={() => setTheme('dark')}
          label="Dark"
          icon={<Moon size={20} className="text-blue-400" strokeWidth={2.2} />}
          preview={
            <div className="w-full aspect-[4/3] rounded-xl bg-[#0D0D14] border border-white/10 grid place-items-center">
              <div className="w-2/3 h-2 rounded-full bg-white/15" />
            </div>
          }
        />
      </div>
    </div>
  );
}

function ThemeCard({ active, onClick, label, icon, preview }) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-2xl p-3 border-2 transition-all text-left ${
        active
          ? 'border-blue-500 bg-blue-500/10 ring-4 ring-blue-500/15'
          : 'border-white/15 dark:border-white/15 bg-white/[0.04] hover:bg-white/[0.08]'
      }`}
    >
      {preview}
      <div className="mt-3 flex items-center gap-2">
        {icon}
        <span className="text-[14px] font-semibold text-gray-900 dark:text-white">{label}</span>
        {active && (
          <span className="ml-auto w-5 h-5 rounded-full bg-blue-500 grid place-items-center text-white">
            <Check size={11} strokeWidth={3} />
          </span>
        )}
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
              className={`group relative aspect-[4/3] rounded-xl overflow-hidden border-2 transition-all ${
                isActive ? 'border-blue-500 ring-4 ring-blue-500/15 scale-[1.02]' : 'border-white/15 dark:border-white/15 hover:border-white/40'
              }`}
              title={wp.label}
            >
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${wp.url}&w=400&q=60)` }}
              />
              <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
              {isActive && (
                <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-blue-500 grid place-items-center text-white shadow-lg">
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

// ===== Step 4: Tour =====
function Tour({ onSkip, onTour, dark }) {
  return (
    <div className="text-center">
      <div className="mb-5 inline-grid place-items-center w-16 h-16 rounded-3xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
        <Check size={28} strokeWidth={2.4} className="text-emerald-500" />
      </div>
      <Header
        title="You&rsquo;re all set"
        sub="Want a quick tour of the desktop? It points at the dock + curriculum flow — about 60 seconds. You can replay anytime in Settings."
        dark={dark}
      />
      <div className="mt-8 flex items-center justify-center gap-2.5">
        <button
          onClick={onSkip}
          className={`px-5 py-2.5 rounded-full border text-[13.5px] font-semibold transition-colors ${
            dark
              ? 'border-white/15 text-white/80 hover:bg-white/[0.08]'
              : 'border-gray-300 text-gray-700 hover:bg-black/[0.04]'
          }`}
        >
          Skip
        </button>
        <button
          onClick={onTour}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 hover:brightness-110 active:scale-[0.98] text-white text-[13.5px] font-bold transition-all"
        >
          Show me around <ArrowRight size={14} />
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
  appearance: 'radial-gradient(at 30% 25%, #1e40af 0%, transparent 55%),' +
              'radial-gradient(at 70% 80%, #6d28d9 0%, transparent 55%),' +
              'linear-gradient(135deg, #060a1c 0%, #0d1130 50%, #100822 100%)',
  wallpaper:  'radial-gradient(at 20% 30%, #0e7490 0%, transparent 55%),' +
              'radial-gradient(at 80% 75%, #1e3a8a 0%, transparent 55%),' +
              'linear-gradient(135deg, #04081a 0%, #061227 50%, #0a0f1f 100%)',
  tour:       'radial-gradient(at 25% 30%, #047857 0%, transparent 55%),' +
              'radial-gradient(at 75% 75%, #1e40af 0%, transparent 55%),' +
              'linear-gradient(135deg, #051613 0%, #08182a 50%, #0a0e1f 100%)',
};
const STEP_BG_LIGHT = {
  welcome:    'radial-gradient(at 25% 20%, #dbeafe 0%, transparent 50%),' +
              'radial-gradient(at 75% 80%, #ede9fe 0%, transparent 50%),' +
              'linear-gradient(135deg, #f8fafc 0%, #f1f5ff 50%, #f5f3ff 100%)',
  appearance: 'radial-gradient(at 30% 25%, #c7d2fe 0%, transparent 55%),' +
              'radial-gradient(at 70% 80%, #ddd6fe 0%, transparent 55%),' +
              'linear-gradient(135deg, #f8fafc 0%, #eef2ff 50%, #f5f3ff 100%)',
  wallpaper:  'radial-gradient(at 20% 30%, #cffafe 0%, transparent 55%),' +
              'radial-gradient(at 80% 75%, #c7d2fe 0%, transparent 55%),' +
              'linear-gradient(135deg, #f8fafc 0%, #ecfeff 50%, #eef2ff 100%)',
  tour:       'radial-gradient(at 25% 30%, #d1fae5 0%, transparent 55%),' +
              'radial-gradient(at 75% 75%, #c7d2fe 0%, transparent 55%),' +
              'linear-gradient(135deg, #f8fafc 0%, #ecfdf5 50%, #eef2ff 100%)',
};
