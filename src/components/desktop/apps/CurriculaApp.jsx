import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Plus, Sparkles, Loader2, BookOpen, ChevronDown, ChevronRight, CheckCircle2, Circle, Lock, ClipboardCheck, PenTool, FileText, Check, X, Trophy, Wand2, Paperclip, Upload, Calculator, GraduationCap, Atom, Sigma, Map as MapIcon, List } from 'lucide-react';
import { listCurricula, generateCurriculum, getCurriculum, sendLessonMessage, getLessonHistory, editCurriculumWithAI, extractSourceUrl, extractFiles } from '../../../api/curriculum';
import { apiFetch } from '../../../api/client';
import { useWindowManager } from '../../../context/WindowManagerContext';
import { useDemoMode } from '../../../context/DemoModeContext';
import { DEFAULT_SETTINGS, DIFFICULTY_OPTIONS, LEARNING_STYLE_OPTIONS } from '../../../utils/constants';
import Button from '../../shared/Button';
import Input from '../../shared/Input';
import PillGroup from '../../shared/PillGroup';
import Toggle from '../../shared/Toggle';
import LoadingSpinner from '../../shared/LoadingSpinner';
import LoadingProgress from '../../shared/ProgressBar';
import { SkeletonProse } from '../../shared/Skeleton';
import ProgressBar from '../../curriculum/ProgressBar';
import ChatContainer from '../../chat/ChatContainer';
import MathText from '../../shared/MathText';
import MathTutorApp from './MathTutorApp';
import TrailView from '../../curriculum/TrailView';
import BlockLessonView from '../../lesson/BlockLessonView';
import ExamBlock from '../../lesson/ExamBlock';
import { useAuth } from '../../../context/AuthContext';
import { errorChatMessage } from '../../../utils/aiErrors';
import useBrowserBack from '../../../hooks/useBrowserBack';
import { InlineProgress } from '../../shared/ProgressBar';

const TYPE_ICONS = { lesson: BookOpen, math_tutor: Calculator, practice: PenTool, essay: FileText, unit_test: ClipboardCheck };
const TYPE_COLORS = { lesson: 'text-blue-400', math_tutor: 'text-indigo-400', practice: 'text-purple-400', essay: 'text-amber-400', unit_test: 'text-rose-400' };

