import { useEffect, useState } from 'react';
import { FileText, Plus, ChevronRight, ArrowLeft, Save, Trash2 } from 'lucide-react';
import { listNotes, createNote, getNote, updateNote, deleteNote } from '../../api/notes';
import MobilePage from './MobilePage';

// Mobile-native notes flow: list → create-or-edit. Tapping "New note"
// creates a note immediately and drops the user into the editor. List
// rows open the editor for that note. Editor has Save + Delete inline.
export default function MobileNotes() {
  const [view, setView] = useState('list'); // list | edit
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  // edit state — server stores the body under `mainNotes` (Cornell-style),
  // not `content`. Keep our state name aligned to avoid the same off-by-key
  // bug that caused "make new note doesn't work" the first time.
  const [activeId, setActiveId] = useState(null);
  const [title, setTitle] = useState('');
  const [mainNotes, setMainNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    listNotes()
      .then((d) => setNotes(d.notes || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleNew() {
    try {
      const { note } = await createNote('Untitled note');
      setNotes((prev) => [note, ...prev]);
      openNote(note);
    } catch (err) { console.error(err); }
  }

  async function openNote(note) {
    setView('edit');
    setActiveId(note.id);
    setTitle(note.title || 'Untitled note');
    setMainNotes('');
    try {
      const d = await getNote(note.id);
      setTitle(d.note?.title ?? note.title ?? '');
      setMainNotes(d.note?.mainNotes ?? '');
    } catch {}
  }

  async function handleSave() {
    if (!activeId || saving) return;
    setSaving(true);
    try {
      const { note } = await updateNote(activeId, { title, mainNotes });
      setNotes((prev) => prev.map((n) => (n.id === activeId ? { ...n, ...note } : n)));
      setSavedAt(Date.now());
    } catch (err) { console.error(err); } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!activeId) return;
    if (!confirm('Delete this note?')) return;
    try {
      await deleteNote(activeId);
      setNotes((prev) => prev.filter((n) => n.id !== activeId));
      setView('list');
      setActiveId(null);
    } catch (err) { console.error(err); }
  }

  // ===== EDIT =====
  if (view === 'edit' && activeId) {
    return (
      <div className="flex flex-col h-full bg-[#F4F5F7] dark:bg-[#0a0a14]">
        <header className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
          <button onClick={() => { handleSave(); setView('list'); }} className="w-9 h-9 -ml-1 rounded-full grid place-items-center text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-white/[0.06]">
            <ArrowLeft size={18} />
          </button>
          <p className="flex-1 text-[12.5px] font-medium text-gray-500 dark:text-gray-400 truncate">
            {savedAt ? `Saved ${timeAgo(savedAt)}` : (saving ? 'Saving…' : 'Tap save to keep changes')}
          </p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-blue-600 disabled:opacity-50 text-white text-[12px] font-bold"
          >
            <Save size={11} /> Save
          </button>
          <button onClick={handleDelete} title="Delete" className="w-9 h-9 rounded-full grid place-items-center text-gray-400 hover:text-rose-500">
            <Trash2 size={15} />
          </button>
        </header>

        <div className="flex-1 min-h-0 flex flex-col px-4 py-3 overflow-y-auto">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            className="text-[22px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white bg-transparent outline-none mb-2"
          />
          <textarea
            value={mainNotes}
            onChange={(e) => setMainNotes(e.target.value)}
            placeholder="Start writing…"
            className="flex-1 min-h-[60vh] resize-none text-[14px] leading-relaxed text-gray-800 dark:text-gray-200 bg-transparent outline-none"
          />
        </div>
      </div>
    );
  }

  // ===== LIST =====
  return (
    <MobilePage
      eyebrow="Notes"
      title="My Notes"
      subtitle={loading ? 'Loading…' : `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
    >
      <button
        onClick={handleNew}
        className="w-full rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white p-4 mb-4 active:scale-[0.99] transition-transform text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 grid place-items-center shrink-0">
            <Plus size={20} className="text-white" />
          </div>
          <p className="flex-1 text-[15px] font-bold tracking-tight">New note</p>
          <ChevronRight size={16} className="text-white/80" />
        </div>
      </button>

      {!loading && notes.length === 0 && (
        <div className="text-center py-12">
          <FileText size={32} className="text-gray-300 dark:text-white/15 mx-auto mb-3" />
          <p className="text-[13px] text-gray-500 dark:text-gray-400">No notes yet.</p>
        </div>
      )}

      <div className="space-y-2">
        {notes.map((n) => (
          <button
            key={n.id}
            onClick={() => openNote(n)}
            className="w-full rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#13131f] p-3.5 active:scale-[0.99] transition-transform text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 grid place-items-center shrink-0">
                <FileText size={18} className="text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold tracking-tight text-gray-900 dark:text-white truncate">{n.title || 'Untitled'}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                  {n.updatedAt ? new Date(n.updatedAt).toLocaleDateString() : 'just now'}
                  {n.preview ? ` · ${n.preview.slice(0, 40)}…` : ''}
                </p>
              </div>
              <ChevronRight size={14} className="text-gray-300 dark:text-white/30 shrink-0" />
            </div>
          </button>
        ))}
      </div>
    </MobilePage>
  );
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 5_000) return 'now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}
