import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, FileText, Plus, Trash2, Layout, Sparkles, Wand2, Loader2, BookOpen, Network } from 'lucide-react';
import { InlineProgress } from '../../shared/ProgressBar';
import { listNotes, createNote, deleteNote, getNote, updateNote, generateCues, generateSummary,
         listNoteMaps, createNoteMap, deleteNoteMap, updateNoteMap } from '../../../api/notes';
import { apiFetch } from '../../../api/client';
import { listCurricula, getCurriculum } from '../../../api/curriculum';
import { peek, fetchOnce, bust } from '../../../api/cache';
import ViewFade from '../../shared/ViewFade';
import Button from '../../shared/Button';
import LoadingSpinner from '../../shared/LoadingSpinner';
import Modal from '../../shared/Modal';
import useBrowserBack from '../../../hooks/useBrowserBack';
import NoteActions from '../../notes/NoteActions';
import NoteMap from '../../notes/NoteMap';

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
  if (!note) return <div className="text-center py-12 text-white/30 text-sm">Note not found</div>;

  const isCornell = note.type === 'cornell';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors">
          <ArrowLeft size={16} /> Notes
        </button>
        <span className="text-xs text-white/25">{saving ? 'Saving...' : 'Auto-saved'}</span>
      </div>

      <input
        value={note.title}
        onChange={e => handleChange('title', e.target.value)}
        className="w-full text-xl font-bold bg-transparent border-none outline-none text-white/95 placeholder-white/25 mb-3 flex-shrink-0"
        placeholder="Title"
      />

      <div className="mb-3 flex-shrink-0">
        <NoteActions
          note={note}
          onNoteUpdated={(patch) => setNote(prev => prev ? { ...prev, ...patch } : prev)}
        />
      </div>

      {isCornell ? (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          <div className="flex-1 min-h-0 grid grid-cols-[200px_1fr] bg-white/[0.02] rounded-2xl border border-white/[0.07] overflow-hidden">
            <div className="border-r border-white/[0.06] p-3 bg-white/[0.02] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-white/35 uppercase tracking-wide">Cues</span>
                <button onClick={handleGenCues} disabled={genCues} className="text-white/40 hover:text-white/70 disabled:opacity-50 transition-colors"><Sparkles size={12} /></button>
              </div>
              {(note.cues || []).length > 0 ? (
                <div className="space-y-1.5">
                  {note.cues.map((cue, i) => (
                    <div key={i} className="text-[11px] text-white/80 bg-white/[0.04] rounded-xl px-2.5 py-1.5 border border-white/[0.06]">{cue}</div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-white/25 italic">Write notes, then click sparkle to generate cues</p>
              )}
            </div>
            <textarea
              value={note.mainNotes}
              onChange={e => handleChange('mainNotes', e.target.value)}
              className="w-full h-full p-3 bg-transparent text-sm text-white/88 placeholder-white/25 resize-none outline-none"
              placeholder="Notes…"
            />
          </div>
          <div className="bg-white/[0.02] rounded-2xl border border-white/[0.06] p-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-white/35 uppercase tracking-wide">Summary</span>
              <button onClick={handleGenSummary} disabled={genSummary} className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/65 disabled:opacity-50 transition-colors">
                <Sparkles size={10} /> Generate
              </button>
            </div>
            <textarea
              value={note.summary}
              onChange={e => handleChange('summary', e.target.value)}
              className="w-full bg-transparent text-sm text-white/88 placeholder-white/25 resize-none outline-none min-h-[40px]"
              placeholder="Summary"
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 bg-white/[0.02] rounded-2xl border border-white/[0.06] overflow-hidden">
          <textarea
            value={note.mainNotes}
            onChange={e => handleChange('mainNotes', e.target.value)}
            className="w-full h-full p-4 bg-transparent text-sm text-white/88 placeholder-white/25 resize-none outline-none leading-relaxed"
            placeholder="Notes…"
          />
        </div>
      )}
    </div>
  );
}

export default function NotesApp({ initialNoteId = null, initialMapId = null, initialView = null } = {}) {
  // Optional meta props from the desktop window manager — `initialNoteId`
  // jumps straight into the editor for that note; `initialMapId` opens
  // the merged Maps view on that specific map. The legacy Note Map app
  // entry passes initialView='map' so existing dock icons keep working.
  const startView = initialNoteId ? 'editor'
                    : initialMapId ? 'map'
                    : initialView === 'map' ? 'map'
                    : 'list';
  const [view, setView] = useState(startView);
  // Back button returns to the notes list instead of leaving the site.
  useBrowserBack(view !== 'list', () => setView('list'));
  // Seed from the in-memory cache so re-opening the app feels instant —
  // the most-recent list paints on first render and we kick a background
  // refresh below.
  const cachedNotes = peek('notes:list');
  const cachedMaps = peek('notes:maps');
  const [notes, setNotes] = useState(() => cachedNotes?.notes || []);
  // Multi-map state. Maps are summaries — each map's nodes+edges are
  // fetched inside <NoteMap> by id.
  const [maps, setMaps] = useState(() => cachedMaps?.maps || []);
  const [mapsLoading, setMapsLoading] = useState(!cachedMaps);
  const [selectedMapId, setSelectedMapId] = useState(initialMapId);
  const [creatingMap, setCreatingMap] = useState(false);
  const [loading, setLoading] = useState(!cachedNotes);
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
  const [selectedNoteId, setSelectedNoteId] = useState(initialNoteId);
  // In-app naming modal — replaces the native browser prompt() that
  // surfaces the URL banner ("www.rushil12.com says…"). `mode` is
  // 'create' for new map, 'rename' when editing an existing one.
  const [nameDialog, setNameDialog] = useState(null);
  // Shape: { mode: 'create' | 'rename', initial: '', mapId? }

  useEffect(() => {
    fetchOnce('notes:list', listNotes)
      .then(d => { setNotes(d.notes || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Load map summaries. We refresh after create/delete via reloadMaps().
  const reloadMaps = useCallback((force = false) => {
    if (force) bust('notes:maps');
    setMapsLoading(!peek('notes:maps'));
    return fetchOnce('notes:maps', listNoteMaps)
      .then(d => {
        const list = d.maps || [];
        setMaps(list);
        // If we landed on the map view with no specific map selected
        // (e.g. user clicked the dock Notes icon then "Map" tab), pick
        // the default one so the canvas isn't blank.
        if (!selectedMapId && list.length > 0) {
          const def = list.find(m => m.isDefault) || list[0];
          if (def) setSelectedMapId(def.id);
        }
      })
      .catch(() => {})
      .finally(() => setMapsLoading(false));
  }, [selectedMapId]);

  useEffect(() => { reloadMaps(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  function handleCreateMap() {
    if (creatingMap) return;
    setNameDialog({ mode: 'create', initial: 'Untitled Map' });
  }

  function handleRenameMap(map) {
    setNameDialog({ mode: 'rename', initial: map.name, mapId: map.id });
  }

  // Single submit handler for both create + rename. Keeps the modal
  // generic — the surrounding state decides what to do with the name.
  async function handleNameSubmit(name) {
    const trimmed = (name || '').trim() || 'Untitled Map';
    const dialog = nameDialog;
    setNameDialog(null);
    if (!dialog) return;
    if (dialog.mode === 'create') {
      setCreatingMap(true);
      try {
        const d = await createNoteMap(trimmed);
        if (d?.map?.id) {
          setSelectedMapId(d.map.id);
          setView('map');
        }
        await reloadMaps(true);
      } catch (e) {
        alert(e?.message || 'Could not create map.');
      }
      setCreatingMap(false);
    } else if (dialog.mode === 'rename') {
      if (trimmed === dialog.initial) return;
      try {
        await updateNoteMap(dialog.mapId, { name: trimmed });
        await reloadMaps(true);
      } catch (e) { alert(e?.message || 'Rename failed.'); }
    }
  }

  async function handleDeleteMap(e, map) {
    e.stopPropagation();
    if (map.isDefault) { alert("Can't delete the default map."); return; }
    if (!confirm(`Delete the map "${map.name}"? Nodes and edges will be lost.`)) return;
    try {
      await deleteNoteMap(map.id);
      if (selectedMapId === map.id) setSelectedMapId(null);
      await reloadMaps(true);
    } catch (err) { alert(err?.message || 'Delete failed.'); }
  }

  function openMap(map) {
    setSelectedMapId(map.id);
    setView('map');
  }

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
      bust('notes:list');
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
          ? `Shape: {"title": "...", "mainNotes": "...", "cues": ["keyword 1", ...], "summary": "..."}. Write mainNotes as plain text only — no markdown, no asterisks, no hashes, no bullet dashes. Use line breaks and indentation for structure. Cues are 4-8 short keyword phrases. Summary is 2-3 plain sentences.`
          : `Shape: {"title": "...", "mainNotes": "..."}. Write mainNotes as plain text only — no markdown, no asterisks, no hashes, no bullet dashes. Use line breaks and indentation for structure.`
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
      bust('notes:list');
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
    bust('notes:list');
    if (selectedNoteId === id) { setView('list'); setSelectedNoteId(null); }
  }

  function openNote(id) {
    setSelectedNoteId(id);
    setView('editor');
  }

  if (view === 'editor' && selectedNoteId) {
    return (
      <ViewFade viewKey="editor" className="h-full flex flex-col">
        <NoteEditor noteId={selectedNoteId} onBack={() => {
          setView('list');
          // Force a refresh in case the body/title changed.
          bust('notes:list');
          fetchOnce('notes:list', listNotes).then(d => setNotes(d.notes || [])).catch(() => {});
        }} />
      </ViewFade>
    );
  }

  if (view === 'map') {
    const activeMap = maps.find(m => m.id === selectedMapId) || null;
    return (
      <ViewFade viewKey="map" className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <button
            onClick={() => setView('list')}
            className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors"
          >
            <ArrowLeft size={16} /> Notes
          </button>
          <div className="flex items-center gap-2 text-xs text-white/40">
            {activeMap && (
              <button
                onClick={() => handleRenameMap(activeMap)}
                className="hover:text-white/70 underline-offset-4 hover:underline"
                title="Rename map"
              >
                {activeMap.name}
              </button>
            )}
            {activeMap && activeMap.isDefault && (
              <span className="text-[10px] uppercase tracking-wider text-white/30 border border-white/10 rounded-full px-1.5 py-0.5">Default</span>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <NoteMap
            key={selectedMapId || 'default'}
            mapId={selectedMapId || undefined}
            onOpenNote={(noteId) => { setSelectedNoteId(noteId); setView('editor'); }}
          />
        </div>
      </ViewFade>
    );
  }

  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  return (
    <ViewFade viewKey="list">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-white/90">Notes</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowAI(true)}>
            <Wand2 size={14} /> AI
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> New</Button>
        </div>
      </div>

      {/* Maps section — merged from the standalone Note Map app. Each map
          is its own canvas; clicking opens the merged map view. */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
            <Network size={12} /> Maps
          </h3>
          <Button size="sm" variant="secondary" onClick={handleCreateMap} disabled={creatingMap || maps.length >= 20}>
            <Plus size={12} /> New map
          </Button>
        </div>
        {mapsLoading && maps.length === 0 ? (
          <div className="text-[11px] text-white/30 italic px-1">Loading maps…</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {maps.map(m => (
              <div
                key={m.id}
                onClick={() => openMap(m)}
                className="group flex items-center gap-2 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] rounded-2xl px-3 py-2.5 cursor-pointer transition-colors"
              >
                <span
                  className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${m.color}1F`, color: m.color }}
                >
                  <Network size={13} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium text-white/85 truncate">{m.name}</div>
                  <div className="text-[10.5px] text-white/40">
                    {m.nodeCount} node{m.nodeCount === 1 ? '' : 's'}
                    {m.isDefault ? ' · default' : ''}
                  </div>
                </div>
                {!m.isDefault && (
                  <button
                    onClick={(e) => handleDeleteMap(e, m)}
                    className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-rose-400 transition-opacity"
                    title="Delete map"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            {maps.length === 0 && !mapsLoading && (
              <div className="col-span-full text-[11px] text-white/30 italic px-1">
                No maps yet — click <span className="font-semibold text-white/55">New map</span> to start one.
              </div>
            )}
          </div>
        )}
      </div>

      <Modal open={showAI} onClose={() => { setShowAI(false); setAiError(null); }} title="Generate note with AI">
        <div className="space-y-3">
          {/* Source tabs */}
          <div>
            <label className="text-xs font-medium text-white/40 mb-1.5 block">Source</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAiSource('prompt')}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs transition-colors backdrop-blur-sm ${aiSource === 'prompt' ? 'border-blue-400/45 bg-blue-500/15 text-white' : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:bg-white/[0.05] hover:text-white/60'}`}
              >
                <Wand2 size={12} /> From prompt
              </button>
              <button
                onClick={() => setAiSource('curriculum')}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs transition-colors backdrop-blur-sm ${aiSource === 'curriculum' ? 'border-blue-400/45 bg-blue-500/15 text-white' : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:bg-white/[0.05] hover:text-white/60'}`}
              >
                <BookOpen size={12} /> From curriculum
              </button>
            </div>
          </div>

          {/* Note type */}
          <div>
            <label className="text-xs font-medium text-white/40 mb-1.5 block">Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setAiType('regular')} className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs transition-colors backdrop-blur-sm ${aiType === 'regular' ? 'border-blue-400/45 bg-blue-500/15 text-white' : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:bg-white/[0.05] hover:text-white/60'}`}>
                <FileText size={12} /> Regular
              </button>
              <button onClick={() => setAiType('cornell')} className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs transition-colors backdrop-blur-sm ${aiType === 'cornell' ? 'border-blue-400/45 bg-blue-500/15 text-white' : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:bg-white/[0.05] hover:text-white/60'}`}>
                <Layout size={12} /> Cornell
              </button>
            </div>
          </div>

          {/* Curriculum source picker */}
          {aiSource === 'curriculum' && (
            <>
              <div>
                <label className="text-xs font-medium text-white/40 mb-1.5 block">Curriculum</label>
                <select
                  value={selectedCurriculumId || ''}
                  onChange={e => setSelectedCurriculumId(e.target.value || null)}
                  className="w-full px-3 py-2 rounded-xl border border-white/[0.06] bg-white/[0.04] text-sm text-white/70 outline-none"
                >
                  <option value="">— Pick a curriculum —</option>
                  {curricula.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>

              {selectedCurriculumId && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-white/40">Lessons ({selectedLessonIds.length} selected)</label>
                    {curriculumDetail && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            const all = [];
                            for (const u of curriculumDetail.units || []) for (const l of u.lessons || []) all.push(l.id);
                            setSelectedLessonIds(all);
                          }}
                          className="text-[10px] text-white/40 hover:text-white/70 hover:underline"
                        >All</button>
                        <button
                          onClick={() => setSelectedLessonIds([])}
                          className="text-[10px] text-white/30 hover:text-white/50 hover:underline"
                        >None</button>
                      </div>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                    {curriculumLoading ? (
                      <div className="flex items-center justify-center py-6 text-xs text-white/30"><InlineProgress active /> Loading lessons…</div>
                    ) : !curriculumDetail ? (
                      <p className="text-[11px] text-white/25 italic p-2">Curriculum not found.</p>
                    ) : (
                      (curriculumDetail.units || []).map(u => (
                        <div key={u.id} className="mb-2 last:mb-0">
                          <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider px-1 mb-1">{u.title}</p>
                          {(u.lessons || []).map(l => {
                            const checked = selectedLessonIds.includes(l.id);
                            return (
                              <label key={l.id} className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-white/[0.04] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => setSelectedLessonIds(prev => checked ? prev.filter(id => id !== l.id) : [...prev, l.id])}
                                  className="w-3 h-3 accent-white"
                                />
                                <span className="text-xs text-white/60">{l.title}</span>
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
            <label className="text-xs font-medium text-white/40 mb-1.5 block">
              {aiSource === 'curriculum' ? 'Extra instructions (optional)' : 'Topic'}
            </label>
            <textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              rows={3}
              placeholder={aiSource === 'curriculum' ? 'Extra instructions…' : 'What should the note cover?'}
              className="w-full px-3 py-2 rounded-xl border border-white/[0.06] bg-white/[0.04] text-sm text-white/70 placeholder-white/20 outline-none resize-none"
            />
          </div>

          {aiError && <p className="text-xs text-rose-400">{aiError}</p>}
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

      <NameMapModal
        open={!!nameDialog}
        mode={nameDialog?.mode}
        initial={nameDialog?.initial}
        onClose={() => setNameDialog(null)}
        onSubmit={handleNameSubmit}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New note">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => handleCreate('regular')} className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/[0.14] transition-colors text-center backdrop-blur-sm">
            <FileText size={24} className="text-white/50" />
            <span className="text-sm font-medium text-white/70">Regular</span>
            <span className="text-xs text-white/30">Freeform</span>
          </button>
          <button onClick={() => handleCreate('cornell')} className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/[0.14] transition-colors text-center backdrop-blur-sm">
            <Layout size={24} className="text-white/50" />
            <span className="text-sm font-medium text-white/70">Cornell</span>
            <span className="text-xs text-white/30">Cues + summary</span>
          </button>
        </div>
      </Modal>

      {notes.length === 0 ? (
        <div className="text-center py-12">
          <FileText size={28} className="text-white/35 mx-auto mb-3" />
          <p className="text-sm text-white/55 mb-3">No notes yet</p>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> New note</Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {notes.map(note => (
            <div key={note.id} onClick={() => openNote(note.id)} className="flex items-center gap-3 bg-white/[0.03] rounded-2xl border border-white/[0.06] px-4 py-3 cursor-pointer hover:bg-white/[0.06] hover:border-white/[0.10] transition-colors group">
              <div className="w-8 h-8 rounded-xl bg-white/[0.07] flex items-center justify-center flex-shrink-0 text-white/45">
                {note.type === 'cornell' ? <Layout size={14} /> : <FileText size={14} />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-white/90 truncate">{note.title}</h3>
                <p className="text-xs text-white/55">{note.type === 'cornell' ? 'Cornell' : 'Note'} · {new Date(note.updatedAt || note.createdAt).toLocaleDateString()}</p>
              </div>
              <button onClick={e => handleDelete(e, note.id)} className="p-1 rounded text-white/20 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </ViewFade>
  );
}

// In-app rename / create dialog for note maps. Replaces the native
// `prompt()` (which shows the URL banner) with our own Modal so the
// flow feels like part of the app.
function NameMapModal({ open, mode, initial, onClose, onSubmit }) {
  const [name, setName] = useState(initial || '');
  // Reset the local input whenever the dialog opens with a different
  // seed (e.g. user opens rename after just opening create).
  useEffect(() => {
    if (open) setName(initial || '');
  }, [open, initial]);

  if (!open) return null;
  const title = mode === 'rename' ? 'Rename map' : 'Name this map';
  const confirmLabel = mode === 'rename' ? 'Rename' : 'Create';
  function submit(e) {
    e?.preventDefault?.();
    onSubmit(name.trim() || 'Untitled Map');
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onFocus={e => e.currentTarget.select()}
          placeholder="Untitled Map"
          className="w-full px-3.5 py-2.5 rounded-xl border border-white/[0.10] bg-white/[0.04] text-[14px] text-white/90 placeholder-white/30 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20"
        />
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm">{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}
