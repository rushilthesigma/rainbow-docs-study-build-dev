import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, FileText, Plus, Trash2, Pencil, Layout, Sparkles, Wand2, Loader2, BookOpen, Network, Folder, Layers, ChevronRight, Share2 } from 'lucide-react';
import { InlineProgress } from '../../shared/ProgressBar';
import { listNotes, createNote, deleteNote, getNote, updateNote, generateCues, generateSummary,
         listNoteMaps, createNoteMap, deleteNoteMap, updateNoteMap,
         listTopics, createTopic, updateTopic, deleteTopic, setNoteTopic, getNoteFlashcards } from '../../../api/notes';
import { apiFetch } from '../../../api/client';
import { listCurricula, getCurriculum } from '../../../api/curriculum';
import { peek, fetchOnce, bust, set } from '../../../api/cache';
import ViewFade from '../../shared/ViewFade';
import Button from '../../shared/Button';
import LoadingSpinner from '../../shared/LoadingSpinner';
import Modal from '../../shared/Modal';
import ShareDialog from '../../shared/ShareDialog';
import SharedWithMeView from '../../library/SharedWithMeView';
import useBrowserBack from '../../../hooks/useBrowserBack';
import NoteActions from '../../notes/NoteActions';
import NoteMap from '../../notes/NoteMap';
import MarkdownNoteEditor from '../../notes/MarkdownNoteEditor';
import NoteFlashcards from '../../notes/NoteFlashcards';
import { useToast } from '../../shared/Toast';

