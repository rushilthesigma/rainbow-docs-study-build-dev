import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { googleLogin } from '../api/auth';
import {
  Loader2 as Loader, Sparkles, X, Check, ChevronDown,
  BookOpen, Zap, Repeat,
  Lightbulb, Calculator, MessageSquare,
  Scale, Link2, Users, Bot, Volume2, FlaskConical, ListPlus,
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
        <QuizBowlSection isMobile={isMobile} />
        <NoteMapSection isMobile={isMobile} />
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

        <button
          onClick={onSignIn}
          className="mt-10 inline-flex items-center justify-center px-8 py-4 rounded-xl bg-blue-500 hover:bg-blue-400 active:scale-[0.98] text-white text-[17px] font-semibold tracking-[-0.01em] transition-colors"
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
  return (
    <section data-section="how" className={`${sectionH(isMobile)} w-full flex flex-col items-center justify-center relative`}>
      <div className="absolute inset-0 bg-black/35" />
      <FadeUp className="relative z-10 w-full max-w-3xl">
        <h2 className="text-[36px] sm:text-[44px] md:text-[50px] leading-[1.05] font-bold tracking-[-0.03em] text-white mb-8">
          How it works
        </h2>
        <p className="text-[24px] sm:text-[30px] md:text-[34px] leading-[1.25] font-medium tracking-[-0.025em] text-white/95">
          Tell RushilAI what you want to learn. It builds a complete curriculum, guides you through each lesson, and uses your quiz results to bring weak topics back until they stick.
        </p>
        <p className="mt-6 max-w-2xl text-[15px] sm:text-[17px] leading-relaxed text-white/60">
          Start with any subject. Your course, notes, and progress stay connected as you learn.
        </p>
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
    },
    {
      icon: Zap,
      title: 'Quiz Bowl',
    },
    {
      icon: Lightbulb,
      title: 'Lessons',
    },
    {
      icon: MessageSquare,
      title: 'Study Mode',
    },
    {
      icon: Calculator,
      title: 'Math Tutor',
    },
    {
      icon: Scale,
      title: 'Debate',
    },
  ];
  return (
    <section data-section="features" className={`${sectionH(isMobile)} w-full flex flex-col items-center justify-center relative`}>
      <div className="absolute inset-0 bg-black/35" />
      <FadeUp className="relative z-10 w-full max-w-4xl">
        <h2 className="text-[36px] sm:text-[44px] md:text-[50px] leading-[1.05] font-bold tracking-[-0.03em] text-white mb-10">
          What&apos;s inside
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-14 border-t border-white/[0.08]">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="flex items-center gap-5 py-6 sm:py-7 border-b border-white/[0.08]">
                <Icon size={32} className="text-white/90 shrink-0" strokeWidth={1.8} />
                <h3 className="text-[22px] sm:text-[24px] font-semibold tracking-[-0.02em] text-white">{f.title}</h3>
              </div>
            );
          })}
        </div>
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
    { icon: Link2, title: 'Link your notes' },
    { icon: Sparkles, title: 'Ask for suggestions' },
    { icon: Repeat, title: 'Review from the map' },
  ];

  return (
    <section data-section="notemap" className={`${sectionH(isMobile)} w-full flex flex-col items-center justify-center relative`}>
      <div className="absolute inset-0 bg-black/35" />
      <FadeUp className="relative z-10 w-full max-w-5xl">
        <h2 className="text-[36px] sm:text-[44px] md:text-[50px] leading-[1.05] font-bold tracking-[-0.03em] text-white mb-10">
          Note Map
        </h2>

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
                <div key={p.title} className="flex items-center gap-5 py-6 first:pt-0 last:pb-0">
                  <Icon size={30} className="text-white/90 shrink-0" strokeWidth={1.8} />
                  <h3 className="text-[20px] sm:text-[22px] font-semibold tracking-[-0.02em] text-white">{p.title}</h3>
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
//
// The flagship section: a live-match mockup on the left and the different
// ways to play on the right, mirroring the Note Map layout (one panel plus
// hairline rows, no nested cards).
function QuizBowlSection({ isMobile }) {
  const MODES = [
    {
      icon: Users,
      title: 'Multiplayer',
      desc: 'Host a room and buzz against friends in real time.',
    },
    {
      icon: Bot,
      title: 'Vs AI bots',
      desc: 'Solo matches against bots that buzz back.',
    },
    {
      icon: Volume2,
      title: 'Read aloud',
      desc: 'A voice reads each tossup word by word, like a real moderator.',
    },
    {
      icon: Sparkles,
      title: 'Sets from your notes',
      desc: 'AI writes fresh tossups from whatever you are studying.',
    },
    {
      icon: ListPlus,
      title: 'Custom sets',
      desc: 'Build your own sets on any topic with custom instructions.',
    },
    {
      icon: FlaskConical,
      title: 'Clue Lab',
      desc: 'See which clues repeat across sets and study the ones that score.',
    },
  ];

  return (
    <section data-section="quizbowl" className={`${sectionH(isMobile)} w-full flex flex-col items-center justify-center relative`}>
      <div className="absolute inset-0 bg-black/35" />
      <FadeUp className="relative z-10 max-w-5xl w-full">
        <h2 className="text-[36px] sm:text-[44px] md:text-[50px] leading-[1.05] font-bold tracking-[-0.03em] text-white mb-10">
          Quiz Bowl
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
        <div className="w-full max-w-[460px] mx-auto lg:mx-0 rounded-xl ring-1 ring-white/[0.10] bg-white/[0.05] overflow-hidden">
          {/* Scoreboard */}
          <div className="grid grid-cols-3 border-b border-white/[0.08]">
            <div className="flex flex-col items-center py-5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-white/50 mb-1">You</span>
              <span className="text-[48px] font-bold tabular-nums text-white leading-none">10</span>
            </div>
            <div className="flex flex-col items-center justify-center border-x border-white/[0.08] gap-1">
              <Zap size={28} className="text-blue-300" strokeWidth={2.3} />
              <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/40">vs</span>
            </div>
            <div className="flex flex-col items-center py-5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-white/50 mb-1">AI</span>
              <span className="text-[48px] font-bold tabular-nums text-blue-300 leading-none">15</span>
            </div>
          </div>

          {/* Live tossup */}
          <div className="p-5 border-b border-white/[0.08]">
            <p className="text-[10px] font-mono uppercase tracking-wider text-white/35 mb-2.5">Tossup, Q4 of 20</p>
            <p className="text-[15px] text-white/85 leading-relaxed">
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
            <button className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-500/25 border border-blue-400/40 cursor-default">
              <Zap size={16} className="text-blue-300" strokeWidth={2.5} />
              <span className="text-[14px] font-semibold text-blue-200">BUZZ</span>
            </button>
          </div>
        </div>

        {/* Ways to play: plain rows split by hairlines, matching Note Map */}
        <div className="divide-y divide-white/10 max-w-md mx-auto lg:mx-0 w-full">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.title} className="flex items-start gap-5 py-4 first:pt-0 last:pb-0">
                <Icon size={26} className="text-white/90 shrink-0 mt-0.5" strokeWidth={1.8} />
                <div>
                  <h3 className="text-[18px] sm:text-[20px] font-semibold tracking-[-0.02em] text-white">{m.title}</h3>
                  <p className="mt-0.5 text-[13.5px] leading-relaxed text-white/55">{m.desc}</p>
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
        <h2 className="text-[40px] sm:text-[48px] leading-[1.05] font-semibold tracking-[-0.03em] text-white">
          Sign in
        </h2>

        {/* Google OAuth - primary (and only) sign-in path.
            The visible <button> is purely cosmetic (pointer-events off).
            The transparent googleBtnRef overlay on top receives real clicks
            and relays them into the GSI iframe → opens the account chooser. */}
        <div className="relative mt-8 w-full">
          <button
            disabled={loading || !googleReady}
            className="w-full py-4 rounded-xl bg-white text-[16px] font-semibold text-slate-800 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-3 pointer-events-none select-none"
            tabIndex={-1}
            aria-hidden="true"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2"><Loader size={20} className="animate-spin" /> Signing in...</span>
            ) : (
              <>
                <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
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
        <h2 className="text-center text-[36px] sm:text-[44px] leading-[1.05] font-bold tracking-[-0.03em] text-white mb-10">
          Why not just use ChatGPT?
        </h2>

        {isMobile ? (
          /* Phone: two narrow text columns are unreadable, so each row
             stacks the RushilAI / ChatGPT lines under its title. Still one
             frame with hairline dividers, no nested cards. */
          <div className="rounded-xl ring-1 ring-white/[0.10] bg-white/[0.03] overflow-hidden divide-y divide-white/[0.06]">
            {ROWS.map((row) => (
              <div key={row.title} className="px-4 py-4">
                <p className="text-[13px] font-semibold tracking-tight text-white mb-2.5">{row.title}</p>
                <div className="flex gap-2.5 mb-2">
                  <Check size={18} className="text-emerald-400 shrink-0 mt-0.5" strokeWidth={3} />
                  <p className="text-[14px] leading-relaxed text-white/80">{row.us}</p>
                </div>
                <div className="flex gap-2.5">
                  <X size={18} className="text-white/30 shrink-0 mt-0.5" strokeWidth={2.5} />
                  <p className="text-[14px] leading-relaxed text-white/45">{row.them}</p>
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
                <Check size={16} className="text-emerald-400 shrink-0" strokeWidth={3} />
                <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-emerald-300">RushilAI</span>
              </span>
              <span className="px-4 py-2.5 flex items-center gap-1.5 border-l border-white/[0.05]">
                <X size={16} className="text-white/30 shrink-0" strokeWidth={2.5} />
                <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/35">ChatGPT</span>
              </span>
            </div>
            {ROWS.map((row) => (
              <div key={row.title} className="grid grid-cols-[120px_1fr_1fr] border-t border-white/[0.06]">
                <span className="px-4 py-3.5 text-[14px] font-semibold text-white/85">{row.title}</span>
                <p className="px-4 py-3.5 text-[13.5px] leading-relaxed text-white/75 border-l border-white/[0.05]">{row.us}</p>
                <p className="px-4 py-3.5 text-[13.5px] leading-relaxed text-white/40 border-l border-white/[0.05]">{row.them}</p>
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
