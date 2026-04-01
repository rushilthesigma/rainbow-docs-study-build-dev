import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Trash2, BookOpen, Layout } from 'lucide-react';
import { listNotes, createNote, deleteNote } from '../api/notes';
import Button from '../components/shared/Button';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import Modal from '../components/shared/Modal';

export default function NotesPage() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    listNotes().then(d => { setNotes(d.notes || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleCreate(type) {
    try {
      const data = await createNote('Untitled Note', type);
      navigate(`/notes/${data.note.id}`);
    } catch (err) { console.error(err); }
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this note?')) return;
    await deleteNote(id);
    setNotes(prev => prev.filter(n => n.id !== id));
  }

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Notes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{notes.length} note{notes.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={16} /> New Note</Button>
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Note">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Choose a note type:</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleCreate('regular')}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border border-gray-200 dark:border-[#2A2A40] hover:border-blue-400 dark:hover:border-blue-600 transition-colors text-center"
          >
            <FileText size={24} className="text-blue-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Regular Note</span>
            <span className="text-xs text-gray-400">Freeform writing</span>
          </button>
          <button
            onClick={() => handleCreate('cornell')}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border border-gray-200 dark:border-[#2A2A40] hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors text-center"
          >
            <Layout size={24} className="text-emerald-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Cornell Note</span>
            <span className="text-xs text-gray-400">Cues, notes, summary</span>
          </button>
        </div>
      </Modal>

      {notes.length === 0 ? (
        <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-12 text-center">
          <FileText size={28} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">No notes yet</p>
          <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={16} /> Create Note</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map(note => (
            <div
              key={note.id}
              onClick={() => navigate(`/notes/${note.id}`)}
              className="flex items-center gap-4 bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] px-5 py-4 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors group"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                note.type === 'cornell'
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500'
                  : 'bg-blue-50 dark:bg-blue-900/20 text-blue-500'
              }`}>
                {note.type === 'cornell' ? <Layout size={16} /> : <FileText size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                  {note.title}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">{note.type === 'cornell' ? 'Cornell' : 'Note'}</span>
                  <span className="text-xs text-gray-300 dark:text-gray-600">&middot;</span>
                  <span className="text-xs text-gray-400">{new Date(note.updatedAt || note.createdAt).toLocaleDateString()}</span>
                  {note.preview && (
                    <>
                      <span className="text-xs text-gray-300 dark:text-gray-600">&middot;</span>
                      <span className="text-xs text-gray-400 truncate">{note.preview}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, note.id)}
                className="p-1.5 rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
