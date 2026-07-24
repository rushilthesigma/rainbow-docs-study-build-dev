import { useEffect, useState } from 'react';
import { BookOpen, Plus, ChevronRight, ArrowLeft, CheckCircle2, Circle, FileText, Sparkles, Zap, Store, Search, Download, UserRound, EyeOff, Upload, X } from 'lucide-react';
import { listCurricula, deleteCurriculum, getCurriculum, generateCurriculum, listCurriculumMarketplace, enrollMarketplaceCurriculum, publishCurriculum, unpublishCurriculum } from '../../api/curriculum';
import { DEFAULT_SETTINGS } from '../../utils/constants';
import BlockLessonView from '../lesson/BlockLessonView';
import ProgressBar, { InlineProgress } from '../shared/ProgressBar';

// Mobile-native Curricula flow: list → detail (units / lessons) →
// lesson runner (BlockLessonView). Centered titles, large touch
// targets, full coverage so the admin Mobile Preview can drive a real
// course end-to-end.
export default function MobileCurricula({ onNavigate }) {
  const [view, setView] = useState('list'); // list | detail | lesson | new | marketplace
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

  // marketplace / publishing
  const [marketplace, setMarketplace] = useState([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState('');
  const [enrollingId, setEnrollingId] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishAnonymous, setPublishAnonymous] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);

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
    if (lesson.type === 'quiz_bowl') {
      const category = activeCurriculum?.category === 'History' ? 'History' : 'Geography';
      sessionStorage.setItem('mobileQuizBowlInitialSetup', JSON.stringify({
        category: lesson.quizBowlCategory || category,
        difficulty: 'Medium',
        source: 'ai',
        customInstructions: `Focus on: ${lesson.quizBowlTopic || `${activeCurriculum?.title}: ${lesson.title}`}`,
        questionCount: 5,
        autoStart: true,
        curriculumId: activeCurriculum?.id,
        curriculumLessonId: lesson.id,
      }));
      onNavigate?.('quizbowl');
      return;
    }
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

  async function openMarketplace() {
    setView('marketplace');
    if (marketplace.length || marketplaceLoading) return;
    setMarketplaceLoading(true); setMarketplaceError('');
    try {
      const data = await listCurriculumMarketplace();
      setMarketplace(data.listings || []);
    } catch (err) {
      setMarketplaceError(err.message || 'Could not load the marketplace');
    } finally {
      setMarketplaceLoading(false);
    }
  }

  async function enrollFromMarketplace(listing) {
    if (enrollingId) return;
    setMarketplaceError('');
    setEnrollingId(listing.listingId);
    try {
      const data = await enrollMarketplaceCurriculum(listing.listingId);
      // Add the returned course to the main list immediately, then refresh it
      // from the server. The user lands back on My courses with the result
      // visible instead of a detail screen that can look unchanged.
      const fallback = [data.curriculum, ...items.filter(course => course.id !== data.curriculum.id)];
      setItems(fallback);
      try {
        const latest = await listCurricula();
        setItems(latest.curricula || fallback);
      } catch (refreshError) {
        console.warn('Could not refresh curricula after enrollment:', refreshError);
      }
      setActiveCurriculum(null);
      setView('list');
    } catch (err) {
      setMarketplaceError(err.message || 'Could not add this curriculum');
    } finally {
      setEnrollingId(null);
    }
  }

  function showPublishPanel() {
    setPublishAnonymous(activeCurriculum?.marketplace?.anonymous === true);
    setPublishOpen(true);
  }

  async function savePublication() {
    if (!activeCurriculum || publishBusy) return;
    setPublishBusy(true);
    try {
      const data = await publishCurriculum(activeCurriculum.id, publishAnonymous);
      const updated = { ...activeCurriculum, marketplace: data.marketplace };
      setActiveCurriculum(updated);
      setItems(prev => prev.map(course => course.id === updated.id ? { ...course, marketplace: data.marketplace } : course));
      setMarketplace([]);
      setPublishOpen(false);
    } catch (err) {
      setMarketplaceError(err.message || 'Could not publish this curriculum');
    } finally {
      setPublishBusy(false);
    }
  }

  async function removePublication() {
    if (!activeCurriculum || publishBusy) return;
    setPublishBusy(true);
    try {
      const data = await unpublishCurriculum(activeCurriculum.id);
      const updated = { ...activeCurriculum, marketplace: data.marketplace };
      setActiveCurriculum(updated);
      setItems(prev => prev.map(course => course.id === updated.id ? { ...course, marketplace: data.marketplace } : course));
      setMarketplace([]);
      setPublishOpen(false);
    } catch (err) {
      setMarketplaceError(err.message || 'Could not remove this listing');
    } finally {
      setPublishBusy(false);
    }
  }

  // ===== LESSON =====
  if (view === 'lesson' && activeLesson && activeCurriculum) {
    return (
      <div key="lesson" className="animate-fade-in">
        <BlockLessonView
          curriculumId={activeCurriculum.id}
          lesson={activeLesson}
          onBack={() => { setActiveLesson(null); setView('detail'); }}
          backLabel="Back to course"
        />
      </div>
    );
  }

  // ===== DETAIL =====
  if (view === 'detail' && activeCurriculum) {
    return (
      <div key="detail" className="px-4 pt-3 pb-8 animate-fade-in">
        <button onClick={() => { setActiveCurriculum(null); setView('list'); }} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-500 dark:text-gray-400 mb-4 active:text-gray-700 dark:active:text-gray-200">
          <ArrowLeft size={14} /> All courses
        </button>
        <div className="text-center mb-5">
          <div className="inline-grid place-items-center w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-500 mb-2">
            <BookOpen size={20} />
          </div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white leading-tight">{activeCurriculum.title}</h1>
          <button
            onClick={showPublishPanel}
            className={`mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-[12px] font-semibold ${
              activeCurriculum.marketplace?.published
                ? 'border-blue-300 dark:border-blue-400/30 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-200'
                : 'border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-gray-600 dark:text-white/55'
            }`}
          >
            <Upload size={13} /> {activeCurriculum.marketplace?.published ? 'Published' : 'Publish to marketplace'}
          </button>
        </div>

        {publishOpen && (
          <div className="mb-5 rounded-2xl border border-blue-200 dark:border-blue-400/20 bg-white dark:bg-[#13131f] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[14px] font-bold text-gray-900 dark:text-white">Public listing</p>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-white/40">Progress, scores, answers, and chats stay private.</p>
              </div>
              <button aria-label="Close publish panel" onClick={() => setPublishOpen(false)} className="min-h-11 min-w-11 -mr-2 -mt-2 grid place-items-center text-gray-400 dark:text-white/35"><X size={16} /></button>
            </div>
            <button
              onClick={() => setPublishAnonymous(value => !value)}
              className="mt-3 w-full min-h-12 flex items-center gap-3 rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 text-left"
              role="switch"
              aria-checked={publishAnonymous}
            >
              {publishAnonymous ? <EyeOff size={16} className="text-blue-500" /> : <UserRound size={16} className="text-gray-400" />}
              <div className="flex-1">
                <p className="text-[12.5px] font-semibold text-gray-800 dark:text-white/80">Post anonymously</p>
                <p className="text-[10.5px] text-gray-500 dark:text-white/35">Hide your name from the listing</p>
              </div>
              <span className={`h-5 w-9 rounded-full p-0.5 transition-colors ${publishAnonymous ? 'bg-blue-500' : 'bg-gray-200 dark:bg-white/15'}`}>
                <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${publishAnonymous ? 'translate-x-4' : ''}`} />
              </span>
            </button>
            <div className="mt-3 flex gap-2">
              {activeCurriculum.marketplace?.published && (
                <button disabled={publishBusy} onClick={removePublication} className="min-h-11 rounded-xl px-3 text-[12px] font-semibold text-rose-500 disabled:opacity-50">Remove</button>
              )}
              <button disabled={publishBusy} onClick={savePublication} className="ml-auto min-h-11 rounded-xl bg-blue-500 px-4 text-[12px] font-bold text-white active:bg-blue-400 disabled:opacity-50">
                {publishBusy ? 'Saving…' : activeCurriculum.marketplace?.published ? 'Save listing' : 'Publish publicly'}
              </button>
            </div>
          </div>
        )}

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
                  const isQuizBowl = l.type === 'quiz_bowl';
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
                          : isQuizBowl ? 'bg-amber-100 dark:bg-amber-500/15'
                          : 'bg-blue-100 dark:bg-blue-500/15'
                        }`}>
                          {completed
                            ? <CheckCircle2 size={17} className="text-emerald-500" />
                            : isExam
                              ? <FileText size={17} className="text-rose-500" />
                              : isQuizBowl
                                ? <Zap size={17} className="text-amber-500" />
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

  // ===== MARKETPLACE =====
  if (view === 'marketplace') {
    return (
      <MobileMarketplace
        listings={marketplace}
        loading={marketplaceLoading}
        error={marketplaceError}
        enrollingId={enrollingId}
        onBack={() => setView('list')}
        onEnroll={enrollFromMarketplace}
      />
    );
  }

  // ===== NEW =====
  if (view === 'new') {
    return (
      <div key="new" className="px-4 pt-3 pb-8 animate-fade-in">
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
    <div key="list" className="px-4 pt-5 pb-8 animate-fade-in">
      <h1 className="text-center text-[26px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white mb-1">
        My Courses
      </h1>
      <p className="text-center text-[12.5px] text-gray-500 dark:text-gray-400 mb-5">
        {loading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'course' : 'courses'}`}
      </p>

      <button
        onClick={openMarketplace}
        className="w-full rounded-2xl border border-blue-200 dark:border-blue-400/20 bg-blue-50 dark:bg-blue-500/10 p-4 mb-2 active:scale-[0.99] transition-transform text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-500/15 grid place-items-center shrink-0">
            <Store size={20} className="text-blue-600 dark:text-blue-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold tracking-tight text-gray-900 dark:text-white">Curriculum Marketplace</p>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-white/40">Find preset and community-made courses</p>
          </div>
          <ChevronRight size={16} className="text-blue-400" />
        </div>
      </button>

      <button
        onClick={() => { setTopic(''); setGenError(null); setView('new'); }}
        className="w-full rounded-2xl bg-blue-500 text-white p-4 mb-5 active:scale-[0.99] transition-transform text-left"
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

function MobileMarketplace({ listings, loading, error, enrollingId, onBack, onEnroll }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const filters = ['All', 'Community', 'Math', 'Science', 'History', 'Geography'];
  const needle = query.trim().toLowerCase();
  const visible = listings.filter(course => {
    const sourceLabel = course.source === 'community' ? 'community community made' : 'preset course library';
    const searchable = [course.title, course.description, course.category, course.subject, course.author, course.grade, sourceLabel].filter(Boolean).join(' ').toLowerCase();
    return (!needle || searchable.includes(needle)) && (
      filter === 'All'
      || (filter === 'Community' && course.source === 'community')
      || String(course.category || course.subject || '').toLowerCase().includes(filter.toLowerCase())
    );
  });

  return (
    <div key="marketplace" className="px-4 pt-3 pb-8 animate-fade-in">
      <button onClick={onBack} className="min-h-11 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-500 dark:text-gray-400 -ml-2 px-2 mb-2">
        <ArrowLeft size={14} /> My courses
      </button>
      <div className="mb-4">
        <h1 className="text-[24px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white">Curriculum Marketplace</h1>
        <p className="mt-1 text-[12px] text-gray-500 dark:text-white/40">Courses from Covalent and the community.</p>
      </div>

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          inputMode="search"
          placeholder="Search courses, topics, or creators…"
          className="w-full rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#13131f] py-3 pl-10 pr-3 text-[14px] text-gray-900 dark:text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <div className="scrollbar-hide flex gap-2 overflow-x-auto -mx-1 px-1 pb-4">
        {filters.map(item => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={`shrink-0 min-h-11 rounded-xl px-3 text-[12px] font-semibold ${
              filter === item
                ? 'bg-blue-500 text-white'
                : 'border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.04] text-gray-600 dark:text-white/50'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-12 text-center text-[12px] text-gray-400">Loading marketplace…</p>
      ) : error && !listings.length ? (
        <div className="py-12 text-center">
          <Store size={28} className="mx-auto mb-3 text-gray-300 dark:text-white/15" />
          <p className="text-[13px] text-rose-500">{error}</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="py-12 text-center">
          <Search size={28} className="mx-auto mb-3 text-gray-300 dark:text-white/15" />
          <p className="text-[13px] text-gray-500 dark:text-white/40">No matching curricula.</p>
        </div>
      ) : (
        <div>
          {error && (
            <p role="alert" className="mb-3 rounded-xl border border-rose-200 dark:border-rose-400/20 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-[11px] text-rose-600 dark:text-rose-300">{error}</p>
          )}
          <p className="px-1 pb-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
            {needle || filter !== 'All' ? 'Results' : 'Explore'} · {visible.length}
          </p>
          <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
            {visible.map(course => (
              <div key={course.listingId} className="flex items-center gap-3 py-3">
                <div className={`h-10 w-10 shrink-0 rounded-xl grid place-items-center ${course.source === 'community' ? 'bg-blue-500/15 text-blue-500' : 'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/45'}`}>
                  {course.source === 'community' ? <UserRound size={17} /> : <BookOpen size={17} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold text-gray-900 dark:text-white">{course.title}</p>
                  <p className="mt-0.5 truncate text-[10.5px] text-gray-500 dark:text-white/40">{course.author} · {course.unitCount} units · {course.lessonCount} lessons</p>
                </div>
                <button
                  onClick={() => onEnroll(course)}
                  disabled={enrollingId === course.listingId}
                  aria-label={`Add ${course.title}`}
                  className="min-h-11 min-w-11 rounded-xl border border-blue-500 bg-blue-500 grid place-items-center text-white active:bg-blue-400 disabled:opacity-40"
                >
                  {enrollingId === course.listingId ? <span className="text-[10px]">•••</span> : <Download size={15} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
