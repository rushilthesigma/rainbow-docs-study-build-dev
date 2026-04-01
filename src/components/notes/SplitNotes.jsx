import { useState, useEffect, useRef } from 'react';
import { listNotes, createNote, updateNote } from '../../api/notes';

export default function SplitNotes({ className = '' }) {
  const [notes, setNotes] = useState([]);
  const [activeNote, setActiveNote] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef(null);

  useEffect(() => {
    listNotes().then(d => { setNotes(d.notes || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleCreate() {
    const data = await createNote('Quick Note', 'regular');
    setActiveNote(data.note);
    setContent('');
    setNotes(prev => [{ id: data.note.id, title: data.note.title, type: 'regular' }, ...prev]);
  }

  function handleContentChange(val) {
    setContent(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (activeNote) updateNote(activeNote.id, { mainNotes: val }).catch(() => {});
    }, 1000);
  }

  async function selectNote(note) {
    const { getNote } = await import('../../api/notes');
    const data = await getNote(note.id);
    setActiveNote(data.note);
    setContent(data.note.mainNotes || '');
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {!activeNote ? (
        <div className="flex-1 overflow-y-auto p-3">
          <button onClick={handleCreate} className="w-full text-left px-3 py-2 rounded-lg text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 mb-2 font-medium">
            + New Quick Note
          </button>
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading...</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No notes</p>
          ) : (
            <div className="space-y-1">
              {notes.map(n => (
                <button key={n.id} onClick={() => selectNote(n)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1e1e2e] transition-colors">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{n.title}</p>
                  {n.preview && <p className="text-xs text-gray-400 truncate">{n.preview}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-[#2A2A40]">
            <button onClick={() => setActiveNote(null)} className="text-xs text-gray-400 hover:text-gray-600">Back</button>
            <input
              value={activeNote.title}
              onChange={e => {
                setActiveNote(prev => ({ ...prev, title: e.target.value }));
                updateNote(activeNote.id, { title: e.target.value }).catch(() => {});
              }}
              className="text-sm font-medium bg-transparent text-gray-800 dark:text-gray-200 outline-none text-center flex-1 mx-2"
            />
            <span className="text-[10px] text-gray-400">Auto-saved</span>
          </div>
          <textarea
            value={content}
            onChange={e => handleContentChange(e.target.value)}
            className="flex-1 p-3 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 resize-none outline-none leading-relaxed"
            placeholder="Write here..."
          />
        </div>
      )}
    </div>
  );
}
