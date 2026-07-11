import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { googleLogin } from '../api/auth';
import {
  Loader2 as Loader, Sparkles, X, Check, ChevronDown,
  BookOpen, Zap, Repeat,
  Lightbulb, Calculator, MessageSquare,
  Scale, Link2,
} from 'lucide-react';
import { Breakpoint } from '../styles/tokens';

// Scroll-snap sections over one fixed wallpaper:
//   hero, how it works, what's inside, note map, quiz bowl,
//   sign-in, why-not-gpt.
//
// Layout rules for this page (per user spec):
//   - No repeated kicker + italic-punchline header formula. Plain
//     headers, one blue accent in the hero and nowhere else.
//   - No glass card grids or boxes-in-boxes. Groups are hairline
//     dividers on the window glass.
//   - backdrop-blur only on the fixed menu bar. Blurred cards inside
//     a snap scroller shimmer in Chromium while scrolling.
//   - Copy avoids em dashes.

// Locked to a nighttime sky; the user's wallpaper preference applies
// after sign-in. Keep this URL byte-identical to the preload link in
// index.html so the parse-time fetch is the one the page paints with.
const LANDING_WALLPAPER = 'https://images.unsplash.com/photo-1509773896068-7fd415d91e2e?w=2560&q=75';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

// True once the image has decoded, so the wallpaper can fade in rather
// than pop from black at full opacity when the network fetch lands.
function useImageReady(url) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let stale = false;
    const img = new Image();
    img.onload = () => { if (!stale) setReady(true); };
    img.onerror = () => { if (!stale) setReady(true); };
    img.src = url;
    return () => { stale = true; };
  }, [url]);
  return ready;
}

// Phone / narrow-viewport gate. Matches the app's MOBILE_BREAKPOINT (768)
// so the signed-out landing flips to its mobile layout at the same width
// the signed-in shell flips to MobileShell.
function useIsMobile(breakpoint = Breakpoint.mobile) {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < breakpoint,
  );
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < breakpoint);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return mobile;
}

// Per-section sizing. Desktop pins each section to exactly one viewport and
// snaps between them. On phones, mandatory snap over fixed-100vh sections
// traps momentum scrolling and clips any section taller than the (browser-
// chrome-reduced) viewport, so we drop snap and let sections grow: each
// still fills the screen (min-h) but extends and scrolls normally when its
// content runs long. svh = the always-visible height, so nothing hides
// behind the URL bar.
function sectionH(isMobile) {
  // Keep the content in normal flow on phones. The additional bottom room
  // keeps the hero cue and sign-in actions clear of Safari's browser chrome
  // on short viewports, while the smaller gutters leave usable line length on
  // 320px-wide screens.
  return isMobile
    ? 'min-h-[100svh] px-4 py-14 pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(3.5rem+env(safe-area-inset-bottom))]'
    : 'snap-start h-screen px-6';
}

