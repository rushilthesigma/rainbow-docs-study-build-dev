import { useRef, useEffect, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';

export default function ChatContainer({
  messages, streamingContent, streamingSources, onSend, disabled, placeholder,
  header, className = '', sourceMode, onToggleSource, searchStatus,
  // Optional: hide the built-in input (caller supplies its own controls),
  // and opt-in editing support (set of editable msg indices + handler).
  hideInput = false,
  editableIndices = null,
  onEditMessage = null,
  onUserEditMessage = null,   // called when user edits their own message (restart semantics)
  onAiInstruct = null,        // called with (index, instruction) for an AI redo request
  // Optional: custom empty-state element shown when there are no messages.
  emptyState = null,
}) {
  const scrollRef = useRef(null);
  // Track whether the user has intentionally scrolled up. If so, we stop
  // auto-scrolling so they can read older messages while the AI streams.
  const [stick, setStick] = useState(true);

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
  if (streamingContent || (streamingSources && streamingSources.length)) {
    displayMessages.push({
      role: 'assistant',
      content: streamingContent || '',
      sources: streamingSources || [],
      _streaming: true,
    });
  }

  return (
    <div className={`flex flex-col bg-gray-50 dark:bg-[#0D0D14] rounded-xl border border-gray-200 dark:border-[#2A2A40] overflow-hidden ${className} relative`}>
      {header}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
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
              isStreaming={msg._streaming}
              canEdit={isEditable}
              onEdit={typeof onEditMessage === 'function' ? (newContent) => onEditMessage(i, newContent) : undefined}
              onUserEdit={typeof onUserEditMessage === 'function' ? (newContent) => onUserEditMessage(i, newContent) : undefined}
              onAiInstruct={typeof onAiInstruct === 'function' ? (instruction) => onAiInstruct(i, instruction) : undefined}
            />
          );
        })}
        {searchStatus && (
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
            <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
            {searchStatus === 'searching' ? 'Searching the web…' : searchStatus === 'reading' ? 'Reading sources…' : searchStatus}
          </div>
        )}
      </div>
      {!stick && (
        <button
          onClick={scrollToBottom}
          className="absolute right-3 bottom-20 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-[11px] shadow-lg"
          title="Jump to latest"
        >
          <ArrowDown size={12} /> New
        </button>
      )}
      {!hideInput && (
        <ChatInput
          onSend={onSend}
          disabled={disabled}
          placeholder={placeholder}
          sourceMode={sourceMode}
          onToggleSource={onToggleSource}
        />
      )}
    </div>
  );
}
