import { useState, useMemo } from 'react';
import { ArrowRight, Check, RotateCcw } from 'lucide-react';

// Matching game block. Block shape:
//   { type: 'matching', title, instructions, pairs: [{ term, definition }] }
//
// Two-column layout. Click a term, then click a definition - if they
// match, both cards lock in. Mismatches flash and clear. Block completes
// when every pair is correctly matched.
export default function MatchingBlock({ block, onComplete }) {
  const pairs = Array.isArray(block.pairs) ? block.pairs.filter(p => p?.term && p?.definition) : [];

  // Stable shuffled definitions so re-renders don't reshuffle the
  // already-paired ones. Seed with the block's identity so navigating
  // away and back doesn't shuffle either.
  const shuffledDefs = useMemo(() => {
    const arr = pairs.map((p, i) => ({ ...p, defIdx: i }));
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  const [selectedTerm, setSelectedTerm] = useState(null);   // index into pairs
  const [selectedDef, setSelectedDef] = useState(null);     // defIdx
  const [matched, setMatched] = useState(new Set());        // set of defIdx that are locked
  const [wrong, setWrong] = useState(null);                 // { termIdx, defIdx } briefly shown then cleared
  const [attempts, setAttempts] = useState(0);

  function attemptPair(termIdx, defIdx) {
    setAttempts(a => a + 1);
    if (termIdx === defIdx) {
      setMatched(prev => {
        const next = new Set(prev);
        next.add(defIdx);
        return next;
      });
      setSelectedTerm(null);
      setSelectedDef(null);
    } else {
      setWrong({ termIdx, defIdx });
      setTimeout(() => {
        setWrong(null);
        setSelectedTerm(null);
        setSelectedDef(null);
      }, 600);
    }
  }

  function pickTerm(i) {
    if (matched.has(i)) return;
    if (selectedDef !== null) attemptPair(i, selectedDef);
    else setSelectedTerm(prev => (prev === i ? null : i));
  }

  function pickDef(defIdx) {
    if (matched.has(defIdx)) return;
    if (selectedTerm !== null) attemptPair(selectedTerm, defIdx);
    else setSelectedDef(prev => (prev === defIdx ? null : defIdx));
  }

  function reset() {
    setMatched(new Set());
    setSelectedTerm(null);
    setSelectedDef(null);
    setWrong(null);
    setAttempts(0);
  }

  const allMatched = matched.size === pairs.length && pairs.length > 0;
  const accuracy = attempts > 0 ? Math.round((pairs.length / attempts) * 100) : 100;

  if (pairs.length === 0) {
    return (
      <div className="cl-anim-in border-t border-white/[0.07] pt-7 text-center text-white/45">
        <p>This matching block has no pairs to render.</p>
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
          <h2 className="text-[22px] font-semibold text-white mb-2">{block.title || 'Match the pairs'}</h2>
          <p className="text-[13px] text-white/55 mb-5 leading-relaxed">
            {block.instructions || 'Click a term, then click its matching definition. Wrong pairs flash and reset.'}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* TERMS column */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40 mb-1">Terms</p>
              {pairs.map((p, i) => {
                const isMatched = matched.has(i);
                const isSelected = selectedTerm === i;
                const isWrong = wrong?.termIdx === i;
                return (
                  <button
                    key={`t-${i}`}
                    onClick={() => pickTerm(i)}
                    disabled={isMatched}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 text-[13.5px] transition-colors ${
                      isMatched
                        ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-100/85 cursor-default'
                        : isWrong
                          ? 'bg-rose-500/15 border-rose-400/50 text-rose-100 animate-pulse'
                          : isSelected
                            ? 'bg-blue-500/20 border-blue-400/55 text-white'
                            : 'bg-white/[0.03] border-white/[0.08] text-white/85 hover:bg-white/[0.07] hover:border-white/[0.18]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isMatched && <Check size={12} className="text-emerald-300 flex-shrink-0" />}
                      <span className="font-medium">{p.term}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* DEFINITIONS column (shuffled) */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40 mb-1">Definitions</p>
              {shuffledDefs.map(({ definition, defIdx }) => {
                const isMatched = matched.has(defIdx);
                const isSelected = selectedDef === defIdx;
                const isWrong = wrong?.defIdx === defIdx;
                return (
                  <button
                    key={`d-${defIdx}`}
                    onClick={() => pickDef(defIdx)}
                    disabled={isMatched}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 text-[13px] leading-snug transition-colors ${
                      isMatched
                        ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-100/85 cursor-default'
                        : isWrong
                          ? 'bg-rose-500/15 border-rose-400/50 text-rose-100 animate-pulse'
                          : isSelected
                            ? 'bg-blue-500/20 border-blue-400/55 text-white'
                            : 'bg-white/[0.03] border-white/[0.08] text-white/80 hover:bg-white/[0.07] hover:border-white/[0.18]'
                    }`}
                  >
                    {definition}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status row */}
          <div className="flex items-center justify-between mt-5 text-[11px] text-white/50">
            <span>
              <span className="text-white/80 font-semibold tabular-nums">{matched.size}</span>
              <span className="text-white/35"> / {pairs.length} matched</span>
              {attempts > 0 && (
                <span className="ml-3 text-white/35">· {attempts} attempts ({accuracy}% accuracy)</span>
              )}
            </span>
            {matched.size > 0 && !allMatched && (
              <button onClick={reset} className="inline-flex items-center gap-1 text-white/45 hover:text-white/70 transition-colors">
                <RotateCcw size={11} /> Reset
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end items-center gap-3 border-t border-white/[0.05] pt-5">
        {allMatched && <span className="text-[12px] text-emerald-300 font-medium">All pairs matched.</span>}
        <button
          onClick={onComplete}
          disabled={!allMatched}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
