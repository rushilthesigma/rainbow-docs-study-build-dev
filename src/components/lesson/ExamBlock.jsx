import { useEffect, useRef, useState } from 'react';
import { GraduationCap, Trophy, Lock, Play, Repeat, MapPinned, Clock3, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  getCurriculumExams, generateCurriculumExam, gradeCurriculumExam,
} from '../../api/curriculum';
import { InlineProgress } from '../shared/ProgressBar';
import MathText from '../shared/MathText';

// Course-level exam runner. Drops into CurriculaApp's curriculum detail
// view as a section: shows midterm + final cards (and a competition Battery
// card when that preset course supplies one) with their unlock /
// generate / take / score state.
//
// Both exams are spaced-repetition: the server pulls the missed-question
// pool from EVERY graded quiz across EVERY lesson and uses it as the
// spine. The midterm unlocks at 50% lesson completion, the final at 90%.
export default function ExamBlock({ curriculumId }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null); // 'midterm' | 'final' | 'battery' | null
  const [activeExam, setActiveExam] = useState(null); // exam being taken now
  const [results, setResults] = useState(null); // {kind, score, results}
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    getCurriculumExams(curriculumId)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setErr(e.message || 'Failed to load exams'); });
    return () => { cancelled = true; };
  }, [curriculumId]);

  async function handleGenerate(kind) {
    setBusy(kind); setErr('');
    try {
      const { exam } = await generateCurriculumExam(curriculumId, kind);
      setData(prev => ({
        ...prev,
        [kind]: exam,
        batteryQuizzes: (prev.batteryQuizzes || []).map(quiz => quiz.kind === kind ? { ...quiz, exam } : quiz),
      }));
      setActiveExam({ ...exam, kind });
    } catch (e) {
      setErr(e.message || `Failed to generate ${kind}`);
    } finally { setBusy(null); }
  }

  async function handleTake(kind) {
    const exam = data?.[kind] || data?.batteryQuizzes?.find(quiz => quiz.kind === kind)?.exam;
    if (!exam) return;
    setActiveExam({ ...exam, kind });
    setResults(null);
  }

  async function handleSubmitExam(submitResults) {
    // QuizBlock posted to /grade/<blockId>; for exams we re-route to the
    // exam-specific endpoint. This wrapper grades again on the exam route.
    if (!activeExam) return;
    try {
      const responses = (submitResults?.results || []).map(r => ({ qid: r.qid, given: r.given }));
      const graded = await gradeCurriculumExam(curriculumId, activeExam.id, responses);
      setResults({ kind: activeExam.kind, ...graded });
      // refresh data so the score sticks
      const fresh = await getCurriculumExams(curriculumId);
      setData(fresh);
    } catch (e) {
      setErr(e.message || 'Failed to grade exam');
      throw e;
    }
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] p-5">
        <div className="flex items-center gap-2 text-sm text-gray-500"><InlineProgress active /> Loading exams…</div>
      </div>
    );
  }

  // ===== TAKING AN EXAM =====
  if (activeExam) {
    // Reuse QuizBlock as the question carousel. We bypass its normal
    // grading by adapting the curriculum/exam-grade endpoint via a tiny
    // shim block id. Easier path: pass a faux blockId that QuizBlock
    // would call /grade on, intercept here. Simpler: use QuizBlock for
    // pure UI and grade ourselves.
    return (
      <div className="space-y-3">
        <button
          onClick={() => { setActiveExam(null); setResults(null); }}
          className="text-xs text-gray-400 hover:text-gray-200"
        >← Back to course</button>
        {err && <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{err}</div>}
        <ExamCarousel
          key={activeExam.id}
          exam={activeExam}
          onSubmit={handleSubmitExam}
          results={results}
          onClose={() => { setActiveExam(null); setResults(null); }}
        />
      </div>
    );
  }

  // ===== EXAM SUMMARY CARDS =====
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <GraduationCap size={16} className="text-white/50" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200">Course exams</h3>
        <span className="text-[11px] text-gray-400 tabular-nums">
          {data.progress?.done || 0} / {data.progress?.total || 0} lessons complete
        </span>
      </div>
      {err && <div className="px-3 py-2 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-300">{err}</div>}

      <div className={`grid gap-3 ${data.batteryConfig ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        <ExamCard
          kind="midterm"
          title="Midterm"
          subtitle="Unlocks at 50% complete"
          unlocked={data.midtermAvailable}
          progressFraction={data.progress?.fraction || 0}
          unlockAt={0.5}
          exam={data.midterm}
          busy={busy === 'midterm'}
          onGenerate={() => handleGenerate('midterm')}
          onTake={() => handleTake('midterm')}
        />
        <ExamCard
          kind="final"
          title="Final Exam"
          subtitle="Unlocks at 90% complete"
          unlocked={data.finalAvailable}
          progressFraction={data.progress?.fraction || 0}
          unlockAt={0.9}
          exam={data.final}
          busy={busy === 'final'}
          onGenerate={() => handleGenerate('final')}
          onTake={() => handleTake('final')}
        />
        {data.batteryConfig && (
          <ExamCard
            kind="battery"
            title={data.batteryConfig.title || 'International Geography Bee Battery Practice'}
            subtitle={data.batteryConfig.description || `Unlocks at ${Math.round((data.batteryConfig.unlockAt || 0.9) * 100)}% complete`}
            unlocked={data.batteryAvailable}
            progressFraction={data.progress?.fraction || 0}
            unlockAt={data.batteryConfig.unlockAt || 0.9}
            exam={data.battery}
            timeLimitMinutes={data.batteryConfig.timeLimitMinutes}
            busy={busy === 'battery'}
            onGenerate={() => handleGenerate('battery')}
            onTake={() => handleTake('battery')}
          />
        )}
      </div>
      {(data.batteryQuizzes || []).length > 0 && (
        <section className="pt-3 border-t border-white/[0.08]">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2">
                <MapPinned size={14} className="text-sky-400" />
                <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">Practice tests</h4>
              </div>
              <p className="mt-1 text-[11px] text-white/35">Timed Battery-format sets for focused practice before the full simulation.</p>
            </div>
            <span className="shrink-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] tabular-nums text-white/40">
              {data.batteryQuizzes.length} tests
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {data.batteryQuizzes.map(quiz => (
              <ExamCard
                key={quiz.kind}
                kind={quiz.kind}
                title={quiz.title}
                subtitle={quiz.description}
                unlocked={quiz.available}
                progressFraction={data.progress?.fraction || 0}
                unlockAt={quiz.unlockAt || 0.9}
                exam={quiz.exam}
                timeLimitMinutes={quiz.timeLimitMinutes}
                busy={busy === quiz.kind}
                onGenerate={() => handleGenerate(quiz.kind)}
                onTake={() => handleTake(quiz.kind)}
              />
            ))}
          </div>
        </section>
      )}
      <p className="text-[10px] text-gray-500 italic flex items-center gap-1.5">
        <Repeat size={10} /> Course exams use spaced repetition. Battery practice also uses a fixed physical, human, political, and regional geography blueprint.
      </p>
    </div>
  );
}

function ExamCard({ kind, title, subtitle, unlocked, progressFraction, unlockAt, exam, timeLimitMinutes, busy, onGenerate, onTake }) {
  const completed = exam?.completedAt;
  const score = exam?.score;
  const tone = score == null ? null : score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-rose-400';
  const pct = Math.round(Math.min(100, (progressFraction / unlockAt) * 100));

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white/80 ${unlocked ? 'bg-white/[0.12] border border-white/[0.15]' : 'bg-white/[0.06] border border-white/[0.08]'}`}>
          {kind === 'final' ? <Trophy size={18} /> : kind.startsWith('battery') ? <MapPinned size={18} /> : <GraduationCap size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white">{title}</p>
          {subtitle && <p className="text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</p>}
          {!!timeLimitMinutes && (
            <p className="mt-1 flex items-center gap-1 text-[10px] font-medium tabular-nums text-sky-300/75">
              <Clock3 size={10} /> {timeLimitMinutes} minutes · timed
            </p>
          )}
        </div>
        {completed && <span className={`text-sm font-mono font-bold ${tone}`}>{score}%</span>}
      </div>

      {!unlocked && (
        <>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
            <Lock size={12} /> {pct}% of the way to unlocking
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full bg-white/[0.20]" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}

      {unlocked && !exam && (
        <button
          onClick={onGenerate}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-500/90 disabled:opacity-50 transition-colors"
        >
          {busy ? <><InlineProgress active /> Building exam…</> : <><Play size={14} /> Generate {title}</>}
        </button>
      )}

      {unlocked && exam && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            {exam.questions.length} questions · pulled from {exam.missedSourceCount || 0} missed-question reviews
          </p>
          <button
            onClick={onTake}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md shadow-blue-500/30"
          >
            {completed ? `Retake (last: ${score}%)` : 'Start exam'}
          </button>
        </div>
      )}
    </div>
  );
}

// Course exam carousel with optional competition timing. Battery deadlines
// live in sessionStorage so leaving and reopening the course cannot reset them.
function ExamCarousel({ exam, onSubmit, results, onClose }) {
  const [idx, setIdx] = useState(0);
  const [picks, setPicks] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const submitStartedRef = useRef(false);
  const total = exam.questions.length;
  const q = exam.questions[idx];
  const allAnswered = Object.keys(picks).length === total;
  const timed = Number(exam.timeLimitMinutes) > 0;
  const storageKey = `covalent-exam-deadline:${exam.id}`;
  const [deadline] = useState(() => {
    if (!timed) return null;
    const saved = Number(sessionStorage.getItem(storageKey));
    if (saved > 0) return saved;
    const next = Date.now() + Number(exam.timeLimitMinutes) * 60_000;
    sessionStorage.setItem(storageKey, String(next));
    return next;
  });
  const [remainingSeconds, setRemainingSeconds] = useState(() => (
    deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : null
  ));

  useEffect(() => {
    if (!deadline || results) return undefined;
    const update = () => setRemainingSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [deadline, results]);

  useEffect(() => {
    if (timed && remainingSeconds === 0 && !results) submit();
  }, [remainingSeconds, timed, results]);

  if (results) {
    const score = results.score || 0;
    const tone = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
    return (
      <div className="rounded-2xl border p-6" style={{ borderColor: tone, background: `${tone}1a` }}>
        <h3 className="text-3xl font-black mb-1" style={{ color: tone }}>{score}%</h3>
        <p className="text-sm text-gray-300">{(results.results || []).filter(r => r.correct).length} of {total} correct on the {results.kind?.startsWith('battery') ? 'Battery exam' : results.kind === 'final' ? 'Final' : 'Midterm'}.</p>
        {results.points != null && (
          <p className="mt-1 text-xs font-mono tabular-nums text-white/50">
            IGC score: {results.points} / {results.maxPoints} · +2 correct, 0 blank, −1 incorrect
          </p>
        )}
        <button onClick={onClose} className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold">Back to course</button>
      </div>
    );
  }

  async function submit() {
    if (submitStartedRef.current) return;
    submitStartedRef.current = true;
    setSubmitting(true);
    try {
      const responses = exam.questions.map(qq => ({ qid: qq.id, given: picks[qq.id] || '' }));
      // Reuse QuizBlock's results shape for the submit handler
      await onSubmit({ score: 0, results: responses.map(r => ({ qid: r.qid, given: r.given, correct: false })) });
      if (timed) sessionStorage.removeItem(storageKey);
    } catch (error) {
      submitStartedRef.current = false;
    } finally { setSubmitting(false); }
  }

  const timerText = remainingSeconds == null
    ? null
    : `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;
  const timerUrgent = remainingSeconds != null && remainingSeconds <= 300;

  return (
    <div className="rounded-2xl border border-blue-500/15 bg-blue-50 dark:bg-[#0f1124]/80 backdrop-blur p-6 lg:p-8">
      <div className="flex items-center justify-between gap-3 mb-5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30">
          {exam.title}
        </span>
        <div className="flex items-center gap-2">
          {timerText && (
            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[12px] font-semibold tabular-nums ${timerUrgent ? 'border-rose-400/35 bg-rose-500/10 text-rose-300' : 'border-white/[0.08] bg-white/[0.04] text-white/65'}`} aria-live={timerUrgent ? 'polite' : 'off'}>
              <Clock3 size={12} /> {timerText}
            </span>
          )}
          <span className="text-[12px] font-mono text-gray-500 tabular-nums">Q {idx + 1} / {total}</span>
        </div>
      </div>
      <MathText as="h3" className="text-[17px] leading-relaxed text-white mb-5 font-medium">{q.prompt}</MathText>
      <div className="flex flex-col gap-2.5">
        {(q.choices || []).map((c, i) => {
          const letter = String.fromCharCode(65 + i);
          const isPicked = picks[q.id] === c;
          return (
            <button
              key={i}
              onClick={() => setPicks(p => ({ ...p, [q.id]: c }))}
              className={`text-left flex items-start gap-3 px-4 py-3 rounded-xl border transition-all ${
                isPicked
                  ? 'border-blue-400 bg-blue-500/15 text-white'
                  : 'border-blue-500/10 bg-white dark:bg-[#0a0a14] text-gray-700 dark:text-gray-200 hover:border-blue-500/40 hover:bg-blue-500/5'
              }`}
            >
              <span className={`w-6 h-6 rounded-md grid place-items-center font-mono text-[12px] font-bold shrink-0 ${
                isPicked ? 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white' : 'bg-white dark:bg-[#0a0a14] text-gray-400 border border-blue-500/15'
              }`}>{letter}</span>
              <MathText as="span" className="text-[14px] leading-snug">{c}</MathText>
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex items-center justify-between gap-3">
        {total <= 80 ? (
          <div className="flex gap-1.5">
            {exam.questions.map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${
                i === idx ? 'bg-blue-400' : i < idx || picks[exam.questions[i].id] ? 'bg-blue-500/50' : 'bg-gray-300 dark:bg-[#2A2A40]'
              }`} />
            ))}
          </div>
        ) : (
          <span className="text-[11px] font-mono text-gray-500">{Object.keys(picks).length} answered</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={idx === 0 || submitting}
            aria-label="Previous question"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.10] text-white/55 hover:bg-white/[0.06] hover:text-white/85 disabled:opacity-30"
          >
            <ChevronLeft size={15} />
          </button>
        {idx + 1 === total ? (
          <button
            onClick={submit}
            disabled={(!timed && !allAnswered) || submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-[14px] text-white bg-gradient-to-r from-blue-600 to-indigo-600 disabled:opacity-50"
          >
            {submitting ? <><InlineProgress active /> Grading…</> : timed && !allAnswered ? `Submit ${Object.keys(picks).length}/${total}` : 'Submit'}
          </button>
        ) : (
          <button
            onClick={() => setIdx(i => Math.min(total - 1, i + 1))}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-[13px] text-blue-200 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 disabled:opacity-40"
          >
            Next <ChevronRight size={14} />
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
