import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, Upload, ArrowLeft, Trash2, Loader2, Send, Sparkles, MessageCircle, GraduationCap } from 'lucide-react';
import { listTextbooks, uploadTextbook, getTextbook, generateTextbookCurriculum, chatWithTextbook, deleteTextbook } from '../../../api/textbooks';
import Button from '../../shared/Button';
import { errorChatMessage } from '../../../utils/aiErrors';
import LoadingSpinner from '../../shared/LoadingSpinner';

// ===== CHAT VIEW =====
function TextbookChat({ textbookId, title, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    // Load existing chat history
    getTextbook(textbookId).then(d => {
      setMessages(d.textbook?.chatHistory || []);
    }).catch(() => {});
  }, [textbookId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date().toISOString() }]);
    setSending(true);
    try {
      const data = await chatWithTextbook(textbookId, text);
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, timestamp: new Date().toISOString() }]);
    } catch (err) {
      setMessages(prev => [...prev, errorChatMessage(err)]);
    }
    setSending(false);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] flex-shrink-0">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><ArrowLeft size={16} /></button>
        <MessageCircle size={14} className="text-blue-500" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{title}</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <MessageCircle size={28} className="text-blue-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Ask any question about your textbook</p>
            <div className="flex flex-wrap gap-1.5 justify-center mt-3">
              {['Summarize the key concepts', 'Explain the main topics', 'What are the important formulas?', 'Give me practice questions'].map(q => (
                <button key={q} onClick={() => { setInput(q); }} className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-[#1e1e2e] text-[11px] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#2A2A40] transition-colors">{q}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-900 dark:text-gray-100 rounded-bl-md'}`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-2xl rounded-bl-md bg-gray-100 dark:bg-[#1e1e2e]">
              <Loader2 size={14} className="animate-spin text-blue-500" />
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 px-3 py-2 border-t border-gray-200 dark:border-[#2A2A40] flex-shrink-0">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about your textbook..." className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] text-sm text-gray-900 dark:text-white outline-none" />
        <button type="submit" disabled={!input.trim() || sending} className="p-2 rounded-xl bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700"><Send size={14} /></button>
      </form>
    </div>
  );
}

// ===== TEXTBOOK DETAIL =====
function TextbookDetail({ textbookId, onBack, onChat }) {
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);

  useEffect(() => {
    getTextbook(textbookId).then(d => { setBook(d.textbook); setLoading(false); }).catch(() => setLoading(false));
  }, [textbookId]);

  async function handleGenerate() {
    setGenerating(true);
    setGenError(null);
    try {
      const data = await generateTextbookCurriculum(textbookId);
      setBook(prev => ({ ...prev, curriculum: data.curriculum }));
    } catch (err) {
      setGenError(err.message || 'Failed to generate');
    }
    setGenerating(false);
  }

  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;
  if (!book) return <div className="text-center py-12 text-sm text-gray-500">Textbook not found</div>;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-4">
        <ArrowLeft size={16} /> Library
      </button>

      <div className="flex items-start gap-4 mb-5">
        <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
          <BookOpen size={24} className="text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{book.title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{book.pageCount} pages · Uploaded {new Date(book.uploadedAt).toLocaleDateString()}</p>
          {book.textPreview && <p className="text-xs text-gray-400 mt-2 line-clamp-3">{book.textPreview}...</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mb-5">
        <button onClick={() => onChat(book)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
          <MessageCircle size={15} /> Ask Questions
        </button>
        {!book.hasCurriculum && !book.curriculum && (
          <button onClick={handleGenerate} disabled={generating} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#2A2A40] text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1e1e2e] transition-colors disabled:opacity-50">
            {generating ? <Loader2 size={15} className="animate-spin" /> : <GraduationCap size={15} />}
            {generating ? 'Generating...' : 'Generate Curriculum'}
          </button>
        )}
      </div>

      {genError && <p className="text-xs text-rose-500 mb-3 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/15">{genError}</p>}

      {generating && (
        <div className="flex flex-col items-center py-10">
          <Loader2 size={28} className="animate-spin text-blue-500 mb-3" />
          <p className="text-sm text-gray-500">Analyzing textbook and generating curriculum...</p>
          <p className="text-xs text-gray-400 mt-1">This may take a minute</p>
        </div>
      )}

      {book.curriculum && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            <GraduationCap size={14} className="inline mr-1.5 text-blue-500" />
            Generated Curriculum
          </h3>
          <p className="text-xs text-gray-500 mb-3">{book.curriculum.title} — {book.curriculum.units?.length || 0} units</p>
          <div className="space-y-2">
            {(book.curriculum.units || []).map((unit, i) => (
              <div key={unit.id || i} className="bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{unit.title}</p>
                {unit.description && <p className="text-xs text-gray-500 mt-0.5">{unit.description}</p>}
                <p className="text-[10px] text-gray-400 mt-1">{unit.lessons?.length || 0} lessons</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3 italic">Curriculum has been added to your Curricula app.</p>
        </div>
      )}
    </div>
  );
}

// ===== MAIN TEXTBOOK APP =====
export default function TextbookApp() {
  const [view, setView] = useState('list'); // list, detail, chat
  const [textbooks, setTextbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [chatBook, setChatBook] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    listTextbooks().then(d => { setTextbooks(d.textbooks || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only PDF files are supported');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const data = await uploadTextbook(file);
      setTextbooks(prev => [{ ...data.textbook, uploadedAt: new Date().toISOString() }, ...prev]);
      setSelectedId(data.textbook.id);
      setView('detail');
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this textbook?')) return;
    await deleteTextbook(id);
    setTextbooks(prev => prev.filter(t => t.id !== id));
  }

  // Chat view
  if (view === 'chat' && chatBook) {
    return <TextbookChat textbookId={chatBook.id} title={chatBook.title} onBack={() => { setView('detail'); }} />;
  }

  // Detail view
  if (view === 'detail' && selectedId) {
    return (
      <div className="h-full overflow-y-auto">
        <TextbookDetail
          textbookId={selectedId}
          onBack={() => { setView('list'); listTextbooks().then(d => setTextbooks(d.textbooks || [])).catch(() => {}); }}
          onChat={(book) => { setChatBook(book); setView('chat'); }}
        />
      </div>
    );
  }

  // List view
  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Textbook Library</h2>
        <div>
          <input ref={fileRef} type="file" accept=".pdf" onChange={handleUpload} className="hidden" />
          <Button size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
            <Upload size={14} /> Upload PDF
          </Button>
        </div>
      </div>

      {uploadError && <p className="text-xs text-rose-500 mb-3 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/15">{uploadError}</p>}

      {uploading && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
          <Loader2 size={16} className="animate-spin text-blue-500" />
          <p className="text-sm text-blue-600 dark:text-blue-400">Uploading and parsing PDF...</p>
        </div>
      )}

      {textbooks.length === 0 && !uploading ? (
        <div className="text-center py-12">
          <BookOpen size={32} className="text-blue-400 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No textbooks yet</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-xs mx-auto">Upload a PDF textbook to generate a curriculum and ask questions about it.</p>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Upload Your First Textbook
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {textbooks.map(book => (
            <div key={book.id} onClick={() => { setSelectedId(book.id); setView('detail'); }} className="flex items-center gap-3 bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] px-4 py-3 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors group">
              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                <BookOpen size={16} className="text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{book.title}</h3>
                <p className="text-xs text-gray-400">{book.pageCount} pages · {new Date(book.uploadedAt).toLocaleDateString()}{book.hasCurriculum ? ' · Curriculum ready' : ''}</p>
              </div>
              <button onClick={e => handleDelete(e, book.id)} className="p-1 rounded text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
