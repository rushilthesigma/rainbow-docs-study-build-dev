import { useMemo } from 'react';
import { Check, X, Zap, Minus } from 'lucide-react';

// Head-to-head "compare and contrast" for a finished match. Fed the compact
// `comparison` payload the server ships with `match_end`:
//   { players: [{ userId, name, isBot, finalScore }],
//     questions: [{ answer, totalWords, powerWordIndex, buzzes: [
//        { userId, name, buzzWord, correct, points, answer } ] }] }
//
// Theme-neutral on purpose (emerald = right, rose = wrong, amber = power) so it
// drops into both the desktop (blue) and mobile (amber) finished screens.
export default function MatchComparison({ comparison, myUserId }) {
  const players = comparison?.players || [];
  const questions = comparison?.questions || [];

  const stats = useMemo(() => {
    const map = {};
    for (const p of players) {
      map[p.userId] = { correct: 0, buzzed: 0, powers: 0, negs: 0, depthSum: 0, depthN: 0 };
    }
    for (const q of questions) {
      const total = q.totalWords || 1;
      for (const b of q.buzzes || []) {
        const s = map[b.userId];
        if (!s) continue;
        s.buzzed += 1;
        if (b.correct) {
          s.correct += 1;
          s.depthSum += Math.min(1, (b.buzzWord + 1) / total);
          s.depthN += 1;
          if (q.powerWordIndex != null && b.buzzWord >= 0 && b.buzzWord < q.powerWordIndex) s.powers += 1;
        } else if ((b.points || 0) < 0) {
          s.negs += 1;
        }
      }
    }
    return map;
  }, [players, questions]);

  if (!questions.length) {
    return (
      <p className="text-[11px] text-white/30 italic text-center py-3">
        No completed questions to compare.
      </p>
    );
  }

  // Best correct-count, used to crown the head-to-head leader subtly.
  const topCorrect = Math.max(0, ...players.map(p => stats[p.userId]?.correct || 0));

  return (
    <div className="text-left space-y-3">
      {/* Per-player summary */}
      <div className={`grid gap-2 ${players.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
        {players.map(p => {
          const s = stats[p.userId] || {};
          const isMe = p.userId === myUserId;
          const leads = (s.correct || 0) === topCorrect && topCorrect > 0;
          const avgDepth = s.depthN ? Math.round((s.depthSum / s.depthN) * 100) : null;
          return (
            <div key={p.userId}
              className={`rounded-xl border p-2.5 ${isMe ? 'border-emerald-400/30 bg-emerald-400/[0.05]' : 'border-white/10 bg-white/[0.03]'}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                {leads && <Zap size={11} className="text-amber-400 shrink-0" />}
                <span className={`text-[12px] font-semibold truncate ${isMe ? 'text-emerald-300' : 'text-white/75'}`}>
                  {p.name}{isMe ? ' (you)' : ''}
                </span>
                <span className="ml-auto text-[13px] font-bold tabular-nums text-white/80">{p.finalScore}</span>
              </div>
              <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] text-white/45">
                <span><strong className="text-emerald-300/90">{s.correct || 0}</strong> right</span>
                <span><strong className="text-white/65">{s.buzzed || 0}</strong> buzzed</span>
                {s.powers ? <span><strong className="text-amber-300/90">{s.powers}</strong> power</span> : null}
                {s.negs ? <span><strong className="text-rose-300/90">{s.negs}</strong> neg</span> : null}
                {avgDepth != null && <span>avg buzz <strong className="text-white/65">{avgDepth}%</strong></span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-question breakdown */}
      <div className="space-y-1">
        {questions.map((q, i) => (
          <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            <span className="text-[10px] font-bold tabular-nums text-white/30 w-6 shrink-0 pt-0.5">Q{i + 1}</span>
            <span className="text-[11px] text-white/55 flex-1 min-w-0 truncate pt-0.5" title={q.answer}>
              {q.answer || '—'}
            </span>
            <div className="flex flex-wrap gap-1 justify-end shrink-0 max-w-[58%]">
              {players.map(p => (
                <PlayerOutcome key={p.userId} q={q} player={p} isMe={p.userId === myUserId} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// One player's result chip for a single question.
function PlayerOutcome({ q, player, isMe }) {
  const b = (q.buzzes || []).find(x => x.userId === player.userId);
  const label = isMe ? 'You' : firstName(player.name);

  if (!b) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-white/[0.06] bg-white/[0.02] text-[10px] text-white/30">
        <Minus size={9} /> {label}
      </span>
    );
  }

  const isPower = b.correct && q.powerWordIndex != null && b.buzzWord >= 0 && b.buzzWord < q.powerWordIndex;
  const tone = b.correct
    ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300/90'
    : 'border-rose-500/30 bg-rose-500/[0.08] text-rose-300/85';
  const wordPos = typeof b.buzzWord === 'number' && b.buzzWord >= 0 ? `w${b.buzzWord + 1}` : null;

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] ${tone}`}
      title={b.correct ? `${label} got it${b.answer ? ` — "${b.answer}"` : ''}` : `${label} missed${b.answer ? ` — "${b.answer}"` : ' — no answer'}`}>
      {isPower && <Zap size={9} className="text-amber-400" />}
      {b.correct ? <Check size={9} /> : <X size={9} />}
      <span className="font-semibold">{label}</span>
      {wordPos && <span className="opacity-60">{wordPos}</span>}
      {typeof b.points === 'number' && b.points !== 0 && (
        <span className="font-bold">{b.points > 0 ? `+${b.points}` : b.points}</span>
      )}
    </span>
  );
}

function firstName(name) {
  if (!name) return '?';
  return String(name).split(/\s+/)[0].slice(0, 10);
}
