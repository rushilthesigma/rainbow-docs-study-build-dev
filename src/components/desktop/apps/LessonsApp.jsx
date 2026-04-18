import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Plus, Lightbulb, Loader2, Trash2, RotateCcw, Trophy, CheckCircle2, Circle } from 'lucide-react';
import {
  listLessons, createLesson, getLessonHistory, sendLessonMessage,
  resetLesson, deleteLesson,
} from '../../../api/lessons';
import { DIFFICULTY_OPTIONS } from '../../../utils/constants';
import Button from '../../shared/Button';
import Input from '../../shared/Input';
import PillGroup from '../../shared/PillGroup';
import LoadingSpinner from '../../shared/LoadingSpinner';
import ChatContainer from '../../chat/ChatContainer';

export default function LessonsApp() {
  const [view, setView] = useState('list'); // list | new | lesson
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);

  // New-lesson form
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('beginner');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Active lesson
  const [activeLesson, setActiveLesson] = useState(null);
  const [messages, setMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingSources, setStreamingSources] = useState([]);
  const [searchStatus, setSearchStatus] = useState(null);
  // Source mode toggle persists across a single lesson session.
  const [sourceMode, setSourceMode] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completionData, setCompletionData] = useState(null);
  const streamRef = useRef('');
  const streamSourcesRef = useRef([]);
  const abortRef = useRef(null);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    listLessons()
      .then(d => { setLessons(d.lessons || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!topic.trim() || creating) return;
    setCreating(true); setCreateError(null);
    try {
      const { lesson } = await createLesson(topic.trim(), difficulty);
      setLessons(prev => [lesson, ...prev.filter(l => l.id !== lesson.id)]);
      setTopic('');
      await openLesson(lesson);
    } catch (err) {
      setCreateError(err.message || 'Failed to create lesson');
    } finally {
      setCreating(false);
    }
  }

  async function openLesson(lesson) {
    setActiveLesson(lesson);
    setView('lesson');
    setMessages([]);
    setCompleted(!!lesson.isCompleted);
    setCompletionData(null);
    setSourceMode(false);
    autoStartedRef.current = false;

    try {
      const hist = await getLessonHistory(lesson.id);
      setMessages(hist.chatHistory || []);
      setCompleted(!!hist.isCompleted);
      if (hist.completionData) setCompletionData(hist.completionData);

      // Fresh lesson → auto-fire the FIRST teaching message WITH source
      // mode on, so the opening always has citations. After that, the
      // source-mode toggle at the bottom controls subsequent messages.
      if (!hist.chatHistory?.length && !hist.isCompleted && !autoStartedRef.current) {
        autoStartedRef.current = true;
        setTimeout(() => doSend(`Teach me about "${lesson.topic}".`, lesson.id, { sourced: true }), 150);
      }
    } catch {}
  }

  function doSend(text, lessonId, opts = {}) {
    const id = lessonId || activeLesson?.id;
    if (!id) return;
    const wasSourced = !!(opts.sourced ?? sourceMode);
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent('');
    setStreamingSources([]);
    setSearchStatus(wasSourced ? 'searching' : null);
    streamRef.current = '';
    streamSourcesRef.current = [];

    const abort = sendLessonMessage(id, text, {
      onChunk: (c) => { streamRef.current += c; setStreamingContent(streamRef.current); if (searchStatus) setSearchStatus(null); },
      onSource: (src) => {
        streamSourcesRef.current = [...streamSourcesRef.current, src];
        setStreamingSources(streamSourcesRef.current);
      },
      onStatus: (s) => setSearchStatus(s),
      onDone: () => {
        const full = streamRef.current;
        const sources = streamSourcesRef.current;
        if (full) {
          const aiMsg = { role: 'assistant', content: full, timestamp: new Date().toISOString() };
          if (sources.length) aiMsg.sources = sources;
          setMessages(m => [...m, aiMsg]);

          const doneMatch = full.match(/\[LESSON_(?:DONE|COMPLETE)\]\s*(\{[^}]+\})/);
          if (doneMatch || /\[LESSON_(?:DONE|COMPLETE)\]/.test(full)) {
            setCompleted(true);
            if (doneMatch) { try { setCompletionData(JSON.parse(doneMatch[1])); } catch {} }
          }
        }
        setStreamingContent(''); setStreamingSources([]); setSearchStatus(null);
        streamRef.current = ''; streamSourcesRef.current = [];
        setStreaming(false);
      },
      onError: (err) => {
        setMessages(m => [...m, { role: 'assistant', content: `Error: ${err}` }]);
        setStreamingContent(''); setStreamingSources([]); setSearchStatus(null);
        streamRef.current = ''; streamSourcesRef.current = [];
        setStreaming(false);
      },
    }, wasSourced);
    abortRef.current = abort;
  }

  const handleSend = useCallback((text) => {
    if (streaming || completed) return;
    doSend(text);
  }, [streaming, completed, activeLesson]);

  async function handleReset() {
    if (!activeLesson) return;
    if (!confirm('Reset this lesson? The conversation will be cleared.')) return;
    try {
      await resetLesson(activeLesson.id);
      setMessages([]);
      setCompleted(false);
      setCompletionData(null);
      // Re-fire the first teaching message with source mode ON (matches
      // the open-fresh-lesson behavior).
      autoStartedRef.current = true;
      setTimeout(() => doSend(`Teach me about "${activeLesson.topic}".`, activeLesson.id, { sourced: true }), 150);
    } catch (err) { console.error(err); }
  }

  async function handleDelete(id, e) {
    e?.stopPropagation();
    if (!confirm('Delete this lesson?')) return;
    try {
      await deleteLesson(id);
      setLessons(prev => prev.filter(l => l.id !== id));
      if (activeLesson?.id === id) { setActiveLesson(null); setView('list'); }
    } catch (err) { console.error(err); }
  }

  // ===== LESSON VIEW =====
  if (view === 'lesson' && activeLesson) {
    const header = (
      <div>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]">
          <button onClick={() => setView('list')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><ArrowLeft size={16} /></button>
          <Lightbulb size={14} className="text-yellow-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate flex-1">{activeLesson.title}</span>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
            completed
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
          }`}>
            {completed ? 'Complete' : 'In progress'}
          </span>
          <button onClick={handleReset} title="Reset" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1"><RotateCcw size={14} /></button>
        </div>
        {completed && completionData && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 px-4 py-2">
            <div className="flex items-center gap-2">
              <Trophy size={14} className="text-emerald-600" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-400 text-xs">Lesson Complete!</span>
              <span className="ml-auto text-xs font-bold text-emerald-600">+{completionData.xpEarned || 20} XP</span>
            </div>
            {completionData.summary && <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">{completionData.summary}</p>}
          </div>
        )}
      </div>
    );

    return (
      <ChatContainer
        messages={messages}
        streamingContent={streamingContent}
        streamingSources={streamingSources}
        searchStatus={searchStatus}
        onSend={handleSend}
        disabled={streaming || completed}
        placeholder={completed ? 'Lesson complete!' : streaming ? 'AI is teaching...' : 'Type your response...'}
        header={header}
        className="h-full"
        sourceMode={sourceMode}
        onToggleSource={setSourceMode}
      />
    );
  }

  // ===== NEW LESSON VIEW =====
  if (view === 'new') {
    return (
      <div>
        <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-4">
          <ArrowLeft size={16} /> Back
        </button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Request a Lesson</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">One topic, one focused lesson. The AI will teach it directly.</p>

        {creating ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-yellow-500 mb-3" />
            <p className="text-sm text-gray-500">Preparing lesson on <span className="font-medium text-gray-700 dark:text-gray-300">{topic}</span>...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {createError && <div className="px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-900/15 border border-rose-200 dark:border-rose-800 text-xs text-rose-600">{createError}</div>}
            <Input
              label="What do you want to learn?"
              placeholder="e.g., Photosynthesis, the French Revolution, Fourier transforms"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            />
            <PillGroup label="Difficulty" options={DIFFICULTY_OPTIONS} value={difficulty} onChange={setDifficulty} />
            <Button onClick={handleCreate} disabled={!topic.trim()}>
              <Lightbulb size={16} /> Start Lesson
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ===== LIST VIEW =====
  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Lessons</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Single topics, taught one at a time.</p>
        </div>
        <Button size="sm" onClick={() => { setTopic(''); setCreateError(null); setView('new'); }}>
          <Plus size={14} /> New Lesson
        </Button>
      </div>

      {lessons.length === 0 ? (
        <div className="text-center py-12">
          <Lightbulb size={32} className="text-yellow-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-4">No lessons yet. Request one to get started.</p>
          <Button onClick={() => setView('new')}><Plus size={16} /> Request a Lesson</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {lessons.map(l => (
            <div
              key={l.id}
              onClick={() => openLesson(l)}
              className="group flex items-center gap-4 bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] px-4 py-3 cursor-pointer hover:border-yellow-300 dark:hover:border-yellow-700 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center flex-shrink-0">
                {l.isCompleted
                  ? <CheckCircle2 size={16} className="text-emerald-500" />
                  : l.messageCount > 0
                    ? <Circle size={16} className="text-yellow-500" />
                    : <Lightbulb size={16} className="text-yellow-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{l.title}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {l.difficulty}
                  {l.messageCount > 0 ? ` · ${l.messageCount} messages` : ' · not started'}
                  {l.isCompleted ? ' · completed' : ''}
                </p>
              </div>
              <button
                onClick={(e) => handleDelete(l.id, e)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-rose-500 p-1"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
