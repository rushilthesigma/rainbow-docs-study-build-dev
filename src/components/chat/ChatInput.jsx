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

  // ⌘/Ctrl+Shift+L toggles source mode when the toggle is available. Works
  // globally while the chat is mounted; we skip when target is a form field
  // other than our textarea so the user can still type in other inputs.
  useEffect(() => {
    if (typeof onToggleSource !== 'function') return;
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || !e.shiftKey) return;
      if (e.key.toLowerCase() !== 'l') return;
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
  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-1.5 p-3 border-t border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]"
    >
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {images.map((img, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-[#2A2A40] bg-gray-100 dark:bg-[#0D0D14]">
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
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
      />
      <div className="flex items-end gap-2">
        <div className="flex-1 flex items-end rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] focus-within:border-blue-500 transition-colors overflow-hidden">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || images.length >= 4}
            title="Attach screenshot or image"
            className="m-1 p-2 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-[#1e1e2e] disabled:opacity-40 flex-shrink-0"
          >
            <Paperclip size={16} />
          </button>
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={sourceMode ? 'Ask anything — I\'ll cite sources…' : placeholder}
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none px-1 py-2 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none max-h-32 overflow-y-auto"
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
            title="Search the web and cite sources. Costs 2 messages. (⌘/Ctrl+Shift+L)"
            className={`inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2 py-0.5 transition-colors ${
              sourceMode
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/40'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-transparent hover:border-gray-200 dark:hover:border-[#2A2A40]'
            }`}
          >
            <Globe size={11} />
            {sourceMode ? 'Source mode ON · 2x' : 'Source mode'}
            <kbd className="ml-1 hidden sm:inline text-[9px] font-mono opacity-60">⌘⇧L</kbd>
          </button>
          {sourceMode && (
            <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80">AI will search the web and cite</span>
          )}
        </div>
      )}
    </form>
  );
}
