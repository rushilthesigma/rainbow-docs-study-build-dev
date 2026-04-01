import { useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';

export default function ChatContainer({ messages, streamingContent, onSend, disabled, placeholder, header, className = '' }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  // Build display messages + streaming message
  const displayMessages = [...messages];
  if (streamingContent) {
    displayMessages.push({ role: 'assistant', content: streamingContent, _streaming: true });
  }

  return (
    <div className={`flex flex-col bg-gray-50 dark:bg-[#0D0D14] rounded-xl border border-gray-200 dark:border-[#2A2A40] overflow-hidden ${className}`}>
      {header}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1">
        {displayMessages.length === 0 && (
          <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">
            Start the conversation...
          </div>
        )}
        {displayMessages.map((msg, i) => (
          <ChatMessage key={i} message={msg} isStreaming={msg._streaming} />
        ))}
      </div>
      <ChatInput onSend={onSend} disabled={disabled} placeholder={placeholder} />
    </div>
  );
}
