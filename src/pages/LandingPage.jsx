import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { googleLogin } from '../api/auth';
import { WALLPAPERS } from '../components/desktop/DesktopBackground';
import {
  Loader2 as Loader, Sparkles, X, Check, ChevronDown,
  BookOpen, Brain, Zap, PenTool, Cpu, Repeat,
  Lightbulb, Calculator, MessageSquare, Target, ClipboardCheck,
  Scale, Link2,
} from 'lucide-react';

// Two scroll-snap sections, Apple-homepage style:
//   1. Hero    - big headline over the wallpaper, scroll cue
//   2. Sign-in - macOS-style lock screen with "Why not GPT?" link
//
// The "Why not GPT?" link opens a full-screen modal with the
// RushilAI vs ChatGPT comparison rather than living as its own
// section in the scroll flow.
//
// The wallpaper stays fixed under everything (parallax effect - the
// content sections slide up over it). CSS scroll-snap on the
// container makes each section come to rest at the top of the
// viewport when the user scrolls.
export default function LandingPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
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
          // Required for Chrome 116+ FedCM on Chromebooks: allows prompt() to
          // trigger the browser-native account picker from a user-gesture handler
          // without needing an on-screen rendered button element.
          use_fedcm_for_prompt: true,
        });
        if (googleBtnRef.current) {
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'filled_blue',
            size: 'large',
            width: 300,
          });
        }
        setGoogleReady(true);
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
    if (!window.google?.accounts?.id) return;
    // Click the rendered button synchronously while still in the user-gesture
    // call stack. Safari / iOS and many mobile browsers block popups that are
    // opened from async callbacks, so the old approach (prompt() → fallback
    // btn.click() inside the notification callback) silently failed on those
    // devices. Clicking directly here is always in-gesture.
    const btn = googleBtnRef.current?.querySelector('div[role=button], button');
    if (btn) {
      btn.click();
      return;
    }
    // No rendered button available yet — use One Tap / FedCM prompt as fallback.
    window.google.accounts.id.prompt();
  }

  function scrollTo(idx) {
    const el = scrollerRef.current;
    if (!el) return;
    const target = el.querySelectorAll('[data-section]')[idx];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Pre-auth welcome screen is locked to a nighttime sky - the user's
  // chosen wallpaper preference only kicks in once they're signed in.
  // Keeps the welcome handshake aesthetically aligned with the
  // Onboarding "Welcome" step's deep-blue gradient backdrop.
  const wallpaperUrl = WALLPAPERS.milkyway?.url || WALLPAPERS.earthnight?.url || WALLPAPERS.aurora?.url;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black text-white select-none">
      {/* Fixed wallpaper layer - parallax bedrock for every section */}
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
        <NoteMapSection />
        <QuizBowlAISection />
        <SignInSection
          loading={loading}
          googleReady={googleReady}
          onSignIn={triggerGoogle}
          onWhyNotGpt={() => scrollTo(7)}
        />
        <WhyNotGptSection />
      </div>

      {/* Hidden GIS button - mounted off-screen so the script + button
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
        <h1 className="text-[44px] sm:text-[68px] md:text-[88px] leading-[0.95] font-bold tracking-[-0.04em] text-white">
          Type a topic.
          <br />
          <span className="text-blue-300">
            Get a curriculum.
          </span>
        </h1>
        <p className="mt-6 text-[16px] sm:text-[19px] leading-relaxed text-white/85 max-w-2xl mx-auto">
          Units, lessons, quizzes, a midterm, and a final, all built around whatever you want to learn.
        </p>

        <button
          onClick={onNext}
          className="mt-10 inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-blue-500 hover:bg-blue-400 active:scale-[0.98] text-white text-[14.5px] font-semibold tracking-[-0.005em] transition-colors"
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
      title: 'Builds the course',
      body: 'Name a topic like Calculus BC, AP Bio, or Roman history. You get back a real syllabus with units, lessons, a midterm, and a final.',
    },
    {
      n: '02',
      icon: ClipboardCheck,
      title: 'Writes the quizzes',
      body: 'Every lesson comes with a short quiz already written. Miss something and it gets logged by topic, so the next round knows where you need work.',
    },
    {
      n: '03',
      icon: Target,
      title: 'Targets your gaps',
      body: 'Finals pull from your weak spots instead of a generic pool, and Quiz Bowl can spin up a weakness round any time.',
    },
  ];
  return (
    <section data-section="how" className="snap-start h-screen w-full flex flex-col items-center justify-center px-6 relative">
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative z-10 max-w-6xl w-full animate-fade-up">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-white/55 mb-3">How it works</p>
        <h2 className="text-center text-[34px] sm:text-[44px] md:text-[56px] leading-[1.05] font-bold tracking-[-0.025em] text-white mb-12">
          One click,{' '}
          <span className="text-blue-300 italic">
            that&apos;s it.
          </span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.n}
                className="rounded-lg p-6 ring-1 ring-white/[0.10] bg-white/[0.05] backdrop-blur-md"
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
        <h2 className="text-center text-[34px] sm:text-[44px] md:text-[56px] leading-[1.05] font-bold tracking-[-0.025em] text-white mb-10">
          Everything{' '}
          <span className="text-blue-300 italic">
            in one place.
          </span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <FeatureTile
            icon={BookOpen}
            title="Curricula"
            body="Type any topic and get a full course with units, lessons, a midterm, and a final. Everything stays editable."
          />
          <FeatureTile
            icon={Lightbulb}
            title="Lessons"
            body="Each lesson walks through the material and ends with a short quiz. Whatever you miss comes back later."
          />
          <FeatureTile
            icon={MessageSquare}
            title="Study Mode"
            body="Chat through anything you're studying. Attach a curriculum or sources so the answers stay on topic."
          />
          <FeatureTile
            icon={Calculator}
            title="Math Tutor"
            body="Work through problems step by step on a canvas while the tutor checks your reasoning."
          />
          <FeatureTile
            icon={Zap}
            title="Quiz Bowl"
            body="Pyramidal tossups from a pool of 500+ questions. Practice solo or go head-to-head."
          />
          <FeatureTile
            icon={Scale}
            title="Debate"
            body="Pick a side against the AI or a friend, then get a scored verdict when you finish."
          />
        </div>
      </div>
    </section>
  );
}

function FeatureTile({ icon: Icon, title, body, tone, className = '', big = false }) {
  return (
    <div
      className={`relative rounded-lg p-4 sm:p-5 ring-1 ring-white/[0.10] bg-white/[0.05] backdrop-blur-md overflow-hidden flex flex-col ${className}`}
    >
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
    { n: '8',   label: 'apps in one workspace' },
    { n: '<5s', label: 'to draft a full curriculum' },
    { n: '500+', label: 'tossups in the Quiz Bowl pool' },
    { prefix: 'Up to', n: '1,048,576', label: 'tokens of context', highlight: true },
  ];
  return (
    <section data-section="numbers" className="snap-start h-screen w-full flex flex-col items-center justify-center px-6 relative">
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative z-10 max-w-5xl w-full animate-fade-up">
        <h2 className="text-center text-[28px] sm:text-[36px] md:text-[44px] leading-[1.05] font-bold tracking-[-0.025em] text-white mb-3">
          By the{' '}
          <span className="italic text-blue-300">
            numbers.
          </span>
        </h2>
        <p className="text-center text-[13px] sm:text-[15px] text-white/65 max-w-xl mx-auto mb-10">
          Every app runs on the latest Gemini models. Pro for the hard problems, Flash for everyday work.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {STATS.map((s) => (
            <div
              key={s.label}
              className={`group rounded-lg p-5 ring-1 bg-white/[0.05] backdrop-blur-md text-center transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.07] ${
                s.highlight
                  ? 'ring-blue-300/30 hover:ring-blue-300/50'
                  : 'ring-white/[0.10] hover:ring-white/[0.18]'
              }`}
            >
              {s.prefix && (
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 mb-1">
                  {s.prefix}
                </div>
              )}
              <div
                className={`font-bold tracking-tight tabular-nums leading-none ${
                  s.prefix ? 'text-[30px] sm:text-[36px]' : 'text-[34px] sm:text-[40px]'
                } ${
                  s.highlight
                    ? 'text-blue-200'
                    : 'text-white'
                }`}
              >
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

// ===== Section 5: Note Map =====
//
// Repurposed from the old sample-curricula grid. Shows off Note Map, the
// Obsidian-style graph that lives inside the Notes app: each note is a
// node you can drag and link, the AI can suggest related nodes, and you
// can run spaced-repetition review over a map. Left side is a small
// static graph illustration, right side is three plain feature rows
// (no nested cards, to keep the chrome low). Copy avoids em dashes per
// user spec.
function NoteMapSection() {
  // Illustration only. Positions are percentages of the panel; the SVG
  // edges below use the same numbers (x * 3.6, y * 2.8) so the lines land
  // under the node dots in the 360x280 viewBox.
  const NODES = [
    { id: 'photo',   label: 'Photosynthesis', x: 46, y: 48, color: '#34d399', big: true },
    { id: 'light',   label: 'Light reactions', x: 22, y: 20, color: '#60a5fa' },
    { id: 'calvin',  label: 'Calvin cycle',    x: 80, y: 24, color: '#22d3ee', flip: true },
    { id: 'atp',     label: 'ATP & NADPH',     x: 82, y: 74, color: '#a78bfa', flip: true },
    { id: 'chloro',  label: 'Chlorophyll',     x: 18, y: 80, color: '#fbbf24' },
    { id: 'stomata', label: 'Stomata',         x: 48, y: 90, color: '#f472b6' },
  ];
  const EDGES = [
    ['photo', 'light'], ['photo', 'calvin'], ['photo', 'atp'],
    ['photo', 'chloro'], ['photo', 'stomata'], ['light', 'calvin'], ['calvin', 'atp'],
  ];
  const pos = Object.fromEntries(NODES.map((n) => [n.id, n]));

  const POINTS = [
    { icon: Link2, title: 'Link your notes', body: 'Every note becomes a node. Drag them around and connect the ones that belong together.' },
    { icon: Sparkles, title: 'Let the AI fill gaps', body: 'Ask for related topics and it drops in new nodes, already wired to what you have.' },
    { icon: Repeat, title: 'Review what slips', body: 'Run spaced-repetition review over a map, or turn any node into flashcards.' },
  ];

  return (
    <section data-section="notemap" className="snap-start h-screen w-full flex flex-col items-center justify-center px-6 relative">
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative z-10 w-full max-w-6xl animate-fade-up">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-white/55 mb-3">Inside Notes</p>
        <h2 className="text-center text-[32px] sm:text-[40px] md:text-[50px] leading-[1.05] font-bold tracking-[-0.025em] text-white mb-3">
          Your notes,{' '}
          <span className="italic text-blue-300">on a map.</span>
        </h2>
        <p className="text-center text-[13px] sm:text-[15px] text-white/65 max-w-xl mx-auto mb-10">
          Note Map turns your notes into a graph. Related ideas sit next to each other instead of getting buried in a long list.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Graph illustration: one panel holding the SVG, no boxes inside it */}
          <div className="relative w-full max-w-[460px] mx-auto lg:mx-0 aspect-[360/280] rounded-xl ring-1 ring-white/[0.10] bg-white/[0.04] backdrop-blur-md overflow-hidden">
            <svg viewBox="0 0 360 280" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full">
              {EDGES.map(([a, b], i) => (
                <line
                  key={i}
                  x1={pos[a].x * 3.6} y1={pos[a].y * 2.8}
                  x2={pos[b].x * 3.6} y2={pos[b].y * 2.8}
                  stroke="rgba(255,255,255,0.16)" strokeWidth="1.5"
                />
              ))}
            </svg>
            {/* node dots */}
            {NODES.map((n) => (
              <span
                key={`dot-${n.id}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white/15"
                style={{
                  left: `${n.x}%`, top: `${n.y}%`,
                  width: n.big ? 15 : 11, height: n.big ? 15 : 11,
                  background: n.color, boxShadow: `0 0 14px ${n.color}66`,
                }}
              />
            ))}
            {/* node labels, flipped to the inside edge for right-side nodes */}
            {NODES.map((n) => (
              <span
                key={`label-${n.id}`}
                className={`absolute whitespace-nowrap font-medium ${n.big ? 'text-[12px] text-white' : 'text-[11px] text-white/75'}`}
                style={
                  n.flip
                    ? { right: `${100 - n.x}%`, top: `${n.y}%`, transform: 'translate(-12px, -50%)' }
                    : { left: `${n.x}%`, top: `${n.y}%`, transform: 'translate(12px, -50%)' }
                }
              >
                {n.label}
              </span>
            ))}
          </div>

          {/* Feature rows: plain rows split by hairlines, not nested cards */}
          <div className="divide-y divide-white/10 max-w-md mx-auto lg:mx-0 w-full">
            {POINTS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.title} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                  <span className="shrink-0 grid place-items-center w-9 h-9 rounded-xl bg-white/10 ring-1 ring-white/15">
                    <Icon size={16} className="text-white" strokeWidth={2} />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-bold tracking-tight text-white">{p.title}</h3>
                    <p className="text-[13px] text-white/65 leading-relaxed mt-0.5">{p.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ===== Section 6: Quiz Bowl vs AI =====
function QuizBowlAISection() {
  return (
    <section data-section="quizbowl" className="snap-start h-screen w-full flex flex-col items-center justify-center px-6 relative">
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative z-10 max-w-5xl w-full animate-fade-up">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-white/55 mb-3">Quiz Bowl</p>
        <h2 className="text-center text-[34px] sm:text-[44px] md:text-[56px] leading-[1.05] font-bold tracking-[-0.025em] text-white mb-4">
          Buzz in before{' '}
          <span className="text-blue-300 italic">the AI does.</span>
        </h2>
        <p className="text-center text-[14px] sm:text-[16px] text-white/65 max-w-xl mx-auto mb-10">
          Pyramidal tossups, a real buzzer, live scoreboard. Race an AI opponent that reads the same clues you do.
        </p>

        <div className="rounded-xl ring-1 ring-white/[0.10] bg-white/[0.05] backdrop-blur-md overflow-hidden max-w-2xl mx-auto">
          {/* Scoreboard */}
          <div className="grid grid-cols-3 border-b border-white/[0.08]">
            <div className="flex flex-col items-center py-5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-white/50 mb-1">You</span>
              <span className="text-[42px] font-bold tabular-nums text-white leading-none">10</span>
            </div>
            <div className="flex flex-col items-center justify-center border-x border-white/[0.08] gap-1">
              <Zap size={18} className="text-blue-300" strokeWidth={2.5} />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">vs</span>
            </div>
            <div className="flex flex-col items-center py-5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-white/50 mb-1">AI</span>
              <span className="text-[42px] font-bold tabular-nums text-blue-300 leading-none">15</span>
            </div>
          </div>

          {/* Live tossup */}
          <div className="p-5 border-b border-white/[0.08]">
            <p className="text-[10px] font-mono uppercase tracking-wider text-white/35 mb-2.5">Tossup — Q4 of 20</p>
            <p className="text-[13.5px] text-white/80 leading-relaxed">
              This mathematician lends his name to a function defined as the integral of{' '}
              <span className="font-mono text-blue-200">e&#8315;&#7511; t&#739;&#8315;&#185;</span>{' '}
              from 0 to infinity, which generalizes the factorial to real and complex numbers.{' '}
              <span className="text-white/35">For 10 points, name this mathematician...</span>
            </p>
          </div>

          {/* Buzz row */}
          <div className="px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[12px] text-white/50">Live match</span>
            </div>
            <button className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-500/25 border border-blue-400/40 cursor-default">
              <Zap size={12} className="text-blue-300" strokeWidth={2.5} />
              <span className="text-[12px] font-semibold text-blue-200">BUZZ</span>
            </button>
          </div>
        </div>

        <p className="text-center text-[12px] text-white/40 mt-6">
          Real packets. The AI buzzes from the same text you see, no shortcuts.
        </p>
      </div>
    </section>
  );
}

// ===== Section 7: Sign-in =====
//
// Google OAuth is the only sign-in path.
function SignInSection({ loading, googleReady, onSignIn, onWhyNotGpt }) {
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
        <h1 className="text-[32px] sm:text-[40px] leading-[1.05] font-semibold tracking-[-0.02em] text-white">
          Sign in
        </h1>
        <p className="mt-2 text-[14px] text-white/65">
          Continue with your Google account to start learning.
        </p>

        {/* Google OAuth - primary (and only) sign-in path */}
        <button
          onClick={onSignIn}
          disabled={loading || !googleReady}
          className="mt-8 w-full py-3 rounded-lg bg-white hover:bg-white/95 active:scale-[0.98] text-[14px] font-semibold text-slate-800 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2.5"
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
          href="https://discord.gg/rRdhczxjgC"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-white/70 hover:text-white transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963a.074.074 0 0 0-.041-.104 13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028ZM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38Zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38Z" />
          </svg>
          Discord
        </a>
        <span className="text-white/25">·</span>
        <button
          onClick={onWhyNotGpt}
          className="text-[12.5px] font-medium text-white/70 hover:text-white transition-colors"
        >
          Why not GPT?
        </button>
      </div>
    </section>
  );
}

// ===== Section 8: Why not GPT? =====
function WhyNotGptSection() {
  const ROWS = [
    {
      icon: BookOpen,
      title: 'Course structure',
      us: 'Type a topic and get a real course back. Units, lessons, quizzes, a midterm, and a final, in seconds.',
      them: 'Spits out a wall of text. Organizing it into a course is on you.',
    },
    {
      icon: Repeat,
      title: 'Memory',
      us: 'Wrong answers resurface on the next quiz. The final pulls directly from your weak spots.',
      them: 'Forgets everything the moment the chat ends.',
    },
    {
      icon: Brain,
      title: 'Progress',
      us: 'Courses, lessons, and streaks are all saved. Open it next week and pick up right where you left off.',
      them: 'Every chat starts from scratch. You track where you are.',
    },
    {
      icon: PenTool,
      title: 'Math',
      us: 'Solve on a real canvas. Each line gets read and you find out exactly where you slipped.',
      them: 'Gives you the answer. Wrong number, no explanation.',
    },
    {
      icon: Zap,
      title: 'Quiz Bowl',
      us: 'Head-to-head with a real buzzer. Pyramidal tossups, real packets, real scoreboard.',
      them: 'Not possible. One person, one chat box.',
    },
    {
      icon: Cpu,
      title: 'Purpose',
      us: 'Built for studying from the ground up. Uses whichever model fits the job.',
      them: 'One model, one chat box. That\'s the whole app.',
    },
  ];

  return (
    <section
      data-section="whynotgpt"
      className="snap-start min-h-screen w-full flex flex-col items-center justify-center px-6 py-16 relative"
    >
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 w-full max-w-3xl animate-fade-up">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-white/55 mb-3">RushilAI vs ChatGPT</p>
        <h2 className="text-center text-[34px] sm:text-[44px] leading-[1.05] font-bold tracking-[-0.025em] text-white mb-3">
          ChatGPT answers questions.
          <br />
          <span className="text-blue-300 italic">RushilAI teaches you.</span>
        </h2>
        <p className="text-center text-[14px] text-white/55 max-w-md mx-auto mb-10">
          One is a chatbot. The other walks you through a real course.
        </p>

        {/* Column labels */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-400/[0.07] ring-1 ring-emerald-400/[0.14]">
            <Check size={10} className="text-emerald-400 shrink-0" strokeWidth={3} />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-emerald-300">RushilAI</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] ring-1 ring-white/[0.07]">
            <X size={10} className="text-white/25 shrink-0" strokeWidth={2.5} />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/30">ChatGPT</span>
          </div>
        </div>

        {/* Comparison rows */}
        <div className="space-y-2">
          {ROWS.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.title} className="rounded-lg ring-1 ring-white/[0.08] bg-white/[0.025] overflow-hidden">
                <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
                  <span className="w-6 h-6 grid place-items-center rounded-md bg-white/[0.08] border border-white/[0.10]">
                    <Icon size={13} className="text-blue-300" strokeWidth={2} />
                  </span>
                  <span className="text-[12.5px] font-semibold tracking-[-0.005em] text-white/85">{row.title}</span>
                </div>
                <div className="grid grid-cols-2">
                  <div className="px-4 py-3 flex items-start gap-2 bg-emerald-400/[0.04] border-r border-white/[0.05]">
                    <Check size={11} className="text-emerald-400 mt-[3px] shrink-0" strokeWidth={3} />
                    <p className="text-[12px] leading-relaxed text-white/70">{row.us}</p>
                  </div>
                  <div className="px-4 py-3 flex items-start gap-2">
                    <X size={11} className="text-white/20 mt-[3px] shrink-0" strokeWidth={2.5} />
                    <p className="text-[12px] leading-relaxed text-white/35">{row.them}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ===== Menu bar =====
// Faux macOS menu bar pinned to the top - slim glass strip with the
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
        <div className="w-4 h-4 rounded-[5px] bg-blue-500 grid place-items-center">
          <Brain size={9} className="text-white" strokeWidth={2.2} />
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
