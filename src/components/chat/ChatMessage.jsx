import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Check, X } from 'lucide-react';
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

export default function ChatMessage({ message, isStreaming }) {
  const isUser = message.role === 'user';
  const raw = message.content || '';

  // Extract quiz blocks — only render the inline quiz UI when the full block has arrived
  const quizMatch = raw.match(/\[QUIZ_START\]\s*([\s\S]*?)\s*\[QUIZ_END\]/);
  const quizJson = quizMatch ? quizMatch[1].trim() : null;
  const quizStreaming = !quizJson && raw.includes('[QUIZ_START]');

  let displayContent = raw;

  // While streaming: drop any partial quiz block so the raw JSON doesn't flash in the bubble.
  // Also drop an unclosed [LESSON_DONE]{... block so the JSON tail doesn't show up either.
  if (quizStreaming) displayContent = displayContent.replace(/\[QUIZ_START\][\s\S]*$/, '');
  displayContent = displayContent.replace(/\[LESSON_DONE\]\s*\{[^}]*$/g, '');

  displayContent = displayContent
    .replace(/\[PHASE_COMPLETE\]/g, '')
    .replace(/\[LESSON_COMPLETE\]\s*\{[^}]*\}/g, '')
    .replace(/\[LESSON_DONE\]\s*\{[^}]*\}/g, '')
    .replace(/\[LESSON_DONE\]/g, '')
    .replace(/\[QUIZ_START\][\s\S]*?\[QUIZ_END\]/g, '')
    .replace(/\[MILESTONE_COMPLETE:[^\]]+\]/g, '')
    .replace(/\[STATUS:\s*(advance|stay|next)\s*\]/gi, '')
    .trim();

  displayContent = normalizeMathDelimiters(displayContent);

  if (!displayContent && !quizJson && !isStreaming) return null;

  const contentWithCursor = isStreaming ? displayContent + CURSOR : displayContent;

  const markdownRef = useRef(null);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm ${
        isUser
          ? 'bg-blue-600 text-white rounded-br-md'
          : 'bg-white dark:bg-[#1e1e2e] border border-gray-200 dark:border-[#2A2A40] text-gray-800 dark:text-gray-200 rounded-bl-md'
      }`}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{displayContent}</p>
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
