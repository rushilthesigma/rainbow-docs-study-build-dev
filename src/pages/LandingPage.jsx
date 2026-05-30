import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { googleLogin } from '../api/auth';
import { WALLPAPERS } from '../components/desktop/DesktopBackground';
import { Z } from '../styles/tokens';
import {
  Loader2 as Loader, Sparkles, ArrowRight, X, Check, ChevronDown,
  BookOpen, Brain, Zap, PenTool, Cpu, Repeat,
  Lightbulb, Calculator, MessageSquare, Target, ClipboardCheck,
} from 'lucide-react';

// Two scroll-snap sections, Apple-homepage style:
//   1. Hero    — big headline over the wallpaper, scroll cue
//   2. Sign-in — macOS-style lock screen with "Why not GPT?" link
//
// The "Why not GPT?" link opens a full-screen modal with the
// RushilAI vs ChatGPT comparison rather than living as its own
// section in the scroll flow.
//
// The wallpaper stays fixed under everything (parallax effect — the
// content sections slide up over it). CSS scroll-snap on the
// container makes each section come to rest at the top of the
// viewport when the user scrolls.
export default function LandingPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const googleBtnRef = useRef(null);
  const scrollerRef = useRef(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
          callback: handleGoogleResponse,
        });
        if (googleBtnRef.current) {
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'filled_blue',
            size: 'large',
            width: 300,
          });
        }
      }
    };
    document.body.appendChild(script);
    return () => { try { document.body.removeChild(script); } catch {} };
  }, []);

  async function handleGoogleResponse(response) {
    setLoading(true);
    try {
      const data = await googleLogin(response.credential);
      if (data.success) {
        login(data.user, data.token);
        navigate('/dashboard');
      }
    } catch (err) { console.error('Login failed:', err); }
    setLoading(false);
  }

  function triggerGoogle() {
    const btn = googleBtnRef.current?.querySelector('div[role=button], button');
    if (btn) btn.click();
    else if (window.google?.accounts?.id) window.google.accounts.id.prompt();
  }

  function scrollTo(idx) {
    const el = scrollerRef.current;
    if (!el) return;
    const target = el.querySelectorAll('[data-section]')[idx];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Pre-auth welcome screen is locked to a nighttime sky — the user's
  // chosen wallpaper preference only kicks in once they're signed in.
  // Keeps the welcome handshake aesthetically aligned with the
  // Onboarding "Welcome" step's deep-blue gradient backdrop.
  const wallpaperUrl = WALLPAPERS.milkyway?.url || WALLPAPERS.earthnight?.url || WALLPAPERS.aurora?.url;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black text-white select-none">
      {/* Fixed wallpaper layer — parallax bedrock for every section */}
      <div className="absolute inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-110"
          style={{ backgroundImage: `url(${wallpaperUrl})` }}
        />
        {/* Always a soft top gradient so the menu bar reads */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 to-transparent" />
      </div>

      <MenuBar />

      {/* Scroll container. Snap-mandatory between sections, smooth.
          Order: hero, how it works, features grid, numbers strip,
          subject spotlight, sign-in. Wallpaper stays fixed under
          everything. */}
      <div
        ref={scrollerRef}
        className="relative z-10 h-screen overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        style={{ scrollBehavior: 'smooth' }}
      >
        <HeroSection onNext={() => scrollTo(1)} />
        <HowItWorksSection />
        <FeaturesGridSection />
        <NumbersStrip />
        <SubjectsSpotlight />
        <SignInSection
          loading={loading}
          onSignIn={triggerGoogle}
          onWhyNotGpt={() => setWhyOpen(true)}
        />
      </div>

      {/* Why not GPT? modal — full-screen overlay over the snap flow */}
      {whyOpen && <WhyNotGptModal onClose={() => setWhyOpen(false)} />}

      {/* Hidden GIS button — mounted off-screen so the script + button
          are present in the DOM. All sign-in CTAs click this. */}
      <div
        ref={googleBtnRef}
        aria-hidden="true"
        style={{ position: 'absolute', left: -99999, top: 0, width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none' }}
      />
    </div>
  );
}

// ===== Section 1: Hero =====
function HeroSection({ onNext }) {
  return (
    <section
      data-section="hero"
      className="snap-start h-screen w-full flex flex-col items-center justify-center px-6 relative"
    >
      {/* Subtle scrim so the headline reads against any wallpaper */}
      <div className="absolute inset-0 bg-black/35" />

      <div className="relative z-10 max-w-4xl text-center animate-fade-up">
        <h1 className="text-[44px] sm:text-[68px] md:text-[88px] leading-[0.95] font-bold tracking-[-0.04em] text-white drop-shadow-2xl">
          Type a topic.
          <br />
          <span className="bg-gradient-to-br from-blue-300 via-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">
            Get a curriculum.
          </span>
        </h1>
        <p className="mt-6 text-[16px] sm:text-[19px] leading-relaxed text-white/85 max-w-2xl mx-auto drop-shadow-md">
          Make a fully featured curriculum in a single click (well, maybe a few).
        </p>

        <button
          onClick={onNext}
          className="mt-10 inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-b from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 active:scale-[0.98] text-white text-[14.5px] font-semibold tracking-[-0.005em] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.20),0_8px_24px_rgba(99,102,241,0.45)] border border-blue-400/55"
        >
          Get started <ChevronDown size={15} />
        </button>
      </div>

      {/* Scroll cue at the bottom */}
      <button
        onClick={onNext}
        aria-label="Scroll down"
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 text-white/65 hover:text-white transition-colors"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.22em]">Scroll</span>
        <ChevronDown size={16} className="animate-bounce-slow" strokeWidth={2.4} />
      </button>
    </section>
  );
}

// ===== Section 2: How it works =====
//
// Three numbered glass cards explaining the type-quiz-train loop.
// All copy intentionally avoids em dashes per user spec.
function HowItWorksSection() {
  const STEPS = [
    {
      n: '01',
      icon: Sparkles,
      title: 'Type a topic',
      body: 'Calculus BC, AP Bio, Roman history, anything. The engine drafts a real syllabus with units, lessons, a midterm, and a final.',
    },
    {
      n: '02',
      icon: ClipboardCheck,
      title: 'Take quizzes',
      body: 'Every lesson ends in a short quiz. Wrong answers get logged by topic so the engine learns where you actually need work.',
    },
    {
      n: '03',
      icon: Target,
      title: 'Train your gaps',
      body: 'Final quizzes are built from your weak spots, not a generic pool. Quiz Bowl can also generate a "train on weaknesses" round on demand.',
    },
  ];
  return (
    <section data-section="how" className="snap-start h-screen w-full flex flex-col items-center justify-center px-6 relative">
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative z-10 max-w-6xl w-full animate-fade-up">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-white/55 mb-3">How it works</p>
        <h2 className="text-center text-[34px] sm:text-[44px] md:text-[56px] leading-[1.05] font-bold tracking-[-0.025em] text-white drop-shadow-2xl mb-12">
          Three steps,{' '}
          <span className="bg-gradient-to-br from-blue-300 via-indigo-300 to-fuchsia-300 bg-clip-text text-transparent italic">
            no busywork.
          </span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.n}
                className="rounded-lg p-6 ring-1 ring-white/[0.10] bg-white/[0.05] backdrop-blur-[20px] backdrop-saturate-150 shadow-[0_8px_24px_rgba(0,0,0,0.30)]"
              >
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[11px] font-mono font-bold tracking-wider text-white/45">{s.n}</span>
                  <span className="grid place-items-center w-9 h-9 rounded-full bg-white/15 border border-white/20">
                    <Icon size={16} className="text-white" strokeWidth={2} />
                  </span>
                </div>
                <h3 className="text-[19px] font-bold tracking-tight text-white mb-2">{s.title}</h3>
                <p className="text-[13.5px] text-white/70 leading-relaxed">{s.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ===== Section 3: Features bento =====
function FeaturesGridSection() {
  return (
    <section data-section="features" className="snap-start h-screen w-full flex flex-col items-center justify-center px-6 relative">
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative z-10 max-w-6xl w-full animate-fade-up">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-white/55 mb-3">What&apos;s inside</p>
        <h2 className="text-center text-[34px] sm:text-[44px] md:text-[56px] leading-[1.05] font-bold tracking-[-0.025em] text-white drop-shadow-2xl mb-10">
          One app,{' '}
          <span className="bg-gradient-to-br from-blue-300 via-indigo-300 to-fuchsia-300 bg-clip-text text-transparent italic">
            every learning surface.
          </span>
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 grid-rows-3 md:grid-rows-2 gap-3 h-[440px]">
          <FeatureTile
            className="col-span-2 row-span-2 md:col-span-2 md:row-span-2"
            icon={BookOpen}
            tone="from-blue-500/30 to-indigo-500/15"
            title="Curricula"
            body="Type a topic, get a real course. Units, lessons, a midterm, and a final. All generated, all editable."
            big
          />
          <FeatureTile
            className="col-span-2 md:col-span-1"
            icon={Lightbulb}
            tone="from-amber-400/30 to-orange-500/15"
            title="Lessons"
            body="Eight-block format with built-in spaced-repetition quizzes."
          />
          <FeatureTile
            className="col-span-2 md:col-span-1"
            icon={Calculator}
            tone="from-indigo-400/30 to-violet-500/15"
            title="Math Tutor"
            body="Solve on a real canvas. The tutor reads each line."
          />
          <FeatureTile
            className="col-span-1"
            icon={Zap}
            tone="from-amber-400/30 to-rose-500/15"
            title="Quiz Bowl"
            body="Pyramidal tossups, real packets, head-to-head."
          />
          <FeatureTile
            className="col-span-1"
            icon={MessageSquare}
            tone="from-sky-400/30 to-blue-500/15"
            title="Study Mode"
            body="Free-form chat with optional curriculum and sources."
          />
        </div>
      </div>
    </section>
  );
}

function FeatureTile({ icon: Icon, title, body, tone, className = '', big = false }) {
  return (
    <div
      className={`relative rounded-lg p-4 sm:p-5 ring-1 ring-white/[0.10] bg-white/[0.05] backdrop-blur-[20px] backdrop-saturate-150 shadow-[0_8px_24px_rgba(0,0,0,0.30)] overflow-hidden flex flex-col ${className}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${tone} pointer-events-none`} />
      <div className="relative z-10 flex flex-col h-full">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-white/15 border border-white/20 mb-3">
          <Icon size={16} className="text-white" strokeWidth={2} />
        </span>
        <h3 className={`font-bold tracking-tight text-white ${big ? 'text-[26px] sm:text-[30px]' : 'text-[16px]'}`}>
          {title}
        </h3>
        <p className={`text-white/70 leading-relaxed mt-1 ${big ? 'text-[14px]' : 'text-[12px]'}`}>
          {body}
        </p>
      </div>
    </div>
  );
}

// ===== Section 4: Numbers strip =====
function NumbersStrip() {
  const STATS = [
    { n: '8',    label: 'apps in one workspace' },
    { n: '<5s',  label: 'to draft a full curriculum' },
    { n: '500+', label: 'tossups in the Quiz Bowl pool' },
    { n: '1M',   label: 'token context per chat' },
  ];
  return (
    <section data-section="numbers" className="snap-start h-screen w-full flex flex-col items-center justify-center px-6 relative">
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative z-10 max-w-5xl w-full animate-fade-up">
        <h2 className="text-center text-[28px] sm:text-[36px] md:text-[44px] leading-[1.05] font-bold tracking-[-0.025em] text-white drop-shadow-2xl mb-3">
          Built thin,{' '}
          <span className="italic bg-gradient-to-br from-blue-300 to-indigo-300 bg-clip-text text-transparent">
            runs heavy.
          </span>
        </h2>
        <p className="text-center text-[13px] sm:text-[15px] text-white/65 max-w-xl mx-auto mb-10">
          One workspace, every learning surface, the smartest model under the hood.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-lg p-5 ring-1 ring-white/[0.10] bg-white/[0.05] backdrop-blur-[20px] backdrop-saturate-150 text-center">
              <div className="text-[34px] sm:text-[40px] font-bold tracking-tight text-white tabular-nums leading-none">
                {s.n}
              </div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/55 mt-2">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== Section 5: Subjects spotlight =====
//
// Four sample-curriculum cards showing what RushilAI generates. Each
// one is a mini-syllabus preview with unit/lesson counts and the
// first four unit titles.
function SubjectsSpotlight() {
  const SAMPLES = [
    {
      title: 'AP Calculus BC',
      tag: 'High school',
      tone: 'from-blue-500/30 to-indigo-500/15',
      units: 8,
      lessons: 64,
      preview: ['Limits & continuity', 'Derivatives & applications', 'Integrals & FTC', 'Series & convergence'],
    },
    {
      title: 'Organic Chemistry',
      tag: 'College',
      tone: 'from-emerald-400/25 to-teal-500/15',
      units: 10,
      lessons: 72,
      preview: ['Hybridization & VSEPR', 'Stereochemistry', 'SN1 / SN2 mechanisms', 'Carbonyl chemistry'],
    },
    {
      title: 'Roman Republic',
      tag: 'Self-study',
      tone: 'from-amber-400/25 to-orange-500/15',
      units: 6,
      lessons: 38,
      preview: ['Founding myths & monarchy', 'Patrician vs plebeian', 'Punic Wars', 'Fall of the Republic'],
    },
    {
      title: 'MCAT Bio + Biochem',
      tag: 'Test prep',
      tone: 'from-rose-400/25 to-fuchsia-500/15',
      units: 9,
      lessons: 58,
      preview: ['Cellular respiration', 'Genetics & gene expression', 'Enzyme kinetics', 'Metabolism integration'],
    },
  ];
  return (
    <section data-section="subjects" className="snap-start h-screen w-full flex flex-col items-center justify-center px-6 relative">
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative z-10 w-full max-w-6xl animate-fade-up">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-white/55 mb-3">Built for</p>
        <h2 className="text-center text-[32px] sm:text-[40px] md:text-[50px] leading-[1.05] font-bold tracking-[-0.025em] text-white drop-shadow-2xl mb-10">
          Whatever you&apos;re{' '}
          <span className="italic bg-gradient-to-br from-blue-300 via-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">
            studying.
          </span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SAMPLES.map((s) => (
            <div
              key={s.title}
              // Soft inner ring instead of a hard 15%-white border —
              // the previous 1px white outline lit up against the
              // night-sky wallpaper and read as a hard, jarring edge.
              className="relative rounded-lg p-5 ring-1 ring-white/[0.10] bg-white/[0.05] backdrop-blur-[20px] backdrop-saturate-150 shadow-[0_8px_24px_rgba(0,0,0,0.30)] overflow-hidden flex flex-col"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${s.tone} pointer-events-none`} />
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-white/55">{s.tag}</span>
                  <BookOpen size={13} className="text-white/45" />
                </div>
                <h3 className="text-[17px] font-bold tracking-tight text-white leading-tight mb-3">{s.title}</h3>
                <div className="flex items-center gap-3 mb-3 text-[11px] text-white/65 tabular-nums">
                  <span><strong className="text-white">{s.units}</strong> units</span>
                  <span className="w-1 h-1 rounded-full bg-white/30" />
                  <span><strong className="text-white">{s.lessons}</strong> lessons</span>
                </div>
                <ul className="space-y-1 flex-1">
                  {s.preview.map((p, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-[11.5px] text-white/70">
                      <span className="text-[8px] font-mono text-white/40 tabular-nums w-3.5">{String(i + 1).padStart(2, '0')}</span>
                      <span className="truncate">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-[12px] text-white/50 mt-6">
          All four were generated in under 10 seconds each.
        </p>
      </div>
    </section>
  );
}

// ===== Section 6: Sign-in =====
//
// Google OAuth is the only sign-in path.
function SignInSection({ loading, onSignIn, onWhyNotGpt }) {
  return (
    <section
      data-section="signin"
      className="snap-start min-h-screen w-full flex flex-col items-center justify-center px-6 py-16 relative"
    >
      <div className="absolute inset-0 bg-black/35" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(at 25% 25%, rgba(30,58,138,0.25) 0%, transparent 60%),' +
            'radial-gradient(at 75% 75%, rgba(49,46,129,0.22) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm animate-fade-up">
        {/* Brand mark */}
        <div className="relative w-16 h-16 rounded-xl bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 grid place-items-center shadow-[0_10px_30px_rgba(99,102,241,0.45),inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-blue-400/40">
          <Sparkles size={30} className="text-white drop-shadow-lg" strokeWidth={2.2} />
        </div>

        <h1 className="mt-5 text-[32px] sm:text-[40px] leading-[1.05] font-semibold tracking-[-0.02em] text-white">
          Sign in
        </h1>
        <p className="mt-2 text-[14px] text-white/65">
          Continue with your Google account to start learning.
        </p>

        {/* Google OAuth — primary (and only) sign-in path */}
        <button
          onClick={onSignIn}
          disabled={loading}
          className="mt-8 w-full py-3 rounded-lg bg-white hover:bg-white/95 active:scale-[0.98] text-[14px] font-semibold text-slate-800 transition-all disabled:opacity-50 shadow-[0_4px_14px_rgba(0,0,0,0.25)] inline-flex items-center justify-center gap-2.5"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2"><Loader size={14} className="animate-spin" /> Working...</span>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.1 24.1 0 0 0 0 21.56l7.98-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

      </div>

      {/* Bottom links */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-5">
        <a
          href="https://discord.gg/E9YXNj4F"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-white/70 hover:text-white drop-shadow-md transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963a.074.074 0 0 0-.041-.104 13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028ZM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38Zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38Z" />
          </svg>
          Discord
        </a>
        <span className="text-white/25">·</span>
        <button
          onClick={onWhyNotGpt}
          className="text-[12.5px] font-medium text-white/70 hover:text-white drop-shadow-md transition-colors"
        >
          Why not GPT?
        </button>
      </div>
    </section>
  );
}

// ===== Why not GPT? modal =====
//
// Full-screen glass overlay containing the RushilAI vs ChatGPT
// comparison. Click the backdrop or X to close, Esc also closes,
// background scroll is locked while open.
function WhyNotGptModal({ onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 flex items-start justify-center overflow-y-auto bg-black/65 backdrop-blur-lg animate-fade-in" style={{ zIndex: Z.modal }}>
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 -z-0"
      />
      <div
        className="relative my-12 mx-4 w-full max-w-3xl rounded-2xl overflow-hidden border border-white/[0.10]"
        style={{
          background:
            'radial-gradient(at 0% 0%, rgba(59,130,246,0.12) 0%, transparent 50%),' +
            'radial-gradient(at 100% 100%, rgba(139,92,246,0.10) 0%, transparent 55%),' +
            '#0a0c16',
          boxShadow:
            '0 30px 60px -15px rgba(0,0,0,0.65),' +
            '0 0 0 0.5px rgba(255,255,255,0.05) inset,' +
            '0 1px 0 rgba(255,255,255,0.06) inset',
        }}
      >
        {/* macOS-style window titlebar — traffic lights left, centered title */}
        <div className="relative h-9 flex items-center px-4 border-b border-white/[0.07] bg-white/[0.025]">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onClose}
              aria-label="Close"
              className="group w-3 h-3 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.20)] grid place-items-center hover:brightness-110 transition-all"
            >
              <X size={7} strokeWidth={3} className="text-[#4d0000] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <span className="w-3 h-3 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.20)]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.20)]" />
          </div>
          <div className="absolute inset-x-0 text-center text-[12px] font-medium text-white/55 pointer-events-none">
            Why not GPT?
          </div>
        </div>

        {/* Header */}
        <div className="relative px-7 pt-7 pb-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 grid place-items-center shadow-[0_6px_18px_rgba(99,102,241,0.45),inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-blue-300/30">
              <Sparkles size={18} className="text-white drop-shadow" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-300">RushilAI vs ChatGPT</span>
          </div>
          <h2 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.02em] text-white leading-tight">
            ChatGPT answers questions.
            <br />
            <span className="bg-gradient-to-br from-blue-300 via-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">RushilAI actually teaches you.</span>
          </h2>
          <p className="mt-3 text-[13.5px] text-white/60 leading-relaxed max-w-xl">
            One&apos;s a chatbot. The other walks you through a real course. Here&apos;s what that looks like:
          </p>
        </div>

        {/* Comparison rows */}
        <div className="px-3 sm:px-5 py-4 space-y-1">
          <Row icon={<BookOpen size={15} />} title="It builds the course for you" us="Type a topic and get a real course back — units, lessons, quizzes, even a midterm and final. Takes a few seconds." them="Spits out a wall of text. You'd have to organize it into a course on your own." />
          <Row icon={<Repeat size={15} />}   title="It remembers what you missed" us="When you get something wrong on a quiz, it shows up again on the next one. The final quiz hits all your weak spots." them="Forgets everything the second the chat ends." />
          <Row icon={<Brain size={15} />}    title="It picks up where you left off" us="Your courses, lessons, streaks — all saved. Open it next week and just keep going." them="Every chat starts from scratch. You're the one keeping track of where you are." />
          <Row icon={<PenTool size={15} />}  title="It grades your math, not just your answer" us="Solve on a real canvas. We read your work line by line and tell you where you slipped." them="Just gives you the answer. If you got the wrong number, you won't know why." />
          <Row icon={<Zap size={15} />}      title="You can play your friends" us="Head-to-head Quiz Bowl with a real buzzer. Pyramidal tossups, real packets, real scoreboard." them="Can't do this. It's one person, one chat box." />
          <Row icon={<Cpu size={15} />}      title="Built for school" us="Made for studying first. We use whichever AI is best right now — Gemini, Claude, GPT, whoever." them="One model, one chat box. That's the whole app." />
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-white/[0.07] flex items-center justify-between bg-white/[0.015]">
          <span className="text-[11.5px] text-white/40">Press <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.10] text-white/70 font-mono text-[10.5px]">Esc</kbd> to close</span>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-b from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 active:scale-[0.98] text-white text-[13px] font-semibold tracking-[-0.005em] transition-all border border-blue-400/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.18),0_6px_18px_rgba(99,102,241,0.30)]"
          >
            Got it <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, title, us, them }) {
  return (
    <div className="rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.025]">
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-300 grid place-items-center ring-1 ring-blue-400/20">
          {icon}
        </span>
        <span className="text-[14px] font-semibold tracking-[-0.005em] text-white">{title}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-9">
        <div className="flex items-start gap-2 rounded-xl bg-emerald-500/[0.08] border border-emerald-400/[0.18] px-3 py-2">
          <Check size={13} className="text-emerald-400 mt-0.5 shrink-0" strokeWidth={3} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/85 mb-0.5">RushilAI</p>
            <p className="text-[12.5px] leading-relaxed text-white/85">{us}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-xl bg-white/[0.025] border border-white/[0.06] px-3 py-2">
          <X size={13} className="text-white/40 mt-0.5 shrink-0" strokeWidth={3} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40 mb-0.5">ChatGPT</p>
            <p className="text-[12.5px] leading-relaxed text-white/55">{them}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Menu bar =====
// Faux macOS menu bar pinned to the top — slim glass strip with the
// brand mark on the left and a live date / time on the right. Sets
// the macOS tone before the user has scrolled to anything.
function MenuBar() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <div
      className="fixed top-0 inset-x-0 z-40 h-7 flex items-center px-4 border-b border-white/[0.08]"
      style={{
        background: 'rgba(8, 10, 18, 0.55)',
        backdropFilter: 'blur(22px) saturate(180%)',
        WebkitBackdropFilter: 'blur(22px) saturate(180%)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-4 rounded-[5px] bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 grid place-items-center shadow-[0_2px_5px_rgba(99,102,241,0.45)] ring-1 ring-blue-300/30">
          <Sparkles size={9} className="text-white" strokeWidth={2.6} />
        </div>
        <span className="text-[12.5px] font-semibold tracking-[-0.005em] text-white/95">RushilAI</span>
      </div>
      <div className="ml-auto flex items-center gap-3 text-[12px] font-medium text-white/85 tabular-nums tracking-tight">
        <span>{date}</span>
        <span>{time}</span>
      </div>
    </div>
  );
}
