import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Trash2, Layout, Network } from 'lucide-react';
import { listNotes, createNote, deleteNote } from '../api/notes';
import Button from '../components/shared/Button';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import Modal from '../components/shared/Modal';
import SharedWithMeView from '../components/library/SharedWithMeView';

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
          <h1 className="text-[20px] font-bold text-white/90">Notes</h1>
          <p className="text-[13px] text-white/35">{notes.length} note{notes.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate('/notes/map')} size="sm" variant="secondary"><Network size={16} /> Map</Button>
          <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={16} /> New</Button>
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New note">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleCreate('regular')}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:border-white/[0.18] hover:bg-white/[0.08] transition-colors text-center"
          >
            <FileText size={22} className="text-white/40" />
            <span className="text-[13px] font-semibold text-white/80">Regular</span>
            <span className="text-[11px] text-white/35">Freeform</span>
          </button>
          <button
            onClick={() => handleCreate('cornell')}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:border-white/[0.18] hover:bg-white/[0.08] transition-colors text-center"
          >
            <Layout size={22} className="text-white/40" />
            <span className="text-[13px] font-semibold text-white/80">Cornell</span>
            <span className="text-[11px] text-white/35">Cues + summary</span>
          </button>
        </div>
      </Modal>

      {notes.length === 0 ? (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-12 text-center">
          <FileText size={26} className="text-white/20 mx-auto mb-3" />
          <p className="text-[13px] text-white/35 mb-4">No notes yet</p>
          <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={16} /> New note</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map(note => (
            <div
              key={note.id}
              onClick={() => navigate(`/notes/${note.id}`)}
              className="flex items-center gap-4 rounded-xl border border-white/[0.07] bg-white/[0.03] hover:border-white/[0.15] hover:bg-white/[0.06] backdrop-blur-sm px-5 py-4 cursor-pointer transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-white/[0.07] border border-white/[0.09] flex items-center justify-center flex-shrink-0">
                {note.type === 'cornell' ? <Layout size={15} className="text-white/45" /> : <FileText size={15} className="text-white/45" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[13px] font-semibold text-white/80 group-hover:text-white/95 transition-colors truncate">
                  {note.title}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-white/30">{note.type === 'cornell' ? 'Cornell' : 'Note'}</span>
                  <span className="text-[11px] text-white/20">&middot;</span>
                  <span className="text-[11px] text-white/30">{new Date(note.updatedAt || note.createdAt).toLocaleDateString()}</span>
                  {note.preview && (
                    <>
                      <span className="text-[11px] text-white/20">&middot;</span>
                      <span className="text-[11px] text-white/25 truncate">{note.preview}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, note.id)}
                className="p-1.5 rounded-lg text-white/20 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <SharedWithMeView className="mt-8" />
    </div>
  );
}
