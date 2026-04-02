import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, X } from 'lucide-react';

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
            <p className="text-sm font-medium mb-2">{i + 1}. {q.question}</p>
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
                    {opt}
                  </button>
                );
              })}
            </div>
            {submitted && q.explanation && <p className="text-[11px] text-gray-500 mt-2 italic">{q.explanation}</p>}
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

  // Extract quiz blocks
  const quizMatch = raw.match(/\[QUIZ_START\]\s*([\s\S]*?)\s*\[QUIZ_END\]/);
  const quizJson = quizMatch ? quizMatch[1].trim() : null;

  const displayContent = raw
    .replace(/\[PHASE_COMPLETE\]/g, '')
    .replace(/\[LESSON_COMPLETE\]\s*\{[^}]*\}/g, '')
    .replace(/\[QUIZ_START\][\s\S]*?\[QUIZ_END\]/g, '')
    .replace(/\[MILESTONE_COMPLETE:[^\]]+\]/g, '')
    .trim();

  if (!displayContent && !quizJson && !isStreaming) return null;

  const contentWithCursor = isStreaming ? displayContent + CURSOR : displayContent;

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
              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-code:bg-gray-100 dark:prose-code:bg-[#161622] prose-code:px-1 prose-code:rounded prose-pre:bg-gray-900 dark:prose-pre:bg-[#0D0D14] prose-pre:rounded-lg">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children, ...props }) => <p {...props}>{injectCursor(children)}</p>,
                    li: ({ children, ...props }) => <li {...props}>{injectCursor(children)}</li>,
                    h1: ({ children, ...props }) => <h1 {...props}>{injectCursor(children)}</h1>,
                    h2: ({ children, ...props }) => <h2 {...props}>{injectCursor(children)}</h2>,
                    h3: ({ children, ...props }) => <h3 {...props}>{injectCursor(children)}</h3>,
                  }}
                >
                  {contentWithCursor}
                </ReactMarkdown>
              </div>
            )}
            {quizJson && <InlineQuiz quizJson={quizJson} />}
          </>
        )}
      </div>
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
