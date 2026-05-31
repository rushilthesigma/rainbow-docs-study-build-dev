import { useState, useEffect } from 'react';
import { ClipboardCheck, Award, AlertCircle, PenTool } from 'lucide-react';
import { generateAssignment, submitAssignment } from '../../api/curriculum';
import LoadingSpinner from '../shared/LoadingSpinner';

// Graded-mode assignment surface for a single lesson. Styled to match
// the lesson's variety blocks (top hairline, colored chip, 68ch column,
// rubric chips, inline feedback) so it doesn't feel like a separate
// surface bolted on above the chat.
//
// Three states:
//   1. No assignment yet — auto-generate-on-open spinner.
//   2. Assignment ready, no submission — prompt + rubric + textarea.
//   3. Submission graded — score chip + per-rubric breakdown + feedback.
//
// `onSubmitted(submission, courseGrade)` is fired after grading so the
// parent page can refresh course-level state without a full reload.
export default function AssignmentCard({ curriculumId, lessonId, initialAssignment, onSubmitted }) {
  const [assignment, setAssignment] = useState(initialAssignment || null);
  const [generating, setGenerating] = useState(false);
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Auto-generate on first open when missing — keeps the flow one-click.
  useEffect(() => {
    if (assignment || generating) return;
    setGenerating(true);
    generateAssignment(curriculumId, lessonId)
      .then(d => setAssignment(d.assignment))
      .catch(e => setError(e.message))
      .finally(() => setGenerating(false));
  }, [assignment, generating, curriculumId, lessonId]);

  async function handleSubmit() {
    setError(null);
    if (response.trim().length < 20) {
      setError('Write at least a couple sentences before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitAssignment(curriculumId, lessonId, response.trim());
      setAssignment(prev => prev ? { ...prev, submission: result.submission } : prev);
      onSubmitted?.(result.submission, result.courseGrade);
      setResponse('');
    } catch (e) { setError(e.message); }
    setSubmitting(false);
  }

  if (generating && !assignment) {
    return (
      <div className="border-t border-sky-300/[0.18] pt-6">
        <div className="mx-auto max-w-[68ch] flex items-center gap-3">
          <LoadingSpinner size={16} />
          <span className="text-[13px] text-white/55">Generating assignment…</span>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="border-t border-rose-300/[0.18] pt-6">
        <div className="mx-auto max-w-[68ch] text-[13px] text-white/55">
          Assignment unavailable. {error && <span className="text-rose-300">{error}</span>}
        </div>
      </div>
    );
  }

  const submission = assignment.submission;
  const rubric = Array.isArray(assignment.rubric) ? assignment.rubric : [];
  const wordCount = response.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="cl-anim-in">
      <div className="border-t border-sky-300/[0.18] pt-7 lg:pt-9 mb-4">
        <div className="mx-auto max-w-[68ch]">
          {/* Type chip + grade chip */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200/85 bg-sky-400/[0.10] border border-sky-300/[0.22] rounded-full px-2.5 py-0.5">
              <ClipboardCheck size={10} strokeWidth={2.4} /> Graded Assignment
            </span>
            {submission && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${gradeStyle(submission.score)}`}>
                <Award size={10} /> {submission.letter} · {submission.score}/100
              </span>
            )}
          </div>

          {/* Prompt */}
          <p className="text-[15.5px] text-white/82 leading-[1.75] whitespace-pre-wrap">
            {assignment.prompt}
          </p>

          {/* Rubric */}
          {rubric.length > 0 && (
            <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45 mb-2">Rubric</p>
              <ul className="space-y-1.5">
                {rubric.map((r, i) => {
                  const ps = submission?.perRubric?.find(p => p.label.toLowerCase() === r.label.toLowerCase());
                  return (
                    <li key={i} className="flex items-start gap-2.5 text-[12.5px]">
                      <span className="grid place-items-center w-4 h-4 mt-[2px] rounded text-[9px] font-bold bg-sky-400/[0.18] text-sky-200/85 tabular-nums flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white/85">{r.label}</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[10px] text-white/35">weight {r.weight}</span>
                            {ps && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${gradeStyle(ps.score)}`}>
                                {ps.score}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-white/55 mt-0.5 leading-snug">{r.criterion}</p>
                        {ps?.note && (
                          <p className="text-white/75 italic mt-1 leading-snug">{ps.note}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Feedback (post-submission) */}
          {submission ? (
            <div className="mt-5 rounded-xl border border-emerald-400/[0.22] bg-emerald-500/[0.05] px-4 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/80 mb-1.5">Feedback</p>
              <p className="text-[14px] text-white/85 leading-relaxed whitespace-pre-wrap">{submission.feedback}</p>
              <details className="mt-3 group">
                <summary className="cursor-pointer text-[11.5px] text-white/45 hover:text-white/75 select-none">
                  Show your submitted response
                </summary>
                <p className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[12.5px] text-white/72 whitespace-pre-wrap leading-relaxed">
                  {submission.text}
                </p>
              </details>
            </div>
          ) : (
            /* Submission state — input */
            <div className="mt-6">
              <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45 mb-2 block">Your response</label>
              <textarea
                value={response}
                onChange={e => setResponse(e.target.value)}
                placeholder="Write 150–400 words showing what you learned…"
                rows={8}
                className="w-full rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 py-3 text-[14px] text-white/90 placeholder-white/30 focus:outline-none focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/15 resize-y leading-relaxed"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-white/40 tabular-nums">{wordCount} words</span>
                {error && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-rose-300/90">
                    <AlertCircle size={12} /> {error}
                  </span>
                )}
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || wordCount < 20}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-[13.5px] text-white bg-sky-500 hover:bg-sky-400 border border-sky-400/45 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? <LoadingSpinner size={13} /> : <PenTool size={13} strokeWidth={2.4} />}
                  {submitting ? 'Grading…' : 'Submit for grading'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function gradeStyle(score) {
  if (score == null) return 'bg-white/[0.06] text-white/55 border border-white/[0.10]';
  if (score >= 90) return 'bg-emerald-500/[0.18] border border-emerald-400/[0.30] text-emerald-200';
  if (score >= 80) return 'bg-blue-500/[0.18] border border-blue-400/[0.30] text-blue-200';
  if (score >= 70) return 'bg-amber-500/[0.18] border border-amber-400/[0.30] text-amber-200';
  return 'bg-rose-500/[0.18] border border-rose-400/[0.30] text-rose-200';
}
