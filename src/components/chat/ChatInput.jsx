import { useState, useRef, useEffect } from 'react';
import { Send, Globe } from 'lucide-react';

// When `sourceMode` + `onToggleSource` are passed, a small "Source mode"
// toggle appears. It tells the parent to flip the flag; the parent decides
// whether to forward that to the server. Source mode costs 2x messages.
export default function ChatInput({
  onSend,
  disabled,
  placeholder = 'Type a message...',
  sourceMode = false,
  onToggleSource,
}) {
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
      className="flex flex-col gap-1.5 p-3 border-t border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]"
    >
      <div className="flex items-end gap-2">
        <div className="flex-1 flex items-end rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] focus-within:border-blue-500 transition-colors overflow-hidden">
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={sourceMode ? 'Ask anything — I\'ll cite sources…' : placeholder}
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
                ? (sourceMode ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white')
                : 'bg-transparent text-gray-400 dark:text-gray-500 cursor-not-allowed'
            }`}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
      {typeof onToggleSource === 'function' && (
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => onToggleSource(!sourceMode)}
            title="Search the web and cite sources. Costs 2 messages."
            className={`inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2 py-0.5 transition-colors ${
              sourceMode
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/40'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-transparent hover:border-gray-200 dark:hover:border-[#2A2A40]'
            }`}
          >
            <Globe size={11} />
            {sourceMode ? 'Source mode ON · 2x' : 'Source mode'}
          </button>
          {sourceMode && (
            <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80">AI will search the web and cite</span>
          )}
        </div>
      )}
    </form>
  );
}