export default function CurriculaApp() {
  const { user } = useAuth();
  const isBeta = !!user?.data?.isBeta;
  // Trail view (BETA) — gamifies the curriculum into a Duolingo-style
  // zigzag path. Persists per-curriculum in localStorage so toggling
  // back to list view is a one-click thing.
  const [trailMode, setTrailMode] = useState(() => {
    try { return localStorage.getItem('cov-curr-trail') === '1'; } catch { return false; }
  });
  function toggleTrail() {
    setTrailMode(prev => {
      const next = !prev;
      try { localStorage.setItem('cov-curr-trail', next ? '1' : '0'); } catch {}
      return next;
    });
  }
  const [view, setView] = useState('list');
  const [curricula, setCurricula] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCurriculum, setSelectedCurriculum] = useState(null);
  // WindowManager is optional — the desktop shell provides it, but if this
  // component is ever rendered outside of one (mobile, for instance) we
  // just skip the math-tutor handoff rather than crashing.
  let wm = null;
  try { wm = useWindowManager(); } catch {}
  const isDemo = useDemoMode();

  // Browser Back navigates up one level inside the curriculum stack instead
  // of leaving the SPA. lesson / math_tutor / assessment → detail → list.
  useBrowserBack(view !== 'list', () => {
    if (view === 'lesson') setView('detail');
    else if (view === 'assessment') setView('detail');
    else if (view === 'math_tutor') setView('detail');
    else setView('list');
  });

  // Lesson view
  const [currentLesson, setCurrentLesson] = useState(null);
  const [lessonMessages, setLessonMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingSources, setStreamingSources] = useState([]);
  const [searchStatus, setSearchStatus] = useState(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const streamRef = useRef('');
  const streamSourcesRef = useRef([]);
  const abortRef = useRef(null);
  const autoStarted = useRef(false);

  // New curriculum
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  // Source material attached to a new curriculum: textbooks (PDF / text)
  // and websites (URL → server-fetched + HTML-stripped). Each entry:
  //   { id, title, kind: 'pdf' | 'text' | 'url', content, url?, chars }
  const [sources, setSources] = useState([]);
  const [sourceUrlInput, setSourceUrlInput] = useState('');
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const sourceFileRef = useRef(null);

  // Edit curriculum modal
  const [editOpen, setEditOpen] = useState(false);

  // PAUSD catalog browser state
  const [pausdCatalog, setPausdCatalog] = useState([]);
  const [pausdLoading, setPausdLoading] = useState(false);
  const [enrollingSlug, setEnrollingSlug] = useState(null);

  useEffect(() => {
    listCurricula().then(d => { setCurricula(d.curricula || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // Lazy-load the PAUSD catalog the first time the user opens that view.
  async function loadPausdCatalog() {
    if (pausdCatalog.length || pausdLoading) return;
    setPausdLoading(true);
    try {
      const data = await apiFetch('/api/pausd/catalog');
      setPausdCatalog(data.catalog || []);
    } catch (e) { console.error('Failed to load PAUSD catalog:', e); }
    setPausdLoading(false);
  }

  async function enrollPausd(slug) {
    if (enrollingSlug) return;
    setEnrollingSlug(slug);
    try {
      const data = await apiFetch('/api/pausd/enroll', {
        method: 'POST',
        body: JSON.stringify({ slug }),
      });
      // If they're already enrolled, show the existing one. Otherwise
      // prepend the new one.
      if (data.alreadyEnrolled) {
        setSelectedCurriculum(data.curriculum);
      } else {
        setCurricula(prev => [data.curriculum, ...prev.filter(c => c.id !== data.curriculum.id)]);
        setSelectedCurriculum(data.curriculum);
      }
      setView('detail');
    } catch (e) {
      console.error('Enroll failed:', e);
      alert('Failed to enroll: ' + (e?.message || 'unknown error'));
    }
    setEnrollingSlug(null);
  }

  async function handleGenerate() {
    if (!settings.topic.trim() || generating) return;
    setGenerating(true); setGenError(null);
    try {
      // Strip the local id (used only for React keys + remove-button) before
      // sending — server doesn't care about it.
      const cleanSources = sources.map(({ id, ...rest }) => rest); // eslint-disable-line no-unused-vars
      const data = await generateCurriculum(settings, cleanSources);
      setCurricula(prev => [data.curriculum, ...prev]);
      setSelectedCurriculum(data.curriculum);
      setView('detail');
      setSettings(DEFAULT_SETTINGS);
      setSources([]);
    } catch (err) { setGenError(err.message || 'Failed'); }
    setGenerating(false);
  }

  async function handleAddSourceUrl(e) {
    e?.preventDefault?.();
    const url = sourceUrlInput.trim();
    if (!url || sourceBusy) return;
    setSourceBusy(true); setSourceError('');
    try {
      const s = await extractSourceUrl(url);
      setSources(prev => [...prev, { id: crypto.randomUUID?.() || String(Date.now()), ...s }]);
      setSourceUrlInput('');
    } catch (err) {
      setSourceError(err.message || 'Failed to fetch URL');
    } finally { setSourceBusy(false); }
  }

  async function handleAddSourceFiles(filesList) {
    const files = Array.from(filesList || []);
    if (!files.length || sourceBusy) return;
    setSourceBusy(true); setSourceError('');
    try {
      const { files: extracted } = await extractFiles(files);
      const ok = (extracted || []).filter(f => !f.error && f.text);
      const failed = (extracted || []).filter(f => f.error);
      if (ok.length) {
        setSources(prev => [
          ...prev,
          ...ok.map(f => ({
            id: crypto.randomUUID?.() || String(Date.now() + Math.random()),
            title: f.name, kind: f.kind || 'text', content: f.text, chars: (f.text || '').length,
          })),
        ]);
      }
      if (failed.length) setSourceError(`${failed.length} file(s) couldn't be extracted: ${failed.map(f => f.name).join(', ')}`);
    } catch (err) {
      setSourceError(err.message || 'Failed to extract files');
    } finally {
      setSourceBusy(false);
      if (sourceFileRef.current) sourceFileRef.current.value = '';
    }
  }

  function removeSource(id) {
    setSources(prev => prev.filter(s => s.id !== id));
  }

  async function openCurriculum(id) {
    setView('detail');
    try { const data = await getCurriculum(id); setSelectedCurriculum(data.curriculum); } catch {}
  }

  async function openLesson(lesson, curriculumId) {
    setCurrentLesson({ ...lesson, curriculumId });
    // Unit-test typed lessons go to a real assessment quiz, not the chat tutor.
    if (lesson.type === 'unit_test' || lesson.type === 'essay') {
      setView('assessment');
      return;
    }
    // Math Tutor lessons embed the tutor INLINE inside the curriculum view
    // (don't pop a separate window). The MathTutorApp accepts a seedTopic
    // prop and auto-starts on the lesson's topic.
    if (lesson.type === 'math_tutor') {
      setView('math_tutor');
      return;
    }
    // Practice lessons (math canvas) — also embed inline for now via the
    // same math-tutor flow seeded with a "give me practice problems" prompt.
    if (lesson.type === 'practice') {
      setView('math_tutor');
      return;
    }
    setView('lesson');
    setLessonMessages([]);
    setSourceMode(false);
    autoStarted.current = false;
    try {
      const hist = await getLessonHistory(curriculumId, lesson.id);
      setLessonMessages(hist.chatHistory || []);
      if (!hist.chatHistory?.length && !autoStarted.current) {
        autoStarted.current = true;
        setTimeout(() => doSendLesson(`I'm ready to learn about "${lesson.title}". Let's begin!`, curriculumId, lesson.id, { sourced: true }), 200);
      }
    } catch {}
  }

  function doSendLesson(text, cid, lid, opts = {}) {
    const wasSourced = !!(opts.sourced ?? sourceMode);
    const images = opts.images || [];
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    if (images.length) userMsg.images = images.map(i => ({ dataUrl: i.dataUrl, name: i.name }));
    setLessonMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent('');
    setStreamingSources([]);
    setSearchStatus(wasSourced ? 'searching' : null);
    streamRef.current = '';
    streamSourcesRef.current = [];

    const abort = sendLessonMessage(cid || currentLesson?.curriculumId, lid || currentLesson?.id, text, images, {
      onChunk: c => { streamRef.current += c; setStreamingContent(streamRef.current); if (searchStatus) setSearchStatus(null); },
      onSource: src => {
        streamSourcesRef.current = [...streamSourcesRef.current, src];
        setStreamingSources(streamSourcesRef.current);
      },
      onStatus: s => setSearchStatus(s),
      onDone: () => {
        const full = streamRef.current;
        const sources = streamSourcesRef.current;
        if (full) {
          const msg = { role: 'assistant', content: full, timestamp: new Date().toISOString() };
          if (sources.length) msg.sources = sources;
          setLessonMessages(m => [...m, msg]);
        }
        setStreamingContent(''); setStreamingSources([]); setSearchStatus(null);
        streamRef.current = ''; streamSourcesRef.current = [];
        setStreaming(false);
      },
      onError: err => {
        setLessonMessages(m => [...m, errorChatMessage(err)]);
        setStreamingContent(''); setStreamingSources([]); setSearchStatus(null);
        streamRef.current = ''; streamSourcesRef.current = [];
        setStreaming(false);
      },
    }, wasSourced);
    abortRef.current = abort;
  }

  const handleLessonSend = useCallback((text, images) => {
    if (streaming) return;
    doSendLesson(text, null, null, { images });
  }, [streaming, currentLesson]);

  // ===== Assessment (unit_test / essay) — real quiz, not a chat tutor =====
  if (view === 'assessment' && currentLesson) {
    return (
      <AssessmentView
        lesson={currentLesson}
        curriculum={selectedCurriculum}
        onBack={() => setView('detail')}
      />
    );
  }

  // ===== Math Tutor — embedded inline. The MathTutorApp component is
  // re-used here with a seedTopic prop so it auto-starts on this lesson's
  // topic without going through its own setup view. Both 'math_tutor' and
  // 'practice' lesson types route here; the seed prompt is slightly
  // different so practice sessions lead with problems instead of theory.
  if (view === 'math_tutor' && currentLesson) {
    const isPractice = currentLesson.type === 'practice';
    const seed = currentLesson.practiceTopic || currentLesson.title;
    return (
      <div className="h-full flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-3 flex-shrink-0">
          <button onClick={() => setView('detail')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200">
            <ArrowLeft size={16} /> Back to curriculum
          </button>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs font-semibold text-indigo-500 uppercase tracking-wider">{isPractice ? 'Practice · Math Canvas' : 'Math Tutor'}</span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{currentLesson.title}</span>
        </div>
        <div className="flex-1 min-h-0">
          <MathTutorApp
            seedTopic={isPractice ? `Practice problems on ${seed}. Give me one problem at a time on the canvas — start at moderate difficulty and escalate.` : seed}
            onBack={() => setView('detail')}
          />
        </div>
      </div>
    );
  }

  // Lesson view
  if (view === 'lesson' && currentLesson) {
    // Plain "lesson" type uses the new Claudius-style 4R/4Q block view
    // with SRS. Math / essay / unit_test still go through their own flows.
    if (currentLesson.type === 'lesson' || !currentLesson.type) {
      return (
        <BlockLessonView
          curriculumId={selectedCurriculum?.id}
          lesson={currentLesson}
          onBack={() => setView('detail')}
        />
      );
    }
    const header = (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]">
        <button onClick={() => setView('detail')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><ArrowLeft size={16} /></button>
        <BookOpen size={14} className="text-blue-500" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{currentLesson.title}</span>
      </div>
    );
    function handleUserEdit(idx, newContent) {
      if (streaming) return;
      if (abortRef.current) try { abortRef.current(); } catch {}
      setLessonMessages(prev => prev.slice(0, idx));
      setTimeout(() => doSendLesson(newContent, null, null, {}), 30);
    }
    // Regenerate the AI bubble IN PLACE. The hidden instruction is sent to
    // the server alongside the prior user text; the client transcript only
    // shows the original user turn + the new AI reply.
    function handleAiInstruct(idx, instruction) {
      if (streaming || !instruction?.trim()) return;
      let userIdx = idx - 1;
      while (userIdx >= 0 && lessonMessages[userIdx]?.role !== 'user') userIdx--;
      if (userIdx < 0) return;
      const prevUserText = lessonMessages[userIdx].content || '';
      const userMsgSnapshot = lessonMessages[userIdx];
      if (abortRef.current) try { abortRef.current(); } catch {}
      setLessonMessages(prev => [...prev.slice(0, userIdx), userMsgSnapshot]);
      const hidden = `${prevUserText}\n\n[SYSTEM NOTE: Regenerate your previous answer — this time ${instruction.trim()}. Do NOT acknowledge this instruction. Just output the revised answer directly.]`;
      setTimeout(() => doSendLessonRegenerate(hidden), 30);
    }

    // No visible user-msg added; only the AI reply appends on done.
    function doSendLessonRegenerate(text) {
      setStreaming(true); setStreamingContent(''); setStreamingSources([]);
      streamRef.current = ''; streamSourcesRef.current = [];
      const abort = sendLessonMessage(currentLesson?.curriculumId, currentLesson?.id, text, [], {
        onChunk: c => { streamRef.current += c; setStreamingContent(streamRef.current); },
        onSource: src => {
          streamSourcesRef.current = [...streamSourcesRef.current, src];
          setStreamingSources(streamSourcesRef.current);
        },
        onStatus: s => setSearchStatus(s),
        onDone: () => {
          const full = streamRef.current;
          const sources = streamSourcesRef.current;
          if (full) {
            const msg = { role: 'assistant', content: full, timestamp: new Date().toISOString(), _edited: true };
            if (sources.length) msg.sources = sources;
            setLessonMessages(m => [...m, msg]);
          }
          setStreamingContent(''); setStreamingSources([]); setSearchStatus(null);
          streamRef.current = ''; streamSourcesRef.current = [];
          setStreaming(false);
        },
        onError: err => {
          setLessonMessages(m => [...m, errorChatMessage(err)]);
          setStreamingContent(''); setStreamingSources([]); setSearchStatus(null);
          streamRef.current = ''; streamSourcesRef.current = [];
          setStreaming(false);
        },
      }, !!sourceMode);
      abortRef.current = abort;
    }
    return (
      <ChatContainer
        messages={lessonMessages}
        streamingContent={streamingContent}
        streamingSources={streamingSources}
        searchStatus={searchStatus}
        onSend={handleLessonSend}
        disabled={streaming}
        placeholder={streaming ? 'AI is thinking...' : 'Message...'}
        header={header}
        className="h-full"
        sourceMode={sourceMode}
        onToggleSource={setSourceMode}
        onUserEditMessage={handleUserEdit}
        onAiInstruct={handleAiInstruct}
      />
    );
  }

  // Detail view
  if (view === 'detail' && selectedCurriculum) {
    const c = selectedCurriculum;
    const totalLessons = (c.units || []).reduce((s, u) => s + (u.lessons || []).length, 0);
    const completedLessons = (c.units || []).reduce((s, u) => s + (u.lessons || []).filter(l => l.isCompleted).length, 0);

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { setView('list'); setSelectedCurriculum(null); }} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200">
            <ArrowLeft size={16} /> All Curricula
          </button>
          <div className="flex items-center gap-2">
            {isBeta && (
              <button
                onClick={toggleTrail}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  trailMode
                    ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                    : 'border-gray-200 dark:border-[#2A2A40] text-gray-700 dark:text-gray-300 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400'
                }`}
                title="Trail view (BETA) — gamified curriculum path"
              >
                {trailMode ? <List size={12} /> : <MapIcon size={12} />}
                {trailMode ? 'List view' : 'Trail'}
                <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">BETA</span>
              </button>
            )}
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#2A2A40] text-xs font-medium text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600"
              title="Edit with AI"
            >
              <Wand2 size={12} /> Edit with AI
            </button>
          </div>
        </div>
        {!trailMode && (
          <>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{c.title}</h1>
            {c.description && <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{c.description}</p>}
            <div className="flex items-center gap-3 mb-4">
              <ProgressBar value={completedLessons} max={totalLessons} className="flex-1" />
              <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">{completedLessons}/{totalLessons}</span>
            </div>
          </>
        )}
        {trailMode && isBeta ? (
          <TrailView curriculum={c} onOpenLesson={(l) => openLesson(l, c.id)} />
        ) : (
          <div className="space-y-3">
            {(c.units || []).map((unit, i) => (
              <UnitSection
                key={unit.id}
                unit={i === 0 ? { ...unit, tourAnchorFirst: true } : unit}
                onOpenLesson={(l) => openLesson(l, c.id)}
              />
            ))}

            {/* Course-level midterm + final, with spaced repetition */}
            <div className="pt-4">
              <ExamBlock curriculumId={c.id} />
            </div>
          </div>
        )}

        {editOpen && (
          <EditCurriculumModal
            curriculum={c}
            onClose={() => setEditOpen(false)}
            onUpdated={(updated) => {
              setSelectedCurriculum(updated);
              // Also update list-view cache so the updated title/descr propagate
              setCurricula(prev => prev.map(x => x.id === updated.id ? updated : x));
              setEditOpen(false);
            }}
          />
        )}
      </div>
    );
  }

  // New curriculum
  if (view === 'new') {
    return (
      <div>
        <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-4"><ArrowLeft size={16} /> Back</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">New Curriculum</h2>
        {generating ? (
          <div className="py-10 px-2 max-w-xl mx-auto w-full">
            <LoadingProgress
              active
              label={`Generating ${settings.topic || 'curriculum'}…`}
              hint="Building units + lesson outlines. 20-40 seconds."
              duration={30000}
            />
            <div className="mt-6">
              <SkeletonProse lines={5} />
            </div>
            {isDemo && (
              <div className="mt-6 max-w-sm mx-auto text-center rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
                <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-300 mb-0.5">Please don&apos;t leave the app.</p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Full curriculum generation takes 20–40 seconds. Switching tabs or closing this window will cancel the request.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {genError && <div className="px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-900/15 border border-rose-200 dark:border-rose-800 text-xs text-rose-600">{genError}</div>}
            <Input label="Topic" placeholder="e.g., Calculus, US History..." value={settings.topic} onChange={e => setSettings(p => ({ ...p, topic: e.target.value }))} data-tour="curriculum-topic-input" />
            <PillGroup label="Difficulty" options={DIFFICULTY_OPTIONS} value={settings.difficulty} onChange={v => setSettings(p => ({ ...p, difficulty: v }))} />
            <PillGroup label="Learning Style" options={LEARNING_STYLE_OPTIONS} value={settings.learningStyle} onChange={v => setSettings(p => ({ ...p, learningStyle: v }))} />
            <div className="flex gap-4">
              <Toggle label="Examples" checked={settings.includeExamples} onChange={v => setSettings(p => ({ ...p, includeExamples: v }))} />
              <Toggle label="Exercises" checked={settings.includeExercises} onChange={v => setSettings(p => ({ ...p, includeExercises: v }))} />
            </div>

            {/* ===== Source material (textbooks + websites) ===== */}
            <div className="rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] p-4">
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200">Source material <span className="font-normal opacity-60">(optional)</span></p>
                {sources.length > 0 && (
                  <span className="text-[10px] text-gray-400 tabular-nums">{sources.length}/8</span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                Drop in a textbook PDF or paste a URL — the AI will align the curriculum to your sources instead of generating from scratch.
              </p>

              {/* URL input */}
              <form onSubmit={handleAddSourceUrl} className="flex items-center gap-2 mb-2">
                <input
                  type="url"
                  value={sourceUrlInput}
                  onChange={e => setSourceUrlInput(e.target.value)}
                  placeholder="https://example.com/article"
                  disabled={sourceBusy || sources.length >= 8}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sourceBusy || !sourceUrlInput.trim() || sources.length >= 8}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1.5"
                >
                  {sourceBusy ? <InlineProgress active /> : <><Plus size={12} /> Add URL</>}
                </button>
              </form>

              {/* File picker */}
              <input
                ref={sourceFileRef}
                type="file"
                multiple
                accept=".pdf,.txt,.md,.csv,.json,.tex"
                className="hidden"
                onChange={e => handleAddSourceFiles(e.target.files)}
              />
              <button
                onClick={() => sourceFileRef.current?.click()}
                disabled={sourceBusy || sources.length >= 8}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-dashed border-gray-300 dark:border-[#2A2A40] text-gray-500 dark:text-gray-400 text-xs hover:border-blue-400 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
              >
                {sourceBusy ? <InlineProgress active /> : <Paperclip size={13} />}
                Attach textbook PDFs or text files
              </button>

              {sourceError && (
                <div className="mt-2 px-2.5 py-1.5 rounded-md text-[11px] text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/15 border border-rose-200 dark:border-rose-800/40 flex items-center justify-between gap-2">
                  <span>{sourceError}</span>
                  <button onClick={() => setSourceError('')} className="opacity-70 hover:opacity-100"><X size={11} /></button>
                </div>
              )}

              {/* Source list */}
              {sources.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {sources.map(s => {
                    const Icon = s.kind === 'url' ? Sparkles : FileText;
                    return (
                      <div key={s.id} className="group flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-gray-50 dark:bg-[#0D0D14] border border-gray-200 dark:border-[#2A2A40]">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${s.kind === 'url' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}`}>
                          <Icon size={11} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-gray-900 dark:text-gray-100 truncate">{s.title}</p>
                          <p className="text-[10px] text-gray-400 truncate">{s.url || s.kind} · {Math.round((s.chars || s.content?.length || 0) / 100) / 10}k chars</p>
                        </div>
                        <button
                          onClick={() => removeSource(s.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-rose-500 transition-all flex-shrink-0"
                          title="Remove"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Button onClick={handleGenerate} disabled={!settings.topic.trim()} data-tour="curriculum-generate-button"><Sparkles size={16} /> Generate Curriculum</Button>
          </div>
        )}
      </div>
    );
  }

  // PAUSD catalog view — browse and enroll in pre-built courses
  if (view === 'pausd') {
    return (
      <PausdCatalogView
        catalog={pausdCatalog}
        loading={pausdLoading}
        enrollingSlug={enrollingSlug}
        onBack={() => setView('list')}
        onEnroll={enrollPausd}
      />
    );
  }

  // List view
  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">My Curricula</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => { loadPausdCatalog(); setView('pausd'); }}
          >
            <GraduationCap size={14} /> PAUSD Catalog
          </Button>
          <Button size="sm" data-tour="new-curriculum-button" onClick={() => setView('new')}><Plus size={14} /> New</Button>
        </div>
      </div>

      {/* PAUSD promo strip — encourages discovering the pre-built rigor track */}
      <button
        onClick={() => { loadPausdCatalog(); setView('pausd'); }}
        data-tour="pausd-catalog-button"
        className="w-full mb-4 flex items-center gap-3 p-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 hover:border-purple-400 dark:hover:border-purple-700 transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-lg bg-purple-500 text-white flex items-center justify-center flex-shrink-0">
          <GraduationCap size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">PAUSD Common Core Catalog</p>
          <p className="text-[11px] text-gray-600 dark:text-gray-300">Pre-built middle + high-school courses at PAUSD rigor: Math 6 → Geometry Honors and full middle-school science. Tap to browse.</p>
        </div>
        <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
      </button>

      {curricula.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen size={32} className="text-blue-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-4">No curricula yet</p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => setView('new')}><Plus size={16} /> Create Curriculum</Button>
            <Button variant="secondary" onClick={() => { loadPausdCatalog(); setView('pausd'); }}>
              <GraduationCap size={16} /> Browse PAUSD
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {curricula.map(c => {
            // The /api/curriculum LIST response strips `units` but supplies
            // pre-computed counters. Prefer those; fall back to recomputing
            // for full-curriculum objects just written into state after a
            // generate/edit.
            const total = typeof c.totalLessons === 'number'
              ? c.totalLessons
              : (c.units || []).reduce((s, u) => s + (u.lessons || []).length, 0);
            const done = typeof c.completedLessons === 'number'
              ? c.completedLessons
              : (c.units || []).reduce((s, u) => s + (u.lessons || []).filter(l => l.isCompleted).length, 0);
            const units = typeof c.unitCount === 'number' ? c.unitCount : (c.units?.length || 0);
            return (
              <div key={c.id} onClick={() => openCurriculum(c.id)} className="flex items-center gap-4 bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] px-4 py-3 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0"><BookOpen size={16} className="text-blue-500" /></div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{done}/{total} lessons · {units} unit{units === 1 ? '' : 's'}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Inline unit accordion (no React Router navigate)
function UnitSection({ unit, onOpenLesson }) {
  const [open, setOpen] = useState(true);
  const totalLessons = (unit.lessons || []).length;
  const completedLessons = (unit.lessons || []).filter(l => l.isCompleted).length;

  return (
    <div className={`bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] overflow-hidden ${unit.locked ? 'opacity-50' : ''}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-[#161622] transition-colors">
        {unit.locked ? <Lock size={14} className="text-gray-400" /> : open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{unit.title}</h4>
        </div>
        <span className="text-xs text-gray-400 tabular-nums">{completedLessons}/{totalLessons}</span>
      </button>
      {open && !unit.locked && (
        <div className="border-t border-gray-100 dark:border-[#2A2A40] p-1.5">
          {(unit.lessons || []).map((lesson, i) => {
            const TypeIcon = TYPE_ICONS[lesson.type] || BookOpen;
            const typeColor = TYPE_COLORS[lesson.type] || 'text-gray-400';
            // Anchor the FIRST lesson of the FIRST unit so the guided tour
            // can highlight it after enrollment.
            const tourAnchor = unit.tourAnchorFirst && i === 0 && lesson.type === 'lesson';
            return (
              <button
                key={lesson.id}
                onClick={() => onOpenLesson(lesson)}
                data-tour={tourAnchor ? 'first-lesson' : undefined}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-[#161622] transition-colors group"
              >
                {lesson.isCompleted ? <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" /> : lesson.chatHistory?.length > 0 ? <Circle size={14} className="text-blue-400 flex-shrink-0" /> : <TypeIcon size={14} className={`${typeColor} flex-shrink-0`} />}
                <span className={`text-sm flex-1 truncate ${lesson.isCompleted ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-200 group-hover:text-blue-500'}`}>{lesson.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============= Real assessment UI — handles both quiz and essay =============
function AssessmentView({ lesson, curriculum, onBack }) {
  const [assessment, setAssessment] = useState(null);
  const [answers, setAnswers] = useState({});
  const [essayText, setEssayText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState(null);

  const isEssay = lesson.type === 'essay';

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const topic = `${lesson.title}${curriculum?.title ? ` (from ${curriculum.title})` : ''}`;
        const data = await apiFetch('/api/assessment/generate', {
          method: 'POST',
          body: JSON.stringify({
            topic,
            type: isEssay ? 'essay' : 'quiz',
            questionCount: 5,
            difficulty: curriculum?.settings?.difficulty || 'beginner',
          }),
        });
        if (!alive) return;
        setAssessment(data.assessment);
      } catch (e) {
        setError(e.message || 'Failed to load assessment');
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [lesson.id, isEssay]);

  async function handleSubmit() {
    if (!assessment) return;
    setGrading(true);
    setError(null);
    try {
      const body = isEssay
        ? { assessment, answers: { essay: essayText } }
        : { assessment, answers };
      const r = await apiFetch('/api/assessment/grade', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setResult(r.result);
    } catch (e) { setError(e.message); }
    setGrading(false);
  }

  const answered = assessment?.questions?.filter((q, i) => answers[i] !== undefined).length || 0;
  const total = assessment?.questions?.length || 0;
  const wordCount = essayText.split(/\s+/).filter(Boolean).length;
  const canSubmitEssay = essayText.trim().length >= 30;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-5">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-4">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="flex items-center gap-2 mb-4">
          {isEssay ? <FileText size={18} className="text-amber-500" /> : <ClipboardCheck size={18} className="text-rose-500" />}
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{lesson.title}</h2>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 ml-1">{isEssay ? 'Graded essay' : 'Assessment'}</span>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-12 justify-center">
            <InlineProgress active />
            <span className="text-sm text-gray-500">{isEssay ? 'Building your essay prompt…' : 'Generating quiz…'}</span>
          </div>
        )}

        {error && <p className="text-sm text-rose-500 bg-rose-50 dark:bg-rose-900/20 rounded-lg p-3 mb-3">{error}</p>}

        {/* ===== ESSAY FORM ===== */}
        {!loading && !error && assessment && !result && isEssay && (
          <>
            <div className="bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] rounded-xl p-4 mb-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-600 dark:text-amber-400 mb-2">Prompt</p>
              <MathText as="p" className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{assessment.prompt || ''}</MathText>
            </div>

            {Array.isArray(assessment.rubric) && assessment.rubric.length > 0 && (
              <div className="bg-gray-50 dark:bg-[#0D0D14] border border-gray-200 dark:border-[#2A2A40] rounded-xl p-4 mb-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400 mb-2">You&rsquo;ll be graded on</p>
                <ul className="space-y-1.5">
                  {assessment.rubric.map((r, i) => (
                    <li key={i} className="text-xs text-gray-600 dark:text-gray-300 leading-snug">
                      <span className="font-semibold text-gray-800 dark:text-gray-100">{r.criterion}</span>
                      <span className="text-gray-400 dark:text-gray-500 ml-1">({r.maxScore || 5} pts)</span>
                      {r.description && <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{r.description}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <textarea
              value={essayText}
              onChange={e => setEssayText(e.target.value)}
              placeholder="Write your essay here. Make a clear claim, support it with evidence, and address each rubric criterion explicitly."
              rows={14}
              className="w-full p-3 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 resize-y leading-relaxed"
            />
            <div className="flex items-center justify-between mt-1.5 mb-3">
              <p className="text-[10px] text-gray-400 tabular-nums">
                {wordCount} word{wordCount === 1 ? '' : 's'} · {essayText.length} char{essayText.length === 1 ? '' : 's'}
              </p>
              {!canSubmitEssay && essayText.length > 0 && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">Need at least 30 characters</p>
              )}
            </div>
            <button
              onClick={handleSubmit}
              disabled={grading || !canSubmitEssay}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {grading ? <><InlineProgress active /> Grading your essay…</> : 'Submit for grading'}
            </button>
          </>
        )}

        {/* ===== QUIZ FORM ===== */}
        {!loading && !error && assessment && !result && !isEssay && (
          <>
            <p className="text-xs text-gray-500 mb-4">{total} questions · Answered {answered}/{total}</p>
            <div className="space-y-3">
              {(assessment.questions || []).map((q, i) => (
                <div key={i} className="bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] rounded-xl p-4">
                  <MathText as="p" className="text-sm font-medium text-gray-900 dark:text-white mb-3">{i + 1}. {q.question}</MathText>
                  <div className="space-y-1.5">
                    {(q.options || []).map(opt => {
                      const letter = opt.charAt(0);
                      const selected = answers[i] === letter;
                      return (
                        <button
                          key={opt}
                          onClick={() => setAnswers(prev => ({ ...prev, [i]: letter }))}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                            selected
                              ? 'bg-blue-600 text-white font-medium'
                              : 'bg-gray-50 dark:bg-[#0D0D14] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1e1e2e]'
                          }`}
                        >
                          <MathText>{opt}</MathText>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={handleSubmit}
              disabled={grading || answered < total}
              className="mt-4 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {grading ? <><InlineProgress active /> Grading…</> : `Submit${answered < total ? ` (${total - answered} left)` : ''}`}
            </button>
          </>
        )}

        {/* ===== RESULT — ESSAY ===== */}
        {result && isEssay && (
          <>
            <div className="bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] rounded-xl p-5 text-center mb-4">
              <Trophy size={28} className="text-amber-500 mx-auto mb-2" />
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{result.score}/{result.total}</p>
              <p className="text-sm text-gray-500 mt-1">{result.percentage}%</p>
            </div>
            {result.overallFeedback && (
              <div className="bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-600 dark:text-blue-400 mb-1.5">Overall feedback</p>
                <MathText as="p" className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{result.overallFeedback}</MathText>
              </div>
            )}
            {Array.isArray(result.rubricScores) && result.rubricScores.length > 0 && (
              <div className="space-y-2 mb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400 mb-1">Rubric breakdown</p>
                {result.rubricScores.map((r, i) => {
                  const pct = r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 100) : 0;
                  const tone = pct >= 80 ? 'emerald' : pct >= 60 ? 'amber' : 'rose';
                  const toneClasses = {
                    emerald: 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800',
                    amber:   'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800',
                    rose:    'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800',
                  }[tone];
                  return (
                    <div key={i} className={`rounded-xl p-3 border ${toneClasses}`}>
                      <div className="flex items-start justify-between mb-1 gap-3">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{r.criterion}</p>
                        <p className="text-sm font-bold tabular-nums text-gray-700 dark:text-gray-200 flex-shrink-0">
                          {r.score}/{r.maxScore}
                        </p>
                      </div>
                      {r.feedback && <MathText as="p" className="text-xs text-gray-600 dark:text-gray-300 leading-snug">{r.feedback}</MathText>}
                    </div>
                  );
                })}
              </div>
            )}
            {Array.isArray(result.strengths) && result.strengths.length > 0 && (
              <div className="bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] rounded-xl p-4 mb-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400 mb-1.5">Strengths</p>
                <ul className="space-y-1">
                  {result.strengths.map((s, i) => (
                    <li key={i} className="text-xs text-gray-700 dark:text-gray-200 flex gap-2">
                      <Check size={12} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(result.improvements) && result.improvements.length > 0 && (
              <div className="bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] rounded-xl p-4 mb-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-600 dark:text-amber-400 mb-1.5">To improve</p>
                <ul className="space-y-1">
                  {result.improvements.map((s, i) => (
                    <li key={i} className="text-xs text-gray-700 dark:text-gray-200 flex gap-2">
                      <span className="text-amber-500 flex-shrink-0 mt-0.5">→</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              onClick={() => { setResult(null); setEssayText(result.essay || essayText); }}
              className="w-full py-2 rounded-xl border border-gray-200 dark:border-[#2A2A40] text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1e1e2e] mb-2"
            >
              Revise &amp; resubmit
            </button>
            <button onClick={onBack} className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">Back to curriculum</button>
          </>
        )}

        {/* ===== RESULT — QUIZ ===== */}
        {result && !isEssay && (
          <>
            <div className="bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] rounded-xl p-5 text-center mb-4">
              <Trophy size={28} className="text-amber-500 mx-auto mb-2" />
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{result.score}/{result.total}</p>
              <p className="text-sm text-gray-500 mt-1">{result.percentage}% correct</p>
            </div>
            <div className="space-y-2">
              {(result.details || []).map((d, i) => (
                <div key={i} className={`rounded-xl p-3 border ${d.correct ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800'}`}>
                  <div className="flex items-start gap-2 mb-1">
                    {d.correct ? <Check size={14} className="text-emerald-500 mt-0.5" /> : <X size={14} className="text-rose-500 mt-0.5" />}
                    <MathText as="p" className="text-xs font-medium text-gray-900 dark:text-white flex-1">{d.question}</MathText>
                  </div>
                  <p className="text-[11px] text-gray-500 ml-6">
                    Your answer: <strong>{d.answer || '—'}</strong>
                    {!d.correct && <> · Correct: <strong className="text-emerald-600">{d.correctAnswer}</strong></>}
                  </p>
                  {d.explanation && <MathText as="p" className="text-[10px] text-gray-400 ml-6 mt-1 italic">{d.explanation}</MathText>}
                </div>
              ))}
            </div>
            <button onClick={onBack} className="mt-4 w-full py-2.5 rounded-xl border border-gray-200 dark:border-[#2A2A40] text-sm font-medium">Back to curriculum</button>
          </>
        )}
      </div>
    </div>
  );
}

// ============= Edit with AI modal =============
function EditCurriculumModal({ curriculum, onClose, onUpdated }) {
  const [instruction, setInstruction] = useState('');
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  function addFiles(list) {
    const incoming = Array.from(list || []);
    // Cap to 5 files + 25MB each (server caps 50MB but we nudge smaller)
    const filtered = incoming.filter(f => f.size <= 25 * 1024 * 1024).slice(0, 5);
    setFiles(prev => [...prev, ...filtered].slice(0, 5));
  }
  function removeFile(i) { setFiles(prev => prev.filter((_, idx) => idx !== i)); }

  async function submit() {
    if (!instruction.trim() || submitting) return;
    setSubmitting(true); setError(null);
    try {
      const { curriculum: updated } = await editCurriculumWithAI(curriculum.id, instruction.trim(), files);
      onUpdated(updated);
    } catch (e) {
      setError(e.message || 'Edit failed');
      setSubmitting(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-white dark:bg-[#161622] rounded-2xl border border-gray-200 dark:border-[#2A2A40] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-[#2A2A40]">
          <div className="flex items-center gap-2">
            <Wand2 size={14} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Edit curriculum with AI</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Your instruction</label>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder={'Examples:\n• Add a unit on functional groups after Unit 2\n• Simplify Unit 1 to 3 lessons\n• Rename "Intro" to "Getting Started" and add a practice lesson\n• Rewrite this to match the AP Chemistry syllabus in the attached PDF'}
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Context files (optional)</label>
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 dark:border-[#2A2A40] rounded-xl p-4 text-center cursor-pointer hover:border-blue-400"
            >
              <Upload size={18} className="text-gray-400 mx-auto mb-1" />
              <p className="text-xs text-gray-500 dark:text-gray-400">Drop PDFs or text files here, or click to pick</p>
              <p className="text-[10px] text-gray-400 mt-0.5">up to 5 files · 25MB each</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.md,.json,application/pdf,text/plain,text/markdown"
                className="hidden"
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
              />
            </div>
            {files.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-[#0D0D14] border border-gray-200 dark:border-[#2A2A40]">
                    <Paperclip size={11} className="text-gray-400 flex-shrink-0" />
                    <span className="flex-1 text-xs text-gray-700 dark:text-gray-200 truncate">{f.name}</span>
                    <span className="text-[10px] text-gray-400">{Math.round(f.size / 1024)} KB</span>
                    <button onClick={() => removeFile(i)} className="text-gray-300 hover:text-rose-500"><X size={11} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-[#2A2A40]">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] text-xs font-medium text-gray-700 dark:text-gray-300">Cancel</button>
          <button
            onClick={submit}
            disabled={!instruction.trim() || submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <><InlineProgress active /> Applying…</> : <><Sparkles size={12} /> Apply edit</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// PAUSD Catalog browser — grid of pre-built courses, grouped by
// subject. Tap a course → enroll → opens the cloned curriculum
// in detail view (handled by parent).
// =============================================================
function PausdCatalogView({ catalog, loading, enrollingSlug, onBack, onEnroll }) {
  const grouped = catalog.reduce((acc, c) => {
    const key = c.subject || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  // Sort math courses by an explicit ladder; science by grade.
  const mathOrder = ['foundations-in-math', 'concepts-in-math', 'algebra-1', 'geometry-h'];
  if (grouped.math) grouped.math.sort((a, b) => mathOrder.indexOf(a.slug) - mathOrder.indexOf(b.slug));
  if (grouped.science) grouped.science.sort((a, b) => String(a.grade).localeCompare(String(b.grade)));

  const SUBJECT_META = {
    math: { label: 'Mathematics', icon: Sigma, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    science: { label: 'Science', icon: Atom, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-4">
        <ArrowLeft size={16} /> Back to my curricula
      </button>

      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap size={20} className="text-purple-500" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">PAUSD Common Core Catalog</h2>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Pre-built courses tuned to PAUSD rigor — significantly above the standard Common Core label.
          Lessons are taught one-on-one by the AI tutor with built-in quizzes, progress tracking, and per-unit assessments.
          Tap a course to enroll.
        </p>
      </div>

      {loading && catalog.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size={24} />
        </div>
      ) : (
        <div className="space-y-6">
          {['math', 'science'].map(key => {
            const courses = grouped[key];
            if (!courses?.length) return null;
            const meta = SUBJECT_META[key] || { label: key, icon: BookOpen, color: 'text-gray-500', bg: 'bg-gray-50' };
            const SubjectIcon = meta.icon;
            return (
              <section key={key}>
                <div className="flex items-center gap-2 mb-2.5">
                  <div className={`w-7 h-7 rounded-md ${meta.bg} flex items-center justify-center`}>
                    <SubjectIcon size={14} className={meta.color} />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">{meta.label}</h3>
                  <span className="text-[10px] text-gray-400">· {courses.length} course{courses.length === 1 ? '' : 's'}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {courses.map((c, i) => (
                    <PausdCourseCard
                      key={c.slug}
                      course={c}
                      enrolling={enrollingSlug === c.slug}
                      onEnroll={() => onEnroll(c.slug)}
                      tourAnchor={key === 'math' && i === 0}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PausdCourseCard({ course, enrolling, onEnroll, tourAnchor }) {
  // Uniform card style — every PAUSD course is honors-tier so no special
  // accent is needed. Subtle gray border with a blue hover state.
  return (
    <button
      onClick={onEnroll}
      disabled={enrolling}
      data-tour={tourAnchor ? 'pausd-course-card' : undefined}
      className="text-left flex flex-col h-full p-4 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#1e1e2e] hover:border-blue-400 dark:hover:border-blue-600 transition-colors disabled:opacity-60"
    >
      <h4 className="text-sm font-bold text-gray-900 dark:text-white leading-snug mb-1.5">{course.title}</h4>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug line-clamp-3 mb-2 flex-1">{course.description}</p>
      {course.textbook && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 italic leading-snug line-clamp-1 mb-2">
          📖 {course.textbook}
        </p>
      )}
      <div className="flex items-center justify-between mt-auto">
        <p className="text-[10px] text-gray-400 tabular-nums">
          Grade {course.grade} · {course.unitCount}u · {course.lessonCount} lessons
        </p>
        {enrolling ? (
          <InlineProgress active />
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
            Enroll <ChevronRight size={12} />
          </span>
        )}
      </div>
    </button>
  );
}