function NoteEditor({ noteId, onBack, topics = [], onTopicChanged, onOpenFlashcards }) {
  // Serve from cache so re-opens are instant; always background-refresh for freshness.
  const [note, setNote] = useState(() => peek(`note:${noteId}`)?.note || null);
  const [loading, setLoading] = useState(() => !peek(`note:${noteId}`));
  const [saving, setSaving] = useState(false);
  const [genCues, setGenCues] = useState(false);
  const [genSummary, setGenSummary] = useState(false);
  const [saveTimer, setSaveTimer] = useState(null);
  const [fc, setFc] = useState({ count: null, due: 0 });

  useEffect(() => {
    getNoteFlashcards(noteId).then(d => setFc({ count: (d.cards || []).length, due: d.due || 0 })).catch(() => {});
  }, [noteId]);

  async function handleTopicChange(value) {
    const tid = value || null;
    setNote(prev => (prev ? { ...prev, topicId: tid } : prev));
    try { await setNoteTopic(noteId, tid); } catch {}
    onTopicChanged?.();
  }

  useEffect(() => {
    let cancelled = false;
    getNote(noteId).then(d => {
      if (cancelled) return;
      setNote(d.note);
      set(`note:${noteId}`, d);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async (updates) => {
    setSaving(true);
    try {
      const d = await updateNote(noteId, updates);
      if (d?.note) { setNote(d.note); set(`note:${noteId}`, d); }
    } catch {}
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
      <div className="flex items-center justify-between mb-3 flex-shrink-0 gap-2">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors">
          <ArrowLeft size={16} /> Notes
        </button>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-white/40">
            <Folder size={13} />
            <select
              value={note.topicId || ''}
              onChange={e => handleTopicChange(e.target.value)}
              title="Topic"
              className="bg-white/[0.05] border border-white/[0.08] rounded-lg px-2 py-1 text-[11px] text-white/75 outline-none hover:bg-white/[0.08] focus:border-blue-400/40 cursor-pointer max-w-[150px]"
            >
              <option value="">No topic</option>
              {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <span className="text-xs text-white/25">{saving ? 'Saving...' : 'Auto-saved'}</span>
        </div>
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
          <div className="flex-1 min-h-0 grid grid-cols-[200px_1fr] border border-white/[0.08] rounded-lg overflow-hidden">
            <div className="border-r border-white/[0.07] p-3 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Cues</span>
                <button onClick={handleGenCues} disabled={genCues} className="text-white/40 hover:text-white/70 disabled:opacity-50 transition-colors"><Sparkles size={12} /></button>
              </div>
              {(note.cues || []).length > 0 ? (
                <div>
                  {note.cues.map((cue, i) => (
                    <p key={i} className="text-[11px] text-white/65 py-1 border-b border-white/[0.05] last:border-0 leading-snug">{cue}</p>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-white/25 italic">Write notes, then click sparkle to generate cues</p>
              )}
            </div>
            <MarkdownNoteEditor
              value={note.mainNotes}
              onChange={v => handleChange('mainNotes', v)}
              className="h-full"
              placeholder="Notes… markdown supported"
            />
          </div>
          <div className="border-t border-white/[0.08] pt-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Summary</span>
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
        <div className="flex-1 min-h-0 border border-white/[0.07] rounded-lg overflow-hidden">
          <MarkdownNoteEditor
            value={note.mainNotes}
            onChange={v => handleChange('mainNotes', v)}
            className="h-full"
            placeholder="Notes… markdown supported"
          />
        </div>
      )}

      <button
        onClick={() => onOpenFlashcards?.(noteId, note.title)}
        className="mt-3 flex-shrink-0 flex items-center gap-2 py-2 border-t border-white/[0.07] text-white/50 hover:text-white/80 transition-colors text-left w-full"
      >
        <Layers size={14} />
        <span className="text-[12px] font-semibold">Flashcards</span>
        {fc.count != null && (
          <span className="text-[11px] text-white/35">
            {fc.count}{fc.due > 0 && <span className="text-blue-300"> · {fc.due} due</span>}
          </span>
        )}
        <span className="flex-1" />
        <ChevronRight size={14} className="text-white/25" />
      </button>
    </div>
  );
}

export default function NotesApp({ initialNoteId = null, initialMapId = null, initialView = null, initialFlashcardsNoteId = null, initialFlashcardsTitle = null } = {}) {
  const toast = useToast();
  const startView = initialFlashcardsNoteId ? 'flashcards'
                    : initialNoteId ? 'editor'
                    : initialMapId ? 'map'
                    : initialView === 'map' ? 'map'
                    : 'list';
  const [view, setView] = useState(startView);
  useBrowserBack(view !== 'list', () => setView('list'));
  const cachedNotes = peek('notes:list');
  const cachedMaps = peek('notes:maps');
  const [notes, setNotes] = useState(() => cachedNotes?.notes || []);
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
  const [aiSource, setAiSource] = useState('prompt');
  const [curricula, setCurricula] = useState([]);
  const [selectedCurriculumId, setSelectedCurriculumId] = useState(null);
  const [curriculumDetail, setCurriculumDetail] = useState(null);
  const [selectedLessonIds, setSelectedLessonIds] = useState([]);
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState(initialNoteId || initialFlashcardsNoteId);
  const [nameDialog, setNameDialog] = useState(null);

  const cachedTopics = peek('notes:topics');
  const [topics, setTopics] = useState(() => cachedTopics?.topics || []);
  const [unfiled, setUnfiled] = useState(cachedTopics?.unfiled || 0);
  const [activeTopicId, setActiveTopicId] = useState(null);
  const [topicDialog, setTopicDialog] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [flashcardsNote, setFlashcardsNote] = useState(
    initialFlashcardsNoteId ? { id: initialFlashcardsNoteId, title: initialFlashcardsTitle || '' } : null,
  );

  useEffect(() => {
    fetchOnce('notes:list', listNotes)
      .then(d => { setNotes(d.notes || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const reloadMaps = useCallback((force = false) => {
    if (force) bust('notes:maps');
    setMapsLoading(!peek('notes:maps'));
    return fetchOnce('notes:maps', listNoteMaps)
      .then(d => {
        const list = d.maps || [];
        setMaps(list);
        if (!selectedMapId && list.length > 0) {
          const def = list.find(m => m.isDefault) || list[0];
          if (def) setSelectedMapId(def.id);
        }
      })
      .catch(() => {})
      .finally(() => setMapsLoading(false));
  }, [selectedMapId]);

  useEffect(() => { reloadMaps(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const reloadTopics = useCallback((force = false) => {
    if (force) bust('notes:topics');
    return fetchOnce('notes:topics', listTopics)
      .then(d => { setTopics(d.topics || []); setUnfiled(d.unfiled || 0); })
      .catch(() => {});
  }, []);
  useEffect(() => { reloadTopics(); }, [reloadTopics]);

  function refreshNotes() {
    bust('notes:list');
    fetchOnce('notes:list', listNotes).then(d => setNotes(d.notes || [])).catch(() => {});
  }

  function submitTopicDialog(name) {
    const n = (name || '').trim();
    const d = topicDialog;
    setTopicDialog(null);
    if (!n || !d) return;
    const p = d.mode === 'rename' && d.id ? updateTopic(d.id, { name: n }) : createTopic(n);
    p.then(() => reloadTopics(true)).catch(() => {});
  }

  function handleDeleteTopic(e, id) {
    e.stopPropagation();
    deleteTopic(id).then(() => {
      if (activeTopicId === id) setActiveTopicId(null);
      reloadTopics(true);
      refreshNotes();
    }).catch(() => {});
  }

  function handleCreateMap() {
    if (creatingMap) return;
    setNameDialog({ mode: 'create', initial: 'Untitled Map' });
  }

  function handleRenameMap(map) {
    setNameDialog({ mode: 'rename', initial: map.name, mapId: map.id });
  }

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
        toast.error(e?.message || 'Could not create map.');
      }
      setCreatingMap(false);
    } else if (dialog.mode === 'rename') {
      if (trimmed === dialog.initial) return;
      try {
        await updateNoteMap(dialog.mapId, { name: trimmed });
        await reloadMaps(true);
      } catch (e) { toast.error(e?.message || 'Rename failed.'); }
    }
  }

  async function handleDeleteMap(e, map) {
    e.stopPropagation();
    if (map.isDefault) { toast.error("Can't delete the default map."); return; }
    if (!confirm(`Delete the map "${map.name}"? Nodes and edges will be lost.`)) return;
    try {
      await deleteNoteMap(map.id);
      if (selectedMapId === map.id) setSelectedMapId(null);
      await reloadMaps(true);
    } catch (err) { toast.error(err?.message || 'Delete failed.'); }
  }

  function openMap(map) {
    setSelectedMapId(map.id);
    setView('map');
  }

  useEffect(() => {
    if (!showAI || aiSource !== 'curriculum' || curricula.length > 0) return;
    listCurricula()
      .then(d => setCurricula(d.curricula || d || []))
      .catch(() => {});
  }, [showAI, aiSource, curricula.length]);

  useEffect(() => {
    if (!selectedCurriculumId) { setCurriculumDetail(null); return; }
    setCurriculumLoading(true);
    getCurriculum(selectedCurriculumId)
      .then(d => {
        const curr = d.curriculum || d;
        setCurriculumDetail(curr);
        const allLessonIds = [];
        for (const u of (curr.units || [])) for (const l of (u.lessons || [])) allLessonIds.push(l.id);
        setSelectedLessonIds(allLessonIds);
      })
      .catch(() => setCurriculumDetail(null))
      .finally(() => setCurriculumLoading(false));
  }, [selectedCurriculumId]);

  async function handleCreate(type) {
    try {
      const seedTopic = activeTopicId && activeTopicId !== 'unfiled' ? activeTopicId : null;
      const data = await createNote('Untitled Note', type, seedTopic);
      setNotes(prev => [data.note, ...prev]);
      bust('notes:list');
      if (seedTopic) reloadTopics(true);
      setSelectedNoteId(data.note.id);
      setView('editor');
      setShowCreate(false);
    } catch {}
  }

  function buildAIUserMessage() {
    const isCornell = aiType === 'cornell';
    const header = `Create a ${isCornell ? 'Cornell' : 'regular'} study note.`;
    if (aiSource !== 'curriculum' || !curriculumDetail) {
      return `${header}\n\nTopic: ${aiPrompt.trim()}`;
    }
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

  async function handleGenerate() {
    const usingCurriculum = aiSource === 'curriculum' && selectedCurriculumId;
    if (!usingCurriculum && !aiPrompt.trim()) return;
    if (usingCurriculum && selectedLessonIds.length === 0) { setAiError('Pick at least one lesson.'); return; }
    if (aiBusy) return;
    setAiBusy(true); setAiError(null);
    try {
      const isCornell = aiType === 'cornell';
      const mdGuide = `Write "mainNotes" as rich GitHub-Flavored Markdown — it renders in the app, so actually USE the formatting:
- "# " / "## " / "### " headings to split the note into clearly labelled sections.
- "**bold**" for every key term and definition the first time it appears; *italics* for emphasis or nuance.
- "- " bullet lists for parallel points and "1. " numbered lists for ordered steps or processes.
- Markdown tables to compare or contrast (term vs. meaning, pros vs. cons, before vs. after).
- "> " blockquotes to set apart laws, theorems, or rules worth remembering.
- Inline \`code\` for symbols, notation, or commands; fenced \`\`\` blocks for multi-line code.
- KaTeX for ALL math: inline as $...$ and display as $$...$$. Never write ASCII math like x^2 — use $x^2$.`;
      const quality = `Quality bar: organized, dense, and genuinely useful to study from — never filler. Open with a one-line overview, then break the topic into sections. Define each key term, add a concrete example or worked problem where it helps, and flag common misconceptions or "gotchas". Aim for 250–600 words scaled to how broad the topic is.`;
      const system = `You are an expert study-note generator. Output ONLY valid JSON — a single object, no markdown code fences around the JSON, no prose before or after. ${
        isCornell
          ? `Shape: {"title": string, "mainNotes": string, "cues": string[], "summary": string}. "cues" are 4–8 short keyword phrases or recall questions for the Cornell left column. "summary" is a 2–3 sentence plain-prose wrap-up (no markdown).`
          : `Shape: {"title": string, "mainNotes": string}.`
      } ${mdGuide} ${quality}${
        usingCurriculum ? ' When LESSON MATERIAL is provided, base the note strictly on it: pull definitions, examples, formulas, and key points directly from the lessons, and do not invent facts the lessons don\'t support.' : ''
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
      const d = await updateNote(noteId, updates);
      // Seed cache so the editor opens instantly without a second fetch.
      if (d?.note) set(`note:${noteId}`, d);
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
        <NoteEditor
          noteId={selectedNoteId}
          topics={topics}
          onTopicChanged={() => { reloadTopics(true); bust('notes:list'); }}
          onOpenFlashcards={(id, title) => { setSelectedNoteId(id); setFlashcardsNote({ id, title }); setView('flashcards'); }}
          onBack={() => {
            setView('list');
            bust('notes:list');
            fetchOnce('notes:list', listNotes).then(d => setNotes(d.notes || [])).catch(() => {});
            reloadTopics(true);
          }}
        />
      </ViewFade>
    );
  }

  if (view === 'flashcards' && flashcardsNote) {
    return (
      <ViewFade viewKey="flashcards" className="h-full flex flex-col">
        <NoteFlashcards
          noteId={flashcardsNote.id}
          noteTitle={flashcardsNote.title}
          onBack={() => setView('editor')}
        />
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
                className="flex items-center gap-1 hover:text-white/70 underline-offset-4 hover:underline"
                title="Rename map"
              >
                {activeMap.name}
                <Pencil size={11} className="opacity-50" />
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

  const topicById = new Map(topics.map(t => [t.id, t]));
  const visibleNotes = activeTopicId == null ? notes
    : activeTopicId === 'unfiled' ? notes.filter(n => !n.topicId)
    : notes.filter(n => n.topicId === activeTopicId);

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

      {/* Maps */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 flex items-center gap-1.5">
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
                className="group flex items-center gap-2 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] rounded-lg px-3 py-2.5 cursor-pointer transition-colors"
              >
                <span
                  className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
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
                <button
                  onClick={(e) => { e.stopPropagation(); handleRenameMap(m); }}
                  className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-white/70 transition-opacity"
                  title="Rename map"
                >
                  <Pencil size={12} />
                </button>
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
                No maps yet - click <span className="font-semibold text-white/55">New map</span> to start one.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Topics */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 flex items-center gap-1.5">
            <Folder size={12} /> Topics
          </h3>
          <Button size="sm" variant="secondary" onClick={() => setTopicDialog({ mode: 'create', initial: '' })}>
            <Plus size={12} /> New topic
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveTopicId(null)}
            className={`text-[12px] px-2.5 py-1 rounded-lg border transition-colors ${activeTopicId === null ? 'bg-white/[0.10] border-white/20 text-white/90' : 'bg-white/[0.03] border-white/[0.06] text-white/55 hover:text-white/80 hover:bg-white/[0.06]'}`}
          >
            All <span className="text-white/35">{notes.length}</span>
          </button>
          {topics.map(t => (
            <div
              key={t.id}
              onClick={() => setActiveTopicId(t.id)}
              className={`group flex items-center gap-1.5 text-[12px] pl-2 pr-1.5 py-1 rounded-lg border cursor-pointer transition-colors ${activeTopicId === t.id ? 'bg-white/[0.10] border-white/20 text-white/90' : 'bg-white/[0.03] border-white/[0.06] text-white/65 hover:text-white/85 hover:bg-white/[0.06]'}`}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
              <span className="truncate max-w-[140px]">{t.name}</span>
              <span className="text-white/35">{t.noteCount}</span>
              <button onClick={(e) => { e.stopPropagation(); setTopicDialog({ mode: 'rename', id: t.id, initial: t.name }); }} className="ml-0.5 opacity-0 group-hover:opacity-100 text-white/25 hover:text-white/70 transition-opacity" title="Rename topic"><Pencil size={11} /></button>
              <button onClick={(e) => handleDeleteTopic(e, t.id)} className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-rose-400 transition-opacity" title="Delete topic"><Trash2 size={11} /></button>
            </div>
          ))}
          {unfiled > 0 && (
            <button
              onClick={() => setActiveTopicId('unfiled')}
              className={`text-[12px] px-2.5 py-1 rounded-lg border transition-colors ${activeTopicId === 'unfiled' ? 'bg-white/[0.10] border-white/20 text-white/90' : 'bg-white/[0.03] border-white/[0.06] text-white/55 hover:text-white/80 hover:bg-white/[0.06]'}`}
            >
              Unfiled <span className="text-white/35">{unfiled}</span>
            </button>
          )}
          {topics.length === 0 && (
            <span className="text-[11px] text-white/30 italic px-1 py-1">No topics yet — make one to group your notes.</span>
          )}
        </div>
      </div>

      <Modal open={showAI} onClose={() => { setShowAI(false); setAiError(null); }} title="Generate note with AI">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-white/40 mb-1.5 block">Source</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAiSource('prompt')}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs transition-colors ${aiSource === 'prompt' ? 'border-blue-400/45 bg-blue-500/15 text-white' : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:bg-white/[0.05] hover:text-white/60'}`}
              >
                <Wand2 size={12} /> From prompt
              </button>
              <button
                onClick={() => setAiSource('curriculum')}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs transition-colors ${aiSource === 'curriculum' ? 'border-blue-400/45 bg-blue-500/15 text-white' : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:bg-white/[0.05] hover:text-white/60'}`}
              >
                <BookOpen size={12} /> From curriculum
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-white/40 mb-1.5 block">Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setAiType('regular')} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs transition-colors ${aiType === 'regular' ? 'border-blue-400/45 bg-blue-500/15 text-white' : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:bg-white/[0.05] hover:text-white/60'}`}>
                <FileText size={12} /> Regular
              </button>
              <button onClick={() => setAiType('cornell')} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs transition-colors ${aiType === 'cornell' ? 'border-blue-400/45 bg-blue-500/15 text-white' : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:bg-white/[0.05] hover:text-white/60'}`}>
                <Layout size={12} /> Cornell
              </button>
            </div>
          </div>

          {aiSource === 'curriculum' && (
            <>
              <div>
                <label className="text-xs font-medium text-white/40 mb-1.5 block">Curriculum</label>
                <select
                  value={selectedCurriculumId || ''}
                  onChange={e => setSelectedCurriculumId(e.target.value || null)}
                  className="w-full px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.04] text-sm text-white/70 outline-none"
                >
                  <option value="">- Pick a curriculum -</option>
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
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
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
                              <label key={l.id} className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-white/[0.04] cursor-pointer">
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
              className="w-full px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.04] text-sm text-white/70 placeholder-white/20 outline-none resize-none"
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
          <button onClick={() => handleCreate('regular')} className="flex flex-col items-center gap-2 p-5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.14] transition-colors text-center">
            <FileText size={24} className="text-white/50" />
            <span className="text-sm font-medium text-white/70">Regular</span>
            <span className="text-xs text-white/30">Freeform</span>
          </button>
          <button onClick={() => handleCreate('cornell')} className="flex flex-col items-center gap-2 p-5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.14] transition-colors text-center">
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
      ) : visibleNotes.length === 0 ? (
        <div className="text-center py-10 text-[12px] text-white/35">No notes in this topic yet.</div>
      ) : (
        <div>
          {visibleNotes.map(note => {
            const topic = note.topicId ? topicById.get(note.topicId) : null;
            return (
            <div key={note.id} onClick={() => openNote(note.id)} className="flex items-center gap-3 px-2 py-2.5 border-b border-white/[0.06] last:border-b-0 cursor-pointer hover:bg-white/[0.03] rounded-md transition-colors group">
              {note.type === 'cornell' ? <Layout size={13} className="text-white/35 flex-shrink-0" /> : <FileText size={13} className="text-white/35 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-white/90 truncate">{note.title}</h3>
                <p className="text-xs text-white/55">{note.type === 'cornell' ? 'Cornell' : 'Note'} · {new Date(note.updatedAt || note.createdAt).toLocaleDateString()}</p>
              </div>
              {topic && (
                <span className="flex items-center gap-1 text-[10.5px] text-white/50 flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: topic.color }} />
                  <span className="truncate max-w-[90px]">{topic.name}</span>
                </span>
              )}
              <button onClick={e => { e.stopPropagation(); setShareTarget({ id: note.id, type: 'note', title: note.title }); }} className="p-1 rounded text-white/20 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition-all" title="Share"><Share2 size={13} /></button>
              <button onClick={e => handleDelete(e, note.id)} className="p-1 rounded text-white/20 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={13} /></button>
            </div>
            );
          })}
        </div>
      )}

      <SharedWithMeView className="mt-8" />

      {shareTarget && (
        <ShareDialog item={shareTarget} onClose={() => setShareTarget(null)} />
      )}

      {topicDialog && (
        <Modal open onClose={() => setTopicDialog(null)} title={topicDialog.mode === 'rename' ? 'Rename topic' : 'New topic'} size="sm">
          <form onSubmit={(e) => { e.preventDefault(); submitTopicDialog(e.target.elements.tname.value); }} className="flex flex-col gap-4">
            <input
              autoFocus
              name="tname"
              defaultValue={topicDialog.initial || ''}
              onFocus={e => e.currentTarget.select()}
              placeholder="e.g. Biology, Exam 2, Chapter 3"
              className="w-full px-3.5 py-2.5 rounded-lg border border-white/[0.10] bg-white/[0.04] text-[14px] text-white/90 placeholder-white/30 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setTopicDialog(null)}>Cancel</Button>
              <Button type="submit" size="sm">{topicDialog.mode === 'rename' ? 'Rename' : 'Create'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </ViewFade>
  );
}

function NameMapModal({ open, mode, initial, onClose, onSubmit }) {
  const [name, setName] = useState(initial || '');
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
          className="w-full px-3.5 py-2.5 rounded-lg border border-white/[0.10] bg-white/[0.04] text-[14px] text-white/90 placeholder-white/30 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20"
        />
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm">{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}
