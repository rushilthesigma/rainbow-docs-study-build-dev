import { ArrowRight, ListChecks } from 'lucide-react';
import MathText from '../shared/MathText';

// Concept recap. Tight bullet-point summary of what's been covered so
// far - used by the AI after a confusing reading or before moving on
// to a harder section. No quiz, just a "got it" continue.
//
// Block shape:
//   { type: 'recap', title, bullets: string[] }
export default function RecapBlock({ block, onComplete, hideContinue = false, continueLabel = 'Got it' }) {
  const bullets = Array.isArray(block.bullets) ? block.bullets : [];

  return (
    <div className="cl-anim-in">
      <div className="border-t border-white/[0.07] pt-7 lg:pt-9 mb-6">
        <div className="mx-auto max-w-[68ch]">
          {/* Type chip */}
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200/85 bg-blue-400/[0.10] border border-blue-300/[0.22] rounded-full px-2.5 py-0.5">
              <ListChecks size={10} strokeWidth={2.4} /> Concept Recap
            </span>
          </div>

          <MathText as="h2" className="text-[22px] font-semibold tracking-[-0.01em] text-white mb-5">
            {block.title || 'Quick recap'}
          </MathText>

          <ul className="space-y-3">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="grid place-items-center w-5 h-5 rounded-full bg-blue-400/[0.18] text-blue-200 text-[10px] font-bold flex-shrink-0 mt-0.5 tabular-nums">
                  {i + 1}
                </span>
                <MathText as="span" className="text-[15px] text-white/82 leading-[1.65]">{b}</MathText>
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
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-[14px] text-white bg-blue-500 hover:bg-blue-400 transition-colors"
          >
            {continueLabel} <ArrowRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
