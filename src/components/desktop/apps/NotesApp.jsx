import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, FileText, Plus, Trash2, Layout, Sparkles, Wand2, Loader2, BookOpen } from 'lucide-react';
import { InlineProgress } from '../../shared/ProgressBar';
import { listNotes, createNote, deleteNote, getNote, updateNote, generateCues, generateSummary } from '../../../api/notes';
import { apiFetch } from '../../../api/client';
import { listCurricula, getCurriculum } from '../../../api/curriculum';
import Button from '../../shared/Button';
import LoadingSpinner from '../../shared/LoadingSpinner';
import Modal from '../../shared/Modal';
import useBrowserBack from '../../../hooks/useBrowserBack';

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
        className="w-full text-xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400 mb-3 flex-shrink-0"
        placeholder="Note title..."
      />

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
  // Back button returns to the notes list instead of leaving the site.
  useBrowserBack(view !== 'list', () => setView('list'));
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiType, setAiType] = useState('regular');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState(null);
  // AI source: 'prompt' (free-form) or 'curriculum' (pick curriculum + lessons).
  const [aiSource, setAiSource] = useState('prompt');
  const [curricula, setCurricula] = useState([]);
  const [selectedCurriculumId, setSelectedCurriculumId] = useState(null);
  const [curriculumDetail, setCurriculumDetail] = useState(null);
  const [selectedLessonIds, setSelectedLessonIds] = useState([]); // [] = whole curriculum
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState(null);

  useEffect(() => {
    listNotes().then(d => { setNotes(d.notes || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // Load the curriculum list the first time the user opens the AI modal in
  // "curriculum" mode. Cached after that.
  useEffect(() => {
    if (!showAI || aiSource !== 'curriculum' || curricula.length > 0) return;
    listCurricula()
      .then(d => setCurricula(d.curricula || d || []))
      .catch(() => {});
  }, [showAI, aiSource, curricula.length]);

  // Fetch the full curriculum (units + lessons) when the user picks one.
  useEffect(() => {
    if (!selectedCurriculumId) { setCurriculumDetail(null); return; }
    setCurriculumLoading(true);
    getCurriculum(selectedCurriculumId)
      .then(d => {
        const curr = d.curriculum || d;
        setCurriculumDetail(curr);
        // Default: select all lessons in the curriculum.
        const allLessonIds = [];
        for (const u of (curr.units || [])) for (const l of (u.lessons || [])) allLessonIds.push(l.id);
        setSelectedLessonIds(allLessonIds);
      })
      .catch(() => setCurriculumDetail(null))
      .finally(() => setCurriculumLoading(false));
  }, [selectedCurriculumId]);

  async function handleCreate(type) {
    try {
      const data = await createNote('Untitled Note', type);
      setNotes(prev => [data.note, ...prev]);
      setSelectedNoteId(data.note.id);
      setView('editor');
      setShowCreate(false);
    } catch {}
  }

  // Build the user-visible "what to cover" string, with optional curriculum
  // lesson content appended as reference material.
  function buildAIUserMessage() {
    const isCornell = aiType === 'cornell';
    const header = `Create a ${isCornell ? 'Cornell' : 'regular'} study note.`;
    if (aiSource !== 'curriculum' || !curriculumDetail) {
      return `${header}\n\nTopic: ${aiPrompt.trim()}`;
    }
    // Walk selected lessons from the curriculum and concatenate their titles
    // + content so the AI grounds the note in those specific lessons.
    const lessonIdSet = new Set(selectedLessonIds);
    const sections = [];
    for (const u of (curriculumDetail.units || [])) {
      for (const l of (u.lessons || [])) {
        if (!lessonIdSet.has(l.id)) continue;
        const content = (l.content || l.description || '').slice(0, 4000);
        sections.push(`### ${u.title} · ${l.title}\n${content || '(no content yet)'}`);
      }
    }
    const body = [
      header,
      `Source: curriculum "${curriculumDetail.title}"${lessonIdSet.size < allLessonCount(curriculumDetail) ? ` (${sections.length} selected lessons)` : ' (all lessons)'}.`,
      aiPrompt.trim() ? `Additional instructions from the student: ${aiPrompt.trim()}` : '',
      '',
      '=== LESSON MATERIAL ===',
      sections.join('\n\n---\n\n'),
    ].filter(Boolean).join('\n\n');
    return body;
  }

  // Ask the AI to draft a full note (title + body + optional cues/summary for Cornell).
  async function handleGenerate() {
    const usingCurriculum = aiSource === 'curriculum' && selectedCurriculumId;
    if (!usingCurriculum && !aiPrompt.trim()) return;
    if (usingCurriculum && selectedLessonIds.length === 0) { setAiError('Pick at least one lesson.'); return; }
    if (aiBusy) return;
    setAiBusy(true); setAiError(null);
    try {
      const isCornell = aiType === 'cornell';
      const system = `You are a study-note generator. Output ONLY valid JSON, no markdown fences, no prose. ${
        isCornell
          ? `Shape: {"title": "...", "mainNotes": "...", "cues": ["keyword 1", ...], "summary": "..."}. The body goes in mainNotes (markdown allowed — bold, bullets, headings, KaTeX math in $...$ or $$...$$ ). Cues are 4-8 short keyword prompts. Summary is 2-3 sentences.`
          : `Shape: {"title": "...", "mainNotes": "..."}. Put the full note body in mainNotes using markdown (headings, bullets, bold, KaTeX math in $...$ or $$...$$).`
      } The note should be organized, dense, and useful for studying — not a paragraph of fluff.${
        usingCurriculum ? ' When LESSON MATERIAL is provided, base the note on that material: pull definitions, examples, formulas, and key points directly from the lessons. Do not invent facts that the lessons don\'t support.' : ''
      }`;
      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ system, messages: [{ role: 'user', content: buildAIUserMessage() }], max_tokens: 4000 }),
      });
      const text = result.content?.[0]?.text || '';
      let parsed = null;
      try { parsed = JSON.parse(text); } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
      }
      if (!parsed?.title) throw new Error('AI did not return a usable note.');
      const created = await createNote(parsed.title, aiType);
      const noteId = created.note.id;
      const updates = { mainNotes: parsed.mainNotes || '' };
      if (isCornell) {
        if (Array.isArray(parsed.cues)) updates.cues = parsed.cues;
        if (typeof parsed.summary === 'string') updates.summary = parsed.summary;
      }
      await updateNote(noteId, updates);
      setNotes(prev => [{ ...created.note, ...updates }, ...prev]);
      setSelectedNoteId(noteId);
      setView('editor');
      setShowAI(false);
      setAiPrompt('');
      setSelectedCurriculumId(null);
      setCurriculumDetail(null);
      setSelectedLessonIds([]);
      setAiSource('prompt');
    } catch (e) {
      setAiError(e?.message || 'Generation failed. Try again.');
    }
    setAiBusy(false);
  }

  function allLessonCount(curr) {
    let n = 0;
    for (const u of (curr?.units || [])) n += (u.lessons || []).length;
    return n;
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
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowAI(true)}>
            <Wand2 size={14} /> Generate with AI
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> New Note</Button>
        </div>
      </div>

      <Modal open={showAI} onClose={() => { setShowAI(false); setAiError(null); }} title="Generate note with AI">
        <div className="space-y-3">
          {/* Source tabs */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Source</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAiSource('prompt')}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${aiSource === 'prompt' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-[#2A2A40] text-gray-700 dark:text-gray-300'}`}
              >
                <Wand2 size={12} /> From prompt
              </button>
              <button
                onClick={() => setAiSource('curriculum')}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${aiSource === 'curriculum' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' : 'border-gray-200 dark:border-[#2A2A40] text-gray-700 dark:text-gray-300'}`}
              >
                <BookOpen size={12} /> From curriculum
              </button>
            </div>
          </div>

          {/* Note type */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setAiType('regular')} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${aiType === 'regular' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-[#2A2A40] text-gray-700 dark:text-gray-300'}`}>
                <FileText size={12} /> Regular
              </button>
              <button onClick={() => setAiType('cornell')} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${aiType === 'cornell' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-gray-200 dark:border-[#2A2A40] text-gray-700 dark:text-gray-300'}`}>
                <Layout size={12} /> Cornell
              </button>
            </div>
          </div>

          {/* Curriculum source picker */}
          {aiSource === 'curriculum' && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Curriculum</label>
                <select
                  value={selectedCurriculumId || ''}
                  onChange={e => setSelectedCurriculumId(e.target.value || null)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40"
                >
                  <option value="">— Pick a curriculum —</option>
                  {curricula.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>

              {selectedCurriculumId && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Lessons ({selectedLessonIds.length} selected)</label>
                    {curriculumDetail && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            const all = [];
                            for (const u of curriculumDetail.units || []) for (const l of u.lessons || []) all.push(l.id);
                            setSelectedLessonIds(all);
                          }}
                          className="text-[10px] text-blue-500 hover:underline"
                        >All</button>
                        <button
                          onClick={() => setSelectedLessonIds([])}
                          className="text-[10px] text-gray-400 hover:underline"
                        >None</button>
                      </div>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] p-2">
                    {curriculumLoading ? (
                      <div className="flex items-center justify-center py-6 text-xs text-gray-400"><InlineProgress active /> Loading lessons…</div>
                    ) : !curriculumDetail ? (
                      <p className="text-[11px] text-gray-400 italic p-2">Curriculum not found.</p>
                    ) : (
                      (curriculumDetail.units || []).map(u => (
                        <div key={u.id} className="mb-2 last:mb-0">
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-1 mb-1">{u.title}</p>
                          {(u.lessons || []).map(l => {
                            const checked = selectedLessonIds.includes(l.id);
                            return (
                              <label key={l.id} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-white dark:hover:bg-[#1e1e2e] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => setSelectedLessonIds(prev => checked ? prev.filter(id => id !== l.id) : [...prev, l.id])}
                                  className="w-3 h-3 accent-indigo-500"
                                />
                                <span className="text-xs text-gray-700 dark:text-gray-200">{l.title}</span>
                              </label>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
              {aiSource === 'curriculum' ? 'Extra instructions (optional)' : 'What should the note cover?'}
            </label>
            <textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              rows={3}
              placeholder={aiSource === 'curriculum'
                ? 'e.g., Focus on formulas and definitions only. Or leave blank.'
                : 'e.g., Photosynthesis — inputs/outputs, light vs dark reactions. Include the chemical equation.'}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
            />
          </div>

          {aiError && <p className="text-xs text-rose-500">{aiError}</p>}
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setShowAI(false); setAiError(null); }}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={aiBusy || (aiSource === 'curriculum' ? (!selectedCurriculumId || selectedLessonIds.length === 0) : !aiPrompt.trim())}
            >
              {aiBusy ? <><InlineProgress active /> Generating…</> : <><Wand2 size={14} /> Generate</>}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Note">
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
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{note.title}</h3>
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
