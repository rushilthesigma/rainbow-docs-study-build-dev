import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import { getCurriculum, getLessonHistory, sendLessonMessage, resetLesson } from '../api/curriculum';
import ChatContainer from '../components/chat/ChatContainer';
import { errorChatMessage } from '../utils/aiErrors';
import PhaseIndicator from '../components/chat/PhaseIndicator';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import Button from '../components/shared/Button';

export default function LessonPage() {
  const { id: curriculumId, lessonId } = useParams();
  const navigate = useNavigate();

  const [curriculum, setCurriculum] = useState(null);
  const [messages, setMessages] = useState([]);
  const [phase, setPhase] = useState('introduction');
  const [streamingContent, setStreamingContent] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [completionData, setCompletionData] = useState(null);
  const abortRef = useRef(null);
  const streamContentRef = useRef('');
  const autoStarted = useRef(false);

  const allLessons = [];
  (curriculum?.units || []).forEach(u => {
    (u.lessons || []).forEach(l => allLessons.push({ ...l, unitId: u.id, unitTitle: u.title }));
  });
  const currentIndex = allLessons.findIndex(l => l.id === lessonId);
  const currentLesson = allLessons[currentIndex];
  const currentUnit = currentLesson ? (curriculum?.units || []).find(u => u.id === currentLesson.unitId) : null;

  useEffect(() => {
    autoStarted.current = false;
    async function load() {
      try {
        const [currData, histData] = await Promise.all([
          getCurriculum(curriculumId),
          getLessonHistory(curriculumId, lessonId),
        ]);
        setCurriculum(currData.curriculum);
        setMessages(histData.chatHistory || []);
        setPhase(histData.phase || 'introduction');

        for (const u of currData.curriculum?.units || []) {
          const l = (u.lessons || []).find(l => l.id === lessonId);
          if (l?.isCompleted) setCompleted(true);
        }

        // Auto-start if no history
        if (!histData.chatHistory?.length && !autoStarted.current) {
          autoStarted.current = true;
          let lessonTitle = '';
          for (const u of currData.curriculum?.units || []) {
            const l = (u.lessons || []).find(l => l.id === lessonId);
            if (l) { lessonTitle = l.title; break; }
          }
          if (lessonTitle) {
            // Delay to let state settle
            setTimeout(() => doSend(`I'm ready to learn about "${lessonTitle}". Let's begin!`), 100);
          }
        }
      } catch (err) {
        console.error('Failed to load lesson:', err);
      }
      setLoading(false);
    }
    load();
    return () => { if (abortRef.current) abortRef.current(); };
  }, [curriculumId, lessonId]);

  function doSend(text) {
    if (completed) return;

    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent('');
    streamContentRef.current = '';

    const abort = sendLessonMessage(curriculumId, lessonId, text, {
      onChunk: (chunk) => {
        streamContentRef.current += chunk;
        setStreamingContent(streamContentRef.current);
      },
      onDone: () => {
        const fullContent = streamContentRef.current;
        if (fullContent) {
          const aiMsg = { role: 'assistant', content: fullContent, timestamp: new Date().toISOString() };
          setMessages(m => [...m, aiMsg]);

          const shouldAdvance = /\[STATUS:\s*advance\]/i.test(fullContent)
            || fullContent.includes('[PHASE_COMPLETE]')
            || fullContent.includes('[LESSON_COMPLETE]');
          if (shouldAdvance) {
            const phases = ['introduction', 'explanation', 'check_understanding', 'deeper_dive', 'practice'];
            setPhase(p => {
              const idx = phases.indexOf(p);
              return idx < phases.length - 1 ? phases[idx + 1] : p;
            });
          }

          if (fullContent.includes('[LESSON_COMPLETE]')) {
            setCompleted(true);
            const match = fullContent.match(/\[LESSON_COMPLETE\]\s*(\{[^}]+\})/);
            if (match) {
              try { setCompletionData(JSON.parse(match[1])); } catch {}
            }
          }
        }
        setStreamingContent('');
        streamContentRef.current = '';
        setStreaming(false);
      },
      onError: (err) => {
        setMessages(m => [...m, errorChatMessage(err)]);
        setStreamingContent('');
        streamContentRef.current = '';
        setStreaming(false);
      },
    });
    abortRef.current = abort;
  }

  const sendMessage = useCallback((text) => {
    if (streaming) return;
    doSend(text);
  }, [streaming, completed, curriculumId, lessonId]);

  async function handleReset() {
    if (!confirm('Reset this lesson? Your conversation will be cleared.')) return;
    try {
      await resetLesson(curriculumId, lessonId);
      setMessages([]);
      setPhase('introduction');
      setCompleted(false);
      setCompletionData(null);
      autoStarted.current = false;
      let lessonTitle = '';
      for (const u of curriculum?.units || []) {
        const l = (u.lessons || []).find(l => l.id === lessonId);
        if (l) { lessonTitle = l.title; break; }
      }
      if (lessonTitle) setTimeout(() => doSend(`I'm ready to learn about "${lessonTitle}". Let's begin!`), 100);
    } catch (err) { console.error('Failed to reset:', err); }
  }

  function navigateToLesson(index) {
    const lesson = allLessons[index];
    if (lesson) navigate(`/curriculum/${curriculumId}/lesson/${lesson.id}`);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;

  if (!curriculum || !currentLesson) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 dark:text-gray-400">Lesson not found.</p>
        <Button variant="ghost" onClick={() => navigate(`/curriculum/${curriculumId}`)} className="mt-4">Back</Button>
      </div>
    );
  }

  const phaseHeader = (
    <div>
      <div className="px-4 py-3 border-b border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]">
        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
          {currentUnit?.title} &middot; Lesson {currentIndex + 1} of {allLessons.length}
        </p>
        <h2 className="font-semibold text-gray-900 dark:text-white text-sm mt-0.5">{currentLesson.title}</h2>
      </div>
      {currentLesson.type === 'lesson' && <PhaseIndicator currentPhase={phase} />}
    </div>
  );

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col flex-1 min-h-0">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <button
          onClick={() => navigate(`/curriculum/${curriculumId}`)}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <ArrowLeft size={16} />
          {curriculum.title}
        </button>
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <RotateCcw size={14} /> Reset
        </Button>
      </div>

      {/* Completion card */}
      {completed && completionData && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 mb-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-emerald-600" />
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Lesson Complete!</span>
            <span className="ml-auto text-sm font-bold text-emerald-600">+{completionData.xpEarned || 25} XP</span>
          </div>
          {completionData.summary && <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">{completionData.summary}</p>}
        </div>
      )}

      {/* Chat — takes remaining space */}
      <ChatContainer
        messages={messages}
        streamingContent={streamingContent}
        onSend={sendMessage}
        disabled={streaming || completed}
        placeholder={completed ? 'Lesson complete!' : streaming ? 'AI is responding...' : 'Type your response...'}
        header={phaseHeader}
        className="flex-1 min-h-0"
      />

      {/* Navigation */}
      <div className="flex items-center justify-between mt-2 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={() => navigateToLesson(currentIndex - 1)} disabled={currentIndex <= 0}>
          <ChevronLeft size={16} /> Prev
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigateToLesson(currentIndex + 1)} disabled={currentIndex >= allLessons.length - 1}>
          Next <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
