import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Check, X, Copy, Pencil } from 'lucide-react';
import MathText from '../shared/MathText';

// Normalize LaTeX delimiter variants that remark-math doesn't parse:
//   \( ... \) and \[ ... \]  →  $ ... $ / $$ ... $$
// KaTeX-inside-React via rehype-katex avoids the DOM reconciliation fight
// that kills math on streaming re-renders.
function normalizeMathDelimiters(s) {
  return s
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, body) => `\n$$${body}$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, body) => `$${body}$`);
}

const CURSOR = '\u200B@@CURSOR@@';

function InlineQuiz({ quizJson }) {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  let quiz;
  try { quiz = JSON.parse(quizJson); } catch { return null; }
  if (!quiz?.questions?.length) return null;

  const score = submitted ? quiz.questions.filter(q => answers[q.question] === q.correct).length : 0;

  return (
    <div className="mt-3 mb-1 space-y-3">
      <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider">Quiz: {quiz.topic || 'Practice'}</p>
      {quiz.questions.map((q, i) => {
        const userAnswer = answers[q.question];
        const isCorrect = submitted && userAnswer === q.correct;
        const isWrong = submitted && userAnswer && userAnswer !== q.correct;
        return (
          <div key={i} className={`rounded-lg border p-3 ${submitted ? (isCorrect ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10' : isWrong ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/10' : 'border-gray-200 dark:border-[#2A2A40]') : 'border-gray-200 dark:border-[#2A2A40]'}`}>
            <MathText as="p" className="text-sm font-medium mb-2">{i + 1}. {q.question}</MathText>
            <div className="space-y-1">
              {(q.options || []).map(opt => {
                const letter = opt.charAt(0);
                const selected = userAnswer === letter;
                const correctOpt = submitted && letter === q.correct;
                return (
                  <button
                    key={opt}
                    disabled={submitted}
                    onClick={() => setAnswers(prev => ({ ...prev, [q.question]: letter }))}
                    className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors ${
                      submitted ? (correctOpt ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium' : selected && !correctOpt ? 'bg-rose-100 dark:bg-rose-900/20 text-rose-600' : 'text-gray-500') :
                      selected ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium' : 'hover:bg-gray-50 dark:hover:bg-[#161622] text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <MathText>{opt}</MathText>
                  </button>
                );
              })}
            </div>
            {submitted && q.explanation && <MathText as="p" className="text-[11px] text-gray-500 mt-2 italic">{q.explanation}</MathText>}
          </div>
        );
      })}
      {!submitted ? (
        <button
          onClick={() => setSubmitted(true)}
          disabled={Object.keys(answers).length < quiz.questions.length}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-40"
        >
          Check Answers
        </button>
      ) : (
        <p className="text-sm font-semibold">{score}/{quiz.questions.length} correct</p>
      )}
    </div>
  );
}

export default function ChatMessage({ message, isStreaming, canEdit = false, onEdit, onUserEdit, onAiInstruct }) {
  const isUser = message.role === 'user';
  const raw = message.content || '';
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(raw);
  const [instructText, setInstructText] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    // Copy the RAW markdown, not the rendered HTML, so it pastes cleanly
    // into Notion / Obsidian / ChatGPT / anywhere.
    const md = raw
      .replace(/\[PHASE_COMPLETE\]/g, '')
      .replace(/\[LESSON_(?:DONE|COMPLETE)\]\s*\{[\s\S]*?\}/g, '')
      .replace(/\[LESSON_(?:DONE|COMPLETE)\]/g, '')
      .replace(/\[QUIZ_START\][\s\S]*?\[QUIZ_END\]/g, '')
      .replace(/\[MILESTONE_COMPLETE:[^\]]+\]/g, '')
      .replace(/\[STATUS:\s*(advance|stay|next)\s*\]/gi, '')
      .trim();
    try { await navigator.clipboard.writeText(md); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* ignore */ }
  }

  function saveUserEdit() {
    // User edits RESTART the conversation from this point — the parent
    // truncates history and re-sends the edited text to the AI.
    const fn = onUserEdit || onEdit;
    if (typeof fn === 'function') fn(editText);
    setEditing(false);
  }

  function submitInstruct() {
    // Intent: REPLACE this AI message with a fresh one that honors the
    // instruction. The parent is responsible for dropping this message +
    // everything after and asking the AI to regenerate the reply in place.
    if (!instructText.trim() || typeof onAiInstruct !== 'function') return;
    onAiInstruct(instructText.trim());
    setInstructText('');
    setEditing(false);
  }

  // Extract quiz blocks — only render the inline quiz UI when the full block has arrived
  const quizMatch = raw.match(/\[QUIZ_START\]\s*([\s\S]*?)\s*\[QUIZ_END\]/);
  const quizJson = quizMatch ? quizMatch[1].trim() : null;
  const quizStreaming = !quizJson && raw.includes('[QUIZ_START]');

  let displayContent = raw;

  // While streaming: drop any partial quiz block so the raw JSON doesn't flash in the bubble.
  // Also drop an unclosed [LESSON_DONE]{... block so the JSON tail doesn't show up either.
  if (quizStreaming) displayContent = displayContent.replace(/\[QUIZ_START\][\s\S]*$/, '');
  displayContent = displayContent.replace(/\[LESSON_DONE\]\s*\{[^}]*$/g, '');

  // Balanced-brace stripper: removes `[LESSON_DONE|LESSON_COMPLETE]` + its
  // trailing JSON even when the JSON has nested braces or is wrapped in a
  // code fence. Also strips the fence itself if present.
  function stripDoneMarker(s) {
    const rx = /```(?:json|javascript|js)?\s*/gi;
    s = s.replace(rx, '').replace(/```/g, '');
    const mark = s.search(/\[LESSON_(?:DONE|COMPLETE)\]/);
    if (mark < 0) return s;
    const markerEnd = mark + (s.slice(mark).match(/\[LESSON_(?:DONE|COMPLETE)\]/)[0].length);
    const rest = s.slice(markerEnd);
    const braceStart = rest.indexOf('{');
    if (braceStart < 0) return s.slice(0, mark);
    // Walk braces
    let depth = 0, inStr = false, esc = false, i = braceStart;
    for (; i < rest.length; i++) {
      const ch = rest[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return s.slice(0, mark) + rest.slice(i);
  }

  displayContent = displayContent
    .replace(/\[PHASE_COMPLETE\]/g, '')
    .replace(/\[QUIZ_START\][\s\S]*?\[QUIZ_END\]/g, '')
    .replace(/\[MILESTONE_COMPLETE:[^\]]+\]/g, '')
    .replace(/\[STATUS:\s*(advance|stay|next)\s*\]/gi, '');
  displayContent = stripDoneMarker(displayContent).trim();

  displayContent = normalizeMathDelimiters(displayContent);

  if (!displayContent && !quizJson && !isStreaming) return null;

  const contentWithCursor = isStreaming ? displayContent + CURSOR : displayContent;

  const markdownRef = useRef(null);

  const isError = !!message._error;
  // Plan-limit notices use an amber/gold palette so they don't look like
  // something went wrong — this is expected user-facing behavior.
  const isPlanLimit = !!message._planLimit;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm ${
        isUser
          ? 'bg-blue-600 text-white rounded-br-md'
          : isPlanLimit
            ? 'bg-amber-50 dark:bg-amber-900/15 border border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-200 rounded-bl-md'
            : isError
              ? 'bg-rose-50 dark:bg-rose-900/15 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 rounded-bl-md'
              : 'bg-white dark:bg-[#1e1e2e] border border-gray-200 dark:border-[#2A2A40] text-gray-800 dark:text-gray-200 rounded-bl-md'
      }`}>
        {isUser ? (
          editing ? (
            <div>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={Math.min(12, Math.max(3, editText.split('\n').length))}
                className="w-full min-w-[280px] p-2 rounded-lg bg-blue-500/30 text-white placeholder-blue-200 text-sm outline-none border border-white/20 focus:border-white/60"
                autoFocus
              />
              <p className="text-[10px] text-white/70 mt-1">Saving will restart the conversation from this point.</p>
              <div className="flex gap-1.5 mt-2 justify-end">
                <button onClick={() => { setEditing(false); setEditText(raw); }} className="px-3 py-1 rounded-lg text-[11px] text-white/80 hover:bg-white/10">Cancel</button>
                <button onClick={saveUserEdit} className="px-3 py-1 rounded-lg text-[11px] bg-white text-blue-700 font-medium hover:bg-blue-50">Save &amp; Restart</button>
              </div>
            </div>
          ) : (
            <div className="group relative">
              {Array.isArray(message.images) && message.images.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {message.images.map((img, i) => (
                    <img
                      key={i}
                      src={img.dataUrl || img.url}
                      alt={img.name || `attachment-${i}`}
                      className="max-w-[160px] max-h-[160px] rounded-lg object-cover border border-white/10"
                    />
                  ))}
                </div>
              )}
              {displayContent && <p className="whitespace-pre-wrap">{displayContent}</p>}
              {!isStreaming && canEdit && (
                <div className="mt-2 pt-1.5 flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity justify-end">
                  <button
                    onClick={handleCopy}
                    title="Copy as text"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-white/80 hover:text-white hover:bg-white/10"
                  >
                    {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                  </button>
                  <button
                    onClick={() => { setEditing(true); setEditText(raw); }}
                    title="Edit this message"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-white/80 hover:text-white hover:bg-white/10"
                  >
                    <Pencil size={10} /> Edit
                  </button>
                  {message._edited && <span className="text-[9px] text-white/60 italic ml-auto">edited</span>}
                </div>
              )}
            </div>
          )
        ) : (
          <>
            {displayContent && (
              <div ref={markdownRef} className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-code:bg-gray-100 dark:prose-code:bg-[#161622] prose-code:px-1 prose-code:rounded prose-pre:bg-gray-900 dark:prose-pre:bg-[#0D0D14] prose-pre:rounded-lg">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    p: ({ children, ...props }) => <p {...props}>{styleCitations(injectCursor(children), message.sources)}</p>,
                    li: ({ children, ...props }) => <li {...props}>{styleCitations(injectCursor(children), message.sources)}</li>,
                    h1: ({ children, ...props }) => <h1 {...props}>{injectCursor(children)}</h1>,
                    h2: ({ children, ...props }) => <h2 {...props}>{injectCursor(children)}</h2>,
                    h3: ({ children, ...props }) => <h3 {...props}>{injectCursor(children)}</h3>,
                    strong: ({ children, ...props }) => <strong {...props}>{styleCitations(children, message.sources)}</strong>,
                    em: ({ children, ...props }) => <em {...props}>{styleCitations(children, message.sources)}</em>,
                  }}
                >
                  {contentWithCursor}
                </ReactMarkdown>
              </div>
            )}
            {quizStreaming && !quizJson && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-xs text-blue-700 dark:text-blue-400 font-medium">Generating quiz…</span>
              </div>
            )}
            {quizJson && <InlineQuiz quizJson={quizJson} />}
            {Array.isArray(message.sources) && message.sources.length > 0 && (
              <Sources sources={message.sources} />
            )}
            {!isStreaming && !isError && displayContent && editing && typeof onAiInstruct === 'function' && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-[#2A2A40]">
                <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1.5">
                  What should the AI change?
                </label>
                <div className="flex gap-1.5 items-start">
                  <input
                    autoFocus
                    value={instructText}
                    onChange={e => setInstructText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && instructText.trim()) submitInstruct(); }}
                    placeholder="e.g. shorter, more examples, include the formula…"
                    className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <button
                    onClick={() => { setEditing(false); setInstructText(''); }}
                    className="px-2 py-1 rounded text-[10px] text-gray-500 hover:bg-gray-100 dark:hover:bg-[#2A2A40]"
                  >Cancel</button>
                  <button
                    onClick={submitInstruct}
                    disabled={!instructText.trim()}
                    className="px-3 py-1 rounded-lg text-[10px] bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40"
                  >Redo</button>
                </div>
              </div>
            )}
            {!isStreaming && !isError && displayContent && !editing && (
              <div className="mt-2 pt-2 flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity">
                <button
                  onClick={handleCopy}
                  title="Copy as Markdown"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2A2A40]"
                >
                  {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                </button>
                {canEdit && typeof onAiInstruct === 'function' && (
                  <button
                    onClick={() => { setEditing(true); setInstructText(''); }}
                    title="Tell the AI what to change about this response"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2A2A40]"
                  >
                    <Pencil size={10} /> Edit
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Sources({ sources }) {
  return (
    <div className="mt-3 pt-2 border-t border-gray-200 dark:border-[#2A2A40]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5">Sources</p>
      <ol className="space-y-1">
        {sources.map((s, i) => {
          let host = '';
          try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch { host = s.url; }
          return (
            <li key={i} className="flex items-start gap-1.5 text-[11px]">
              <span className="text-gray-400 tabular-nums">[{i + 1}]</span>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                title={s.url}
              >
                {s.title || host}
              </a>
              {s.title && <span className="text-gray-400 truncate">· {host}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function injectCursor(children) {
  if (!children) return children;
  if (!Array.isArray(children)) children = [children];
  return children.map((child, i) => {
    if (typeof child === 'string' && child.includes('@@CURSOR@@')) {
      const parts = child.split('@@CURSOR@@');
      return (
        <span key={i}>
          {parts[0].replace('\u200B', '')}
          <span className="inline-block w-1.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-middle rounded-sm" />
          {parts[1]}
        </span>
      );
    }
    return child;
  });
}

// Turn inline "[n]" citation markers into Wikipedia-style superscripts.
// If we have the matching source, make it a clickable link to the URL
// and trim the preceding space so "word [3]" renders as "word³".
function styleCitations(children, sources) {
  if (!children) return children;
  if (!Array.isArray(children)) children = [children];
  const rx = /\s*\[(\d+)\]/g;
  return children.flatMap((child, idx) => {
    if (typeof child !== 'string') return [child];
    const parts = [];
    let last = 0;
    let m;
    let n = 0;
    while ((m = rx.exec(child)) !== null) {
      if (m.index > last) parts.push(child.slice(last, m.index));
      const num = Number(m[1]);
      const src = Array.isArray(sources) ? sources[num - 1] : null;
      const sup = (
        <sup
          key={`${idx}-${n++}`}
          className="ml-0.5 text-[0.7em] font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 align-super"
        >
          {src?.url ? (
            <a
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              title={src.title || src.url}
              className="no-underline hover:underline"
            >[{num}]</a>
          ) : (
            <span>[{num}]</span>
          )}
        </sup>
      );
      parts.push(sup);
      last = m.index + m[0].length;
    }
    if (last < child.length) parts.push(child.slice(last));
    return parts.length ? parts : [child];
  });
}
