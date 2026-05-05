import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUIPreference } from '../context/UIPreferenceContext';
import { googleLogin } from '../api/auth';
import { WALLPAPERS } from '../components/desktop/DesktopBackground';
import {
  Loader2 as Loader, Sparkles, ArrowRight, X, Check, BookOpen, Brain, Zap, PenTool, Cpu, Repeat,
} from 'lucide-react';

// macOS-style login screen — RushilAI flavor.
//
// Wallpaper: same one the desktop shell uses (read via useUIPreference;
// defaults to lavender). Real Unsplash photo, no procedural fill.
//
// No password field, no preloaded profile cache (everything UI-pref
// related is server-side now — we don't have a way to know the
// previous user without localStorage). The screen is a clean "RushilAI
// brand mark + Welcome + Sign in with Google" lock-screen.
export default function LandingPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { wallpaper } = useUIPreference();
  const [loading, setLoading] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const googleBtnRef = useRef(null);

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
    // Force the account picker so a returning user can pick a
    // different account / a brand new user can run the Google
    // create-account flow.
    if (window.google?.accounts?.id) {
      try { window.google.accounts.id.disableAutoSelect(); } catch {}
    }
    triggerGoogle();
  }

  // Resolve the wallpaper: prefer the user's pref if present (for
  // returning sessions where we still have an auth token), else the
  // canonical default (lavender).
  const wp = WALLPAPERS[wallpaper] || WALLPAPERS.lavender;
  const wallpaperUrl = wp?.url || WALLPAPERS.lavender.url;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-white select-none">
      {/* Real photographic wallpaper */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
          style={{ backgroundImage: `url(${wallpaperUrl})` }}
        />
        <div className="absolute inset-0 bg-black/45" />
      </div>

      <Clock />

      {/* Lock-screen content — pushed below center. */}
      <div className="relative z-10 min-h-screen flex flex-col items-center px-6" style={{ paddingTop: '45vh' }}>
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
          onClick={triggerGoogle}
          disabled={loading}
          className="group mt-6 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 hover:brightness-110 active:scale-[0.98] text-white text-[14.5px] font-bold transition-all disabled:opacity-50 shadow-xl shadow-blue-900/40 w-[280px] max-w-full"
        >
          {loading
            ? <><Loader size={15} className="animate-spin" /> Signing in…</>
            : <>Sign in with Google <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" /></>}
        </button>

        {/* Secondary link */}
        <button
          onClick={newAccount}
          className="mt-4 text-[13px] font-medium text-white/75 hover:text-white transition-colors"
        >
          I&apos;m a new user
        </button>
      </div>

      {/* Bottom-of-screen "Why not ChatGPT?" link */}
      <button
        onClick={() => setWhyOpen(true)}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 text-[12.5px] font-medium text-white/70 hover:text-white drop-shadow-md transition-colors inline-flex items-center gap-1.5"
      >
        <span className="opacity-70">·</span> Why not ChatGPT?
      </button>

      {/* Comparison modal */}
      {whyOpen && <WhyNotChatGPT onClose={() => setWhyOpen(false)} />}

      {/* Hidden GIS button — mounted off-screen so the script + button
          are present in the DOM. Both CTAs click this. */}
      <div
        ref={googleBtnRef}
        aria-hidden="true"
        style={{ position: 'absolute', left: -99999, top: 0, width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none' }}
      />
    </div>
  );
}

// ===== Why not ChatGPT? =====
//
// Full-screen glass overlay. Side-by-side comparison: RushilAI does
// these things; ChatGPT structurally cannot. Tap anywhere on the
// backdrop or the X to close.
function WhyNotChatGPT({ onClose }) {
  // Lock background scroll while open + escape-to-close.
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
          <Row
            icon={<BookOpen size={15} />}
            title="It builds the course for you"
            us="Type a topic and get a real course back — units, lessons, quizzes, even a midterm and final. Takes a few seconds."
            them="Spits out a wall of text. You'd have to organize it into a course on your own."
          />
          <Row
            icon={<Repeat size={15} />}
            title="It remembers what you missed"
            us="When you get something wrong on a quiz, it shows up again on the next one. The final quiz hits all your weak spots."
            them="Forgets everything the second the chat ends."
          />
          <Row
            icon={<Brain size={15} />}
            title="It picks up where you left off"
            us="Your courses, lessons, streaks — all saved. Open it next week and just keep going."
            them="Every chat starts from scratch. You're the one keeping track of where you are."
          />
          <Row
            icon={<PenTool size={15} />}
            title="It grades your math, not just your answer"
            us="Solve on a real canvas. We read your work line by line and tell you where you slipped."
            them="Just gives you the answer. If you got the wrong number, you won't know why."
          />
          <Row
            icon={<Zap size={15} />}
            title="You can play your friends"
            us="Head-to-head Quiz Bowl with a real buzzer. Pyramidal tossups, real packets, real scoreboard."
            them="Can't do this. It's one person, one chat box."
          />
          <Row
            icon={<Cpu size={15} />}
            title="Built for school"
            us="Made for studying first. We use whichever AI is best right now — Gemini, Claude, GPT, whoever."
            them="One model, one chat box. That's the whole app."
          />
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
    <div className="absolute top-3 right-5 z-20 flex items-center gap-3 text-[12.5px] font-medium text-white/90 tabular-nums tracking-tight drop-shadow-md">
      <span>{date}</span>
      <span>{time}</span>
    </div>
  );
}
