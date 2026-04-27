import { useState, useRef, useEffect } from 'react';
import { Send, Globe, Paperclip, X, FileText, Loader2, Upload } from 'lucide-react';
import { getToken } from '../../api/client';

// Read a File into a base64 data URL string.
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function isImageFile(f) { return f && f.type && f.type.startsWith('image/'); }
function isPdfFile(f) {
  if (!f) return false;
  if (f.type === 'application/pdf') return true;
  return /\.pdf$/i.test(f.name || '');
}
function isTextFile(f) {
  if (!f) return false;
  if (f.type && f.type.startsWith('text/')) return true;
  return /\.(txt|md|csv|json|tex)$/i.test(f.name || '');
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
  // docs: [{ name, kind: 'pdf' | 'text', text, size, status: 'extracting'|'ready'|'error' }]
  // PDFs + text files get extracted server-side and prepended to the
  // outgoing message as a fenced quote block.
  const [docs, setDocs] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const dragDepth = useRef(0);

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
    const list = Array.from(files || []);
    if (!list.length) return;

    // Split files by kind. Images go through the existing base64
    // inline_data path; PDFs + text files get sent to /api/files/extract
    // for server-side text extraction.
    const newImages = [];
    const pdfsAndText = [];
    for (const f of list) {
      if (isImageFile(f)) {
        if (images.length + newImages.length >= 4) continue;
        if (f.size > 5 * 1024 * 1024) continue; // 5MB image cap
        const dataUrl = await fileToDataUrl(f);
        newImages.push({ dataUrl, mimeType: f.type, name: f.name });
      } else if (isPdfFile(f) || isTextFile(f)) {
        if (f.size > 25 * 1024 * 1024) continue; // 25MB doc cap
        pdfsAndText.push(f);
      }
    }
    if (newImages.length) setImages(prev => [...prev, ...newImages]);

    // Show pending chips immediately so the user knows the upload started.
    if (pdfsAndText.length) {
      const pending = pdfsAndText.map(f => ({
        name: f.name, kind: isPdfFile(f) ? 'pdf' : 'text', text: '', size: f.size, status: 'extracting',
      }));
      setDocs(prev => [...prev, ...pending]);
      try {
        const form = new FormData();
        for (const f of pdfsAndText) form.append('files', f, f.name);
        const tok = getToken();
        const res = await fetch('/api/files/extract', {
          method: 'POST',
          headers: tok ? { Authorization: `Bearer ${tok}` } : {},
          body: form,
        });
        const json = await res.json();
        const extracted = Array.isArray(json.files) ? json.files : [];
        setDocs(prev => {
          // Replace each pending entry (matched by name) with the extracted version.
          const next = [...prev];
          for (const e of extracted) {
            const idx = next.findIndex(d => d.status === 'extracting' && d.name === e.name);
            if (idx >= 0) {
              next[idx] = e.error
                ? { ...next[idx], status: 'error', error: e.error }
                : { name: e.name, kind: e.kind, text: e.text || '', size: e.size, status: 'ready' };
            }
          }
          return next;
        });
      } catch (err) {
        setDocs(prev => prev.map(d => d.status === 'extracting' ? { ...d, status: 'error', error: err.message } : d));
      }
    }
  }

  async function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f && (isImageFile(f) || isPdfFile(f) || isTextFile(f))) files.push(f);
      }
    }
    if (files.length) { e.preventDefault(); await handleFiles(files); }
  }

  // Drag-and-drop handlers attached to the composer card. dragDepth
  // counter handles the dragenter/leave bubbling correctly so the
  // overlay doesn't flicker on child elements.
  function handleDragEnter(e) {
    e.preventDefault();
    if (!e.dataTransfer?.types?.includes('Files')) return;
    dragDepth.current++;
    setDragOver(true);
  }
  function handleDragOver(e) {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }
  function handleDragLeave(e) {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  }
  async function handleDrop(e) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files?.length) await handleFiles(files);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    // Block submit while any doc is still extracting — otherwise we'd
    // send the message with empty doc text.
    const stillExtracting = docs.some(d => d.status === 'extracting');
    if (stillExtracting) return;
    if ((!trimmed && !images.length && !docs.some(d => d.status === 'ready')) || disabled) return;

    // Prepend each ready doc's extracted text to the message as a fenced
    // quote so the model sees the full context.
    const readyDocs = docs.filter(d => d.status === 'ready' && d.text);
    let composed = trimmed;
    if (readyDocs.length) {
      const blocks = readyDocs.map(d => `--- FILE: ${d.name} ---\n${d.text}`).join('\n\n');
      composed = `${blocks}\n\n${trimmed || '(see attached file)'}`.trim();
    }

    onSend(composed, images);
    setText('');
    setImages([]);
    setDocs([]);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  const stillExtracting = docs.some(d => d.status === 'extracting');
  const readyDocs = docs.filter(d => d.status === 'ready');
  const canSend = !disabled && !stillExtracting && (text.trim().length > 0 || images.length > 0 || readyDocs.length > 0);

  // Composer redesign — DELIBERATELY not the ChatGPT rounded-pill input.
  // Layout: a card-style composer with a top "intent" rail (paperclip,
  // source-mode toggle, char count) and the textarea below. Send button is
  // a square corner-accent on the bottom-right with an arrow, not a circle.
  // The whole thing has a subtle outer ring instead of a flat border, so
  // it reads as "panel" not "search box".
  return (
    <form
      onSubmit={handleSubmit}
      className="px-3 pt-2 pb-3 border-t border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.pdf,.txt,.md,.csv,.json,.tex,text/*"
        multiple
        className="hidden"
        onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Drag overlay — full-card highlight while user drags a file in. */}
      {dragOver && (
        <div className="absolute inset-x-3 top-2 bottom-3 z-20 rounded-xl border-2 border-dashed border-blue-500 bg-blue-50/90 dark:bg-blue-950/70 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Upload size={22} className="text-blue-500 mx-auto mb-1.5" />
            <p className="text-sm font-bold text-blue-700 dark:text-blue-300">Drop to attach</p>
            <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-0.5">Images, PDFs, or text files</p>
          </div>
        </div>
      )}

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
            disabled={disabled}
            title="Attach an image, PDF, or text file (you can also drag-and-drop or paste)"
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
              {sourceMode ? 'Source · 2×' : 'Source'}
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

        {/* DOC STRIP — PDFs + text files. Each chip shows a status (extracting / ready / error). */}
        {docs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {docs.map((d, i) => {
              const tone = d.status === 'error'
                ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/15 text-rose-600 dark:text-rose-400'
                : d.status === 'extracting'
                  ? 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/15 text-blue-600 dark:text-blue-400'
                  : 'border-gray-200 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] text-gray-700 dark:text-gray-200';
              return (
                <div key={i} className={`inline-flex items-center gap-1.5 max-w-[260px] px-2 py-1 rounded-md border ${tone}`}>
                  {d.status === 'extracting'
                    ? <Loader2 size={12} className="animate-spin flex-shrink-0" />
                    : <FileText size={12} className="flex-shrink-0" />}
                  <span className="text-[11px] font-medium truncate">{d.name}</span>
                  {d.status === 'ready' && d.text && (
                    <span className="text-[9px] tabular-nums opacity-70 flex-shrink-0">
                      {d.text.split(/\s+/).filter(Boolean).length}w
                    </span>
                  )}
                  {d.status === 'error' && (
                    <span className="text-[9px] flex-shrink-0">failed</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setDocs(prev => prev.filter((_, idx) => idx !== i))}
                    className="flex-shrink-0 hover:opacity-100 opacity-60 -mr-0.5"
                    aria-label="Remove file"
                  >
                    <X size={11} />
                  </button>
                </div>
              );
            })}
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
          Enter to send · Shift+Enter for new line · drag &amp; drop PDFs / images
        </p>
        {sourceMode && (
          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">AI will search and cite</span>
        )}
      </div>
    </form>
  );
}
