import { ArrowRight, ListChecks } from 'lucide-react';

// Concept recap. Tight bullet-point summary of what's been covered so
// far — used by the AI after a confusing reading or before moving on
// to a harder section. No quiz, just a "got it" continue.
//
// Block shape:
//   { type: 'recap', title, bullets: string[] }
export default function RecapBlock({ block, onComplete, hideContinue = false, continueLabel = 'Got it' }) {
  const bullets = Array.isArray(block.bullets) ? block.bullets : [];

  return (
    <div className="cl-anim-in">
      <div className="border-t border-emerald-300/[0.18] pt-7 lg:pt-9 mb-6">
        <div className="mx-auto max-w-[68ch]">
          {/* Type chip */}
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200/85 bg-emerald-400/[0.10] border border-emerald-300/[0.22] rounded-full px-2.5 py-0.5">
              <ListChecks size={10} strokeWidth={2.4} /> Concept Recap
            </span>
          </div>

          <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-white mb-5">
            {block.title || 'Quick recap'}
          </h2>

          <ul className="space-y-3">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="grid place-items-center w-5 h-5 rounded-full bg-emerald-400/[0.18] text-emerald-200 text-[10px] font-bold flex-shrink-0 mt-0.5 tabular-nums">
                  {i + 1}
                </span>
                <span className="text-[15px] text-white/82 leading-[1.65]">{b}</span>
              </li>
            ))}
            {bullets.length === 0 && (
              <li className="text-[13px] text-white/40 italic">Nothing summarised yet.</li>
            )}
          </ul>
        </div>
      </div>

      {!hideContinue && (
        <div className="flex justify-end border-t border-white/[0.05] pt-5">
          <button
            onClick={onComplete}
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-[14px] text-white bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 border border-emerald-400/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_6px_18px_rgba(16,185,129,0.40)] transition-all"
          >
            {continueLabel} <ArrowRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
