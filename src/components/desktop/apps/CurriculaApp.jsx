import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Plus, Sparkles, Loader2, BookOpen, ChevronDown, ChevronRight, CheckCircle2, Circle, Lock, ClipboardCheck, PenTool, FileText, Check, X, Trophy, Wand2, Paperclip, Upload } from 'lucide-react';
import { listCurricula, generateCurriculum, getCurriculum, sendLessonMessage, getLessonHistory, editCurriculumWithAI } from '../../../api/curriculum';
import { apiFetch } from '../../../api/client';
import { DEFAULT_SETTINGS, DIFFICULTY_OPTIONS, LEARNING_STYLE_OPTIONS } from '../../../utils/constants';
import Button from '../../shared/Button';
import Input from '../../shared/Input';
import PillGroup from '../../shared/PillGroup';
import Toggle from '../../shared/Toggle';
import LoadingSpinner from '../../shared/LoadingSpinner';
import ProgressBar from '../../curriculum/ProgressBar';
import ChatContainer from '../../chat/ChatContainer';
import MathText from '../../shared/MathText';
import { errorChatMessage } from '../../../utils/aiErrors';
import useBrowserBack from '../../../hooks/useBrowserBack';

const TYPE_ICONS = { lesson: BookOpen, practice: PenTool, essay: FileText, unit_test: ClipboardCheck };
const TYPE_COLORS = { lesson: 'text-blue-400', practice: 'text-purple-400', essay: 'text-amber-400', unit_test: 'text-rose-400' };

export default function CurriculaApp() {
  const [view, setView] = useState('list');
  const [curricula, setCurricula] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCurriculum, setSelectedCurriculum] = useState(null);

  // Browser Back navigates up one level inside the curriculum stack instead
  // of leaving the SPA. lesson → detail → list.
  useBrowserBack(view !== 'list', () => {
    if (view === 'lesson') setView('detail');
    else if (view === 'assessment') setView('detail');
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

  // Edit curriculum modal
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    listCurricula().then(d => { setCurricula(d.curricula || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleGenerate() {
    if (!settings.topic.trim() || generating) return;
    setGenerating(true); setGenError(null);
    try {
      const data = await generateCurriculum(settings);
      setCurricula(prev => [data.curriculum, ...prev]);
      setSelectedCurriculum(data.curriculum);
      setView('detail');
      setSettings(DEFAULT_SETTINGS);
    } catch (err) { setGenError(err.message || 'Failed'); }
    setGenerating(false);
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

  // Lesson view
  if (view === 'lesson' && currentLesson) {
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
          <button
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#2A2A40] text-xs font-medium text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600"
            title="Edit with AI"
          >
            <Wand2 size={12} /> Edit with AI
          </button>
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{c.title}</h1>
        {c.description && <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{c.description}</p>}
        <div className="flex items-center gap-3 mb-4">
          <ProgressBar value={completedLessons} max={totalLessons} className="flex-1" />
          <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">{completedLessons}/{totalLessons}</span>
        </div>
        <div className="space-y-3">
          {(c.units || []).map(unit => (
            <UnitSection key={unit.id} unit={unit} onOpenLesson={(l) => openLesson(l, c.id)} />
          ))}
        </div>

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
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 size={32} className="animate-spin text-blue-500 mb-4" />
            <p className="text-sm text-gray-500">Generating <span className="font-medium text-gray-700 dark:text-gray-300">{settings.topic}</span>...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {genError && <div className="px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-900/15 border border-rose-200 dark:border-rose-800 text-xs text-rose-600">{genError}</div>}
            <Input label="Topic" placeholder="e.g., Calculus, US History..." value={settings.topic} onChange={e => setSettings(p => ({ ...p, topic: e.target.value }))} />
            <PillGroup label="Difficulty" options={DIFFICULTY_OPTIONS} value={settings.difficulty} onChange={v => setSettings(p => ({ ...p, difficulty: v }))} />
            <PillGroup label="Learning Style" options={LEARNING_STYLE_OPTIONS} value={settings.learningStyle} onChange={v => setSettings(p => ({ ...p, learningStyle: v }))} />
            <div className="flex gap-4">
              <Toggle label="Examples" checked={settings.includeExamples} onChange={v => setSettings(p => ({ ...p, includeExamples: v }))} />
              <Toggle label="Exercises" checked={settings.includeExercises} onChange={v => setSettings(p => ({ ...p, includeExercises: v }))} />
            </div>
            <Button onClick={handleGenerate} disabled={!settings.topic.trim()}><Sparkles size={16} /> Generate Curriculum</Button>
          </div>
        )}
      </div>
    );
  }

  // List view
  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">My Curricula</h2>
        <Button size="sm" onClick={() => setView('new')}><Plus size={14} /> New</Button>
      </div>
      {curricula.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen size={32} className="text-blue-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-4">No curricula yet</p>
          <Button onClick={() => setView('new')}><Plus size={16} /> Create Curriculum</Button>
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
          {(unit.lessons || []).map(lesson => {
            const TypeIcon = TYPE_ICONS[lesson.type] || BookOpen;
            const typeColor = TYPE_COLORS[lesson.type] || 'text-gray-400';
            return (
              <button key={lesson.id} onClick={() => onOpenLesson(lesson)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-[#161622] transition-colors group">
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

// ============= Real assessment quiz UI (unit_test / essay) =============
function AssessmentView({ lesson, curriculum, onBack }) {
  const [assessment, setAssessment] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const topic = `${lesson.title}${curriculum?.title ? ` (from ${curriculum.title})` : ''}`;
        const isEssay = lesson.type === 'essay';
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
  }, [lesson.id]);

  async function handleSubmit() {
    if (!assessment) return;
    setGrading(true);
    try {
      const r = await apiFetch('/api/assessment/grade', {
        method: 'POST',
        body: JSON.stringify({ assessment, answers }),
      });
      setResult(r.result);
    } catch (e) { setError(e.message); }
    setGrading(false);
  }

  const answered = assessment?.questions?.filter((q, i) => answers[i] !== undefined).length || 0;
  const total = assessment?.questions?.length || 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-5">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-4">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="flex items-center gap-2 mb-4">
          <ClipboardCheck size={18} className="text-rose-500" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{lesson.title}</h2>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-12 justify-center">
            <Loader2 size={16} className="animate-spin text-gray-400" />
            <span className="text-sm text-gray-500">Generating quiz…</span>
          </div>
        )}

        {error && <p className="text-sm text-rose-500 bg-rose-50 dark:bg-rose-900/20 rounded-lg p-3">{error}</p>}

        {!loading && !error && assessment && !result && (
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
              {grading ? <><Loader2 size={14} className="animate-spin" /> Grading…</> : `Submit${answered < total ? ` (${total - answered} left)` : ''}`}
            </button>
          </>
        )}

        {result && (
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
            {submitting ? <><Loader2 size={12} className="animate-spin" /> Applying…</> : <><Sparkles size={12} /> Apply edit</>}
          </button>
        </div>
      </div>
    </div>
  );
}
