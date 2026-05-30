import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Notion-style line editor: each line of the body renders as markdown
// (so **bold**, # headings, - lists show formatted in place). Click any
// line to drop it back to its raw markdown source for editing. Click
// elsewhere — or hit Enter / Escape — to commit and re-render.
//
// Lines are kept independent on purpose: cross-line constructs like
// fenced code blocks won't merge visually until the user looks at the
// raw source, but that tradeoff buys us O(1) click-to-edit per line
// without needing a CodeMirror-grade engine.
export default function MarkdownLineEditor({
  value,
  onChange,
  placeholder = 'Click to write…',
  disabled = false,
  className = '',
  textClassName = '',
}) {
  const text = value ?? '';
  const lines = text.length === 0 ? [''] : text.split('\n');
  const [editIdx, setEditIdx] = useState(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  // Focus + cursor-at-end whenever we enter edit mode.
  useEffect(() => {
    if (editIdx !== null && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      const len = el.value.length;
      try { el.setSelectionRange(len, len); } catch {}
      autoResize(el);
    }
  }, [editIdx]);

  function autoResize(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  function commitTo(nextLines) {
    onChange(nextLines.join('\n'));
  }

  function startEdit(i) {
    if (disabled) return;
    // If another line was being edited, commit it first.
    if (editIdx !== null && editIdx !== i) {
      const updated = [...lines];
      updated[editIdx] = draft;
      commitTo(updated);
      setDraft(updated[i] ?? '');
    } else {
      setDraft(lines[i] ?? '');
    }
    setEditIdx(i);
  }

  function commitCurrent(nextEdit = null) {
    if (editIdx === null) return;
    const updated = [...lines];
    updated[editIdx] = draft;
    commitTo(updated);
    setEditIdx(nextEdit);
    if (nextEdit !== null) setDraft(updated[nextEdit] ?? '');
  }

  function handleKeyDown(e) {
    const ta = inputRef.current;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Split the current line at the caret; everything after becomes
      // a fresh line below, and the cursor lands on it.
      const caret = ta?.selectionStart ?? draft.length;
      const before = draft.slice(0, caret);
      const after = draft.slice(caret);
      const updated = [...lines];
      updated[editIdx] = before;
      updated.splice(editIdx + 1, 0, after);
      commitTo(updated);
      setDraft(after);
      setEditIdx(editIdx + 1);
      return;
    }
    if (e.key === 'Backspace' && draft === '' && lines.length > 1) {
      e.preventDefault();
      const updated = [...lines];
      updated.splice(editIdx, 1);
      commitTo(updated);
      const newIdx = Math.max(0, editIdx - 1);
      setDraft(updated[newIdx] ?? '');
      setEditIdx(newIdx);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      commitCurrent(null);
      return;
    }
    if (e.key === 'ArrowUp' && editIdx > 0 && isCaretAtTop(ta)) {
      e.preventDefault();
      commitCurrent(editIdx - 1);
      return;
    }
    if (e.key === 'ArrowDown' && editIdx < lines.length - 1 && isCaretAtBottom(ta)) {
      e.preventDefault();
      commitCurrent(editIdx + 1);
      return;
    }
  }

  // Caret position helpers for ArrowUp/Down line navigation.
  function isCaretAtTop(el) {
    if (!el) return true;
    const pre = el.value.slice(0, el.selectionStart ?? 0);
    return !pre.includes('\n');
  }
  function isCaretAtBottom(el) {
    if (!el) return true;
    const post = el.value.slice(el.selectionEnd ?? el.value.length);
    return !post.includes('\n');
  }

  // Container click — when the user clicks empty space below the last
  // line, they probably want to start editing the last line (or append).
  function handleContainerClick(e) {
    if (disabled || editIdx !== null) return;
    if (e.target === e.currentTarget) startEdit(lines.length - 1);
  }

  // Whole body is empty AND not editing — show a single placeholder.
  if (lines.length === 1 && lines[0] === '' && editIdx === null) {
    return (
      <div
        className={`${className} cursor-text`}
        onClick={() => startEdit(0)}
      >
        <p className={`text-white/25 italic ${textClassName}`}>{placeholder}</p>
      </div>
    );
  }

  return (
    <div className={className} onClick={handleContainerClick}>
      {lines.map((line, i) => {
        if (i === editIdx) {
          return (
            <textarea
              key={`edit-${i}`}
              ref={inputRef}
              value={draft}
              onChange={e => { setDraft(e.target.value); autoResize(e.target); }}
              onBlur={() => commitCurrent(null)}
              onKeyDown={handleKeyDown}
              rows={1}
              spellCheck={false}
              className={`w-full bg-white/[0.05] border border-blue-400/40 rounded px-1.5 py-0.5 text-white/95 outline-none resize-none font-mono leading-relaxed ${textClassName}`}
              style={{ minHeight: '1.6em' }}
              disabled={disabled}
            />
          );
        }
        const isBlank = line.trim() === '';
        return (
          <div
            key={`view-${i}`}
            onClick={() => startEdit(i)}
            className={`md-line cursor-text rounded px-1.5 py-0.5 hover:bg-white/[0.04] min-h-[1.6em] ${textClassName}`}
          >
            {isBlank ? (
              <span className="text-white/15 select-none">&nbsp;</span>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={INLINE_RENDERERS}
              >
                {line}
              </ReactMarkdown>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Override block-level wrappers so each line renders tightly without
// the default heavy <p>/<ul> margins that would break the per-line
// visual rhythm.
const INLINE_RENDERERS = {
  p: ({ children }) => <span className="block">{children}</span>,
  h1: ({ children }) => <span className="block text-[18px] font-bold text-white/95">{children}</span>,
  h2: ({ children }) => <span className="block text-[16px] font-bold text-white/95">{children}</span>,
  h3: ({ children }) => <span className="block text-[14px] font-semibold text-white/90">{children}</span>,
  h4: ({ children }) => <span className="block text-[13px] font-semibold text-white/85">{children}</span>,
  ul: ({ children }) => <span className="block">{children}</span>,
  ol: ({ children }) => <span className="block">{children}</span>,
  li: ({ children }) => <span className="block before:content-['•_'] before:text-white/45">{children}</span>,
  code: ({ children }) => <code className="px-1 py-px rounded bg-white/[0.08] text-emerald-200 text-[0.9em] font-mono">{children}</code>,
  strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-white/90">{children}</em>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline hover:text-blue-200">{children}</a>,
  blockquote: ({ children }) => <span className="block border-l-2 border-white/20 pl-2 text-white/75 italic">{children}</span>,
};
