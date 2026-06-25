import { useRef, useEffect, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';

export default function ChatContainer({
  messages, streamingContent, streamingThinking, streamingSources, streamingArtifacts, streamingBestOf, onSend, disabled, placeholder,
  header, className = '', sourceMode, onToggleSource, searchStatus,
  sourceDisabled = false, sourceDisabledReason = '',
  humanizeMode = false, onToggleHumanize,
  showThinking = false, thinkingMode = true, thinkingLocked = false, onToggleThinking,
  composerExtras = null,
  composerPrefix = null,
  enableDictation = false,
  onPreviewFile = null,
  sideScreenQuizId = null,
  quizSideScreenTarget = null,
  onSideScreenQuiz = null,
  hideInput = false,
  editableIndices = null,
  onEditMessage = null,
  onUserEditMessage = null,
  onAiInstruct = null,
  onReroute = null,
  onSmartReroute = null,
  onBruteForce = null,
  emptyState = null,
  // When true, renders flush (no glass-card, no rounded corners) - use for full-page panels
  flush = false,
  attachmentSlot = null,
  canvasOpen = false,
}) {
  const scrollRef = useRef(null);
  const chatInputRef = useRef(null);
  // Track whether the user has intentionally scrolled up. If so, we stop
  // auto-scrolling so they can read older messages while the AI streams.
  const [stick, setStick] = useState(true);

  // Forward drops on the messages area to ChatInput so the whole panel is a
  // drop zone, not just the input form.
  function handleMsgDragOver(e) {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }
  function handleMsgDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    chatInputRef.current?.handleFiles(files);
    // Call onPreviewFile directly for PDFs — the ref's handleFiles may have a
    // stale closure that doesn't fire it.
    if (typeof onPreviewFile === 'function') {
      for (const f of Array.from(files)) {
        if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          onPreviewFile(f);
        }
      }
    }
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 60; // px from bottom to count as "stuck"
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setStick(atBottom);
  }

  useEffect(() => {
    if (stick && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent, stick]);

  function scrollToBottom() {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setStick(true);
    }
  }

  // Build display messages + streaming message (show live sources while streaming)
  const displayMessages = [...messages];
  if (streamingContent || streamingThinking || (streamingSources && streamingSources.length) || (streamingArtifacts && streamingArtifacts.length)) {
    displayMessages.push({
      role: 'assistant',
      content: streamingContent || '',
      thinking: streamingThinking || '',
      sources: streamingSources || [],
        artifacts: streamingArtifacts || [],
        bestOf: streamingBestOf || undefined,
        _streaming: true,
      });
  }

  return (
    <div className={`flex flex-col overflow-hidden ${flush ? '' : 'glass-card rounded-2xl'} ${className} relative`}>
      {header}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onDragOver={handleMsgDragOver}
        onDrop={handleMsgDrop}
        className="flex-1 overflow-y-auto p-4 space-y-1"
      >
        {displayMessages.length === 0 && (
          emptyState || (
            <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">
              Start the conversation...
            </div>
          )
        )}
        {displayMessages.map((msg, i) => {
          const isEditable = !msg._streaming && (
            // Explicit editable set (back-compat)
            (!!editableIndices && editableIndices.has && editableIndices.has(i))
            // Or any of the new per-role handlers are wired
            || (typeof onUserEditMessage === 'function' && msg.role === 'user')
            || (typeof onAiInstruct === 'function' && msg.role === 'assistant')
          );
          return (
            <ChatMessage
              key={i}
              message={msg}
              quizId={`quiz-message-${i}`}
              sideScreenQuizId={sideScreenQuizId}
              quizSideScreenTarget={quizSideScreenTarget}
              onSideScreenQuiz={onSideScreenQuiz}
              isStreaming={msg._streaming}
              canEdit={isEditable}
              onEdit={typeof onEditMessage === 'function' ? (newContent) => onEditMessage(i, newContent) : undefined}
              onUserEdit={typeof onUserEditMessage === 'function' ? (newContent) => onUserEditMessage(i, newContent) : undefined}
              onAiInstruct={typeof onAiInstruct === 'function' ? (instruction) => onAiInstruct(i, instruction) : undefined}
              onReroute={typeof onReroute === 'function' && msg.role === 'assistant' && !msg._streaming ? () => onReroute(i) : undefined}
              onSmartReroute={typeof onSmartReroute === 'function' && msg.role === 'assistant' && !msg._streaming ? () => onSmartReroute(i) : undefined}
              onBruteForce={typeof onBruteForce === 'function' && msg.role === 'assistant' && !msg._streaming ? (clarify) => onBruteForce(i, clarify) : undefined}
            />
          );
        })}
        {searchStatus && (
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400">
            <span className="inline-block w-1.5 h-1.5 bg-white/60 rounded-full animate-pulse" />
            {searchStatus === 'searching' ? 'Sourcing…' : searchStatus === 'reading' ? 'Reading sources…' : searchStatus}
          </div>
        )}
      </div>
      {!stick && (
        <button
          onClick={scrollToBottom}
          className="absolute right-3 bottom-20 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.13] hover:bg-white/[0.20] border border-white/[0.24] text-white/80 text-[11px] backdrop-blur-sm shadow-lg"
          title="Jump to latest"
        >
          <ArrowDown size={12} /> New
        </button>
      )}
      {!hideInput && (
        <ChatInput
          ref={chatInputRef}
          onSend={onSend}
          disabled={disabled}
          placeholder={placeholder}
          sourceMode={sourceMode}
          onToggleSource={onToggleSource}
          sourceDisabled={sourceDisabled}
          sourceDisabledReason={sourceDisabledReason}
          humanizeMode={humanizeMode}
          onToggleHumanize={onToggleHumanize}
          showThinking={showThinking}
          thinkingMode={thinkingMode}
          thinkingLocked={thinkingLocked}
          onToggleThinking={onToggleThinking}
          composerExtras={composerExtras}
          composerPrefix={composerPrefix}
          enableDictation={enableDictation}
          onPreviewFile={onPreviewFile}
          flush={flush}
          attachmentSlot={attachmentSlot}
          canvasOpen={canvasOpen}
        />
      )}
    </div>
  );
}
