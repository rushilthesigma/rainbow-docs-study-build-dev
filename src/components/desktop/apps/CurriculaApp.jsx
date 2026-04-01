import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Plus, Sparkles, Loader2, BookOpen, ChevronDown, ChevronRight, CheckCircle2, Circle, Lock, ClipboardCheck, PenTool, FileText } from 'lucide-react';
import { listCurricula, generateCurriculum, getCurriculum, sendLessonMessage, getLessonHistory } from '../../../api/curriculum';
import { DEFAULT_SETTINGS, DIFFICULTY_OPTIONS, LEARNING_STYLE_OPTIONS } from '../../../utils/constants';
import Button from '../../shared/Button';
import Input from '../../shared/Input';
import PillGroup from '../../shared/PillGroup';
import Toggle from '../../shared/Toggle';
import LoadingSpinner from '../../shared/LoadingSpinner';
import ProgressBar from '../../curriculum/ProgressBar';
import ChatContainer from '../../chat/ChatContainer';

const TYPE_ICONS = { lesson: BookOpen, practice: PenTool, essay: FileText, unit_test: ClipboardCheck };
const TYPE_COLORS = { lesson: 'text-blue-400', practice: 'text-purple-400', essay: 'text-amber-400', unit_test: 'text-rose-400' };

export default function CurriculaApp() {
  const [view, setView] = useState('list');
  const [curricula, setCurricula] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCurriculum, setSelectedCurriculum] = useState(null);

  // Lesson view
  const [currentLesson, setCurrentLesson] = useState(null);
  const [lessonMessages, setLessonMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [streaming, setStreaming] = useState(false);
  const streamRef = useRef('');
  const abortRef = useRef(null);
  const autoStarted = useRef(false);

  // New curriculum
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);

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
    setView('lesson');
    setLessonMessages([]);
    autoStarted.current = false;
    try {
      const hist = await getLessonHistory(curriculumId, lesson.id);
      setLessonMessages(hist.chatHistory || []);
      if (!hist.chatHistory?.length && !autoStarted.current) {
        autoStarted.current = true;
        setTimeout(() => doSendLesson(`I'm ready to learn about "${lesson.title}". Let's begin!`, curriculumId, lesson.id), 200);
      }
    } catch {}
  }

  function doSendLesson(text, cid, lid) {
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setLessonMessages(prev => [...prev, userMsg]);
    setStreaming(true); setStreamingContent(''); streamRef.current = '';

    const abort = sendLessonMessage(cid || currentLesson?.curriculumId, lid || currentLesson?.id, text, {
      onChunk: c => { streamRef.current += c; setStreamingContent(streamRef.current); },
      onDone: () => {
        const full = streamRef.current;
        if (full) setLessonMessages(m => [...m, { role: 'assistant', content: full, timestamp: new Date().toISOString() }]);
        setStreamingContent(''); streamRef.current = ''; setStreaming(false);
      },
      onError: err => {
        setLessonMessages(m => [...m, { role: 'assistant', content: `Error: ${err}` }]);
        setStreamingContent(''); streamRef.current = ''; setStreaming(false);
      },
    });
    abortRef.current = abort;
  }

  const handleLessonSend = useCallback((text) => {
    if (streaming) return;
    doSendLesson(text);
  }, [streaming, currentLesson]);

  // Lesson view
  if (view === 'lesson' && currentLesson) {
    const header = (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]">
        <button onClick={() => setView('detail')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><ArrowLeft size={16} /></button>
        <BookOpen size={14} className="text-blue-500" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{currentLesson.title}</span>
      </div>
    );
    return (
      <ChatContainer
        messages={lessonMessages}
        streamingContent={streamingContent}
        onSend={handleLessonSend}
        disabled={streaming}
        placeholder={streaming ? 'AI is thinking...' : 'Message...'}
        header={header}
        className="h-full"
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
        <button onClick={() => { setView('list'); setSelectedCurriculum(null); }} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-4">
          <ArrowLeft size={16} /> All Curricula
        </button>
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
            const total = (c.units || []).reduce((s, u) => s + (u.lessons || []).length, 0);
            const done = (c.units || []).reduce((s, u) => s + (u.lessons || []).filter(l => l.isCompleted).length, 0);
            return (
              <div key={c.id} onClick={() => openCurriculum(c.id)} className="flex items-center gap-4 bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] px-4 py-3 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0"><BookOpen size={16} className="text-blue-500" /></div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{done}/{total} lessons · {c.units?.length || 0} units</p>
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
