import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const CURSOR = '\u200B@@CURSOR@@';

export default function ChatMessage({ message, isStreaming }) {
  const isUser = message.role === 'user';

  const displayContent = (message.content || '')
    .replace(/\[PHASE_COMPLETE\]/g, '')
    .replace(/\[LESSON_COMPLETE\]\s*\{[^}]*\}/g, '')
    .replace(/\[QUIZ_START\][\s\S]*?\[QUIZ_END\]/g, '')
    .replace(/\[MILESTONE_COMPLETE:[^\]]+\]/g, '')
    .trim();

  if (!displayContent && !isStreaming) return null;

  // Append cursor marker to the content so it renders inline with last word
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
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-code:bg-gray-100 dark:prose-code:bg-[#161622] prose-code:px-1 prose-code:rounded prose-pre:bg-gray-900 dark:prose-pre:bg-[#0D0D14] prose-pre:rounded-lg">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Intercept text nodes to inject cursor inline
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
