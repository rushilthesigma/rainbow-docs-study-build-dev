import { useEffect, useRef, useState } from 'react';
import { FileText, Plus, ChevronRight, ArrowLeft, Save, Trash2, Download, Upload } from 'lucide-react';
import { listNotes, createNote, getNote, updateNote, deleteNote } from '../../api/notes';
import { exportNoteAsPdf } from '../../lib/notesPdf';
import { importNotesFromFiles, NOTE_IMPORT_ACCEPT } from '../../lib/noteImport';
import MobilePage from './MobilePage';
import MarkdownNoteEditor from '../notes/MarkdownNoteEditor';

// Mobile-native notes flow: list → create-or-edit. Tapping "New note"
// creates a note immediately and drops the user into the editor. List
// rows open the editor for that note. Editor has Save + Delete inline.
export default function MobileNotes() {
  const [view, setView] = useState('list'); // list | edit
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  // edit state - server stores the body under `mainNotes` (Cornell-style),
  // not `content`. Keep our state name aligned to avoid the same off-by-key
  // bug that caused "make new note doesn't work" the first time.
  const [activeId, setActiveId] = useState(null);
  const [activeType, setActiveType] = useState('regular');
  const [title, setTitle] = useState('');
  const [mainNotes, setMainNotes] = useState('');
  const [cues, setCues] = useState([]);
  const [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef(null);
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

  async function handleImport(event) {
    const files = event.target.files;
    event.target.value = '';
    if (!files?.length || importing) return;
    setImporting(true);
    try {
      await importNotesFromFiles(files);
      const refreshed = await listNotes();
      setNotes(refreshed.notes || []);
    } catch (err) {
      alert(err?.message || 'Could not import those notes.');
    } finally {
      setImporting(false);
    }
  }

  async function openNote(note) {
    setView('edit');
    setActiveId(note.id);
    setActiveType(note.type || 'regular');
    setTitle(note.title || 'Untitled note');
    setMainNotes('');
    setCues([]);
    setSummary('');
    try {
      const d = await getNote(note.id);
      setTitle(d.note?.title ?? note.title ?? '');
      setMainNotes(d.note?.mainNotes ?? '');
      setActiveType(d.note?.type ?? note.type ?? 'regular');
      setCues(Array.isArray(d.note?.cues) ? d.note.cues : []);
      setSummary(d.note?.summary ?? '');
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
      setActiveType('regular');
    } catch (err) { console.error(err); }
  }

  async function handleExportPdf() {
    if (!activeId || exportingPdf) return;
    setExportingPdf(true);
    try {
      await exportNoteAsPdf({ id: activeId, title, mainNotes, type: activeType, cues, summary });
    } catch {
      alert('Could not export this note as a PDF.');
    } finally {
      setExportingPdf(false);
    }
  }

  // ===== EDIT =====
  if (view === 'edit' && activeId) {
    return (
      <div className="flex flex-col h-full bg-transparent">
        <header className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] flex-shrink-0">
          <button onClick={() => { handleSave(); setView('list'); }} className="w-9 h-9 -ml-1 rounded-full grid place-items-center text-white/50 active:bg-white/[0.06]">
            <ArrowLeft size={18} />
          </button>
          <p className="flex-1 text-[12.5px] font-medium text-white/35 truncate">
            {savedAt ? `Saved ${timeAgo(savedAt)}` : (saving ? 'Saving…' : 'Tap save to keep changes')}
          </p>
          <button
            onClick={handleExportPdf}
            disabled={exportingPdf}
            aria-label="Export as PDF"
            title="Export as PDF"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-blue-500/15 border border-blue-400/30 disabled:opacity-50 text-blue-100 text-[12px] font-bold"
          >
            <Download size={11} /> PDF
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-blue-500 border border-blue-400/30 disabled:opacity-50 text-white text-[12px] font-bold active:bg-blue-600"
          >
            <Save size={11} /> Save
          </button>
          <button onClick={handleDelete} title="Delete" className="w-9 h-9 rounded-full grid place-items-center text-white/30 hover:text-rose-400">
            <Trash2 size={15} />
          </button>
        </header>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            className="text-[22px] font-bold tracking-[-0.02em] text-white/80 bg-transparent outline-none mx-4 mt-3 mb-1 flex-shrink-0"
          />
          <MarkdownNoteEditor
            value={mainNotes}
            onChange={setMainNotes}
            className="flex-1 min-h-0"
            placeholder="Start writing… markdown supported"
          />
        </div>
      </div>
    );
  }

  // ===== LIST =====
  return (
    <MobilePage
      title="My Notes"
    >
      <button
        onClick={handleNew}
        className="w-full rounded-2xl bg-blue-500 border border-blue-400/30 p-4 mb-4 active:scale-[0.99] transition-transform text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-400/30 grid place-items-center shrink-0">
            <Plus size={20} className="text-white/85" />
          </div>
          <p className="flex-1 text-[15px] font-bold tracking-tight text-white/90">New note</p>
          <ChevronRight size={16} className="text-white/80" />
        </div>
      </button>

      <button
        onClick={() => importInputRef.current?.click()}
        disabled={importing}
        className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 mb-4 disabled:opacity-50 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-400/15 grid place-items-center shrink-0">
            <Upload size={17} className="text-emerald-300/80" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold tracking-tight text-white/80">{importing ? 'Importing notes…' : 'Import notes'}</p>
            <p className="text-[11px] text-white/30 mt-0.5">Markdown, text, or JSON</p>
          </div>
          <ChevronRight size={16} className="text-white/25" />
        </div>
      </button>
      <input
        ref={importInputRef}
        type="file"
        multiple
        accept={NOTE_IMPORT_ACCEPT}
        hidden
        onChange={handleImport}
      />

      {!loading && notes.length === 0 && (
        <div className="text-center py-12">
          <FileText size={32} className="text-white/15 mx-auto mb-3" />
          <p className="text-[13px] text-white/30">No notes yet.</p>
        </div>
      )}

      <div className="space-y-2">
        {notes.map((n) => (
          <button
            key={n.id}
            onClick={() => openNote(n)}
            className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3.5 active:scale-[0.99] transition-transform text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.07] grid place-items-center shrink-0">
                <FileText size={18} className="text-white/40" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold tracking-tight text-white/90 truncate">{n.title || 'Untitled'}</p>
                <p className="text-[11px] text-white/30 mt-0.5 truncate">
                  {n.updatedAt ? new Date(n.updatedAt).toLocaleDateString() : 'just now'}
                  {n.preview ? ` · ${n.preview.slice(0, 40)}…` : ''}
                </p>
              </div>
              <ChevronRight size={14} className="text-white/25 shrink-0" />
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
