import { ArrowRight, BookOpen, Brain, Zap, Lightbulb, Sparkles, Shield, Cpu, PenTool } from 'lucide-react';

// Mobile-native marketing landing page. Vertical, finger-friendly,
// gradient-heavy, single-column. Mirrors the desktop /landing copy
// hierarchy (one-click curriculum) but with mobile-first sizing.
//
// Used inside the admin Mobile Preview app via a "Landing" toggle so
// the team can QA the signed-out experience without a real signed-out
// session.
export default function MobileLanding({ onSignIn }) {
  return (
    <div className="relative h-full w-full overflow-y-auto bg-[#F4F5F7] dark:bg-[#0a0a14] text-gray-900 dark:text-white">
      {/* Atmospheric glow — dark mode only; light mode keeps a clean
          surface so the page doesn't look smeared. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden hidden dark:block">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-40 blur-[100px]"
             style={{ background: 'radial-gradient(closest-side, #4f46e5 0%, transparent 70%)' }} />
        <div className="absolute top-20 -right-24 w-[300px] h-[300px] rounded-full opacity-30 blur-[80px]"
             style={{ background: 'radial-gradient(closest-side, #d946ef 0%, transparent 70%)' }} />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-5 pt-10 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center">
            <BookOpen size={15} className="text-white" strokeWidth={2.4} />
          </div>
          <span className="font-bold text-[15px] tracking-tight text-gray-900 dark:text-white">RushilAI</span>
        </div>
        <button
          onClick={onSignIn}
          className="px-3.5 py-1.5 rounded-full bg-blue-600 active:bg-blue-700 text-white text-[12px] font-semibold inline-flex items-center gap-1"
        >
          Sign in <ArrowRight size={11} />
        </button>
      </header>

      {/* Hero */}
      <section className="relative z-10 px-5 pt-12 pb-10 text-center">
        <h1 className="text-[36px] leading-[1] font-bold tracking-[-0.04em] text-gray-900 dark:text-white mb-4">
          Type a topic.{' '}
          <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">
            Get a curriculum
          </span>{' '}
          in one click.
        </h1>
        <p className="text-[14px] leading-relaxed text-gray-600 dark:text-gray-300 max-w-[300px] mx-auto mb-6">
          Not a chatbot. A real course that teaches itself to you, one block at a time.
        </p>
        <button
          onClick={onSignIn}
          className="w-full max-w-[280px] mx-auto py-3.5 rounded-full bg-blue-600 active:bg-blue-700 text-white text-[14.5px] font-bold inline-flex items-center justify-center gap-2"
        >
          Start free with Google <ArrowRight size={14} />
        </button>
        <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-3">Free tier · no credit card</p>
      </section>

      {/* Stats strip */}
      <section className="relative z-10 px-5 pb-10">
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] grid grid-cols-2 gap-3 p-4">
          <Stat n="8" label="blocks per lesson" />
          <Stat n="∞" label="Quiz Bowl tossups" />
          <Stat n="SRS" label="every quiz" />
          <Stat n="2-way" label="multiplayer" />
        </div>
      </section>

      {/* How it works — 3 steps stacked */}
      <section className="relative z-10 px-5 pb-12">
        <div className="text-center mb-6">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300 mb-1">The flow</p>
          <h2 className="text-[22px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white">Build → Learn → Master.</h2>
        </div>
        <div className="space-y-3">
          <Step n="01" title="Build" body="Units, lessons, quizzes, midterm + final — generated in seconds." />
          <Step n="02" title="Learn" body="Each lesson runs 4 readings + 4 quizzes with spaced repetition." />
          <Step n="03" title="Master" body="Quiz Bowl on real packets, math canvas that grades your steps." />
        </div>
      </section>

      {/* Why us */}
      <section className="relative z-10 px-5 pb-12">
        <div className="text-center mb-6">
          <h2 className="text-[22px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white">Not another AI wrapper.</h2>
        </div>
        <div className="space-y-2.5">
          <DiffRow icon={<Brain size={15} />}    title="Remembers you"        body="Weak spots and progress persist across sessions." />
          <DiffRow icon={<BookOpen size={15} />} title="Real course structure" body="Editable units + lessons. Not a chat log." />
          <DiffRow icon={<Zap size={15} />}      title="Live multiplayer"      body="Head-to-head Quiz Bowl with real-time buzz-in." />
          <DiffRow icon={<PenTool size={15} />}  title="Step-graded math"      body="Solve on a canvas. Working graded line by line." />
          <DiffRow icon={<Cpu size={15} />}      title="Model-agnostic"        body="Frontier models swapped in as they ship." />
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 px-5 pb-10 text-center">
        <h2 className="text-[22px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white mb-4">Start your first course.</h2>
        <button
          onClick={onSignIn}
          className="w-full max-w-[280px] mx-auto py-3.5 rounded-full bg-blue-600 active:bg-blue-700 text-white text-[14.5px] font-bold inline-flex items-center justify-center gap-2"
        >
          Sign in with Google <ArrowRight size={14} />
        </button>
      </section>

      {/* Integrity tease */}
      <section className="relative z-10 px-5 pb-10">
        <div className="rounded-2xl bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] p-4 text-center">
          <Shield size={16} className="text-blue-500 dark:text-blue-300 mx-auto mb-2" />
          <p className="text-[11.5px] text-gray-600 dark:text-gray-300 leading-relaxed">
            We trust you to use RushilAI honestly. Compliance with your school&apos;s honor code is your responsibility.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-5 pb-10 text-center">
        <p className="text-[10px] text-gray-500 dark:text-gray-500">© {new Date().getFullYear()} RushilAI</p>
      </footer>
    </div>
  );
}

// ===== bits =====

function Stat({ n, label }) {
  return (
    <div className="text-center">
      <div className="text-[24px] font-bold leading-none bg-gradient-to-br from-blue-500 to-indigo-500 bg-clip-text text-transparent mb-1">{n}</div>
      <div className="text-[10.5px] font-semibold text-gray-700 dark:text-gray-300">{label}</div>
    </div>
  );
}

function Step({ n, title, body }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-4">
      <div className="flex items-center gap-3 mb-1.5">
        <span className="font-mono text-[10.5px] font-bold tracking-[0.2em] text-blue-600 dark:text-blue-300">{n}</span>
        <span className="h-px flex-1 bg-gradient-to-r from-blue-500/30 to-transparent" />
      </div>
      <h3 className="text-[14.5px] font-bold tracking-tight text-gray-900 dark:text-white mb-1">{title}</h3>
      <p className="text-[12px] leading-relaxed text-gray-600 dark:text-gray-400">{body}</p>
    </div>
  );
}

function DiffRow({ icon, title, body }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-3">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-white grid place-items-center shrink-0">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-[13px] font-bold tracking-tight text-gray-900 dark:text-white">{title}</p>
        <p className="text-[11.5px] leading-relaxed text-gray-600 dark:text-gray-400 mt-0.5">{body}</p>
      </div>
    </div>
  );
}