export default function LandingPage() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [googleReady, setGoogleReady] = useState(false);
  const googleBtnRef = useRef(null);
  const scrollerRef = useRef(null);
  const lastBtnWidthRef = useRef(0);
  const bgReady = useImageReady(LANDING_WALLPAPER);
  const isMobile = useIsMobile();

  // Count one anonymous landing-page visit per browser session for admin
  // analytics. The sessionStorage guard keeps refreshes and StrictMode's
  // double-mount from inflating the count. Fire-and-forget — never blocks
  // the page or surfaces an error.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('covalent-landing-counted')) return;
      sessionStorage.setItem('covalent-landing-counted', '1');
    } catch { /* private mode: skip the guard, still ping once per mount */ }
    fetch('/api/metrics/landing-visit', { method: 'POST' }).catch(() => {});
  }, []);

  // Render (or re-render) the GSI button sized to its container. The button
  // is the transparent click-target overlaid on the cosmetic button, so its
  // width has to match the container exactly. A hardcoded 400px overflowed
  // narrow phones (GSI's max width) and pushed the invisible iframe out of
  // alignment with the button beneath it, so real taps missed.
  function renderGoogleBtn() {
    const el = googleBtnRef.current;
    if (!el || !window.google?.accounts?.id) return;
    const width = Math.max(220, Math.min(400, Math.round(el.offsetWidth || 320)));
    // Skip a re-render that wouldn't change anything (avoids flicker on every
    // resize tick); GSI's max is 400, so clamp before comparing.
    if (el.hasChildNodes() && Math.abs(width - lastBtnWidthRef.current) < 8) return;
    lastBtnWidthRef.current = width;
    el.innerHTML = '';
    window.google.accounts.id.renderButton(el, {
      theme: 'filled_blue',
      size: 'large',
      width,
    });
  }

  useEffect(() => {
    let cancelled = false;
    const init = () => {
      if (cancelled || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
        callback: handleGoogleResponse,
        // Required for Chrome 116+ FedCM on Chromebooks: allows prompt() to
        // trigger the browser-native account picker from a user-gesture handler
        // without needing an on-screen rendered button element.
        use_fedcm_for_prompt: true,
      });
      renderGoogleBtn();
      setGoogleReady(true);
    };
    if (window.google?.accounts?.id) {
      init();
      return () => { cancelled = true; };
    }
    // Reuse a script tag if one is already in the DOM. The script stays
    // mounted across unmounts on purpose: removing and re-appending it
    // re-ran initialize() on every mount and spammed GSI warnings.
    let script = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = GSI_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
    script.addEventListener('load', init);
    return () => { cancelled = true; script.removeEventListener('load', init); };
  }, []);

  // Keep the GSI button width matched to its container across viewport
  // changes (phone rotation, desktop window drag).
  useEffect(() => {
    if (!googleReady) return;
    const onResize = () => renderGoogleBtn();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleReady]);

  async function handleGoogleResponse(response) {
    setLoading(true);
    setLoginError(null);
    try {
      const data = await googleLogin(response.credential);
      if (data.success) {
        login(data.user, data.token);
      }
    } catch (err) {
      console.error('Login failed:', err);
      setLoginError(err.message || 'Sign-in failed. Please try again.');
    }
    setLoading(false);
  }

  function scrollToSection(name) {
    const el = scrollerRef.current?.querySelector(`[data-section="${name}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className={`relative w-full overflow-hidden bg-[#05070f] text-white select-none ${isMobile ? 'h-[100dvh]' : 'h-screen'}`}>
      {/* Fixed wallpaper layer. Deep-navy base so the page never sits on
          raw black while the image is still downloading. */}
      <div className="absolute inset-0 z-0">
        <div
          className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-700 ${bgReady ? 'opacity-100' : 'opacity-0'}`}
          style={{ backgroundImage: `url(${LANDING_WALLPAPER})` }}
        />
        {/* Always a soft top gradient so the menu bar reads */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 to-transparent" />
      </div>

      <MenuBar />

      <div
        ref={scrollerRef}
        data-scroll-root
        className={`relative z-10 overflow-y-auto overflow-x-hidden overscroll-y-contain scrollbar-hide ${isMobile ? 'h-[100dvh]' : 'h-screen snap-y snap-mandatory'}`}
      >
        <HeroSection
          isMobile={isMobile}
          onSignIn={() => scrollToSection('signin')}
          onTour={() => scrollToSection('how')}
        />
        <HowItWorksSection isMobile={isMobile} />
        <FeaturesSection isMobile={isMobile} />
        <NoteMapSection isMobile={isMobile} />
        <QuizBowlSection isMobile={isMobile} />
        <SignInSection
          isMobile={isMobile}
          loading={loading}
          loginError={loginError}
          googleReady={googleReady}
          googleBtnRef={googleBtnRef}
          onWhyNotGpt={() => scrollToSection('whynotgpt')}
        />
        <WhyNotGptSection isMobile={isMobile} />
      </div>
    </div>
  );
}

// Fade-up entrance keyed to scroll position in the snap container.
// Triggers while the section is still 60% of a viewport below the
// fold, so the animation runs during the snap transition instead of
// after it. The old IntersectionObserver version waited until the
// section was already on screen, which left a beat of empty black on
// every transition (read as the page flashing between sections), and
// IO callbacks can lag by seconds in throttled/background tabs.
// Scroll events are synchronous everywhere, and the math is cheap.
function FadeUp({ className = '', children }) {
  const ref = useRef(null);
  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [visible, setVisible] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const scroller = el.closest('[data-scroll-root]');
    if (!scroller) { setVisible(true); return; }
    let detached = false;
    const check = () => {
      if (detached) return;
      const buffer = scroller.clientHeight * 0.6;
      if (el.getBoundingClientRect().top < scroller.getBoundingClientRect().bottom + buffer) {
        detached = true;
        scroller.removeEventListener('scroll', check);
        setVisible(true);
      }
    };
    check(); // sections already in (or near) view on mount
    scroller.addEventListener('scroll', check, { passive: true });
    return () => { detached = true; scroller.removeEventListener('scroll', check); };
  }, [reduced]);
  return (
    <div ref={ref} className={`${visible ? (reduced ? '' : 'animate-fade-up') : 'opacity-0'} ${className}`}>
      {children}
    </div>
  );
}

// ===== Hero =====
function HeroSection({ isMobile, onSignIn, onTour }) {
  return (
    <section
      data-section="hero"
      className={`${sectionH(isMobile)} w-full flex flex-col items-center justify-center relative`}
    >
      {/* Subtle scrim so the headline reads against any wallpaper */}
      <div className="absolute inset-0 bg-black/35" />

      <FadeUp className="relative z-10 w-full max-w-4xl text-center">
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
          onClick={onSignIn}
          className="mt-10 inline-flex items-center justify-center px-7 py-3.5 rounded-xl bg-blue-500 hover:bg-blue-400 active:scale-[0.98] text-white text-[14.5px] font-semibold tracking-[-0.005em] transition-colors"
        >
          Get started
        </button>
      </FadeUp>

      {/* Scroll cue at the bottom */}
      <button
        onClick={onTour}
        aria-label="Scroll down"
        className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] sm:bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 text-white/65 hover:text-white transition-colors"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.16em]">Scroll</span>
        <ChevronDown size={16} className="animate-bounce-slow" strokeWidth={2.4} />
      </button>
    </section>
  );
}

// ===== How it works =====
function HowItWorksSection({ isMobile }) {
  const STEPS = [
    {
      n: '1',
      title: 'Build the course',
      body: 'Name a topic like Calculus BC, AP Bio, or Roman history. You get a syllabus with units, lessons, a midterm, and a final.',
    },
    {
      n: '2',
      title: 'Take the quizzes',
      body: 'Every lesson ends with a short quiz. Missed questions get logged by topic, so the app knows where you need work.',
    },
    {
      n: '3',
      title: 'Close the gaps',
      body: 'The final pulls from your weak spots instead of a generic pool, and Quiz Bowl can build a round out of them whenever you want.',
    },
  ];
  return (
    <section data-section="how" className={`${sectionH(isMobile)} w-full flex flex-col items-center justify-center relative`}>
      <div className="absolute inset-0 bg-black/35" />
      <FadeUp className="relative z-10 w-full max-w-2xl">
        <h2 className="text-[30px] sm:text-[38px] md:text-[44px] leading-[1.08] font-bold tracking-[-0.02em] text-white mb-8">
          How it works
        </h2>
        <div className="divide-y divide-white/10 border-y border-white/10">
          {STEPS.map((s) => (
            <div key={s.n} className="flex gap-5 py-5">
              <span className="shrink-0 w-6 text-[13px] font-mono text-white/40 pt-0.5">{s.n}</span>
              <div>
                <h3 className="text-[16px] font-semibold tracking-tight text-white">{s.title}</h3>
                <p className="text-[13.5px] text-white/65 leading-relaxed mt-1">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </FadeUp>
    </section>
  );
}

// ===== What's inside =====
function FeaturesSection({ isMobile }) {
  const FEATURES = [
    {
      icon: BookOpen,
      title: 'Curricula',
      body: 'Type any topic and get a full course with units, lessons, a midterm, and a final. Everything stays editable.',
    },
    {
      icon: Lightbulb,
      title: 'Lessons',
      body: 'Each lesson walks through the material and ends with a short quiz. Whatever you miss comes back later.',
    },
    {
      icon: MessageSquare,
      title: 'Study Mode',
      body: "Chat through anything you're studying. Attach a curriculum or sources so the answers stay on topic.",
    },
    {
      icon: Calculator,
      title: 'Math Tutor',
      body: 'Work through problems step by step on a canvas while the tutor checks your reasoning.',
    },
    {
      icon: Zap,
      title: 'Quiz Bowl',
      body: 'Buzz against a full lobby of AI opponents, not just one bot. Play 180,000+ real packet questions or a custom set on any topic.',
    },
    {
      icon: Scale,
      title: 'Debate',
      body: 'Pick a side against the AI or a friend, then get a scored verdict when you finish.',
    },
  ];
  return (
    <section data-section="features" className={`${sectionH(isMobile)} w-full flex flex-col items-center justify-center relative`}>
      <div className="absolute inset-0 bg-black/35" />
      <FadeUp className="relative z-10 w-full max-w-4xl">
        <h2 className="text-[30px] sm:text-[38px] md:text-[44px] leading-[1.08] font-bold tracking-[-0.02em] text-white mb-2">
          What&apos;s inside
        </h2>
        <p className="text-[14px] text-white/65 mb-8">
          Every app shares one account. Quiz results turn into flashcards, and notes come back as spaced review.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-14 border-t border-white/[0.08]">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="flex gap-4 py-5 border-b border-white/[0.08]">
                <Icon size={17} className="text-white/85 mt-0.5 shrink-0" strokeWidth={2} />
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight text-white">{f.title}</h3>
                  <p className="text-[12.5px] text-white/65 leading-relaxed mt-1">{f.body}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[12px] text-white/45 mt-6">Runs on Gemini, GPT, Grok, and DeepSeek models.</p>
      </FadeUp>
    </section>
  );
}

// ===== Note Map =====
//
// Shows off Note Map, the graph view inside the Notes app: each note is
// a node you can drag and link, the AI can suggest related nodes, and
// you can run spaced-repetition review over a map. Left side is a small
// static graph illustration, right side is three plain feature rows.
function NoteMapSection({ isMobile }) {
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
    { icon: Sparkles, title: 'Ask for suggestions', body: 'Ask for related topics and the AI adds new nodes, linked to the ones you already have.' },
    { icon: Repeat, title: 'Review from the map', body: 'Run spaced-repetition review over a map, or turn any node into flashcards.' },
  ];

  return (
    <section data-section="notemap" className={`${sectionH(isMobile)} w-full flex flex-col items-center justify-center relative`}>
      <div className="absolute inset-0 bg-black/35" />
      <FadeUp className="relative z-10 w-full max-w-5xl">
        <h2 className="text-[30px] sm:text-[38px] md:text-[44px] leading-[1.08] font-bold tracking-[-0.02em] text-white mb-2">
          Note Map
        </h2>
        <p className="text-[14px] text-white/65 max-w-xl mb-10">
          Your notes become a graph. Related ideas sit next to each other instead of getting buried in a long list.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Graph illustration: one panel holding the SVG, no boxes inside it */}
          <div className="relative w-full max-w-[460px] mx-auto lg:mx-0 aspect-[360/280] rounded-xl ring-1 ring-white/[0.10] bg-white/[0.04] overflow-hidden">
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
                className={`absolute whitespace-nowrap font-medium ${
                  n.big
                    ? `${isMobile ? 'text-[10px]' : 'text-[12px]'} text-white`
                    : `${isMobile ? 'text-[9px]' : 'text-[11px]'} text-white/75`
                }`}
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
                  <Icon size={16} className="text-white/85 mt-0.5 shrink-0" strokeWidth={2} />
                  <div>
                    <h3 className="text-[15px] font-semibold tracking-tight text-white">{p.title}</h3>
                    <p className="text-[13px] text-white/65 leading-relaxed mt-0.5">{p.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </FadeUp>
    </section>
  );
}

// ===== Quiz Bowl =====
function QuizBowlSection({ isMobile }) {
  return (
    <section data-section="quizbowl" className={`${sectionH(isMobile)} w-full flex flex-col items-center justify-center relative`}>
      <div className="absolute inset-0 bg-black/35" />
      <FadeUp className="relative z-10 max-w-2xl w-full">
        <h2 className="text-[30px] sm:text-[38px] md:text-[44px] leading-[1.08] font-bold tracking-[-0.02em] text-white mb-2">
          Quiz Bowl
        </h2>
        <p className="text-[14px] text-white/65 mb-8">
          Pyramidal tossups with a buzzer and a live scoreboard. Face a whole lobby of AI opponents at once, tuned to your level, not a single practice bot.
        </p>

        <div className="rounded-xl ring-1 ring-white/[0.10] bg-white/[0.05] overflow-hidden">
          {/* Scoreboard */}
          <div className="grid grid-cols-3 border-b border-white/[0.08]">
            <div className="flex flex-col items-center py-5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-white/50 mb-1">You</span>
              <span className="text-[42px] font-bold tabular-nums text-white leading-none">10</span>
            </div>
            <div className="flex flex-col items-center justify-center border-x border-white/[0.08] gap-1">
              <Zap size={18} className="text-blue-300" strokeWidth={2.5} />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">vs</span>
            </div>
            <div className="flex flex-col items-center py-5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-white/50 mb-1">AI</span>
              <span className="text-[42px] font-bold tabular-nums text-blue-300 leading-none">15</span>
            </div>
          </div>

          {/* Live tossup */}
          <div className="p-5 border-b border-white/[0.08]">
            <p className="text-[10px] font-mono uppercase tracking-wider text-white/35 mb-2.5">Tossup, Q4 of 20</p>
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

        <p className="text-[12px] text-white/40 mt-6">
          Play real packet questions, or have a custom set written for any topic you name. No other quiz bowl trainer does that.
        </p>
      </FadeUp>
    </section>
  );
}

// ===== Sign-in =====
//
// Google OAuth is the only sign-in path.
// The GSI renderButton renders inside a cross-origin iframe, so it cannot be
// triggered via programmatic .click(). Instead, we position the real GSI
// button (transparent, opacity:0) directly over our custom-styled button so
// real user pointer events hit the iframe and open the account chooser popup.
function SignInSection({ isMobile, loading, loginError, googleReady, googleBtnRef, onWhyNotGpt }) {
  return (
    <section
      data-section="signin"
      className={`${isMobile ? sectionH(isMobile) : 'snap-start min-h-screen px-6 py-16'} w-full flex flex-col items-center justify-center relative`}
    >
      <div className="absolute inset-0 bg-black/35" />

      <FadeUp className="relative z-10 flex flex-col items-center w-full max-w-sm text-center">
        <h2 className="text-[32px] sm:text-[40px] leading-[1.05] font-semibold tracking-[-0.02em] text-white">
          Sign in
        </h2>
        <p className="mt-2 text-[14px] text-white/65">
          Your courses, notes, and quiz history save to your Google account.
        </p>

        {/* Google OAuth - primary (and only) sign-in path.
            The visible <button> is purely cosmetic (pointer-events off).
            The transparent googleBtnRef overlay on top receives real clicks
            and relays them into the GSI iframe → opens the account chooser. */}
        <div className="relative mt-8 w-full">
          <button
            disabled={loading || !googleReady}
            className="w-full py-3 rounded-lg bg-white text-[14px] font-semibold text-slate-800 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2.5 pointer-events-none select-none"
            tabIndex={-1}
            aria-hidden="true"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2"><Loader size={14} className="animate-spin" /> Signing in...</span>
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

          {/* Transparent GSI button overlay — real user clicks hit the iframe */}
          <div
            ref={googleBtnRef}
            aria-label="Continue with Google"
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0,
              cursor: 'pointer',
              pointerEvents: (loading || !googleReady) ? 'none' : 'auto',
            }}
          />
        </div>

        {loginError && (
          <p className="mt-3 text-[13px] text-red-400 text-center">
            {loginError}
          </p>
        )}

      </FadeUp>

      {/* Bottom links */}
      <div className={`${isMobile
        ? 'relative z-10 mt-10 flex items-center gap-5'
        : 'absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] sm:bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-5'
      }`}>
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

// ===== Why not GPT? =====
function WhyNotGptSection({ isMobile }) {
  const ROWS = [
    {
      title: 'Courses',
      us: 'Type a topic and get a course with units, lessons, quizzes, a midterm, and a final.',
      them: 'You get one long answer, and turning it into a course is up to you.',
    },
    {
      title: 'Memory',
      us: 'Wrong answers resurface on the next quiz. The final pulls directly from your weak spots.',
      them: 'It forgets the conversation once the chat ends.',
    },
    {
      title: 'Progress',
      us: 'Courses, lessons, and streaks are all saved. Open it next week and pick up right where you left off.',
      them: 'Every chat starts over, and you keep track of your own progress.',
    },
    {
      title: 'Math',
      us: 'Work each problem out on a canvas. The tutor reads every line and shows you where it went wrong.',
      them: 'It gives you the final answer without checking your steps.',
    },
    {
      title: 'Quiz Bowl',
      us: 'Live head-to-head matches with a buzzer, pyramidal tossups, and a scoreboard.',
      them: 'A chat window can\'t run a live match.',
    },
    {
      title: 'Purpose',
      us: 'Made for studying and nothing else. Courses, quizzes, notes, and review are all connected.',
      them: 'A general chatbot, not a study tool.',
    },
  ];

  return (
    <section
      data-section="whynotgpt"
      className={`${isMobile ? sectionH(isMobile) : 'snap-start min-h-screen px-6 py-16'} w-full flex flex-col items-center justify-center relative`}
    >
      <div className="absolute inset-0 bg-black/40" />

      <FadeUp className="relative z-10 w-full max-w-3xl">
        <h2 className="text-center text-[30px] sm:text-[38px] leading-[1.08] font-bold tracking-[-0.02em] text-white mb-3">
          Why not just use ChatGPT?
        </h2>
        <p className="text-center text-[14px] text-white/55 max-w-md mx-auto mb-10">
          A chat box forgets you between sessions. RushilAI keeps track of what you miss and builds the next quiz around it.
        </p>

        {isMobile ? (
          /* Phone: two narrow text columns are unreadable, so each row
             stacks the RushilAI / ChatGPT lines under its title. Still one
             frame with hairline dividers, no nested cards. */
          <div className="rounded-xl ring-1 ring-white/[0.10] bg-white/[0.03] overflow-hidden divide-y divide-white/[0.06]">
            {ROWS.map((row) => (
              <div key={row.title} className="px-4 py-4">
                <p className="text-[13px] font-semibold tracking-tight text-white mb-2.5">{row.title}</p>
                <div className="flex gap-2.5 mb-2">
                  <Check size={13} className="text-emerald-400 shrink-0 mt-0.5" strokeWidth={3} />
                  <p className="text-[12.5px] leading-relaxed text-white/75">{row.us}</p>
                </div>
                <div className="flex gap-2.5">
                  <X size={13} className="text-white/25 shrink-0 mt-0.5" strokeWidth={2.5} />
                  <p className="text-[12.5px] leading-relaxed text-white/40">{row.them}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* One table, hairline rows. Column headers inside the same frame. */
          <div className="rounded-xl ring-1 ring-white/[0.10] bg-white/[0.03] overflow-hidden">
            <div className="grid grid-cols-[120px_1fr_1fr]">
              <span className="px-4 py-2.5" />
              <span className="px-4 py-2.5 flex items-center gap-1.5 border-l border-white/[0.05]">
                <Check size={10} className="text-emerald-400 shrink-0" strokeWidth={3} />
                <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-emerald-300">RushilAI</span>
              </span>
              <span className="px-4 py-2.5 flex items-center gap-1.5 border-l border-white/[0.05]">
                <X size={10} className="text-white/25 shrink-0" strokeWidth={2.5} />
                <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/30">ChatGPT</span>
              </span>
            </div>
            {ROWS.map((row) => (
              <div key={row.title} className="grid grid-cols-[120px_1fr_1fr] border-t border-white/[0.06]">
                <span className="px-4 py-3.5 text-[12px] font-semibold text-white/80">{row.title}</span>
                <p className="px-4 py-3.5 text-[12px] leading-relaxed text-white/70 border-l border-white/[0.05]">{row.us}</p>
                <p className="px-4 py-3.5 text-[12px] leading-relaxed text-white/35 border-l border-white/[0.05]">{row.them}</p>
              </div>
            ))}
          </div>
        )}
      </FadeUp>
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
        <span className="text-[12.5px] font-semibold tracking-[-0.005em] text-white/95">RushilAI</span>
      </div>
      <div className="ml-auto flex items-center gap-3 text-[12px] font-medium text-white/85 tabular-nums tracking-tight">
        <span>{date}</span>
        <span>{time}</span>
      </div>
    </div>
  );
}
