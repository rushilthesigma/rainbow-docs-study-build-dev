import { ArrowLeft, Users, Loader2, Crown, Check, Minus, BarChart3 } from 'lucide-react';

// GradebookView - performance dashboard for a SHARED curriculum. Shows every
// participant (the owner + everyone with an accepted share) with their own
// completion, average grade, and a per-lesson score breakdown. Rendered inline
// inside the Curricula window; `onBack` returns to the curriculum detail view.

function scoreTone(score) {
  if (score == null) return 'text-white/20';
  if (score >= 90) return 'text-emerald-300';
  if (score >= 80) return 'text-sky-300';
  if (score >= 70) return 'text-amber-300';
  return 'text-rose-300';
}

function pillTone(score) {
  if (score == null) return 'border-white/10 bg-white/[0.04] text-white/40';
  if (score >= 90) return 'border-emerald-400/25 bg-emerald-500/[0.10] text-emerald-200';
  if (score >= 80) return 'border-sky-400/25 bg-sky-500/[0.10] text-sky-200';
  if (score >= 70) return 'border-amber-400/25 bg-amber-500/[0.10] text-amber-200';
  return 'border-rose-400/25 bg-rose-500/[0.10] text-rose-200';
}

function initialsOf(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function timeAgo(iso) {
  if (!iso) return 'No activity yet';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return 'Active just now';
  const m = Math.round(s / 60);
  if (m < 60) return `Active ${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `Active ${h}h ago`;
  const d = Math.round(h / 24);
  return `Active ${d}d ago`;
}

export default function GradebookView({ gradebook, loading, onBack, onRefresh }) {
  const title = gradebook?.curriculum?.title || 'Curriculum';
  const lessons = gradebook?.curriculum?.lessons || [];
  // Leaderboard order: most lessons done, then highest average.
  const participants = [...(gradebook?.participants || [])].sort((a, b) => {
    if (b.lessonsCompleted !== a.lessonsCompleted) return b.lessonsCompleted - a.lessonsCompleted;
    return (b.averageScore ?? -1) - (a.averageScore ?? -1);
  });

  // Lesson rows grouped under their unit heading for the breakdown table.
  const lessonGroups = [];
  for (const les of lessons) {
    const last = lessonGroups[lessonGroups.length - 1];
    if (last && last.unitTitle === les.unitTitle) last.lessons.push(les);
    else lessonGroups.push({ unitTitle: les.unitTitle, lessons: [les] });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/50 hover:text-white/90">
          <ArrowLeft size={16} /> {title}
        </button>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-white/50 hover:border-white/25 hover:text-white/80 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <BarChart3 size={12} />} Refresh
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-1">
        <BarChart3 size={18} className="text-sky-300" />
        <h1 className="text-xl font-bold text-white">Gradebook</h1>
      </div>
      <p className="text-sm text-white/45 mb-5">
        {participants.length} {participants.length === 1 ? 'person' : 'people'} studying this course together.
      </p>

      {loading && !gradebook ? (
        <div className="flex items-center gap-2 text-sm text-white/40 py-10 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading performance…
        </div>
      ) : participants.length === 0 ? (
        <div className="text-center py-12 text-white/40">
          <Users size={28} className="mx-auto mb-3 text-white/30" />
          <p className="text-sm">No participants yet. Share this curriculum to start tracking together.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Per-person summary */}
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-2 px-1">People</h2>
            <div className="rounded-xl border border-white/10 overflow-hidden">
              {participants.map((p, i) => {
                const pct = p.lessonsTotal > 0 ? Math.round((p.lessonsCompleted / p.lessonsTotal) * 100) : 0;
                return (
                  <div
                    key={p.userId}
                    className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-white/[0.06]' : ''} ${p.isYou ? 'bg-sky-500/[0.05]' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-full bg-white/10 grid place-items-center flex-shrink-0 text-[11px] font-bold text-white/70">
                      {initialsOf(p.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white truncate">{p.name}</span>
                        {p.isOwner && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-300/90" title="Curriculum owner">
                            <Crown size={10} /> Owner
                          </span>
                        )}
                        {p.isYou && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-sky-300/90">You</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.08] overflow-hidden max-w-[180px]">
                          <div className="h-full bg-sky-400/70 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] text-white/40 tabular-nums">{p.lessonsCompleted}/{p.lessonsTotal} done</span>
                      </div>
                      <p className="text-[10px] text-white/30 mt-1">{timeAgo(p.lastActivityAt)}</p>
                    </div>
                    <div className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg border text-center min-w-[58px] ${pillTone(p.averageScore)}`}>
                      <div className="text-sm font-bold leading-none tabular-nums">{p.averageScore != null ? `${p.averageScore}%` : '—'}</div>
                      <div className="text-[9px] font-semibold uppercase tracking-wider opacity-80 mt-0.5">{p.averageLetter || 'avg'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-lesson breakdown */}
          {lessons.length > 0 && (
            <div>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-2 px-1">Lesson breakdown</h2>
              <div className="rounded-xl border border-white/10 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08]">
                      <th className="text-left font-semibold text-white/50 text-[11px] uppercase tracking-wider px-4 py-2.5 sticky left-0 bg-[#1a1d26]/80 backdrop-blur-sm">Lesson</th>
                      {participants.map((p) => (
                        <th key={p.userId} className="px-2 py-2.5 text-center font-semibold text-white/55 text-[11px] min-w-[52px]" title={p.name}>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="w-6 h-6 rounded-full bg-white/10 grid place-items-center text-[10px] text-white/70">{initialsOf(p.name)}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lessonGroups.map((group, gi) => (
                      <GroupRows key={gi} group={group} participants={participants} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 px-1 text-[10px] text-white/35">
                <span className="inline-flex items-center gap-1"><Check size={11} className="text-white/45" /> done, not scored</span>
                <span className="inline-flex items-center gap-1"><Minus size={11} className="text-white/25" /> not started</span>
                <span className="text-emerald-300">90+</span>
                <span className="text-sky-300">80s</span>
                <span className="text-amber-300">70s</span>
                <span className="text-rose-300">below 70</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupRows({ group, participants }) {
  return (
    <>
      <tr>
        <td colSpan={participants.length + 1} className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
          {group.unitTitle}
        </td>
      </tr>
      {group.lessons.map((les) => (
        <tr key={les.id} className="border-t border-white/[0.05]">
          <td className="px-4 py-2 text-white/75 sticky left-0 bg-[#1a1d26]/80 backdrop-blur-sm max-w-[260px]">
            <span className="line-clamp-1">{les.title}</span>
          </td>
          {participants.map((p) => {
            const cell = p.perLesson?.find((x) => x.lessonId === les.id);
            const score = cell && typeof cell.score === 'number' ? cell.score : null;
            return (
              <td key={p.userId} className="px-2 py-2 text-center tabular-nums">
                {score != null ? (
                  <span className={`font-semibold ${scoreTone(score)}`}>{score}</span>
                ) : cell?.isCompleted ? (
                  <Check size={14} className="inline text-white/45" />
                ) : (
                  <Minus size={14} className="inline text-white/15" />
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
