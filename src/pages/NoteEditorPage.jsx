import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { getNote, updateNote, generateCues, generateSummary } from '../api/notes';
import Button from '../components/shared/Button';
import LoadingSpinner from '../components/shared/LoadingSpinner';

export default function NoteEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [genCues, setGenCues] = useState(false);
  const [genSummary, setGenSummary] = useState(false);
  const [saveTimer, setSaveTimer] = useState(null);

  useEffect(() => {
    getNote(id).then(d => { setNote(d.note); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  const save = useCallback(async (updates) => {
    setSaving(true);
    try { await updateNote(id, updates); } catch {}
    setSaving(false);
  }, [id]);

  function handleChange(field, value) {
    setNote(prev => ({ ...prev, [field]: value }));
    if (saveTimer) clearTimeout(saveTimer);
    setSaveTimer(setTimeout(() => save({ [field]: value }), 1000));
  }

  async function handleGenCues() {
    setGenCues(true);
    try {
      const data = await generateCues(id);
      setNote(prev => ({ ...prev, cues: data.cues }));
    } catch {}
    setGenCues(false);
  }

  async function handleGenSummary() {
    setGenSummary(true);
    try {
      const data = await generateSummary(id);
      setNote(prev => ({ ...prev, summary: data.summary }));
    } catch {}
    setGenSummary(false);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;
  if (!note) return <div className="text-center py-20 text-gray-500">Note not found</div>;

  const isCornell = note.type === 'cornell';

  return (
    <div className="w-full flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <button onClick={() => navigate('/notes')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          <ArrowLeft size={16} /> Notes
        </button>
        <span className="text-xs text-gray-400">{saving ? 'Saving...' : 'Auto-saved'}</span>
      </div>

      {/* Title */}
      <input
        value={note.title}
        onChange={e => handleChange('title', e.target.value)}
        className="w-full text-xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400 mb-3 flex-shrink-0"
        placeholder="Note title..."
      />

      {isCornell ? (
        /* Cornell layout */
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          <div className="flex-1 min-h-0 grid grid-cols-[240px_1fr] bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] overflow-hidden">
            {/* Cues column */}
            <div className="border-r border-gray-200 dark:border-[#2A2A40] p-4 bg-gray-50 dark:bg-[#0D0D14] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cues</span>
                <button onClick={handleGenCues} disabled={genCues} className="text-blue-500 hover:text-blue-600 disabled:opacity-50 transition-colors">
                  <Sparkles size={14} />
                </button>
              </div>
              {(note.cues || []).length > 0 ? (
                <div className="space-y-2">
                  {note.cues.map((cue, i) => (
                    <div key={i} className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-[#161622] rounded-lg px-3 py-2 border border-gray-100 dark:border-[#2A2A40]">
                      {cue}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Write notes, then click the sparkle to generate cues</p>
              )}
            </div>

            {/* Main notes */}
            <textarea
              value={note.mainNotes}
              onChange={e => handleChange('mainNotes', e.target.value)}
              className="w-full h-full p-4 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 resize-none outline-none"
              placeholder="Write your notes here..."
            />
          </div>

          {/* Summary */}
          <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Summary</span>
              <button onClick={handleGenSummary} disabled={genSummary} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 disabled:opacity-50 transition-colors">
                <Sparkles size={12} /> Generate
              </button>
            </div>
            <textarea
              value={note.summary}
              onChange={e => handleChange('summary', e.target.value)}
              className="w-full bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 resize-none outline-none min-h-[50px]"
              placeholder="Summary..."
            />
          </div>
        </div>
      ) : (
        /* Regular note - simple editor */
        <div className="flex-1 min-h-0 bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] overflow-hidden">
          <textarea
            value={note.mainNotes}
            onChange={e => handleChange('mainNotes', e.target.value)}
            className="w-full h-full p-5 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 resize-none outline-none leading-relaxed"
            placeholder="Start writing..."
          />
        </div>
      )}
    </div>
  );
}
