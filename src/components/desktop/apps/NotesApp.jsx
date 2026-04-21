import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, FileText, Plus, Trash2, Layout, Sparkles, BookOpen } from 'lucide-react';
import { listNotes, createNote, deleteNote, getNote, updateNote, generateCues, generateSummary } from '../../../api/notes';
import Button from '../../shared/Button';
import LoadingSpinner from '../../shared/LoadingSpinner';
import Modal from '../../shared/Modal';
import CurriculumLessonPicker from '../../shared/CurriculumLessonPicker';

function NoteEditor({ noteId, onBack }) {
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [genCues, setGenCues] = useState(false);
  const [genSummary, setGenSummary] = useState(false);
  const [saveTimer, setSaveTimer] = useState(null);

  useEffect(() => {
    getNote(noteId).then(d => { setNote(d.note); setLoading(false); }).catch(() => setLoading(false));
  }, [noteId]);

  const save = useCallback(async (updates) => {
    setSaving(true);
    try { await updateNote(noteId, updates); } catch {}
    setSaving(false);
  }, [noteId]);

  function handleChange(field, value) {
    setNote(prev => ({ ...prev, [field]: value }));
    if (saveTimer) clearTimeout(saveTimer);
    setSaveTimer(setTimeout(() => save({ [field]: value }), 1000));
  }

  async function handleGenCues() {
    setGenCues(true);
    try { const d = await generateCues(noteId); setNote(prev => ({ ...prev, cues: d.cues })); } catch {}
    setGenCues(false);
  }

  async function handleGenSummary() {
    setGenSummary(true);
    try { const d = await generateSummary(noteId); setNote(prev => ({ ...prev, summary: d.summary })); } catch {}
    setGenSummary(false);
  }

  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;
  if (!note) return <div className="text-center py-12 text-gray-500 text-sm">Note not found</div>;

  const isCornell = note.type === 'cornell';

  function handleLinkChange(next) {
    const curriculumId = next?.curriculumId || null;
    const lessonId = next?.lessonId || null;
    setNote(prev => ({ ...prev, linkedCurriculumId: curriculumId, linkedLessonId: lessonId }));
    save({ linkedCurriculumId: curriculumId, linkedLessonId: lessonId });
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200">
          <ArrowLeft size={16} /> Notes
        </button>
        <span className="text-xs text-gray-400">{saving ? 'Saving...' : 'Auto-saved'}</span>
      </div>

      <input
        value={note.title}
        onChange={e => handleChange('title', e.target.value)}
        className="w-full text-xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400 mb-2 flex-shrink-0"
        placeholder="Note title..."
      />

      <div className="mb-3 flex-shrink-0">
        <CurriculumLessonPicker
          compact
          value={note.linkedCurriculumId ? { curriculumId: note.linkedCurriculumId, lessonId: note.linkedLessonId } : null}
          onChange={handleLinkChange}
        />
      </div>

      {isCornell ? (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          <div className="flex-1 min-h-0 grid grid-cols-[200px_1fr] bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] overflow-hidden">
            <div className="border-r border-gray-200 dark:border-[#2A2A40] p-3 bg-gray-50 dark:bg-[#0D0D14] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Cues</span>
                <button onClick={handleGenCues} disabled={genCues} className="text-blue-500 hover:text-blue-600 disabled:opacity-50"><Sparkles size={12} /></button>
              </div>
              {(note.cues || []).length > 0 ? (
                <div className="space-y-1.5">
                  {note.cues.map((cue, i) => (
                    <div key={i} className="text-[11px] text-gray-700 dark:text-gray-300 bg-white dark:bg-[#161622] rounded-lg px-2.5 py-1.5 border border-gray-100 dark:border-[#2A2A40]">{cue}</div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-gray-400 italic">Write notes, then click sparkle to generate cues</p>
              )}
            </div>
            <textarea
              value={note.mainNotes}
              onChange={e => handleChange('mainNotes', e.target.value)}
              className="w-full h-full p-3 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 resize-none outline-none"
              placeholder="Write your notes here..."
            />
          </div>
          <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Summary</span>
              <button onClick={handleGenSummary} disabled={genSummary} className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-600 disabled:opacity-50">
                <Sparkles size={10} /> Generate
              </button>
            </div>
            <textarea
              value={note.summary}
              onChange={e => handleChange('summary', e.target.value)}
              className="w-full bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 resize-none outline-none min-h-[40px]"
              placeholder="Summary..."
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] overflow-hidden">
          <textarea
            value={note.mainNotes}
            onChange={e => handleChange('mainNotes', e.target.value)}
            className="w-full h-full p-4 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 resize-none outline-none leading-relaxed"
            placeholder="Start writing..."
          />
        </div>
      )}
    </div>
  );
}

export default function NotesApp() {
  const [view, setView] = useState('list');
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [newLink, setNewLink] = useState(null); // { curriculumId, lessonId } | null
  const [filterCurriculumId, setFilterCurriculumId] = useState(null);

  useEffect(() => {
    listNotes().then(d => { setNotes(d.notes || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleCreate(type) {
    try {
      const data = await createNote('Untitled Note', type, {
        linkedCurriculumId: newLink?.curriculumId,
        linkedLessonId: newLink?.lessonId,
      });
      setNotes(prev => [data.note, ...prev]);
      setSelectedNoteId(data.note.id);
      setView('editor');
      setShowCreate(false);
      setNewLink(null);
    } catch {}
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this note?')) return;
    await deleteNote(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    if (selectedNoteId === id) { setView('list'); setSelectedNoteId(null); }
  }

  function openNote(id) {
    setSelectedNoteId(id);
    setView('editor');
  }

  if (view === 'editor' && selectedNoteId) {
    return <NoteEditor noteId={selectedNoteId} onBack={() => { setView('list'); listNotes().then(d => setNotes(d.notes || [])).catch(() => {}); }} />;
  }

  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Notes</h2>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> New Note</Button>
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setNewLink(null); }} title="New Note">
        <div className="mb-4">
          <CurriculumLessonPicker value={newLink} onChange={setNewLink} />
          <p className="text-[10px] text-gray-400 mt-1">Optional — link this note to a curriculum or lesson so you can find it again alongside your course.</p>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Choose a note type:</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => handleCreate('regular')} className="flex flex-col items-center gap-2 p-5 rounded-xl border border-gray-200 dark:border-[#2A2A40] hover:border-blue-400 dark:hover:border-blue-600 transition-colors text-center">
            <FileText size={24} className="text-blue-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Regular Note</span>
            <span className="text-xs text-gray-400">Freeform writing</span>
          </button>
          <button onClick={() => handleCreate('cornell')} className="flex flex-col items-center gap-2 p-5 rounded-xl border border-gray-200 dark:border-[#2A2A40] hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors text-center">
            <Layout size={24} className="text-emerald-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Cornell Note</span>
            <span className="text-xs text-gray-400">Cues, notes, summary</span>
          </button>
        </div>
      </Modal>

      {notes.length === 0 ? (
        <div className="text-center py-12">
          <FileText size={28} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-3">No notes yet</p>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> Create Note</Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {notes.map(note => (
            <div key={note.id} onClick={() => openNote(note.id)} className="flex items-center gap-3 bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] px-4 py-3 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors group">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${note.type === 'cornell' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-500'}`}>
                {note.type === 'cornell' ? <Layout size={14} /> : <FileText size={14} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{note.title}</h3>
                  {note.linkedCurriculumId && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                      <BookOpen size={8} /> linked
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">{note.type === 'cornell' ? 'Cornell' : 'Note'} · {new Date(note.updatedAt || note.createdAt).toLocaleDateString()}</p>
              </div>
              <button onClick={e => handleDelete(e, note.id)} className="p-1 rounded text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
