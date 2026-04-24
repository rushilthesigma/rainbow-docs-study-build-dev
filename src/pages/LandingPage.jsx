import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { googleLogin } from '../api/auth';
import { useEffect, useRef, useState } from 'react';
import {
  BookOpen, Sparkles, ClipboardCheck, Layers, Shield, MessageSquare, ScrollText,
  Brain, Zap, PenTool, RefreshCw, Cpu, Loader2 as Loader,
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
    } catch (err) {
      console.error('Login failed:', err);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F5F7] dark:bg-[#0D0D14]">
      {/* ========== Top nav ========== */}
      <header className="px-6 py-4 border-b border-gray-200 dark:border-[#2A2A40] bg-white/60 dark:bg-[#0f0f18]/60 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto w-full flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
              <BookOpen size={16} className="text-white" strokeWidth={2.25} />
            </div>
            <span className="font-semibold text-[15px] tracking-tight text-gray-900 dark:text-white">RushilAI</span>
          </div>
          <div className="hidden md:flex items-center gap-5 text-[13px] ml-6">
            <a href="#demo" className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Live demo</a>
            <a href="#not-a-wrapper" className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Why us</a>
            <a href="#integrity" className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Academic use</a>
          </div>
          <button
            onClick={() => {
              const btn = googleBtnRef.current?.querySelector('div[role=button], button');
              if (btn) btn.click();
              else if (window.google?.accounts?.id) window.google.accounts.id.prompt();
            }}
            className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors text-[12px] font-medium shadow-sm"
          >
            {loading ? <><Loader size={11} className="animate-spin" /> Signing in…</> : 'Sign in'}
          </button>
        </div>
      </header>

      {/* Google button is still required for auth to work — rendered
          off-screen so the "Sign in" link in the header can trigger it. */}
      <div
        ref={googleBtnRef}
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', top: 0, visibility: 'hidden' }}
      />

      {/* ================================================================= */}
      {/* MAIN TOP — Live mini-OS preview. Visitor sees the actual product, */}
      {/* types a topic, and watches the AI generate a real curriculum.     */}
      {/* ================================================================= */}
      <section id="demo" className="px-6 pt-2 pb-14">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-6">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-[#1a1a28] border border-gray-200 dark:border-[#2A2A40] text-[10px] font-semibold uppercase tracking-widest text-gray-700 dark:text-gray-200 mb-4">
              <Sparkles size={10} className="text-blue-500" /> Live preview — no sign in required
            </span>
            <h1 className="text-[32px] md:text-[48px] leading-[1.05] font-semibold tracking-[-0.02em] text-gray-900 dark:text-white mb-3">
              This is the actual product.
            </h1>
            <p className="text-[14px] md:text-[16px] leading-relaxed text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
              Generate a real curriculum, drill into any lesson, watch the AI tutor stream in. All live — same endpoints, same model. No canned data.
            </p>
          </div>
          <MiniOS />
        </div>
      </section>

      {/* ================================================================= */}
      {/* "Not a wrapper" — five proof points                               */}
      {/* ================================================================= */}
      <section id="not-a-wrapper" className="px-6 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-2xl bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] p-8 md:p-10">
            <div className="text-center max-w-2xl mx-auto mb-8">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-600 text-white text-[10px] font-semibold uppercase tracking-widest mb-4 shadow-sm">
                Not another AI wrapper
              </span>
              <h2 className="text-[26px] md:text-[34px] leading-tight font-semibold tracking-tight text-gray-900 dark:text-white mb-3">
                RushilAI isn&apos;t a chatbot with a coat of paint.
              </h2>
              <p className="text-[13.5px] leading-relaxed text-gray-600 dark:text-gray-400">
                Most &quot;AI study apps&quot; are a prompt and a text box. We built purpose-built surfaces, persistent state, and workflows that don&apos;t exist inside a raw model.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <DiffCard icon={<Brain size={16} />} title="Remembers you"
                body="Weak spots, completed lessons, progress persist. Each tutor turn starts with what you know and what you missed." />
              <DiffCard icon={<BookOpen size={16} />} title="Real curriculum structure"
                body="Courses as units + lessons + assessments — editable with natural language. Not a chat log." />
              <DiffCard icon={<Zap size={16} />} title="Live multiplayer"
                body="Head-to-head Quiz Bowl with real-time buzz-in over SSE. A wrapper physically cannot do this." />
              <DiffCard icon={<PenTool size={16} />} title="Handwriting + steps"
                body="Solve math on a real canvas. We grade your working step by step — not just the final answer." />
              <DiffCard icon={<Cpu size={16} />} title="Model-agnostic"
                body="We swap frontier models as better ones ship. The product doesn't change. The model is a component." />
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* Tiny "try it today" line — replaces the old huge sign-in card.    */}
      {/* Big CTA already lives in the header; this is a soft nudge.        */}
      {/* ================================================================= */}
      <section id="sign-in" className="px-6 pb-12">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-[13px] text-gray-500 dark:text-gray-400">
            Ready for the real thing?{' '}
            <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
               className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
              Try it today →
            </a>
          </p>
        </div>
      </section>

      {/* ================================================================= */}
      {/* Feature grid                                                      */}
      {/* ================================================================= */}
      <section id="how-it-works" className="px-6 pb-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">What&apos;s inside</p>
            <h2 className="text-[24px] md:text-[28px] font-semibold tracking-tight text-gray-900 dark:text-white">
              Every tool a serious student actually uses
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <FeatureCard icon={<BookOpen size={16} />} title="AI-built curricula"
              body="Generate a full course on any subject — units, lessons, progression — calibrated to your level." />
            <FeatureCard icon={<MessageSquare size={16} />} title="Source-backed tutoring"
              body="Ask anything. Answers stream live with inline citations from real sources you can click." />
            <FeatureCard icon={<ClipboardCheck size={16} />} title="Graded practice"
              body="Real quizzes and essay rubrics. Step-by-step feedback on math with a handwriting canvas." />
            <FeatureCard icon={<Layers size={16} />} title="Spaced repetition"
              body="Flashcard decks generated from your notes, reviewed on a schedule that beats cramming." />
            <FeatureCard icon={<ScrollText size={16} />} title="Cornell notes"
              body="AI drafts cues and summaries from your class notes so review is minutes, not hours." />
            <FeatureCard icon={<Sparkles size={16} />} title="Adaptive memory"
              body="Every session builds on the last. Your weak spots from last week are the first drill this week." />
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* Academic integrity — full-width PR-speak statement. Spans the     */}
      {/* whole page width so it reads as a formal legal/PR block.          */}
      {/* ================================================================= */}
      <section id="integrity" className="px-0 pb-20">
        <div className="w-full bg-white dark:bg-[#161622] border-y border-gray-200 dark:border-[#2A2A40] py-12 md:py-16">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Shield size={18} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">Legal / policy</p>
                <h3 className="text-[18px] md:text-[22px] font-semibold text-gray-900 dark:text-white tracking-tight">
                  RushilAI Academic Integrity Statement
                </h3>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-x-12 gap-y-6 text-[14px] leading-relaxed text-gray-600 dark:text-gray-300">
              <p className="md:col-span-2">
                RushilAI is a learning platform. Our mission is to help students master difficult material, build lasting knowledge, and gain confidence in their coursework. We <strong className="text-gray-900 dark:text-white">do not endorse, encourage, or condone academic dishonesty</strong> in any form, and nothing on this platform should be interpreted as an invitation to misuse it.
              </p>

              <p>
                RushilAI is built on a principle of trust. As a matter of deliberate product philosophy, <strong className="text-gray-900 dark:text-white">we do not impose technical restrictions, content gates, or behavioral limits on how users engage with the platform.</strong> We believe the most effective learning tools are the ones that treat learners as adults capable of directing their own education — and we extend that trust by default.
              </p>

              <p>
                In exchange for that openness, each user accepts a corresponding responsibility. By using RushilAI, you affirm that your use of the platform complies with the academic integrity policies, honor codes, exam regulations, and institutional rules that apply to you. <strong className="text-gray-900 dark:text-white">Any violation of those rules — including submitting AI-generated output as original work, circumventing assessment policies, or breaching any institution&apos;s honor code — is the sole and exclusive responsibility of the individual user who chooses to commit that violation.</strong>
              </p>

              <p>
                RushilAI, its operators, and its affiliates accept no responsibility for how individual users choose to apply the platform in academic or professional settings. We do not monitor, police, or approve student usage on a case-by-case basis, and we make no representations that our output is appropriate for direct submission in any graded context.
              </p>

              <p className="md:col-span-2 text-[15px] text-gray-700 dark:text-gray-200 border-l-4 border-blue-500 pl-4 italic">
                Our work is to help you understand. What you choose to do with that understanding — and any consequences that follow from your choices — is entirely yours.
              </p>

              <div className="md:col-span-2 pt-6 border-t border-gray-200 dark:border-[#2A2A40] text-[11px] text-gray-400 dark:text-gray-500">
                <p>
                  By creating an account or continuing to use RushilAI, you acknowledge that you have read and agreed to this statement. This statement may be updated; continued use after an update constitutes acceptance. Questions about this policy can be directed to <a href="mailto:rushilkelapure@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline">rushilkelapure@gmail.com</a>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== Footer ========== */}
      <footer className="border-t border-gray-200 dark:border-[#2A2A40] px-6 py-6 bg-white dark:bg-[#0f0f18]">
        <div className="max-w-6xl mx-auto w-full flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-gray-500 dark:text-gray-400">
          <span>&copy; {new Date().getFullYear()} RushilAI</span>
          <span className="hidden sm:inline text-gray-300 dark:text-gray-600">·</span>
          <span>We do not sell your personal information.</span>
          <span className="hidden sm:inline text-gray-300 dark:text-gray-600">·</span>
          <a href="#integrity" className="hover:text-gray-900 dark:hover:text-white transition-colors">Academic integrity</a>
          <span className="hidden sm:inline text-gray-300 dark:text-gray-600">·</span>
          <a href="mailto:rushilkelapure@gmail.com" className="hover:text-gray-900 dark:hover:text-white transition-colors">rushilkelapure@gmail.com</a>
        </div>
      </footer>
    </div>
  );
}

function DiffCard({ icon, title, body }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0f0f18] p-4 hover:border-blue-400 dark:hover:border-blue-600 transition-colors">
      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white mb-1 tracking-tight">{title}</h3>
      <p className="text-[11.5px] leading-relaxed text-gray-500 dark:text-gray-400">{body}</p>
    </div>
  );
}

function FeatureCard({ icon, title, body }) {
  return (
    <div className="rounded-xl bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] p-5 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-sm transition-all">
      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white mb-1 tracking-tight">{title}</h3>
      <p className="text-[12px] leading-relaxed text-gray-500 dark:text-gray-400">{body}</p>
    </div>
  );
}
