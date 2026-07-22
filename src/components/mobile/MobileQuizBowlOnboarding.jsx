import { useState } from 'react';
import { Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { syncData } from '../../api/auth';

const CATEGORIES = ['Science', 'History', 'Literature', 'Geography', 'Math', 'Art', 'Music', 'Philosophy', 'Pop Culture', 'Mixed'];
const DIFFICULTIES = [
  { id: 'Easy', label: 'Easy' },
  { id: 'Medium', label: 'Medium' },
  { id: 'Hard', label: 'Hard' },
  { id: 'Tournament', label: 'Tournament' },
];

// Mobile follows the desktop setup-assistant rhythm, but every decision is
// about the player's first AI-generated custom Quiz Bowl set.
export default function MobileQuizBowlOnboarding() {
  const { user, fetchUser } = useAuth();
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState('Mixed');
  const [difficulty, setDifficulty] = useState('Medium');
  const [customInstructions, setCustomInstructions] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const firstName = (user?.name || user?.email || 'there').split(/[\s@]/)[0];

  async function generateSet() {
    setSaving(true);
    setError('');
    const setup = { category, difficulty, customInstructions: customInstructions.trim(), questionCount, source: 'ai', autoStart: true };
    try {
      await syncData({
        preferences: {
          ...(user?.data?.preferences || {}),
          onboarded: true,
          useCase: 'quizbowl',
          tourStep: null,
          quizBowlOnboarding: setup,
        },
      });
      sessionStorage.setItem('postOnboardOpen', 'quizbowl');
      sessionStorage.setItem('mobileQuizBowlInitialSetup', JSON.stringify(setup));
      await fetchUser();
    } catch (err) {
      console.error('Failed to save mobile Quiz Bowl onboarding:', err);
      setError('Your set could not be prepared. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="mobile-accent-scope min-h-dvh bg-[#0a0a14] text-white" style={{ '--app-accent': '#3b82f6', '--app-accent-contrast': '#ffffff' }}>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-[calc(20px+env(safe-area-inset-top,0px))]">
        <Progress step={step} />
        <main className={`min-h-0 flex flex-1 flex-col overflow-y-auto py-7 ${step === 0 ? 'justify-center' : 'justify-start'}`}>
          {step === 0 && <Welcome firstName={firstName} />}
          {step === 1 && <SetBasics category={category} difficulty={difficulty} onCategory={setCategory} onDifficulty={setDifficulty} />}
          {step === 2 && <CustomSet customInstructions={customInstructions} questionCount={questionCount} onInstructions={setCustomInstructions} onQuestionCount={setQuestionCount} />}
        </main>
        {error && <p role="alert" className="mb-3 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-center text-[12px] text-rose-200">{error}</p>}
        <div className="flex items-center gap-3 pt-4">
          {step > 0 && <button type="button" onClick={() => setStep((current) => current - 1)} disabled={saving} className="h-12 shrink-0 rounded-2xl border border-white/[0.10] bg-white/[0.04] px-4 text-[14px] font-semibold text-white/70 transition-colors active:bg-white/[0.09] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]/70">Back</button>}
          <button type="button" onClick={step === 2 ? generateSet : () => setStep((current) => current + 1)} disabled={saving} className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-blue-500 px-5 text-[14px] font-bold text-white transition-colors active:bg-blue-400 disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a14]">
            {saving ? 'Opening your set…' : step === 2 ? 'Generate custom set' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Progress({ step }) {
  return <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of 3`}>{[0, 1, 2].map((index) => <span key={index} className={`h-1 rounded-full transition-all duration-200 ${index === step ? 'w-8 bg-[#60a5fa]' : index < step ? 'w-2 bg-[#60a5fa]/65' : 'w-2 bg-white/15'}`} />)}</div>;
}

function Welcome({ firstName }) {
  return <section className="animate-fade-up text-center"><h1 className="bg-gradient-to-br from-white via-blue-100 to-blue-300 bg-clip-text text-[54px] font-bold italic leading-[0.92] tracking-[-0.05em] text-transparent">hello</h1><p className="mt-5 text-[16px] text-white/80">Welcome{firstName !== 'there' ? `, ${firstName}` : ''}.</p></section>;
}

function SetBasics({ category, difficulty, onCategory, onDifficulty }) {
  return <section className="animate-fade-up"><StepHeader title="Build your first set." /><p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Category</p><div className="grid grid-cols-2 gap-2">{CATEGORIES.map((item) => <Choice key={item} selected={category === item} onClick={() => onCategory(item)}>{item}</Choice>)}</div><p className="mb-2.5 mt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Difficulty</p><div className="space-y-2">{DIFFICULTIES.map((item) => <button key={item.id} type="button" onClick={() => onDifficulty(item.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]/70 ${difficulty === item.id ? 'border-[#60a5fa]/55 bg-[#3b82f6]/15' : 'border-white/[0.07] bg-white/[0.025] active:bg-white/[0.06]'}`}><SelectionMark selected={difficulty === item.id} /><span className="text-[13px] font-bold text-white/90">{item.label}</span></button>)}</div></section>;
}

function CustomSet({ customInstructions, questionCount, onInstructions, onQuestionCount }) {
  return <section className="animate-fade-up"><StepHeader title="Make it yours." /><label htmlFor="custom-set-focus" className="mb-2.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Custom focus <span className="normal-case tracking-normal text-white/20">optional</span></label><textarea id="custom-set-focus" value={customInstructions} onChange={(event) => onInstructions(event.target.value)} rows={4} placeholder="e.g. Focus on Renaissance art and early modern Europe" className="w-full resize-none rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3 text-[13px] leading-relaxed text-white/85 placeholder:text-white/25 outline-none transition-colors focus:border-[#60a5fa]/55 focus:ring-2 focus:ring-[#3b82f6]/20" /><div className="mt-6 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Questions</p><div className="flex items-center rounded-xl border border-white/[0.08] bg-white/[0.04] p-1">{[5, 10, 15].map((count) => <button key={count} type="button" onClick={() => onQuestionCount(count)} className={`min-h-9 min-w-10 rounded-lg px-2 text-[12px] font-bold transition-colors ${questionCount === count ? 'bg-blue-500 text-white' : 'text-white/40 active:bg-white/[0.07]'}`}>{count}</button>)}</div></div></section>;
}

function StepHeader({ title }) { return <div className="mb-7"><h1 className="text-[30px] font-bold leading-tight tracking-[-0.03em] text-white">{title}</h1></div>; }
function SelectionMark({ selected }) { return <span className={`grid h-5 w-5 place-items-center rounded-full border ${selected ? 'border-blue-200 bg-blue-500 text-white' : 'border-white/20 text-transparent'}`}><Check size={13} strokeWidth={3} /></span>; }
function Choice({ selected, onClick, children }) { return <button type="button" onClick={onClick} className={`min-h-11 rounded-xl border px-3 py-2 text-left text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]/70 ${selected ? 'border-[#60a5fa]/55 bg-[#3b82f6]/15 text-[#dbeafe]' : 'border-white/[0.07] bg-white/[0.025] text-white/55 active:bg-white/[0.06]'}`}>{children}</button>; }
