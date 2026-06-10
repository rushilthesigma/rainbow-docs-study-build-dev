import { useEffect, useRef, useState } from 'react';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from 'tiptap-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Bold, Italic, Underline, Strikethrough, Heading2, List, ListOrdered, Code2, Eye, Pencil } from 'lucide-react';

// The Preview tab renders the stored markdown the same way notes display
// elsewhere. rehype-raw parses inline HTML (e.g. the <u> underline that GFM
// lacks) and rehype-sanitize strips anything dangerous; rehype-katex runs last
// so its output is trusted. The schema only needs to let remark-math's `math`
// spans survive sanitization so KaTeX can transform them.
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'u', 'mark', 'sub', 'sup', 'span', 'div'],
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span || []), ['className', 'math', 'math-inline', 'math-display']],
    div: [...(defaultSchema.attributes?.div || []), ['className', 'math', 'math-display']],
    code: [...(defaultSchema.attributes?.code || []), ['className', /^language-./, 'math', 'math-inline', 'math-display']],
  },
};
const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeRaw, [rehypeSanitize, SANITIZE_SCHEMA], [rehypeKatex, { throwOnError: false, errorColor: '#94a3b8' }]];
const MD_COMPONENTS = { a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> };

const PROSE_TWEAKS =
  'prose-p:my-2 prose-headings:mt-4 prose-headings:mb-2 prose-h1:text-xl prose-h2:text-lg prose-h3:text-base ' +
  'prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-blockquote:my-2 prose-blockquote:border-white/20 ' +
  'prose-code:bg-white/[0.08] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12.5px] prose-code:before:content-none prose-code:after:content-none ' +
  'prose-pre:bg-black/50 prose-pre:rounded-lg prose-table:text-[13px] prose-th:border-white/15 prose-td:border-white/10';
const PROSE_CLASS = `prose prose-sm prose-invert max-w-none ${PROSE_TWEAKS}`;
const EDITOR_CLASS = `tiptap ${PROSE_CLASS} focus:outline-none p-4 min-h-full`;

// A markdown-backed WYSIWYG note editor. The Write tab is a true rich-text
// editor (TipTap/ProseMirror): bold/italic/underline/strikethrough render
// inline, the toolbar applies real formatting, and markdown shortcuts work as
// you type (**bold**, *italic*, ~~strike~~, "# ", "- ", "1. ", `code`).
// Content is stored as markdown so notes stay compatible with the rest of the
// app (AI generation, note maps, etc.). The Preview tab renders the markdown
// with full KaTeX math + tables. The host owns the surrounding card and sets
// height via `className` (e.g. "h-full").
export default function MarkdownNoteEditor({
  value = '',
  onChange,
  placeholder = 'Start writing… markdown supported',
  className = '',
  autoFocus = false,
}) {
  const [mode, setMode] = useState('write');
  // Tracks the markdown we last emitted so external updates (AI generation,
  // switching notes) can be told apart from our own edits — preventing a
  // setContent → onUpdate → setState feedback loop.
  const lastMd = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({ html: true, transformPastedText: true, transformCopiedText: true }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: value,
    autofocus: autoFocus ? 'end' : false,
    editorProps: { attributes: { class: EDITOR_CLASS, spellcheck: 'true' } },
  });

  // Edits are forwarded from an effect-time subscription, NOT a useEditor
  // `onUpdate` option. useEditor constructs the editor during render, and
  // construction itself can emit `update`: Placeholder's viewport plugin
  // dispatches from its plugin-view constructor, and StarterKit's
  // TrailingNode then appends a paragraph to any note that doesn't already
  // end with one (most AI notes end with a list/quote/table). An `onUpdate`
  // option is bound inside the constructor, so it forwarded that render-
  // phase emission into the host's setState — React's "Cannot update a
  // component (NoteEditor) while rendering a different component
  // (MarkdownNoteEditor)" — and autosaved every such note the moment it was
  // opened. Subscribing after render means construction-time transactions
  // never reach the host.
  useEffect(() => {
    if (!editor) return;
    const handleUpdate = ({ editor }) => {
      const md = editor.storage.markdown.getMarkdown();
      lastMd.current = md;
      onChangeRef.current?.(md);
    };
    editor.on('update', handleUpdate);
    return () => { editor.off('update', handleUpdate); };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    if (value === lastMd.current) return;
    lastMd.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);

  const active = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? {
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      h2: editor.isActive('heading', { level: 2 }),
      bullet: editor.isActive('bulletList'),
      ordered: editor.isActive('orderedList'),
      code: editor.isActive('code'),
    } : {}),
  }) || {};

  const writing = mode === 'write';
  const run = (fn) => () => { if (editor) fn(editor.chain().focus()).run(); };
  const tBtn = (on) =>
    `p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent ${
      on ? 'bg-white/[0.14] text-white' : 'text-white/45 hover:text-white/90 hover:bg-white/[0.08]'
    }`;

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/[0.07] flex-shrink-0">
        <button type="button" disabled={!writing} onClick={run(c => c.toggleBold())} className={tBtn(active.bold)} title="Bold (⌘B)"><Bold size={15} /></button>
        <button type="button" disabled={!writing} onClick={run(c => c.toggleItalic())} className={tBtn(active.italic)} title="Italic (⌘I)"><Italic size={15} /></button>
        <button type="button" disabled={!writing} onClick={run(c => c.toggleUnderline())} className={tBtn(active.underline)} title="Underline (⌘U)"><Underline size={15} /></button>
        <button type="button" disabled={!writing} onClick={run(c => c.toggleStrike())} className={tBtn(active.strike)} title="Strikethrough"><Strikethrough size={15} /></button>
        <span className="w-px h-4 bg-white/10 mx-1" />
        <button type="button" disabled={!writing} onClick={run(c => c.toggleHeading({ level: 2 }))} className={tBtn(active.h2)} title="Heading"><Heading2 size={15} /></button>
        <button type="button" disabled={!writing} onClick={run(c => c.toggleBulletList())} className={tBtn(active.bullet)} title="Bullet list"><List size={15} /></button>
        <button type="button" disabled={!writing} onClick={run(c => c.toggleOrderedList())} className={tBtn(active.ordered)} title="Numbered list"><ListOrdered size={15} /></button>
        <button type="button" disabled={!writing} onClick={run(c => c.toggleCode())} className={tBtn(active.code)} title="Inline code"><Code2 size={15} /></button>

        <div className="ml-auto flex items-center gap-0.5 rounded-lg bg-white/[0.05] p-0.5">
          <button
            type="button"
            onClick={() => setMode('write')}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${writing ? 'bg-white/[0.12] text-white/90' : 'text-white/45 hover:text-white/70'}`}
          >
            <Pencil size={12} /> Write
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${!writing ? 'bg-white/[0.12] text-white/90' : 'text-white/45 hover:text-white/70'}`}
          >
            <Eye size={12} /> Preview
          </button>
        </div>
      </div>

      {/* Content */}
      {writing ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <EditorContent editor={editor} className="h-full" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {value.trim() ? (
            <div className={PROSE_CLASS}>
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MD_COMPONENTS}>
                {value}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-white/25 text-sm italic">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
