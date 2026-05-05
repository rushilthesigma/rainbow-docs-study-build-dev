import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { googleLogin } from '../api/auth';
import { useEffect, useRef, useState } from 'react';
import {
  BookOpen, Shield, Brain, Zap, PenTool, Cpu, Loader2 as Loader, ArrowRight,
} from 'lucide-react';
import MiniOS from '../components/landing/MiniOS';

export default function LandingPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
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
            theme: 'outline',
            size: 'large',
            width: 300,
            text: 'continue_with',
            shape: 'pill',
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

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#F4F5F7] dark:bg-[#0c0c16]">
      {/* ============================================================
          Atmospheric backdrop — two soft radial glows in the upper half
          only. Dark mode only. Bottom of the page stays clean so cards
          and copy don't disappear into a haze.
          ============================================================ */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 hidden dark:block">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1100px] h-[700px] rounded-full opacity-15 blur-[120px]"
             style={{ background: 'radial-gradient(closest-side, #4f46e5 0%, transparent 70%)' }} />
        <div className="absolute top-[20%] -right-40 w-[600px] h-[600px] rounded-full opacity-10 blur-[120px]"
             style={{ background: 'radial-gradient(closest-side, #06b6d4 0%, transparent 70%)' }} />
      </div>

      {/* ============================================================
          Top nav — translucent glass with a subtle border glow.
          ============================================================ */}
      <header className="relative z-40 sticky top-0 px-6 py-3 border-b border-gray-200/70 dark:border-white/10 bg-white/80 dark:bg-[#0c0c16]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto w-full flex items-center gap-4">
          <a href="#top" className="flex items-center gap-2.5 group" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center group-hover:scale-105 transition-transform">
              <BookOpen size={17} className="text-white" strokeWidth={2.4} />
            </div>
            <span className="font-bold text-[16px] tracking-tight text-gray-900 dark:text-white">RushilAI</span>
          </a>
          <nav className="hidden md:flex items-center gap-1 ml-6">
            <NavLink href="#demo">Live demo</NavLink>
            <NavLink href="#how">How it works</NavLink>
            <NavLink href="#why">Why us</NavLink>
            <NavLink href="#integrity">Academic use</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="https://discord.gg/UetMmE8SkS"
              target="_blank"
              rel="noopener noreferrer"
              title="Join the RushilAI Discord"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-indigo-600 dark:text-indigo-300 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors text-[12px] font-medium"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M13.545 2.907a13.227 13.227 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.19 12.19 0 0 0-3.658 0 8.258 8.258 0 0 0-.412-.833.051.051 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.041.041 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032c.001.014.01.028.021.037a13.276 13.276 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019c.308-.42.582-.863.818-1.329a.05.05 0 0 0-.01-.059.051.051 0 0 0-.018-.011 8.875 8.875 0 0 1-1.248-.595.05.05 0 0 1-.02-.066.051.051 0 0 1 .015-.019c.084-.063.168-.129.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.052.052 0 0 1 .053.007c.08.066.164.132.248.195a.051.051 0 0 1-.004.085 8.254 8.254 0 0 1-1.249.594.05.05 0 0 0-.03.03.052.052 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.235 13.235 0 0 0 4.001-2.02.049.049 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.034.034 0 0 0-.02-.019Zm-8.198 7.307c-.789 0-1.438-.724-1.438-1.612 0-.889.637-1.613 1.438-1.613.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612Zm5.316 0c-.788 0-1.438-.724-1.438-1.612 0-.889.637-1.613 1.438-1.613.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612Z" />
              </svg>
              <span>Discord</span>
            </a>
            <button
              onClick={triggerGoogle}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors text-[12.5px] font-semibold"
            >
              {loading ? <><Loader size={12} className="animate-spin" /> Signing in…</> : <>Sign in <ArrowRight size={12} /></>}
            </button>
          </div>
        </div>
      </header>

      {/* Hidden Google sign-in button — wired through the header CTA. */}
      <div ref={googleBtnRef} aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 0, visibility: 'hidden' }} />

      {/* ============================================================
          HERO — bold headline, gradient flourish, twin CTAs.
          ============================================================ */}
      <section id="top" className="relative z-10 px-6 pt-16 md:pt-24 pb-12">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-[40px] sm:text-[56px] md:text-[72px] leading-[0.98] font-bold tracking-[-0.04em] text-gray-900 dark:text-white mb-5">
            Type a topic.{' '}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">Get a curriculum</span>
              <svg className="absolute -bottom-2 left-0 w-full" height="10" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0,5 Q50,0 100,5 T200,5" fill="none" stroke="url(#hl)" strokeWidth="3" strokeLinecap="round" />
                <defs><linearGradient id="hl" x1="0" x2="1"><stop offset="0" stopColor="#3b82f6" /><stop offset="1" stopColor="#d946ef" /></linearGradient></defs>
              </svg>
            </span>
            <br className="hidden sm:block" />
            in one click.
          </h1>

          <p className="text-[16px] md:text-[19px] leading-relaxed text-gray-600 dark:text-gray-300 max-w-xl mx-auto mb-8">
            Not a chatbot. A real course that teaches itself to you, one block at a time.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
            <button
              onClick={triggerGoogle}
              className="group inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-blue-600 text-white text-[14.5px] font-semibold hover:bg-blue-700 transition-colors"
            >
              {loading ? <><Loader size={15} className="animate-spin" /> Signing in…</> : <>Start free with Google <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" /></>}
            </button>
            <a
              href="#demo"
              onClick={(e) => { e.preventDefault(); document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' }); }}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-gray-300 dark:border-white/15 bg-white/80 dark:bg-white/5 backdrop-blur text-gray-700 dark:text-gray-200 text-[14.5px] font-semibold hover:bg-white dark:hover:bg-white/10 transition-colors"
            >
              Try the live demo
            </a>
          </div>

          <p className="text-[12px] text-gray-500 dark:text-gray-400">
            Free tier · no credit card · cancel anytime
          </p>
        </div>
      </section>

      {/* ============================================================
          STATS row — concrete numbers / signals before the demo.
          ============================================================ */}
      <section className="relative z-10 px-6 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-[#13131f] backdrop-blur-xl px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat n="8" label="blocks per lesson" sub="4 readings + 4 quizzes" />
            <Stat n="∞" label="Quiz Bowl tossups" sub="real packets via QBReader" />
            <Stat n="SRS" label="across every quiz" sub="targets actual misses" />
            <Stat n="2-way" label="multiplayer Quiz Bowl" sub="real-time SSE buzz-in" />
          </div>
        </div>
      </section>

      {/* ============================================================
          LIVE DEMO — MiniOS (the centerpiece).
          ============================================================ */}
      <section id="demo" className="relative z-10 px-6 pb-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600 dark:text-blue-400 mb-2">Live demo</p>
            <h2 className="text-[26px] md:text-[34px] leading-tight font-bold tracking-[-0.02em] text-gray-900 dark:text-white">
              Try it. No sign-up.
            </h2>
          </div>
          <MiniOS />
        </div>
      </section>

      {/* ============================================================
          HOW IT WORKS — 3-step flow.
          ============================================================ */}
      <section id="how" className="relative z-10 px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600 dark:text-blue-400 mb-2">The flow</p>
            <h2 className="text-[28px] md:text-[36px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white">
              Build → Learn → Master.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4 relative">
            <Step n="01" title="Build"
                  body="Units, lessons, quizzes, midterm + final. Generated in seconds, editable any time." />
            <Step n="02" title="Learn"
                  body="Each lesson runs 4 readings + 4 quizzes. The 3rd reading reviews 1 + 2; the final quiz drills what you missed." />
            <Step n="03" title="Master"
                  body="Quiz Bowl on real packets, a math canvas that grades your working, and exams that revisit course-wide misses." />
          </div>
        </div>
      </section>

      {/* ============================================================
          WHY US — proof points (renamed from "Not a wrapper").
          ============================================================ */}
      <section id="why" className="relative z-10 px-6 pb-20">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-3xl border border-gray-200 dark:border-white/10 bg-white/70 dark:bg-[#13131f] backdrop-blur-xl p-8 md:p-12 relative overflow-hidden">
            <div className="relative text-center max-w-2xl mx-auto mb-10">
              <h2 className="text-[28px] md:text-[36px] leading-tight font-bold tracking-[-0.02em] text-gray-900 dark:text-white">
                Not another AI wrapper.
              </h2>
            </div>

            <div className="relative grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <DiffCard icon={<Brain size={16} />} title="Remembers you"
                body="Weak spots and progress persist. Every turn starts with what you missed last time." />
              <DiffCard icon={<BookOpen size={16} />} title="Real course structure"
                body="Editable units + lessons + assessments. Not a chat log." />
              <DiffCard icon={<Zap size={16} />} title="Live multiplayer"
                body="Head-to-head Quiz Bowl with real-time buzz-in. A wrapper can&apos;t do this." />
              <DiffCard icon={<PenTool size={16} />} title="Step-graded math"
                body="Solve on a canvas. We grade your working line by line, not just the answer." />
              <DiffCard icon={<Cpu size={16} />} title="Model-agnostic"
                body="Frontier models are swapped in as they ship. The product stays the same." />
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          FINAL CTA — single short ask, no repeat copy.
          ============================================================ */}
      <section className="relative z-10 px-6 pb-20">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-[28px] md:text-[40px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white leading-tight mb-6">
            Start your first course.
          </h2>
          <button
            onClick={triggerGoogle}
            className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-blue-600 text-white text-[15px] font-bold hover:bg-blue-700 transition-colors"
          >
            {loading ? <><Loader size={16} className="animate-spin" /> Signing in…</> : <>Sign in with Google <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" /></>}
          </button>
        </div>
      </section>

      {/* ============================================================
          ACADEMIC INTEGRITY — full-width formal statement.
          ============================================================ */}
      <section id="integrity" className="relative z-10 px-6 pb-24">
        <div className="max-w-3xl mx-auto">
          {/* Header — centered emblem + title */}
          <div className="text-center mb-10">
            <div className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 mb-4">
              <Shield size={22} />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300 mb-2">Legal · policy</p>
            <h3 className="text-[26px] md:text-[32px] font-bold text-gray-900 dark:text-white tracking-[-0.02em] leading-tight">
              Academic Integrity
            </h3>
          </div>

          {/* Numbered cards — each paragraph stands on its own */}
          <div className="space-y-3">
            <IntegrityCard n="01" title="Our position">
              RushilAI is a learning platform. Our mission is to help students master difficult material, build lasting knowledge, and gain confidence in their coursework. We <strong className="text-gray-900 dark:text-white">do not endorse, encourage, or condone academic dishonesty</strong> in any form.
            </IntegrityCard>

            <IntegrityCard n="02" title="Trust by default">
              As a deliberate product choice, <strong className="text-gray-900 dark:text-white">we do not impose technical restrictions, content gates, or behavioral limits on how users engage with the platform.</strong> The most effective learning tools treat learners as adults capable of directing their own education — and we extend that trust by default.
            </IntegrityCard>

            <IntegrityCard n="03" title="Responsibility lives with you">
              By using RushilAI, you affirm that your use complies with the academic integrity policies, honor codes, exam regulations, and institutional rules that apply to you. <strong className="text-gray-900 dark:text-white">Any violation — including submitting AI output as original work or circumventing assessment policies — is the sole responsibility of the individual user who commits it.</strong>
            </IntegrityCard>

            <IntegrityCard n="04" title="What we don't do">
              RushilAI, its operators, and its affiliates accept no responsibility for how individuals choose to apply the platform in academic or professional settings. We do not monitor or approve student usage case-by-case, and make no representations that our output is appropriate for direct submission in any graded context.
            </IntegrityCard>
          </div>

          {/* Pull-quote */}
          <blockquote className="mt-8 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-6 md:p-7 text-center">
            <p className="text-[15px] md:text-[17px] leading-relaxed font-medium italic">
              Our work is to help you understand. What you choose to do with that understanding — and any consequences that follow — is entirely yours.
            </p>
          </blockquote>

          {/* Fine print */}
          <p className="mt-6 text-center text-[11.5px] text-gray-500 dark:text-gray-500 leading-relaxed">
            By creating an account or continuing to use RushilAI, you acknowledge you have read and agreed to this statement. Questions:{' '}
            <a href="mailto:rushilkelapure@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline">rushilkelapure@gmail.com</a>.
          </p>
        </div>
      </section>

      {/* ============================================================
          FOOTER
          ============================================================ */}
      <footer className="relative z-10 border-t border-gray-200 dark:border-white/10 px-6 py-8 bg-white/60 dark:bg-[#0c0c16]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto w-full flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center">
              <BookOpen size={11} className="text-white" strokeWidth={2.4} />
            </div>
            <span className="font-semibold text-gray-700 dark:text-gray-300">RushilAI</span>
          </div>
          <span className="hidden sm:inline text-gray-300 dark:text-white/20">·</span>
          <span>&copy; {new Date().getFullYear()}</span>
          <span className="hidden sm:inline text-gray-300 dark:text-white/20">·</span>
          <span>We do not sell your personal information.</span>
          <span className="hidden sm:inline text-gray-300 dark:text-white/20">·</span>
          <a href="#integrity" className="hover:text-gray-900 dark:hover:text-white transition-colors">Academic integrity</a>
          <span className="hidden sm:inline text-gray-300 dark:text-white/20">·</span>
          <a href="mailto:rushilkelapure@gmail.com" className="hover:text-gray-900 dark:hover:text-white transition-colors">rushilkelapure@gmail.com</a>
        </div>
      </footer>
    </div>
  );
}

// ===== Sub-components =====

function NavLink({ href, children }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        const el = document.querySelector(href);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }}
      className="px-3 py-1.5 rounded-full text-[13px] text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
    >
      {children}
    </a>
  );
}

function Stat({ n, label, sub }) {
  return (
    <div className="text-center md:text-left">
      <div className="text-[26px] md:text-[32px] font-bold tracking-tight bg-gradient-to-br from-blue-500 to-indigo-500 bg-clip-text text-transparent leading-none mb-1">{n}</div>
      <div className="text-[12px] font-semibold text-gray-700 dark:text-gray-200">{label}</div>
      <div className="text-[11px] text-gray-500 dark:text-gray-400">{sub}</div>
    </div>
  );
}

function Step({ n, title, body }) {
  return (
    <div className="group relative rounded-2xl border border-gray-200 dark:border-white/10 bg-white/70 dark:bg-[#13131f] backdrop-blur-xl p-6 hover:border-blue-400 dark:hover:border-blue-500/50 hover:-translate-y-0.5 transition-all">
      <div className="flex items-center gap-3 mb-3">
        <div className="font-mono text-[11px] font-bold tracking-[0.2em] text-blue-500 dark:text-blue-400">{n}</div>
        <div className="flex-1 h-px bg-gradient-to-r from-blue-500/40 to-transparent" />
      </div>
      <h3 className="text-[18px] font-bold text-gray-900 dark:text-white tracking-tight mb-2">{title}</h3>
      <p className="text-[13.5px] leading-relaxed text-gray-600 dark:text-gray-400">{body}</p>
    </div>
  );
}

function DiffCard({ icon, title, body }) {
  return (
    <div className="group rounded-xl border border-gray-200 dark:border-white/10 bg-white/70 dark:bg-[#161624] p-4 hover:border-blue-400 dark:hover:border-blue-500/50 hover:-translate-y-0.5 transition-all">
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="text-[13px] font-bold text-gray-900 dark:text-white mb-1 tracking-tight">{title}</h3>
      <p className="text-[11.5px] leading-relaxed text-gray-500 dark:text-gray-400">{body}</p>
    </div>
  );
}

function IntegrityCard({ n, title, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#13131f] p-5 md:p-6">
      <div className="flex items-center gap-3 mb-2">
        <span className="font-mono text-[10px] font-bold tracking-[0.22em] text-blue-500 dark:text-blue-300">{n}</span>
        <span className="h-px flex-1 bg-gradient-to-r from-blue-500/30 to-transparent" />
      </div>
      <h4 className="text-[15px] font-bold tracking-tight text-gray-900 dark:text-white mb-2">{title}</h4>
      <p className="text-[13.5px] leading-relaxed text-gray-600 dark:text-gray-300">{children}</p>
    </div>
  );
}

