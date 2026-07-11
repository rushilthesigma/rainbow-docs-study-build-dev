import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Send, Globe, Paperclip, X, FileText, Loader2, Upload, Brain, PenLine, Calculator, Wand2 } from 'lucide-react';
import { getToken } from '../../api/client';
import { InlineProgress } from '../shared/ProgressBar';
import DictationButton from '../study/voice/DictationButton';

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

function toolAccentStyle(prefix) {
  return {
    '--tool-accent': `var(--${prefix}-accent)`,
    '--tool-accent-text': `var(--${prefix}-accent-text)`,
    '--tool-accent-hover': `var(--${prefix}-accent-hover)`,
    '--tool-accent-soft': `var(--${prefix}-accent-soft)`,
    '--tool-accent-ring': `var(--${prefix}-accent-ring)`,
  };
}

const TOOL_ACCENTS = {
  canvas: toolAccentStyle('canvas'),
  voice: toolAccentStyle('voice'),
  humanize: toolAccentStyle('humanize'),
  webSearch: toolAccentStyle('web-search'),
  refine: toolAccentStyle('refine'),
};

// When `sourceMode` + `onToggleSource` are passed, a small "Source mode"
// toggle appears. It tells the parent to flip the flag; the parent decides
// whether to forward that to the server. Source mode costs 2x messages.
const ChatInput = forwardRef(function ChatInput({
  onSend,
  disabled,
  placeholder = 'Type a message...',
  sourceMode = false,
  onToggleSource,
  // When set, the web-search toggle is shown disabled (greyed, not active) with
  // sourceDisabledReason as its tooltip — e.g. Best of 3, where grounding would
  // collapse the compared models onto Gemini server-side.
  sourceDisabled = false,
  sourceDisabledReason = '',
  // Humanize toggle (Study Mode). When passed, a labeled "Humanize" button
  // appears that flips the composer into essay-writer mode: the request carries
  // humanize:true and the server swaps in a natural prose system prompt.
  humanizeMode = false,
  onToggleHumanize,
  // Prompt refine (Study Mode). When onRefine is passed, a wand button appears
  // with two actions: "Refine draft" rewrites the current draft in place (with
  // Undo), and "Auto-refine before sending" is a mode where every send routes
  // through the rewrite first. onRefine(draft) resolves to {refined, note}.
  onRefine = null,
  autoRefine = false,
  onToggleAutoRefine,
  // Thinking toggle (Study Mode). showThinking renders the Brain button;
  // thinkingLocked = always-on (Pro), so the button is shown active+disabled.
  showThinking = false,
  thinkingMode = true,
  thinkingLocked = false,
  onToggleThinking,
  // Optional node rendered in the composer top rail (e.g. Study Mode's model
  // dropdown). Sits between the tool buttons and the char count.
  composerExtras = null,
  // Optional node rendered just before the DictationButton (e.g. VoiceMenu).
  composerPrefix = null,
  // When true, shows a push-to-talk mic button that dictates into the textarea.
  enableDictation = false,
  // Called with each pasted/dropped/attached PDF File so the parent can mirror
  // it into a side-by-side preview pane (Study Mode splitscreen).
  onPreviewFile = null,
  flush = false,
  // Optional node rendered between the doc strip and the textarea (e.g. a
  // live canvas thumbnail when the Math Canvas split-screen is open).
  attachmentSlot = null,
  // When true, outlines the composer with the canvas accent and shows a small Canvas chip in the top rail.
  canvasOpen = false,
}, ref) {
  const [text, setText] = useState('');
  // images: [{ dataUrl, mimeType, name }]
  const [images, setImages] = useState([]);
  // docs: [{ name, kind: 'pdf' | 'text', text, size, status: 'extracting'|'ready'|'error' }]
  // PDFs + text files get extracted server-side and prepended to the
  // outgoing message as a fenced quote block.
  const [docs, setDocs] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  // Prompt refine state. `refining` blocks send while the AI rewrite is in
  // flight; `refineUndo` keeps the pre-refine draft so the chip can restore it.
  const [refining, setRefining] = useState(false);
  const [refineMenuOpen, setRefineMenuOpen] = useState(false);
  const [refineUndo, setRefineUndo] = useState(null); // { original, note }
  const [refineError, setRefineError] = useState('');
  const refineBtnRef = useRef(null);
  const refinePopRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    if (!refineMenuOpen) return;
    function onDown(e) {
      if (refinePopRef.current?.contains(e.target) || refineBtnRef.current?.contains(e.target)) return;
      setRefineMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [refineMenuOpen]);

  // Expose handleFiles so parent containers can programmatically add files
  // (e.g. when a PDF is dropped on the messages area above this form).
  useImperativeHandle(ref, () => ({ handleFiles }));

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  // ⌘/Ctrl+Shift+A toggles source mode when the toggle is available. Works
  // globally while the chat is mounted; we skip when target is a form field
  // other than our textarea so the user can still type in other inputs.
  useEffect(() => {
    if (typeof onToggleSource !== 'function' || sourceDisabled) return;
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
  }, [onToggleSource, sourceMode, sourceDisabled]);

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
        // Mirror PDFs into the side-by-side preview pane, in addition to
        // extracting their text below for the AI.
        if (isPdfFile(f) && typeof onPreviewFile === 'function') onPreviewFile(f);
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

  async function doSend(textOverride, opts = {}) {
    const trimmed = (textOverride ?? text).trim();
    const stillExtracting = docs.some(d => d.status === 'extracting');
    if (stillExtracting || disabled || refining) return;
    if (!trimmed && !images.length && !docs.some(d => d.status === 'ready')) return;

    const readyDocs = docs.filter(d => d.status === 'ready' && d.text);
    const sentImages = images;

    // Clear the composer up front: with auto-refine the send waits on a short
    // AI rewrite, and anything typed during that wait must not be clobbered
    // by a late setText('').
    setText('');
    setImages([]);
    setDocs([]);
    setRefineUndo(null);
    setRefineError('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    let promptText = trimmed;
    let sendOpts = opts;
    if (autoRefine && typeof onRefine === 'function' && trimmed) {
      setRefining(true);
      try {
        const r = await onRefine(trimmed);
        const refined = typeof r?.refined === 'string' ? r.refined.trim() : '';
        if (refined && refined !== trimmed) {
          promptText = refined;
          sendOpts = { ...opts, refined: { original: trimmed, note: r?.note || '' } };
        }
      } catch {
        // Refine is best-effort: on any failure the original draft is sent.
      }
      setRefining(false);
    }

    let composed = promptText;
    if (readyDocs.length) {
      const blocks = readyDocs.map(d => `--- FILE: ${d.name} ---\n${d.text}`).join('\n\n');
      composed = `${blocks}\n\n${promptText || '(see attached file)'}`.trim();
    }

    onSend(composed, sentImages, sendOpts);
  }

  // One-shot refine: rewrite the current draft in place, keeping the original
  // around for Undo. Auto-refine instead rewrites at send time (see doSend).
  async function refineDraftNow() {
    const t = text.trim();
    if (!t || refining || disabled || typeof onRefine !== 'function') return;
    setRefineMenuOpen(false);
    setRefineError('');
    setRefining(true);
    try {
      const r = await onRefine(t);
      const refined = typeof r?.refined === 'string' ? r.refined.trim() : '';
      if (refined && refined !== t) {
        setRefineUndo({ original: t, note: r?.note || '' });
        setText(refined);
        requestAnimationFrame(() => { inputRef.current?.focus(); growTextarea(); });
      } else if (refined) {
        setRefineUndo({ original: t, note: 'Already clear, no changes needed' });
      } else {
        setRefineError('Refine is unavailable right now');
      }
    } catch (e) {
      setRefineError(e?.message || 'Refine is unavailable right now');
    }
    setRefining(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    doSend();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  const [dictationActive, setDictationActive] = useState(false);

  // Live dictation. The spoken words stream into the textarea as they're
  // recognized: we snapshot whatever was typed when dictation started
  // (dictBaseRef), then on each live update show base + the growing
  // transcript. On stop we commit it as the new base so a second dictation
  // pass appends rather than overwrites.
  const dictBaseRef = useRef('');
  // Mirror of `text` kept in a ref so voice-command callbacks always read the
  // latest value without stale-closure issues.
  const textRef = useRef(text);
  useEffect(() => { textRef.current = text; }, [text]);
  function growTextarea() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }
  function handleDictationStart() {
    dictBaseRef.current = text.trim();
  }
  function handleDictationLive(combined) {
    const base = dictBaseRef.current;
    setText(base ? `${base} ${combined}` : combined);
    requestAnimationFrame(growTextarea);
  }
  function handleDictationAutoSend(chunk) {
    const base = dictBaseRef.current;
    const merged = (base && chunk ? `${base} ${chunk}` : base || chunk).trim();
    dictBaseRef.current = '';
    doSend(merged);
  }

  function handleDictationAutoRestart() {
    setText('');
    dictBaseRef.current = '';
    requestAnimationFrame(growTextarea);
  }

  function handleDictationAutoDelete(countWord) {
    const NUMBER_WORDS = {
      one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
      eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,
      sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,
    };
    const n = parseInt(countWord, 10) || NUMBER_WORDS[countWord.toLowerCase()] || 0;
    if (!n) return;
    const words = textRef.current.trim().split(/\s+/).filter(Boolean);
    const remaining = words.slice(0, Math.max(0, words.length - n)).join(' ');
    setText(remaining);
    dictBaseRef.current = remaining;
    requestAnimationFrame(growTextarea);
  }

  // Tolerant of how speech recognition transcribes "send send" ("sent send",
  // "send, send", trailing period). Must match DictationButton's copy, which
  // handles the live-transcript path; this one covers the final transcript.
  const SEND_TRIGGER = /\b(?:send|sent)[\s,.!]+(?:send|sent)[\s,.!?]*$/i;

  function handleDictationFinal(finalText) {
    const base = dictBaseRef.current;
    const chunk = (finalText || '').trim();
    const merged = (base ? (chunk ? `${base} ${chunk}` : base) : chunk).trim();

    if (SEND_TRIGGER.test(merged)) {
      const payload = merged.replace(SEND_TRIGGER, '').trim();
      setText(payload);
      dictBaseRef.current = '';
      requestAnimationFrame(() => { inputRef.current?.focus(); growTextarea(); });
      doSend(payload);
      return;
    }

    setText(merged);
    dictBaseRef.current = merged;
    requestAnimationFrame(() => { inputRef.current?.focus(); growTextarea(); });
  }

  const stillExtracting = docs.some(d => d.status === 'extracting');
  const readyDocs = docs.filter(d => d.status === 'ready');
  const canSend = !disabled && !stillExtracting && !refining && (text.trim().length > 0 || images.length > 0 || readyDocs.length > 0);
  const activeComposerAccent = dictationActive
    ? TOOL_ACCENTS.voice
    : humanizeMode
      ? TOOL_ACCENTS.humanize
      : sourceMode
        ? TOOL_ACCENTS.webSearch
        : autoRefine
          ? TOOL_ACCENTS.refine
          : canvasOpen
            ? TOOL_ACCENTS.canvas
            : undefined;
  const sendAccent = dictationActive
    ? TOOL_ACCENTS.voice
    : humanizeMode
      ? TOOL_ACCENTS.humanize
      : sourceMode
        ? TOOL_ACCENTS.webSearch
        : autoRefine
          ? TOOL_ACCENTS.refine
          : canvasOpen
            ? TOOL_ACCENTS.canvas
            : undefined;

  // Composer redesign - DELIBERATELY not the ChatGPT rounded-pill input.
  // Layout: a card-style composer with a top "intent" rail (paperclip,
  // source-mode toggle, char count) and the textarea below. Send button is
  // a square corner-accent on the bottom-right with an arrow, not a circle.
  // The whole thing has a subtle outer ring instead of a flat border, so
  // it reads as "panel" not "search box".
  return (
    <form
      onSubmit={handleSubmit}
      className={`px-3 py-2 relative ${flush ? 'bg-transparent' : 'glass-header'}`}
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

      {/* Drag overlay - full-card highlight while user drags a file in. */}
      {dragOver && (
        <div className="absolute inset-x-3 top-2 bottom-3 z-20 rounded-xl border-2 border-dashed border-white/40 bg-black/30 dark:bg-black/60 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Upload size={22} className="text-white/70 mx-auto mb-1.5" />
            <p className="text-sm font-bold text-white">Drop to attach</p>
            <p className="text-[11px] text-white/60 mt-0.5">Images, PDFs, or text files</p>
          </div>
        </div>
      )}

      {/* Refine menu - anchored to the form, not the composer card, because
          the card has overflow-hidden and would clip a popover. */}
      {refineMenuOpen && (
        <div
          ref={refinePopRef}
          style={TOOL_ACCENTS.refine}
          className="absolute left-4 bottom-full mb-1 z-30 w-72 rounded-xl border border-white/[0.10] bg-white dark:bg-[#16181d] shadow-xl p-1"
        >
          <button
            type="button"
            onClick={refineDraftNow}
            disabled={!text.trim() || refining}
            className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
          >
            <span className="block text-[12px] font-semibold text-gray-800 dark:text-gray-200">Refine draft</span>
          </button>
          <button
            type="button"
            onClick={() => { onToggleAutoRefine?.(!autoRefine); setRefineMenuOpen(false); }}
            className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors flex items-start gap-2"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] font-semibold text-gray-800 dark:text-gray-200">Auto-refine before sending</span>
            </span>
            <span className={`mt-0.5 w-7 h-4 rounded-full relative transition-colors flex-shrink-0 ${autoRefine ? 'bg-[var(--refine-accent)]' : 'bg-gray-300 dark:bg-white/[0.14]'}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${autoRefine ? 'left-3.5' : 'left-0.5'}`} />
            </span>
          </button>
        </div>
      )}

      {/* Composer card */}
      <div
        data-tour="chat-input"
        style={activeComposerAccent}
        className={`rounded-xl bg-white/75 dark:bg-transparent backdrop-blur-md transition-all overflow-hidden ${
          dictationActive
            ? 'ring-2 tool-accent-mode'
            : humanizeMode
              ? 'ring-2 tool-accent-mode'
              : sourceMode
                ? 'ring-2 tool-accent-mode'
                : autoRefine
                  ? 'ring-2 tool-accent-mode'
                  : canvasOpen
                    ? 'ring-2 tool-accent-mode'
                    : 'ring-1 ring-white/20 dark:ring-transparent focus-within:ring-2 focus-within:ring-blue-400/80 dark:focus-within:ring-blue-400/85'
        }`}
      >
        {/* TOP RAIL - tools + mode toggle + char count */}
        <div className="flex items-center gap-1 px-2 pt-1.5 pb-1 bg-white/20 dark:bg-transparent">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            title="Attach an image, PDF, or text file (you can also drag-and-drop or paste)"
            className="p-1.5 rounded-lg text-gray-400 dark:text-blue-200/55 hover:text-gray-700 dark:hover:text-blue-100 hover:bg-white/40 dark:hover:bg-blue-500/[0.12] disabled:opacity-40 transition-colors"
          >
            <Paperclip size={13} />
          </button>
          {typeof onToggleSource === 'function' && (
            <button
              type="button"
              onClick={() => { if (!sourceDisabled) onToggleSource(!sourceMode); }}
              disabled={disabled || sourceDisabled}
              title={sourceDisabled ? (sourceDisabledReason || 'Web search is unavailable here') : 'Search the web and cite sources (⌘⇧A)'}
              style={TOOL_ACCENTS.webSearch}
              className={`p-1.5 rounded-lg transition-colors tool-accent-button disabled:opacity-40 ${
                sourceMode && !sourceDisabled ? 'is-active' : 'text-gray-400 dark:text-blue-200/55'
              }`}
            >
              <Globe size={13} />
            </button>
          )}
          {typeof onToggleHumanize === 'function' && (
            <button
              type="button"
              onClick={() => onToggleHumanize(!humanizeMode)}
              title="Humanize: draft or rewrite in natural, specific prose (no em dashes, no stiff filler)"
              style={TOOL_ACCENTS.humanize}
              className={`p-1.5 rounded-lg transition-colors tool-accent-button ${
                humanizeMode ? 'is-active' : 'text-gray-400 dark:text-blue-200/55'
              }`}
            >
              <PenLine size={13} />
            </button>
          )}
          {showThinking && (
            <button
              type="button"
              onClick={() => { if (!thinkingLocked) onToggleThinking?.(!thinkingMode); }}
              disabled={disabled || thinkingLocked}
              title={thinkingLocked
                ? 'This model always thinks through problems'
                : thinkingMode
                  ? 'Thinking on — reasons step by step before answering (slower)'
                  : 'Thinking off — faster, direct answers'}
              className={`p-1.5 rounded-lg transition-colors ${
                thinkingMode
                  ? 'text-white bg-blue-500/30 ring-1 ring-blue-400/50'
                  : 'text-gray-400 dark:text-blue-200/55 hover:text-gray-700 dark:hover:text-blue-100 hover:bg-white/40 dark:hover:bg-blue-500/[0.12]'
              } ${thinkingLocked ? 'cursor-default' : ''}`}
            >
              <Brain size={13} />
            </button>
          )}
          {typeof onRefine === 'function' && (
            <button
              ref={refineBtnRef}
              type="button"
              onClick={() => setRefineMenuOpen(o => !o)}
              disabled={disabled}
              title={autoRefine
                ? 'Auto-refine is on: drafts are rewritten into stronger prompts before sending'
                : 'Refine prompts with AI: rewrite your draft into a stronger prompt'}
              style={TOOL_ACCENTS.refine}
              className={`p-1.5 rounded-lg transition-colors tool-accent-button disabled:opacity-40 ${
                autoRefine || refining ? 'is-active' : 'text-gray-400 dark:text-blue-200/55'
              }`}
            >
              <Wand2 size={13} />
            </button>
          )}
          {composerPrefix}
          {canvasOpen && (
            <div
              style={TOOL_ACCENTS.canvas}
              className="inline-flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-md tool-accent-button is-active"
            >
              <Calculator size={11} />
              <span className="text-[10px] font-semibold leading-none">Canvas</span>
            </div>
          )}
          {enableDictation && (
            <DictationButton
              onStart={handleDictationStart}
              onLiveText={handleDictationLive}
              onTranscript={handleDictationFinal}
              onListeningChange={setDictationActive}
              onAutoSend={handleDictationAutoSend}
              onAutoRestart={handleDictationAutoRestart}
              onAutoDelete={handleDictationAutoDelete}
              disabled={disabled}
            />
          )}
          {composerExtras}
          <span className="flex-1" />
          {text.length > 0 && (
            <span className={`text-[10px] tabular-nums px-1 ${text.length > 1800 ? 'text-rose-500' : 'text-gray-400 dark:text-blue-200/40'}`}>
              {text.length}
            </span>
          )}
        </div>

        {/* REFINE STRIP - in-flight indicator, undo chip, or error. */}
        {(refining || refineUndo || refineError) && (
          <div className="flex items-center gap-2 px-3 pt-2" style={TOOL_ACCENTS.refine}>
            {refining ? (
              <>
                <InlineProgress active />
                <span className="text-[11px] text-gray-500 dark:text-gray-400">Refining your prompt…</span>
              </>
            ) : refineError ? (
              <>
                <span className="text-[11px] text-rose-500 dark:text-rose-400 truncate">{refineError}</span>
                <button type="button" onClick={() => setRefineError('')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0" aria-label="Dismiss">
                  <X size={11} />
                </button>
              </>
            ) : (
              <>
                <Wand2 size={11} className="flex-shrink-0" style={{ color: 'var(--refine-accent-text)' }} />
                <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{refineUndo.note || 'Prompt refined'}</span>
                <button
                  type="button"
                  onClick={() => {
                    setText(refineUndo.original);
                    setRefineUndo(null);
                    requestAnimationFrame(() => { inputRef.current?.focus(); growTextarea(); });
                  }}
                  className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:underline flex-shrink-0"
                >
                  Undo
                </button>
                <button type="button" onClick={() => setRefineUndo(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0" aria-label="Dismiss">
                  <X size={11} />
                </button>
              </>
            )}
          </div>
        )}

        {/* IMAGE STRIP */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-2.5">
            {images.map((img, i) => (
              <div key={i} className="relative w-14 h-14 rounded-md overflow-hidden border border-gray-200 dark:border-white/[0.08] bg-gray-100 dark:bg-[#111111]">
                <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-gray-800 dark:bg-black/70 text-white flex items-center justify-center hover:bg-gray-900 dark:hover:bg-black"
                  aria-label="Remove image"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* DOC STRIP - PDFs + text files. Each chip shows a status (extracting / ready / error). */}
        {docs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {docs.map((d, i) => {
              const tone = d.status === 'error'
                ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/15 text-rose-600 dark:text-rose-400'
                : d.status === 'extracting'
                  ? 'border-gray-300 dark:border-white/20 bg-gray-50 dark:bg-white/[0.06] text-gray-600 dark:text-gray-300'
                  : 'border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#111111] text-gray-700 dark:text-gray-200';
              return (
                <div key={i} className={`inline-flex items-center gap-1.5 max-w-[260px] px-2 py-1 rounded-md border ${tone}`}>
                  {d.status === 'extracting'
                    ? <InlineProgress active />
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

        {attachmentSlot}

        {/* TEXTAREA + SEND */}
        <div className="flex items-end">
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={humanizeMode ? 'Paste a prompt or draft and I\'ll make it read naturally…' : sourceMode ? 'Ask anything - I\'ll search and cite…' : autoRefine ? 'Type it rough - your prompt gets refined before sending…' : placeholder}
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none px-3 py-2.5 bg-transparent text-[14px] text-gray-900 dark:text-blue-50 placeholder-gray-400 dark:placeholder-blue-200/35 focus:outline-none max-h-40 overflow-y-auto"
            style={{ minHeight: '44px', border: 'none', boxShadow: 'none' }}
            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'; }}
          />
          {/* Flat, modern send button */}
          <button
            type="submit"
            disabled={!canSend}
            title="Send (Enter)"
            style={sendAccent}
            className={`m-1.5 px-3.5 h-9 rounded-lg inline-flex items-center gap-1.5 text-[12px] font-semibold transition-colors flex-shrink-0 ${
              canSend
                ? (sendAccent
                    ? 'tool-accent-button is-fill'
                    : 'bg-blue-500 hover:bg-blue-400 text-white')
                : (sendAccent
                    ? 'tool-accent-button is-fill opacity-40 cursor-not-allowed'
                    : 'bg-blue-500 text-white cursor-not-allowed opacity-40')
            }`}
          >
            Send <Send size={11} />
          </button>
        </div>
      </div>

    </form>
  );
});

export default ChatInput;
