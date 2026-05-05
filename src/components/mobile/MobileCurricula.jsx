import { useEffect, useState } from 'react';
import { BookOpen, Plus, ChevronRight, ArrowLeft, CheckCircle2, Circle, FileText, Sparkles } from 'lucide-react';
import { listCurricula, deleteCurriculum, getCurriculum, generateCurriculum } from '../../api/curriculum';
import { DEFAULT_SETTINGS } from '../../utils/constants';
import BlockLessonView from '../lesson/BlockLessonView';
import ProgressBar, { InlineProgress } from '../shared/ProgressBar';

// Mobile-native Curricula flow: list → detail (units / lessons) →
// lesson runner (BlockLessonView). Centered titles, large touch
// targets, full coverage so the admin Mobile Preview can drive a real
// course end-to-end.
export default function MobileCurricula() {
  const [view, setView] = useState('list'); // list | detail | lesson | new
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // detail / lesson state
  const [activeCurriculum, setActiveCurriculum] = useState(null);
  const [activeLesson, setActiveLesson] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // new-course form
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('beginner');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);

  useEffect(() => {
    listCurricula()
      .then((d) => setItems(d.curricula || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleGenerate() {
    if (!topic.trim() || generating) return;
    setGenerating(true); setGenError(null);
    try {
      const settings = { ...DEFAULT_SETTINGS, topic: topic.trim(), difficulty };
      const data = await generateCurriculum(settings, []);
      setItems((prev) => [data.curriculum, ...prev]);
      setActiveCurriculum(data.curriculum);
      setTopic('');
      setView('detail');
    } catch (err) {
      setGenError(err.message || 'Failed to generate course');
    } finally {
      setGenerating(false);
    }
  }

  async function openCourse(course) {
    setView('detail');
    setActiveCurriculum(course);
    setDetailLoading(true);
    try {
      // Refetch to get fresh blocks/completion data.
      const d = await getCurriculum(course.id);
      setActiveCurriculum(d.curriculum || course);
    } catch {} finally { setDetailLoading(false); }
  }

  function openLesson(lesson) {
    setActiveLesson(lesson);
    setView('lesson');
  }

  async function handleDelete(id, e) {
    e?.stopPropagation();
    if (!confirm('Delete this course?')) return;
    try {
      await deleteCurriculum(id);
      setItems((prev) => prev.filter((c) => c.id !== id));
    } catch (err) { console.error(err); }
  }

  // ===== LESSON =====
  if (view === 'lesson' && activeLesson && activeCurriculum) {
    return (
      <BlockLessonView
        curriculumId={activeCurriculum.id}
        lesson={activeLesson}
        onBack={() => { setActiveLesson(null); setView('detail'); }}
        backLabel="Back to course"
      />
    );
  }

  // ===== DETAIL =====
  if (view === 'detail' && activeCurriculum) {
    return (
      <div className="px-4 pt-3 pb-8">
        <button onClick={() => { setActiveCurriculum(null); setView('list'); }} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-500 dark:text-gray-400 mb-4 active:text-gray-700 dark:active:text-gray-200">
          <ArrowLeft size={14} /> All courses
        </button>
        <div className="text-center mb-5">
          <div className="inline-grid place-items-center w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-500 mb-2">
            <BookOpen size={20} />
          </div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white leading-tight">{activeCurriculum.title}</h1>
          {activeCurriculum.description && (
            <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">{activeCurriculum.description}</p>
          )}
        </div>

        {detailLoading && (
          <p className="text-center text-[12px] text-gray-400">Loading lessons…</p>
        )}

        <div className="space-y-4">
          {(activeCurriculum.units || []).map((unit, ui) => (
            <div key={unit.id || ui}>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 mb-2 px-1">
                Unit {ui + 1} · {unit.title}
              </p>
              <div className="space-y-2">
                {(unit.lessons || []).map((l) => {
                  const completed = !!l.isCompleted;
                  const isExam = l.type === 'unit_test' || l.type === 'midterm' || l.type === 'final';
                  return (
                    <button
                      key={l.id}
                      onClick={() => openLesson(l)}
                      className="w-full rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#13131f] p-3.5 active:scale-[0.99] transition-transform text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${
                          completed ? 'bg-emerald-100 dark:bg-emerald-500/15'
                          : isExam ? 'bg-rose-100 dark:bg-rose-500/15'
                          : 'bg-blue-100 dark:bg-blue-500/15'
                        }`}>
                          {completed
                            ? <CheckCircle2 size={17} className="text-emerald-500" />
                            : isExam
                              ? <FileText size={17} className="text-rose-500" />
                              : <Circle size={17} className="text-blue-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13.5px] font-bold tracking-tight text-gray-900 dark:text-white truncate">{l.title}</p>
                          {l.description && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{l.description}</p>}
                        </div>
                        <ChevronRight size={14} className="text-gray-300 dark:text-white/30 shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ===== NEW =====
  if (view === 'new') {
    return (
      <div className="px-4 pt-3 pb-8">
        <button onClick={() => { setView('list'); setGenError(null); }} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-500 dark:text-gray-400 mb-4 active:text-gray-700 dark:active:text-gray-200">
          <ArrowLeft size={14} /> All courses
        </button>
        <div className="text-center mb-5">
          <div className="inline-grid place-items-center w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-500 mb-2">
            <Sparkles size={20} />
          </div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white">New course</h1>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1">AI generates units, lessons, midterm + final.</p>
        </div>

        {generating && (
          <div className="rounded-2xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-4 mb-4">
            <ProgressBar active label={`Generating ${topic || 'curriculum'}…`} hint="20-30 seconds. Don't close." duration={25000} />
          </div>
        )}

        {genError && !generating && (
          <p className="text-[11.5px] text-rose-500 px-3 py-2 mb-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-center">{genError}</p>
        )}

        {!generating && (
          <>
            <label className="block">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400 mb-2 block px-1">Topic</span>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
                placeholder="e.g. Calculus, AP Bio, US History"
                autoFocus
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#13131f] text-[14px] text-gray-900 dark:text-white outline-none"
              />
            </label>

            <div className="mt-4">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400 mb-2 block px-1">Difficulty</span>
              <div className="grid grid-cols-3 gap-1.5">
                {['beginner', 'intermediate', 'advanced'].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`px-3 py-2 rounded-xl text-[12px] font-semibold tracking-tight capitalize ${
                      difficulty === d
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-white/[0.05] text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!topic.trim() || generating}
              className="mt-5 w-full py-3.5 rounded-2xl bg-blue-600 active:bg-blue-700 disabled:opacity-50 text-white text-[14.5px] font-bold inline-flex items-center justify-center gap-2"
            >
              <Sparkles size={15} /> Generate course
            </button>
          </>
        )}
      </div>
    );
  }

  // ===== LIST =====
  return (
    <div className="px-4 pt-5 pb-8">
      <h1 className="text-center text-[26px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white mb-1">
        My Courses
      </h1>
      <p className="text-center text-[12.5px] text-gray-500 dark:text-gray-400 mb-5">
        {loading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'course' : 'courses'}`}
      </p>

      {/* Single full-width "New course" CTA — PAUSD catalog isn't
          surfaced on mobile (catalog browse is a desktop-class flow). */}
      <button
        onClick={() => { setTopic(''); setGenError(null); setView('new'); }}
        className="w-full rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-4 mb-5 active:scale-[0.99] transition-transform text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 grid place-items-center shrink-0">
            <Plus size={20} className="text-white" />
          </div>
          <p className="flex-1 text-[15px] font-bold tracking-tight">New course</p>
          <ChevronRight size={16} className="text-white/80" />
        </div>
      </button>

      {!loading && items.length === 0 && (
        <div className="text-center py-12">
          <BookOpen size={32} className="text-gray-300 dark:text-white/15 mx-auto mb-3" />
          <p className="text-[13px] text-gray-500 dark:text-gray-400">No courses yet.</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((c) => (
          <CourseRow key={c.id} course={c} onOpen={() => openCourse(c)} onDelete={(e) => handleDelete(c.id, e)} />
        ))}
      </div>
    </div>
  );
}

// ===== Sub-components =====

function CourseRow({ course, onOpen, onDelete }) {
  const totalLessons = (course.units || []).reduce((s, u) => s + (u.lessons?.length || 0), 0);
  const doneLessons  = (course.units || []).reduce((s, u) => s + (u.lessons || []).filter((l) => l.isCompleted).length, 0);
  const pct = totalLessons ? Math.round((doneLessons / totalLessons) * 100) : 0;
  const units = course.units?.length || 0;
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#13131f] active:scale-[0.99] transition-transform text-left"
    >
      <div className="flex items-center gap-3 p-3.5">
        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/15 grid place-items-center shrink-0">
          <BookOpen size={18} className="text-blue-500 dark:text-blue-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold tracking-tight text-gray-900 dark:text-white truncate">{course.title}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 tabular-nums">
            {doneLessons}/{totalLessons} lessons · {units} unit{units === 1 ? '' : 's'}
          </p>
        </div>
        <ChevronRight size={14} className="text-gray-300 dark:text-white/30 shrink-0" />
      </div>
      <div className="px-3.5 pb-3.5">
        <div className="h-1 rounded-full bg-gray-200 dark:bg-white/[0.06] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </button>
  );
}
