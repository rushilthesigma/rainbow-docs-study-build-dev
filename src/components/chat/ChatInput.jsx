import { useState, useRef, useEffect } from 'react';
import { Send, Globe, Paperclip, X } from 'lucide-react';

// Read a File into a base64 data URL string.
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

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
  // images: [{ dataUrl, mimeType, name }]
  const [images, setImages] = useState([]);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  // ⌘/Ctrl+Shift+A toggles source mode when the toggle is available. Works
  // globally while the chat is mounted; we skip when target is a form field
  // other than our textarea so the user can still type in other inputs.
  useEffect(() => {
    if (typeof onToggleSource !== 'function') return;
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || !e.shiftKey) return;
      if (e.key.toLowerCase() !== 'a') return;
      const t = e.target;
      const inOtherField = t && (t.tagName === 'INPUT' || (t.tagName === 'TEXTAREA' && t !== inputRef.current));
      if (inOtherField) return;
      e.preventDefault();
      onToggleSource(!sourceMode);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggleSource, sourceMode]);

  async function handleFiles(files) {
    const list = Array.from(files || []).filter(f => f.type.startsWith('image/'));
    if (!list.length) return;
    const added = [];
    for (const f of list.slice(0, 4 - images.length)) {
      // Cap at 5MB per image to keep request size sane.
      if (f.size > 5 * 1024 * 1024) continue;
      const dataUrl = await fileToDataUrl(f);
      added.push({ dataUrl, mimeType: f.type, name: f.name });
    }
    if (added.length) setImages(prev => [...prev, ...added]);
  }

  async function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f && f.type.startsWith('image/')) files.push(f);
      }
    }
    if (files.length) { e.preventDefault(); await handleFiles(files); }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && !images.length) || disabled) return;
    onSend(trimmed, images);
    setText('');
    setImages([]);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  const canSend = !disabled && (text.trim().length > 0 || images.length > 0);

  // Composer redesign — DELIBERATELY not the ChatGPT rounded-pill input.
  // Layout: a card-style composer with a top "intent" rail (paperclip,
  // source-mode toggle, char count) and the textarea below. Send button is
  // a square corner-accent on the bottom-right with an arrow, not a circle.
  // The whole thing has a subtle outer ring instead of a flat border, so
  // it reads as "panel" not "search box".
  return (
    <form
      onSubmit={handleSubmit}
      className="px-3 pt-2 pb-3 border-t border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]"
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Composer card */}
      <div
        data-tour="chat-input"
        className={`rounded-xl bg-white dark:bg-[#0f0f18] transition-all overflow-hidden ${
          sourceMode
            ? 'ring-2 ring-amber-400/60 shadow-[0_0_0_4px_rgba(251,191,36,0.08)]'
            : 'ring-1 ring-gray-200 dark:ring-[#2A2A40] focus-within:ring-2 focus-within:ring-blue-500/70 focus-within:shadow-[0_0_0_4px_rgba(59,130,246,0.08)]'
        }`}
      >
        {/* TOP RAIL — tools + mode toggle + char count */}
        <div className="flex items-center gap-1 px-2 pt-1.5 pb-1 border-b border-gray-100 dark:border-[#2A2A40]/70 bg-gray-50/60 dark:bg-[#0a0a14]/40">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || images.length >= 4}
            title="Attach screenshot or image"
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-40 transition-colors"
          >
            <Paperclip size={12} /> Attach
          </button>
          {typeof onToggleSource === 'function' && (
            <button
              type="button"
              onClick={() => onToggleSource(!sourceMode)}
              title="Search the web and cite sources. Costs 2 messages. (⌘/Ctrl+Shift+A)"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                sourceMode
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                  : 'text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/15'
              }`}
            >
              <Globe size={12} />
              {sourceMode ? 'Web · 2×' : 'Web'}
            </button>
          )}
          <span className="flex-1" />
          {text.length > 0 && (
            <span className={`text-[10px] tabular-nums px-1 ${text.length > 1800 ? 'text-rose-500' : 'text-gray-400'}`}>
              {text.length}
            </span>
          )}
        </div>

        {/* IMAGE STRIP */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-2.5">
            {images.map((img, i) => (
              <div key={i} className="relative w-14 h-14 rounded-md overflow-hidden border border-gray-200 dark:border-[#2A2A40] bg-gray-100 dark:bg-[#0D0D14]">
                <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
                  aria-label="Remove image"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* TEXTAREA + SEND */}
        <div className="flex items-end">
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={sourceMode ? 'Ask anything — I\'ll search and cite…' : placeholder}
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none px-3 py-2.5 bg-transparent text-[14px] text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none max-h-40 overflow-y-auto"
            style={{ minHeight: '44px', border: 'none', boxShadow: 'none' }}
            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'; }}
          />
          {/* Square corner-accent send button — NOT a round pill */}
          <button
            type="submit"
            disabled={!canSend}
            title="Send (Enter)"
            className={`m-1.5 px-3 h-9 rounded-md inline-flex items-center gap-1 text-[12px] font-semibold transition-colors flex-shrink-0 ${
              canSend
                ? (sourceMode ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-gray-900 hover:bg-black dark:bg-blue-600 dark:hover:bg-blue-500 text-white')
                : 'bg-gray-100 dark:bg-[#161622] text-gray-400 dark:text-gray-500 cursor-not-allowed'
            }`}
          >
            Send <Send size={11} />
          </button>
        </div>
      </div>

      {/* Hint row beneath the composer — replaces the inline keyboard hint pattern */}
      <div className="flex items-center justify-between mt-1.5 px-1">
        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          Enter to send · Shift+Enter for new line
        </p>
        {sourceMode && (
          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">AI will search and cite</span>
        )}
      </div>
    </form>
  );
}
