import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronRight, X } from 'lucide-react';
import { listCurricula, getCurriculum } from '../../api/curriculum';

// Inline picker: "None" / a specific curriculum / a specific lesson inside a
// curriculum. Used by Notes and Goals to anchor items to course material.
//
// Props:
//   value = { curriculumId, lessonId } | null
//   onChange(next)
//   allowLesson = true → show lesson dropdown after picking a curriculum
//   compact = true → single-line inline layout
export default function CurriculumLessonPicker({ value, onChange, allowLesson = true, compact = false }) {
  const [curricula, setCurricula] = useState([]);
  const [loadingCurricula, setLoadingCurricula] = useState(true);
  const [curriculumDetail, setCurriculumDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const curriculumId = value?.curriculumId || null;
  const lessonId = value?.lessonId || null;

  useEffect(() => {
    listCurricula()
      .then(d => setCurricula(d.curricula || d || []))
      .catch(() => {})
      .finally(() => setLoadingCurricula(false));
  }, []);

  useEffect(() => {
    if (!curriculumId) { setCurriculumDetail(null); return; }
    setLoadingDetail(true);
    getCurriculum(curriculumId)
      .then(d => setCurriculumDetail(d.curriculum || d))
      .catch(() => setCurriculumDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [curriculumId]);

  const allLessons = useMemo(() => {
    if (!curriculumDetail) return [];
    const out = [];
    for (const u of (curriculumDetail.units || [])) {
      for (const l of (u.lessons || [])) {
        out.push({ id: l.id, title: l.title, unitTitle: u.title });
      }
    }
    return out;
  }, [curriculumDetail]);

  function pickCurriculum(id) {
    onChange?.({ curriculumId: id || null, lessonId: null });
  }
  function pickLesson(id) {
    onChange?.({ curriculumId, lessonId: id || null });
  }
  function clearAll() {
    onChange?.(null);
  }

  const Wrapper = compact ? 'div' : 'div';
  const wrapperClass = compact
    ? 'flex flex-wrap items-center gap-2'
    : 'flex flex-col gap-2';

  return (
    <Wrapper className={wrapperClass}>
      <label className={`text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 ${compact ? '' : 'block'}`}>
        <BookOpen size={10} className="inline -mt-0.5 mr-1" />
        Link to curriculum
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={curriculumId || ''}
          onChange={e => pickCurriculum(e.target.value || null)}
          disabled={loadingCurricula}
          className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="">— None —</option>
          {curricula.map(c => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>

        {allowLesson && curriculumId && (
          <>
            <ChevronRight size={12} className="text-gray-400" />
            <select
              value={lessonId || ''}
              onChange={e => pickLesson(e.target.value || null)}
              disabled={loadingDetail || !allLessons.length}
              className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30 max-w-[260px]"
            >
              <option value="">— Whole curriculum —</option>
              {allLessons.map(l => (
                <option key={l.id} value={l.id}>{l.unitTitle} · {l.title}</option>
              ))}
            </select>
          </>
        )}

        {(curriculumId || lessonId) && (
          <button
            onClick={clearAll}
            type="button"
            title="Clear link"
            className="p-1 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-gray-100 dark:hover:bg-[#1e1e2e]"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </Wrapper>
  );
}
