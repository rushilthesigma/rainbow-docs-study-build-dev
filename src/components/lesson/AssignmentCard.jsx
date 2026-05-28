import { useState, useEffect } from 'react';
import { ClipboardCheck, Award, RefreshCw, AlertCircle } from 'lucide-react';
import { generateAssignment, submitAssignment } from '../../api/curriculum';
import Button from '../shared/Button';
import LoadingSpinner from '../shared/LoadingSpinner';

// Graded-mode assignment surface for a single lesson. Handles three states:
//   1. No assignment yet — generate-on-open button.
//   2. Assignment ready, no submission — show prompt + rubric + textarea.
//   3. Submission graded — show score, letter, rubric breakdown, feedback.
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
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-6 flex items-center gap-3">
        <LoadingSpinner size={18} />
        <span className="text-[13px] text-white/55">Generating assignment…</span>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-6 text-[13px] text-white/55">
        Assignment unavailable. {error && <span className="text-rose-300">{error}</span>}
      </div>
    );
  }

  const submission = assignment.submission;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardCheck size={16} className="text-blue-300" />
        <h3 className="text-[14px] font-semibold text-white/85">Assignment</h3>
        {submission && (
          <span className={`ml-auto px-2 py-0.5 rounded-md text-[12px] font-semibold ${gradeStyle(submission.score)}`}>
            <Award size={11} className="inline -mt-px mr-1" />
            {submission.letter} · {submission.score}/100
          </span>
        )}
      </div>

      <p className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">{assignment.prompt}</p>

      {assignment.rubric?.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wide text-white/35 mb-2">Rubric</div>
          <ul className="space-y-1.5">
            {assignment.rubric.map((r, i) => {
              const ps = submission?.perRubric?.find(p => p.label.toLowerCase() === r.label.toLowerCase());
              return (
                <li key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white/80">{r.label}</span>
                    <div className="flex items-center gap-2 text-white/45">
                      <span className="text-[10px]">weight {r.weight}</span>
                      {ps && (
                        <span className={`px-1.5 py-0.5 rounded font-semibold ${gradeStyle(ps.score)}`}>
                          {ps.score}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-white/45 mt-0.5">{r.criterion}</p>
                  {ps?.note && <p className="text-white/65 mt-1 italic">{ps.note}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {submission ? (
        <>
          <div className="mt-5 rounded-lg border border-emerald-400/[0.20] bg-emerald-500/[0.06] px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-emerald-300/70 mb-1">Teacher feedback</div>
            <p className="text-[13px] text-emerald-100 leading-relaxed whitespace-pre-wrap">{submission.feedback}</p>
          </div>
          <details className="mt-3 group">
            <summary className="cursor-pointer text-[12px] text-white/45 hover:text-white/70 inline-flex items-center gap-1">
              Your submitted response
              <RefreshCw size={11} className="group-open:rotate-180 transition-transform" />
            </summary>
            <p className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] text-white/70 whitespace-pre-wrap">
              {submission.text}
            </p>
          </details>
        </>
      ) : (
        <div className="mt-5">
          <label className="text-[12px] text-white/55 block mb-1.5">Your response</label>
          <textarea
            value={response}
            onChange={e => setResponse(e.target.value)}
            placeholder="Write 150–400 words showing what you learned…"
            rows={8}
            className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-[13px] text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 resize-y"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11px] text-white/35">{response.trim().split(/\s+/).filter(Boolean).length} words</span>
            {error && (
              <span className="text-[12px] text-rose-300 inline-flex items-center gap-1">
                <AlertCircle size={12} /> {error}
              </span>
            )}
          </div>
          <Button onClick={handleSubmit} loading={submitting} className="mt-3 w-full">
            <ClipboardCheck size={14} /> Submit for grading
          </Button>
        </div>
      )}
    </div>
  );
}

function gradeStyle(score) {
  if (score == null) return 'bg-white/[0.06] text-white/55';
  if (score >= 90) return 'bg-emerald-500/[0.18] border border-emerald-400/[0.30] text-emerald-200';
  if (score >= 80) return 'bg-blue-500/[0.18] border border-blue-400/[0.30] text-blue-200';
  if (score >= 70) return 'bg-amber-500/[0.18] border border-amber-400/[0.30] text-amber-200';
  return 'bg-rose-500/[0.18] border border-rose-400/[0.30] text-rose-200';
}
