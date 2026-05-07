import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function LessonViewer({ content }) {
  if (!content) return null;

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-white/90 prose-p:text-white/75 prose-strong:text-white/90 prose-em:text-white/70 prose-code:bg-white/[0.08] prose-code:text-white/80 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-white/[0.06] prose-pre:rounded-xl prose-a:text-white/70 prose-blockquote:text-white/60 prose-li:text-white/75">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
