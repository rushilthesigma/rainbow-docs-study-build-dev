import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

export default function ChatInput({ onSend, disabled, placeholder = 'Type a message...' }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  const canSend = !disabled && text.trim().length > 0;
  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 p-3 border-t border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]"
    >
      {/* Single rounded pill containing the textarea AND the send button so
          no stray border/bg strips appear between them. */}
      <div className="flex-1 flex items-end rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] focus-within:border-blue-500 transition-colors overflow-hidden">
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none px-3 py-2 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none max-h-32 overflow-y-auto"
          style={{ minHeight: '40px', border: 'none', boxShadow: 'none' }}
          onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'; }}
        />
        <button
          type="submit"
          disabled={!canSend}
          className={`m-1 p-2 rounded-lg flex-shrink-0 transition-colors ${
            canSend
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-transparent text-gray-400 dark:text-gray-500 cursor-not-allowed'
          }`}
        >
          <Send size={16} />
        </button>
      </div>
    </form>
  );
}
