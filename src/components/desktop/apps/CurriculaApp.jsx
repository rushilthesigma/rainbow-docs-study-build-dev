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
import QuizBlock from '../../lesson/QuizBlock';
import { useAuth } from '../../../context/AuthContext';
import { errorChatMessage } from '../../../utils/aiErrors';
import useBrowserBack from '../../../hooks/useBrowserBack';
import { InlineProgress } from '../../shared/ProgressBar';

const TYPE_ICONS = { lesson: BookOpen, math_tutor: Calculator, practice: PenTool, essay: FileText, unit_test: ClipboardCheck };
const TYPE_COLORS = { lesson: 'text-white/50', math_tutor: 'text-white/50', practice: 'text-white/50', essay: 'text-amber-400', unit_test: 'text-rose-400' };

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
          <button onClick={() => setView('detail')} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/90">
            <ArrowLeft size={16} /> Back to curriculum
          </button>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">{isPractice ? 'Practice' : 'Math Tutor'}</span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs text-white/60 truncate">{currentLesson.title}</span>
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
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 glass-header">
        <button onClick={() => setView('detail')} className="text-white/40 hover:text-white/80"><ArrowLeft size={16} /></button>
        <BookOpen size={14} className="text-white/50" />
        <span className="text-sm font-semibold text-white truncate">{currentLesson.title}</span>
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
          <button onClick={() => { setView('list'); setSelectedCurriculum(null); }} className="flex items-center gap-2 text-sm text-white/50 hover:text-white/90">
            <ArrowLeft size={16} /> All Curricula
          </button>
          <div className="flex items-center gap-2">
            {isBeta && (
              <button
                onClick={toggleTrail}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  trailMode
                    ? 'border-white/25 bg-white/15 text-white'
                    : 'border-white/10 text-white/50 hover:border-white/25 hover:text-white/80'
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-white/50 hover:border-white/25 hover:text-white/80 transition-colors"
              title="Edit with AI"
            >
              <Wand2 size={12} /> Edit with AI
            </button>
          </div>
        </div>
        {!trailMode && (
          <>
            <h1 className="text-xl font-bold text-white mb-1">{c.title}</h1>
            {c.description && <p className="text-sm text-white/45 mb-3">{c.description}</p>}
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
        <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/90 mb-4"><ArrowLeft size={16} /> Back</button>
        <h2 className="text-lg font-bold text-white mb-4">New Curriculum</h2>
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
            <div className="rounded-xl border border-white/10 bg-white/[0.06] backdrop-blur-sm p-4">
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200">Source material <span className="font-normal opacity-60">(optional)</span></p>
                {sources.length > 0 && (
                  <span className="text-[10px] text-gray-400 tabular-nums">{sources.length}/8</span>
                )}
              </div>
              <p className="text-[11px] text-white/45 mb-3">
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
                  className="flex-1 px-3 py-2 rounded-lg border border-white/10 bg-white dark:bg-[#0D0D14] text-sm text-white outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sourceBusy || !sourceUrlInput.trim() || sources.length >= 8}
                  className="px-3 py-2 rounded-lg bg-white/[0.10] hover:bg-white/[0.15] border border-white/[0.12] text-white text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1.5"
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
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-dashed border-gray-300 dark:border-white/10 text-white/45 text-xs hover:border-white/30 hover:text-white/70 transition-colors disabled:opacity-50"
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
                      <div key={s.id} className="group flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/[0.04] border border-white/10">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${s.kind === 'url' ? 'bg-white/[0.08] text-white/50' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}`}>
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
        <h2 className="text-lg font-bold text-white">My Curricula</h2>
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

      {/* PAUSD promo strip */}
      <button
        onClick={() => { loadPausdCatalog(); setView('pausd'); }}
        data-tour="pausd-catalog-button"
        className="w-full mb-4 flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.06] hover:border-white/20 hover:bg-white/10 transition-colors text-left backdrop-blur-sm"
      >
        <div className="w-10 h-10 rounded-lg bg-white/10 text-white/70 flex items-center justify-center flex-shrink-0">
          <GraduationCap size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">PAUSD Common Core Catalog</p>
          <p className="text-[11px] text-white/50">Pre-built middle + high-school courses at PAUSD rigor: Math 6 → Geometry Honors and full middle-school science. Tap to browse.</p>
        </div>
        <ChevronRight size={16} className="text-white/30 flex-shrink-0" />
      </button>

      {curricula.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen size={32} className="text-white/40 mx-auto mb-3" />
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
              <div key={c.id} onClick={() => openCurriculum(c.id)} className="flex items-center gap-4 bg-white/[0.06] backdrop-blur-sm rounded-xl border border-white/10 px-4 py-3 cursor-pointer hover:border-white/25 hover:bg-white/10 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0"><BookOpen size={16} className="text-white/60" /></div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white truncate">{c.title}</h3>
                  <p className="text-xs text-white/40 mt-0.5">{done}/{total} lessons · {units} unit{units === 1 ? '' : 's'}</p>
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
    <div className={`bg-white/[0.06] backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden ${unit.locked ? 'opacity-50' : ''}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors">
        {unit.locked ? <Lock size={14} className="text-white/30" /> : open ? <ChevronDown size={16} className="text-white/30" /> : <ChevronRight size={16} className="text-white/30" />}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-white text-sm">{unit.title}</h4>
        </div>
        <span className="text-xs text-white/35 tabular-nums">{completedLessons}/{totalLessons}</span>
      </button>
      {open && !unit.locked && (
        <div className="border-t border-white/8 p-1.5">
          {(unit.lessons || []).map((lesson, i) => {
            const TypeIcon = TYPE_ICONS[lesson.type] || BookOpen;
            // Anchor the FIRST lesson of the FIRST unit so the guided tour
            // can highlight it after enrollment.
            const tourAnchor = unit.tourAnchorFirst && i === 0 && lesson.type === 'lesson';
            return (
              <button
                key={lesson.id}
                onClick={() => onOpenLesson(lesson)}
                data-tour={tourAnchor ? 'first-lesson' : undefined}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-white/8 transition-colors group"
              >
                {lesson.isCompleted ? <CheckCircle2 size={14} className="text-white/40 flex-shrink-0" /> : lesson.chatHistory?.length > 0 ? <Circle size={14} className="text-white/35 flex-shrink-0" /> : <TypeIcon size={14} className="text-white/35 flex-shrink-0" />}
                <span className={`text-sm flex-1 truncate ${lesson.isCompleted ? 'text-white/25 line-through' : 'text-white/60 group-hover:text-white'}`}>{lesson.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============= Real assessment UI — handles both quiz and essay =============
//
// Quiz path now uses the same `<QuizBlock>` component the in-lesson
// quizzes use, so the look + feel is consistent across the entire
// curriculum (one MCQ at a time, choice cards, results screen with
// per-question explanations). The essay path still has its own
// custom UI because it needs a textarea + rubric + AI grader output.
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
            // Default to 3 questions instead of 5. ~40% faster
            // generation on Flash Lite + still enough to gauge
            // mastery; users can re-take to drill more.
            questionCount: 3,
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

  // Convert the server's assessment shape into the QuizBlock `block`
  // shape so we can reuse the in-lesson quiz UI verbatim.
  //   server:   { questions: [{ id, question, options: ["A) …", …], correct: "A", explanation }] }
  //   block:    { id, title, questions: [{ id, prompt, choices: [text, …], answer: text, explanation }] }
  // Memoised by assessment id so we don't rebuild on every render.
  const block = (!isEssay && assessment) ? (() => {
    const stripPrefix = (s) => String(s || '').replace(/^[A-Z]\)\s*/, '');
    return {
      id: assessment.id,
      title: assessment.title || lesson.title,
      questions: (assessment.questions || []).map((q, i) => {
        const choices = (q.options || []).map(stripPrefix);
        const correctLetter = String(q.correct || 'A').toUpperCase();
        const correctIdx = Math.max(0, correctLetter.charCodeAt(0) - 65);
        return {
          id: q.id || `q${i + 1}`,
          prompt: q.question,
          choices,
          answer: choices[correctIdx] || choices[0] || '',
          explanation: q.explanation || '',
        };
      }),
    };
  })() : null;

  // QuizBlock's grader contract: gradeFn(blockId, responses) where
  // each response is { qid, given (choice text) }. We translate the
  // chosen text back into the server's letter format and call the
  // existing /api/assessment/grade endpoint, then re-shape the
  // server result into what QuizBlock expects.
  async function quizGradeFn(_blockId, responses) {
    if (!assessment) return { score: 0, results: [] };
    const answersByIdx = {};
    block.questions.forEach((bq, i) => {
      const r = responses.find(x => x.qid === bq.id);
      if (!r) return;
      const choiceIdx = bq.choices.findIndex(c => c === r.given);
      const letter = String.fromCharCode(65 + Math.max(0, choiceIdx));
      answersByIdx[i] = letter;
    });
    const r = await apiFetch('/api/assessment/grade', {
      method: 'POST',
      body: JSON.stringify({ assessment, answers: answersByIdx }),
    });
    setResult(r.result);
    const blockResults = block.questions.map((bq, i) => ({
      qid: bq.id,
      correct: !!r.result?.details?.[i]?.correct,
      given: responses.find(x => x.qid === bq.id)?.given || '',
    }));
    return { score: r.result?.percentage || 0, results: blockResults };
  }

  async function handleEssaySubmit() {
    if (!assessment) return;
    setGrading(true);
    setError(null);
    try {
      const r = await apiFetch('/api/assessment/grade', {
        method: 'POST',
        body: JSON.stringify({ assessment, answers: { essay: essayText } }),
      });
      setResult(r.result);
    } catch (e) { setError(e.message); }
    setGrading(false);
  }

  const wordCount = essayText.split(/\s+/).filter(Boolean).length;
  const canSubmitEssay = essayText.trim().length >= 30;

  const totalRubricPoints = Array.isArray(assessment?.rubric)
    ? assessment.rubric.reduce((s, r) => s + (r.maxScore || 5), 0)
    : null;

  return (
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="max-w-2xl mx-auto px-5 py-6">
        {/* ── Back nav ── */}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors mb-6"
        >
          <ArrowLeft size={14} /> Back
        </button>

        {/* ── Header ── */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
              isEssay
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
            }`}>
              {isEssay ? <FileText size={10} /> : <ClipboardCheck size={10} />}
              {isEssay ? 'Graded Essay' : 'Assessment'}
            </span>
            {totalRubricPoints && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{totalRubricPoints} pts total</span>
            )}
          </div>
          <h1 className="text-xl font-bold text-white leading-snug">{lesson.title}</h1>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="py-12">
            <LoadingProgress
              active
              label={isEssay ? 'Building your essay prompt…' : 'Generating quiz…'}
              duration={8000}
            />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 mb-4">
            <X size={14} className="text-rose-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        )}

        {/* ===== ESSAY FORM ===== */}
        {!loading && !error && assessment && !result && isEssay && (
          <div className="space-y-4">
            {/* Prompt card */}
            <div className="relative bg-white/[0.07] backdrop-blur-sm border border-amber-200 dark:border-amber-900/60 rounded-2xl overflow-hidden">
              <div className="absolute left-0 inset-y-0 w-1 bg-amber-400 dark:bg-amber-500 rounded-l-2xl" />
              <div className="pl-5 pr-4 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-600 dark:text-amber-400 mb-2">Essay Prompt</p>
                <MathText as="p" className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{assessment.prompt || ''}</MathText>
              </div>
            </div>

            {/* Rubric card */}
            {Array.isArray(assessment.rubric) && assessment.rubric.length > 0 && (
              <div className="bg-white/[0.07] backdrop-blur-sm border border-white/10 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/45 mb-3">Grading Rubric</p>
                <div className="space-y-2.5">
                  {assessment.rubric.map((r, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 dark:bg-white/[0.04] text-[10px] font-bold text-white/45 flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">{r.criterion}</span>
                          <span className="flex-shrink-0 text-[10px] font-bold tabular-nums text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-md">
                            {r.maxScore || 5} pts
                          </span>
                        </div>
                        {r.description && (
                          <p className="text-[11px] text-white/45 mt-0.5 leading-snug">{r.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Textarea */}
            <div className="bg-white/[0.07] backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden focus-within:border-white/30 transition-colors">
              <div className="px-4 pt-3 pb-1 border-b border-gray-100 dark:border-[#1e1e2e]">
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Your Response</p>
              </div>
              <textarea
                value={essayText}
                onChange={e => setEssayText(e.target.value)}
                placeholder="Write your essay here. Make a clear claim, support it with evidence, and address each rubric criterion explicitly."
                rows={14}
                className="w-full px-4 py-3 bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none resize-y leading-7 placeholder:text-gray-400 dark:placeholder:text-gray-600"
              />
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-[#1e1e2e]">
                <p className="text-[10px] text-gray-400 tabular-nums">
                  <span className="font-semibold text-gray-600 dark:text-gray-300">{wordCount}</span> word{wordCount === 1 ? '' : 's'}
                  <span className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
                  <span className="font-semibold text-gray-600 dark:text-gray-300">{essayText.length}</span> char{essayText.length === 1 ? '' : 's'}
                </p>
                {!canSubmitEssay && essayText.length > 0 && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">30 characters minimum</p>
                )}
                {canSubmitEssay && (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <Check size={10} /> Ready to submit
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={handleEssaySubmit}
              disabled={grading || !canSubmitEssay}
              className="w-full py-3 rounded-2xl bg-white/15 hover:bg-white/20 border border-white/15 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {grading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Grading your essay…
                </>
              ) : (
                <>
                  <FileText size={14} />
                  Submit for Grading
                </>
              )}
            </button>
          </div>
        )}

        {/* ===== QUIZ — same UI as in-lesson QuizBlock ===== */}
        {!loading && !error && assessment && !result && !isEssay && block && (
          <QuizBlock
            block={block}
            gradeFn={quizGradeFn}
            onComplete={onBack}
          />
        )}

        {/* ===== RESULT — ESSAY ===== */}
        {result && isEssay && (
          <div className="space-y-4">
            {/* Score hero */}
            <div className="bg-white/[0.07] backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center">
              <Trophy size={32} className="text-amber-500 mx-auto mb-3" />
              <p className="text-5xl font-bold text-white tabular-nums tracking-tight">
                {result.score}
                <span className="text-2xl font-medium text-gray-400 dark:text-gray-500">/{result.total}</span>
              </p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                  result.percentage >= 80 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : result.percentage >= 60 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                  : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
                }`}>
                  {result.percentage}%
                </span>
              </div>
              {/* Mini progress bar */}
              <div className="mt-4 h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.04] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    result.percentage >= 80 ? 'bg-emerald-500'
                    : result.percentage >= 60 ? 'bg-amber-500'
                    : 'bg-rose-500'
                  }`}
                  style={{ width: `${result.percentage}%` }}
                />
              </div>
            </div>

            {/* Overall feedback */}
            {result.overallFeedback && (
              <div className="relative bg-white/[0.07] backdrop-blur-sm border border-white/[0.10] rounded-2xl overflow-hidden">
                <div className="absolute left-0 inset-y-0 w-1 bg-white/20 rounded-l-2xl" />
                <div className="pl-5 pr-4 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/70 mb-2">Overall Feedback</p>
                  <MathText as="p" className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{result.overallFeedback}</MathText>
                </div>
              </div>
            )}

            {/* Rubric breakdown */}
            {Array.isArray(result.rubricScores) && result.rubricScores.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/45 mb-2.5 px-0.5">Rubric Breakdown</p>
                <div className="space-y-2">
                  {result.rubricScores.map((r, i) => {
                    const pct = r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 100) : 0;
                    const tone = pct >= 80 ? 'emerald' : pct >= 60 ? 'amber' : 'rose';
                    const barColor = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500' }[tone];
                    const scoreColor = {
                      emerald: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
                      amber: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
                      rose: 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20',
                    }[tone];
                    return (
                      <div key={i} className="bg-white/[0.07] backdrop-blur-sm border border-white/10 rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <p className="text-sm font-semibold text-white">{r.criterion}</p>
                          <span className={`flex-shrink-0 text-xs font-bold tabular-nums px-2 py-0.5 rounded-lg ${scoreColor}`}>
                            {r.score}/{r.maxScore}
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-gray-100 dark:bg-white/[0.04] mb-2 overflow-hidden">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                        {r.feedback && (
                          <MathText as="p" className="text-xs text-gray-600 dark:text-gray-400 leading-snug">{r.feedback}</MathText>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Strengths & improvements side by side (or stacked) */}
            <div className="grid grid-cols-1 gap-3">
              {Array.isArray(result.strengths) && result.strengths.length > 0 && (
                <div className="bg-white/[0.07] backdrop-blur-sm border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400 mb-2.5">Strengths</p>
                  <ul className="space-y-2">
                    {result.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mt-0.5">
                          <Check size={9} className="text-emerald-600 dark:text-emerald-400" />
                        </span>
                        <span className="text-xs text-white/60 leading-snug">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(result.improvements) && result.improvements.length > 0 && (
                <div className="bg-white/[0.07] backdrop-blur-sm border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-600 dark:text-amber-400 mb-2.5">Areas to Improve</p>
                  <ul className="space-y-2">
                    {result.improvements.map((s, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mt-0.5 text-amber-600 dark:text-amber-400 text-[10px] font-bold">→</span>
                        <span className="text-xs text-white/60 leading-snug">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => { setResult(null); setEssayText(result.essay || essayText); }}
                className="w-full py-2.5 rounded-2xl border border-white/10 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1a1a28] transition-colors"
              >
                Revise &amp; Resubmit
              </button>
              <button
                onClick={onBack}
                className="w-full py-3 rounded-2xl bg-white/[0.10] hover:bg-white/[0.15] border border-white/[0.12] text-white text-sm font-semibold transition-colors"
              >
                Back to Curriculum
              </button>
            </div>
          </div>
        )}

        {/* In NEW (QuizBlock) mode the quiz results are rendered
            inside QuizBlock itself (score chip + per-question
            breakdown + Continue button), so nothing else to render
            here. The CLASSIC mode renders its own result block
            above. */}
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
        className="w-full max-w-xl bg-black/40 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Wand2 size={14} className="text-white/50" />
            <h3 className="text-sm font-semibold text-white">Edit curriculum with AI</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-white/45 mb-2 block">Your instruction</label>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder={'Examples:\n• Add a unit on functional groups after Unit 2\n• Simplify Unit 1 to 3 lessons\n• Rename "Intro" to "Getting Started" and add a practice lesson\n• Rewrite this to match the AP Chemistry syllabus in the attached PDF'}
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-white/[0.04] text-sm text-white placeholder-gray-400 resize-none outline-none focus:border-white/30"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-white/45 mb-2 block">Context files (optional)</label>
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/10 rounded-xl p-4 text-center cursor-pointer hover:border-white/30"
            >
              <Upload size={18} className="text-gray-400 mx-auto mb-1" />
              <p className="text-xs text-white/45">Drop PDFs or text files here, or click to pick</p>
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
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10">
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

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-white/10 text-xs font-medium text-white/60">Cancel</button>
          <button
            onClick={submit}
            disabled={!instruction.trim() || submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.10] hover:bg-white/[0.15] border border-white/[0.12] text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
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
    math: { label: 'Mathematics', icon: Sigma, color: 'text-white/60', bg: 'bg-white/[0.06]' },
    science: { label: 'Science', icon: Atom, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/90 mb-4">
        <ArrowLeft size={16} /> Back to my curricula
      </button>

      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap size={20} className="text-white/50" />
          <h2 className="text-lg font-bold text-white">PAUSD Common Core Catalog</h2>
        </div>
        <p className="text-xs text-white/45">
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
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">{meta.label}</h3>
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
      className="text-left flex flex-col h-full p-4 rounded-xl border border-white/10 bg-white/[0.06] backdrop-blur-sm hover:border-white/25 hover:bg-white/10 transition-colors disabled:opacity-60"
    >
      <h4 className="text-sm font-bold text-white leading-snug mb-1.5">{course.title}</h4>
      <p className="text-[11px] text-white/45 leading-snug line-clamp-3 mb-2 flex-1">{course.description}</p>
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
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/70">
            Enroll <ChevronRight size={12} />
          </span>
        )}
      </div>
    </button>
  );
}
