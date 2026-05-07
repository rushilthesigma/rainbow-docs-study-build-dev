import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUIPreference } from '../context/UIPreferenceContext';
import { googleLogin } from '../api/auth';
import { WALLPAPERS } from '../components/desktop/DesktopBackground';
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
  const { wallpaper } = useUIPreference();
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

  function newAccount() {
    if (window.google?.accounts?.id) {
      try { window.google.accounts.id.disableAutoSelect(); } catch {}
    }
    triggerGoogle();
  }

  function scrollTo(idx) {
    const el = scrollerRef.current;
    if (!el) return;
    const target = el.querySelectorAll('[data-section]')[idx];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const wp = WALLPAPERS[wallpaper] || WALLPAPERS.lavender;
  const wallpaperUrl = wp?.url || WALLPAPERS.lavender.url;

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

      <Clock />

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
          onNewAccount={newAccount}
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
      <div className="absolute inset-0 bg-black/40" />

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
          className="mt-10 inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-white text-gray-900 text-[14.5px] font-bold hover:bg-white/95 active:scale-[0.98] transition-all shadow-2xl shadow-black/30"
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
      <div className="absolute inset-0 bg-black/55" />
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
                className="rounded-2xl p-6 border border-white/15 bg-white/[0.06] backdrop-blur-xl shadow-2xl shadow-black/30"
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
      <div className="absolute inset-0 bg-black/60" />
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
      className={`relative rounded-2xl p-4 sm:p-5 border border-white/15 bg-white/[0.05] backdrop-blur-xl shadow-2xl shadow-black/30 overflow-hidden flex flex-col ${className}`}
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
      <div className="absolute inset-0 bg-black/65" />
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
            <div key={s.label} className="rounded-2xl p-5 border border-white/15 bg-white/[0.06] backdrop-blur-xl text-center">
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
      <div className="absolute inset-0 bg-black/60" />
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
              className="relative rounded-2xl p-5 border border-white/15 bg-white/[0.06] backdrop-blur-xl shadow-2xl shadow-black/30 overflow-hidden flex flex-col"
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
function SignInSection({ loading, onSignIn, onNewAccount, onWhyNotGpt }) {
  return (
    <section
      data-section="signin"
      className="snap-start h-screen w-full flex flex-col items-center justify-center px-6 relative"
    >
      <div className="absolute inset-0 bg-black/45" />

      <div className="relative z-10 flex flex-col items-center text-center animate-fade-up">
        {/* RushilAI brand mark */}
        <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 grid place-items-center ring-2 ring-white/30 shadow-2xl shadow-black/50">
          <Sparkles size={36} className="text-white drop-shadow-lg" strokeWidth={2.2} />
          <span className="pointer-events-none absolute inset-1 rounded-2xl bg-gradient-to-b from-white/25 to-transparent" />
        </div>

        <p className="mt-3 text-[18px] font-bold tracking-tight text-white drop-shadow-md">
          Welcome to RushilAI
        </p>
        <p className="text-[13px] text-white/75 mt-0.5 drop-shadow-md">Sign in to continue</p>

        {/* Primary sign-in CTA */}
        <button
          onClick={onSignIn}
          disabled={loading}
          className="group mt-6 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 hover:brightness-110 active:scale-[0.98] text-white text-[14.5px] font-bold transition-all disabled:opacity-50 shadow-xl shadow-blue-900/40 w-[280px] max-w-full"
        >
          {loading
            ? <><Loader size={15} className="animate-spin" /> Signing in…</>
            : <>Sign in with Google <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" /></>}
        </button>

        <button
          onClick={onNewAccount}
          className="mt-4 text-[13px] font-medium text-white/75 hover:text-white transition-colors"
        >
          I&apos;m a new user
        </button>
      </div>

      {/* "Why not GPT?" link pinned to the bottom of the sign-in section */}
      <button
        onClick={onWhyNotGpt}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-[12.5px] font-medium text-white/70 hover:text-white drop-shadow-md transition-colors inline-flex items-center gap-1.5"
      >
        <span className="opacity-70">·</span> Why not GPT?
      </button>
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
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-md animate-fade-in">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 -z-0"
      />
      <div className="relative my-12 mx-4 w-full max-w-3xl rounded-3xl bg-[#0c0e1c] border border-white/10 shadow-2xl shadow-black/50 overflow-hidden">
        {/* Header */}
        <div className="relative px-7 pt-7 pb-5 border-b border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center">
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-300">RushilAI vs ChatGPT</span>
          </div>
          <h2 className="text-[28px] sm:text-[32px] font-bold tracking-[-0.02em] text-white leading-tight">
            ChatGPT answers questions.
            <br />
            <span className="bg-gradient-to-br from-blue-400 to-indigo-400 bg-clip-text text-transparent">RushilAI actually teaches you.</span>
          </h2>
          <p className="mt-2 text-[13.5px] text-white/65 leading-relaxed max-w-xl">
            One&apos;s a chatbot. The other walks you through a real course. Here&apos;s what that looks like:
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-5 right-5 w-9 h-9 rounded-full grid place-items-center text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Comparison rows */}
        <div className="px-3 sm:px-5 py-4 space-y-1.5">
          <Row icon={<BookOpen size={15} />} title="It builds the course for you" us="Type a topic and get a real course back — units, lessons, quizzes, even a midterm and final. Takes a few seconds." them="Spits out a wall of text. You'd have to organize it into a course on your own." />
          <Row icon={<Repeat size={15} />}   title="It remembers what you missed" us="When you get something wrong on a quiz, it shows up again on the next one. The final quiz hits all your weak spots." them="Forgets everything the second the chat ends." />
          <Row icon={<Brain size={15} />}    title="It picks up where you left off" us="Your courses, lessons, streaks — all saved. Open it next week and just keep going." them="Every chat starts from scratch. You're the one keeping track of where you are." />
          <Row icon={<PenTool size={15} />}  title="It grades your math, not just your answer" us="Solve on a real canvas. We read your work line by line and tell you where you slipped." them="Just gives you the answer. If you got the wrong number, you won't know why." />
          <Row icon={<Zap size={15} />}      title="You can play your friends" us="Head-to-head Quiz Bowl with a real buzzer. Pyramidal tossups, real packets, real scoreboard." them="Can't do this. It's one person, one chat box." />
          <Row icon={<Cpu size={15} />}      title="Built for school" us="Made for studying first. We use whichever AI is best right now — Gemini, Claude, GPT, whoever." them="One model, one chat box. That's the whole app." />
        </div>

        {/* Footer */}
        <div className="px-7 py-5 border-t border-white/10 flex items-center justify-end">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 hover:brightness-110 active:scale-[0.98] text-white text-[13px] font-bold transition-all"
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
    <div className="rounded-2xl px-4 py-3 hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-300 grid place-items-center">
          {icon}
        </span>
        <span className="text-[14px] font-bold tracking-tight text-white">{title}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-9">
        <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
          <Check size={13} className="text-emerald-400 mt-0.5 shrink-0" strokeWidth={3} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/85 mb-0.5">RushilAI</p>
            <p className="text-[12.5px] leading-relaxed text-white/85">{us}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-rose-500/[0.07] border border-rose-500/15 px-3 py-2">
          <X size={13} className="text-rose-400 mt-0.5 shrink-0" strokeWidth={3} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-300/85 mb-0.5">ChatGPT</p>
            <p className="text-[12.5px] leading-relaxed text-white/65">{them}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Clock =====
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <div className="absolute top-3 right-5 z-30 flex items-center gap-3 text-[12.5px] font-medium text-white/90 tabular-nums tracking-tight drop-shadow-md">
      <span>{date}</span>
      <span>{time}</span>
    </div>
  );
}
