import { useState, useMemo } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import MathText from '../shared/MathText';

// Fill-in-the-blank block. Block shape:
//   { type: 'fill-blank', title, instructions, sentences: [
//       { before: 'The capital of France is ', answer: 'Paris', after: '.', hint: 'Eiffel Tower city' }
//   ] }
//
// Each sentence renders as a prose line with an inline input where the
// blank should be. Student types the answer; case-insensitive +
// whitespace-tolerant matching. After "Check", correct blanks lock
// green, wrong ones turn rose with the right answer revealed under them.
// Block completes when the student clicks Continue after checking.
export default function FillBlankBlock({ block, onComplete }) {
  const sentences = Array.isArray(block.sentences)
    ? block.sentences.filter(s => s?.answer)
    : [];

  const [answers, setAnswers] = useState(() => sentences.map(() => ''));
  const [checked, setChecked] = useState(false);

  const results = useMemo(() => {
    if (!checked) return sentences.map(() => null);
    return sentences.map((s, i) => normalize(answers[i]) === normalize(s.answer));
  }, [checked, answers, sentences]);

  const correctCount = results.filter(Boolean).length;
  const score = sentences.length ? Math.round((correctCount / sentences.length) * 100) : 0;
  const allAttempted = answers.every(a => a.trim().length > 0);

  function setAnswer(i, value) {
    if (checked) return;
    setAnswers(prev => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  }

  function handleCheck(e) {
    e?.preventDefault?.();
    if (!allAttempted) return;
    setChecked(true);
  }

  function handleRetry() {
    setChecked(false);
    setAnswers(sentences.map((s, i) => results[i] ? answers[i] : ''));
  }

  if (sentences.length === 0) {
    return (
      <div className="cl-anim-in border-t border-white/[0.07] pt-7 text-center text-white/45">
        <p>This fill-in-the-blank block has no sentences to render.</p>
        <button
          onClick={onComplete}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-semibold transition-colors"
        >
          Skip <ArrowRight size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="cl-anim-in">
      <div className="border-t border-white/[0.07] pt-7 lg:pt-9 mb-6">
        <div className="mx-auto max-w-[68ch]">
          <MathText as="h2" className="text-[22px] font-semibold text-white mb-2">{block.title || 'Fill in the blanks'}</MathText>
          <MathText as="p" className="text-[13px] text-white/55 mb-5 leading-relaxed">
            {block.instructions || 'Type the missing word or phrase in each blank, then check your work.'}
          </MathText>

          <form onSubmit={handleCheck} className="space-y-4">
            {sentences.map((s, i) => {
              const correct = results[i];
              const inputBase = 'inline-block mx-1 align-baseline rounded-md border px-2 py-0.5 text-[14px] font-medium outline-none transition-colors';
              const inputCls = checked
                ? (correct
                    ? 'border-emerald-400/45 bg-emerald-500/10 text-emerald-100'
                    : 'border-rose-400/45 bg-rose-500/10 text-rose-100')
                : 'border-blue-400/30 bg-blue-500/[0.06] text-white/95 focus:border-blue-400/65 focus:bg-blue-500/[0.10]';
              // Auto-size by the longer of answer length and current input
              const widthCh = Math.max(6, Math.min(28, (s.answer?.length || 6) + 2));
              return (
                <div key={i} className="leading-[2]">
                  <MathText as="span" className="text-[15px] text-white/85">{s.before || ''}</MathText>
                  <input
                    type="text"
                    value={answers[i]}
                    onChange={e => setAnswer(i, e.target.value)}
                    disabled={checked}
                    className={`${inputBase} ${inputCls}`}
                    style={{ width: `${widthCh}ch` }}
                    placeholder="…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <MathText as="span" className="text-[15px] text-white/85">{s.after || ''}</MathText>
                  {checked && (
                    <div className="mt-1 ml-1 text-[11.5px] inline-flex items-center gap-1.5">
                      {correct ? (
                        <span className="inline-flex items-center gap-1 text-emerald-300">
                          <Check size={11} /> Correct
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-300">
                          <X size={11} /> Answer: <MathText as="span" className="text-emerald-200 font-medium">{s.answer}</MathText>
                        </span>
                      )}
                    </div>
                  )}
                  {!checked && s.hint && (
                    <p className="text-[11px] text-white/35 mt-0.5 ml-1 italic">Hint: <MathText as="span">{s.hint}</MathText></p>
                  )}
                </div>
              );
            })}

            {!checked && (
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={!allAttempted}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Check answers
                </button>
              </div>
            )}
          </form>

          {checked && (
            <div className="mt-5 flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
              <div className="text-[13px] text-white/80">
                <span className="font-semibold text-white">{correctCount}</span>
                <span className="text-white/45"> / {sentences.length} correct</span>
                <span className="ml-3 font-mono tabular-nums text-blue-300">{score}%</span>
              </div>
              {correctCount < sentences.length && (
                <button
                  onClick={handleRetry}
                  className="text-[11px] text-blue-300 hover:text-blue-200 font-medium"
                >
                  Retry wrong ones
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end items-center gap-3 border-t border-white/[0.05] pt-5">
        <button
          onClick={onComplete}
          disabled={!checked}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

// Normalise an answer for forgiving comparison - case-insensitive,
// whitespace-collapsed, punctuation-stripped. Matches anything
// reasonable: "Paris", "paris", "PARIS", " Paris " all equate.
function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip diacritics
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
