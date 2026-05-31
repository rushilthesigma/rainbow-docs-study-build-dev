import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, ChevronLeft, ChevronRight, Trophy, Sparkles } from 'lucide-react';
import { getCurriculum, getLessonHistory, sendLessonMessage, resetLesson } from '../api/curriculum';
import ChatContainer from '../components/chat/ChatContainer';
import { errorChatMessage } from '../utils/aiErrors';
import PhaseIndicator from '../components/chat/PhaseIndicator';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import Button from '../components/shared/Button';
import AssignmentCard from '../components/lesson/AssignmentCard';

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

  function doSend(text, opts = {}) {
    if (completed) return;

    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    if (!opts.hideUserInDisplay) setMessages(prev => [...prev, userMsg]);
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

  function handleUserEdit(idx, newContent) {
    if (streaming) return;
    setMessages(prev => prev.slice(0, idx));
    setTimeout(() => doSend(newContent), 30);
  }
  function handleAiInstruct(idx, instruction) {
    if (streaming || !instruction?.trim()) return;
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx]?.role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const prevUserText = messages[userIdx].content || '';
    const userMsgSnapshot = messages[userIdx];
    setMessages(prev => [...prev.slice(0, userIdx), userMsgSnapshot]);
    const hidden = `${prevUserText}\n\n[SYSTEM NOTE: Regenerate your previous answer — this time ${instruction.trim()}. Do NOT acknowledge this instruction. Output the revised answer directly.]`;
    setTimeout(() => doSend(hidden, { hideUserInDisplay: true }), 30);
  }

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

  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;
  const phaseHeader = currentLesson.type === 'lesson' ? <PhaseIndicator currentPhase={phase} /> : null;

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col flex-1 min-h-0 px-1">
      {/* Slim breadcrumb row */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <button
          onClick={() => navigate(`/curriculum/${curriculumId}`)}
          className="flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/85 transition-colors group"
        >
          <ArrowLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
          <span className="truncate max-w-[260px]">{curriculum.title}</span>
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 text-[12px] text-white/35 hover:text-white/75 transition-colors px-2 py-1 rounded-md hover:bg-white/[0.04]"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      {/* Hero header — unit tag + big lesson title */}
      <div className="mb-5 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300/80 bg-blue-500/[0.10] border border-blue-400/[0.20] rounded-full px-2.5 py-0.5">
            {currentUnit?.title || 'Lesson'}
          </span>
          <span className="text-[11px] text-white/35 font-mono tabular-nums">
            {currentIndex + 1} / {allLessons.length}
          </span>
        </div>
        <h1 className="text-[26px] sm:text-[30px] leading-[1.15] font-semibold tracking-[-0.015em] text-white/95">
          {currentLesson.title}
        </h1>
      </div>

      {/* Completion celebration — gradient card with trophy + XP */}
      {completed && completionData && (
        <div
          className="relative overflow-hidden rounded-2xl p-5 mb-4 flex-shrink-0 border border-emerald-400/25"
          style={{
            background:
              'radial-gradient(at 0% 0%, rgba(16,185,129,0.20) 0%, transparent 55%),' +
              'radial-gradient(at 100% 100%, rgba(99,102,241,0.18) 0%, transparent 60%),' +
              'rgba(16, 22, 26, 0.65)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 grid place-items-center flex-shrink-0">
              <Trophy size={20} className="text-white drop-shadow" strokeWidth={2.2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[16px] font-semibold text-white">Lesson complete</h3>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-200/90 bg-emerald-500/[0.18] border border-emerald-400/30 rounded-full px-2 py-0.5">
                  <Sparkles size={10} /> +{completionData.xpEarned || 25} XP
                </span>
              </div>
              {completionData.summary && (
                <p className="text-[13px] text-white/65 mt-1 leading-snug">{completionData.summary}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Graded-mode assignment — only renders when the course is graded.
          Sits above the chat so the student sees the assignment + can either
          submit there or use the chat below to work through the content first. */}
      {curriculum.graded && currentLesson.type === 'lesson' && (
        <div className="mb-4 flex-shrink-0">
          <AssignmentCard
            curriculumId={curriculumId}
            lessonId={lessonId}
            initialAssignment={currentLesson.assignment}
            onSubmitted={() => {
              // Re-fetch the curriculum so the completion + grade reflect immediately.
              getCurriculum(curriculumId).then(d => setCurriculum(d.curriculum)).catch(() => {});
              setCompleted(true);
            }}
          />
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
        onUserEditMessage={handleUserEdit}
        onAiInstruct={handleAiInstruct}
      />

      {/* Prev / Next nav — proper outlined buttons with lesson previews */}
      <div className="grid grid-cols-2 gap-3 mt-4 flex-shrink-0">
        <LessonNavButton
          dir="prev"
          lesson={prevLesson}
          onClick={() => navigateToLesson(currentIndex - 1)}
        />
        <LessonNavButton
          dir="next"
          lesson={nextLesson}
          onClick={() => navigateToLesson(currentIndex + 1)}
        />
      </div>
    </div>
  );
}

// Prev/Next pill: arrow + "Previous" / "Next" label, then the
// adjacent lesson title underneath. Greys out + disables when there's
// nothing to navigate to. Hovering nudges the arrow in its direction.
function LessonNavButton({ dir, lesson, onClick }) {
  const isPrev = dir === 'prev';
  const disabled = !lesson;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
        disabled
          ? 'border-white/[0.05] bg-white/[0.015] opacity-40 cursor-not-allowed'
          : 'border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/[0.14] active:scale-[0.99]'
      } ${isPrev ? '' : 'flex-row-reverse text-right'}`}
    >
      <div className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 transition-all ${
        disabled
          ? 'bg-white/[0.03] text-white/30'
          : 'bg-white/[0.06] text-white/65 group-hover:bg-white/[0.12] group-hover:text-white'
      }`}>
        {isPrev
          ? <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" strokeWidth={2.2} />
          : <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" strokeWidth={2.2} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">
          {isPrev ? 'Previous' : 'Next'}
        </p>
        <p className={`text-[13px] mt-0.5 truncate ${disabled ? 'text-white/30' : 'text-white/85'}`}>
          {lesson?.title || '—'}
        </p>
      </div>
    </button>
  );
}
