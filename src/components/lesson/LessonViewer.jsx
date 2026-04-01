import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function LessonViewer({ content }) {
  if (!content) return null;

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-600 dark:prose-p:text-gray-300 prose-strong:text-gray-800 dark:prose-strong:text-gray-200 prose-code:bg-gray-100 dark:prose-code:bg-[#1e1e2e] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-900 dark:prose-pre:bg-[#0D0D14] prose-pre:rounded-xl prose-a:text-blue-600 dark:prose-a:text-blue-400">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
