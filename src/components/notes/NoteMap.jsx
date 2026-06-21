import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sparkles, Plus, Trash2, RotateCw, Wand2, Link2, X, FileText, Lightbulb, Pencil, ArrowLeft, Focus, StickyNote, Loader2, Brain, Layers, Share2 } from 'lucide-react';
import {
  listNotes,
  getNoteGraph, saveNoteGraph,
  getNoteMap, updateNoteMap,
  createNote, updateNote, getNote,
  getMapSrs, generateNodeFlashcards,
} from '../../api/notes';
import { apiFetch } from '../../api/client';
import Button from '../shared/Button';
import LoadingSpinner from '../shared/LoadingSpinner';
import NoteMapReview from './NoteMapReview';
import ShareDialog from '../shared/ShareDialog';

// Obsidian-style note map. Each existing note becomes a graph node; the
// user can drag nodes, link them with edges, add free-form topic nodes,
// and ask the AI to suggest new related nodes. Layout is interactive
// (drag) with a light spring-relax pass on each tick so the graph
// settles after AI inserts. Positions persist server-side.

const NODE_PALETTE = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#fb7185', '#c084fc'];

function randPaletteColor() {
  return NODE_PALETTE[Math.floor(Math.random() * NODE_PALETTE.length)];
}

// Cheap UUID - we don't need cryptographic randomness here, just unique
// ids the server can accept.
function newId() {
  return `n_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

// Tiny force-directed relaxation step. Keeps the graph from piling onto
// (0,0) after an AI insert without needing a full d3-force dependency.
function relaxOnce(nodes, edges, fixedSet) {
  if (nodes.length === 0) return nodes;
  const next = nodes.map(n => ({ ...n, fx: 0, fy: 0 }));
  const byId = new Map(next.map(n => [n.id, n]));

  // Repulsion between every pair.
  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const a = next[i], b = next[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = (Math.random() - 0.5) * 0.5; dy = (Math.random() - 0.5) * 0.5; d2 = 0.5; }
      const d = Math.sqrt(d2);
      const force = 9000 / d2;
      a.fx += (dx / d) * force;
      a.fy += (dy / d) * force;
      b.fx -= (dx / d) * force;
      b.fy -= (dy / d) * force;
    }
  }
  // Spring along edges.
  const targetLen = 130;
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const force = (d - targetLen) * 0.05;
    a.fx += (dx / d) * force;
    a.fy += (dy / d) * force;
    b.fx -= (dx / d) * force;
    b.fy -= (dy / d) * force;
  }
  // Soft pull toward origin so the graph stays centered.
  for (const n of next) {
    n.fx -= n.x * 0.015;
    n.fy -= n.y * 0.015;
  }
  // Apply.
  for (const n of next) {
    if (fixedSet.has(n.id)) continue;
    n.x += Math.max(-30, Math.min(30, n.fx));
    n.y += Math.max(-30, Math.min(30, n.fy));
  }
  return next.map(({ fx, fy, ...rest }) => rest);
}

function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export default function NoteMap({ onOpenNote, mapId, mapName }) {
  // When a mapId is supplied, every read/write is scoped to that map.
  // Without a mapId we fall back to the legacy single-graph endpoints,
  // which now alias to the default map server-side.
  const loadGraph = mapId
    ? () => getNoteMap(mapId).then(d => ({ graph: d.map ? { nodes: d.map.nodes, edges: d.map.edges } : { nodes: [], edges: [] } }))
    : () => getNoteGraph();
  const saveGraph = mapId
    ? (nodes, edges) => updateNoteMap(mapId, { nodes, edges })
    : (nodes, edges) => saveNoteGraph(nodes, edges);

  // SRS endpoints are keyed by map id; the legacy default-map call-site
  // passes no mapId, so fall back to the well-known 'default' map.
  const srsMapId = mapId || 'default';

  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [linkingFrom, setLinkingFrom] = useState(null);
  const [renaming, setRenaming] = useState(null); // { id, value }
  const [saving, setSaving] = useState(false);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: 480 });
  // Drill-in mode: when set, hide all unrelated nodes and pin the focused
  // node in the center with neighbors arranged around it.
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [creatingNoteFromId, setCreatingNoteFromId] = useState(null);
  // AI note-generation modal. Lives next to the "Topic" / "Note" buttons
  // - student types a topic, AI drafts title + body, we create the note,
  // drop a node on the canvas, and seed an edge from the focused node
  // (if any) just like createNewNoteOnMap does.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState(null);
  // Inline note editor state - loaded when the selected node is a real
  // note. Lets the user write into the note without leaving the map.
  const [activeNote, setActiveNote] = useState(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  // "Pull from notes" picker. Maps no longer auto-mirror every note -
  // the user explicitly picks which notes to add to the current map.
  const [pullOpen, setPullOpen] = useState(false);
  const [pullNotes, setPullNotes] = useState([]);
  const [pullLoading, setPullLoading] = useState(false);
  const [pullSelected, setPullSelected] = useState(() => new Set());
  const [pullQuery, setPullQuery] = useState('');
  // Spaced-repetition state. `srs` holds the review queue + per-node card
  // counts; `reviewOpen` toggles the review modal; `genNodeId` tracks an
  // in-flight per-node flashcard generation.
  const [srs, setSrs] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [genNodeId, setGenNodeId] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);

  const svgRef = useRef(null);
  const draggingRef = useRef(null);
  const saveTimerRef = useRef(null);
  const panRef = useRef(null);
  const noteSaveTimerRef = useRef(null);

  // Track the SVG's actual pixel size so we can center the graph in
  // pixels (SVG transforms don't accept % values on <g>). Watches the
  // SVG itself, its parent, AND window resize - needed because the
  // desktop window-manager swaps fullscreen via CSS, which sometimes
  // doesn't trip a ResizeObserver on the SVG node before the next
  // paint. The window-resize listener catches both browser fullscreen
  // and zoom-to-fill ("maximized") transitions.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setCanvasSize(prev => (prev.w === rect.width && prev.h === rect.height)
          ? prev
          : { w: rect.width, h: rect.height });
      }
    };
    measure();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
      if (el.parentElement) ro.observe(el.parentElement);
    }
    window.addEventListener('resize', measure);
    document.addEventListener('fullscreenchange', measure);
    document.addEventListener('webkitfullscreenchange', measure);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measure);
      document.removeEventListener('fullscreenchange', measure);
      document.removeEventListener('webkitfullscreenchange', measure);
    };
  }, []);

  // Load graph on mount (or whenever the bound map changes).
  useEffect(() => {
    setLoading(true);
    loadGraph()
      .then(d => {
        const g = d.graph || { nodes: [], edges: [] };
        setNodes(g.nodes || []);
        setEdges(g.edges || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]);

  // Load the SRS summary (due counts + per-node card counts). Drives the
  // "Review" badge and the side-panel flashcards strip; refreshed after a
  // review session or generating cards.
  const loadSrs = useCallback(() => {
    getMapSrs(srsMapId).then(setSrs).catch(() => {});
  }, [srsMapId]);

  useEffect(() => { loadSrs(); }, [loadSrs]);

  // Debounced auto-save. Fires 800ms after the last change so dragging
  // doesn't hammer the server.
  useEffect(() => {
    if (loading) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try { await saveGraph(nodes, edges); } catch {}
      setSaving(false);
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [nodes, edges, loading]);

  // Helpers ----------------------------------------------------------------

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedId) || null, [nodes, selectedId]);
  const adjacency = useMemo(() => {
    const m = new Map();
    for (const e of edges) {
      if (!m.has(e.from)) m.set(e.from, new Set());
      if (!m.has(e.to)) m.set(e.to, new Set());
      m.get(e.from).add(e.to);
      m.get(e.to).add(e.from);
    }
    return m;
  }, [edges]);

  const focusedNode = useMemo(() => nodes.find(n => n.id === focusedNodeId) || null, [nodes, focusedNodeId]);

  // In focus mode, override positions: the focused node sits at the
  // origin and its neighbors arrange themselves in a clean ring. This is
  // purely a render-time override - node.x / node.y are untouched so
  // exiting focus returns to the original layout.
  const renderPositions = useMemo(() => {
    const map = new Map();
    if (!focusedNodeId || !focusedNode) {
      for (const n of nodes) map.set(n.id, { x: n.x, y: n.y });
      return map;
    }
    map.set(focusedNodeId, { x: 0, y: 0 });
    const neighborIds = Array.from(adjacency.get(focusedNodeId) || []);
    const r = Math.max(110, 70 + neighborIds.length * 10);
    neighborIds.forEach((id, i) => {
      const angle = (i / Math.max(1, neighborIds.length)) * Math.PI * 2 - Math.PI / 2;
      map.set(id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    });
    return map;
  }, [focusedNodeId, focusedNode, nodes, adjacency]);

  const visibleIds = useMemo(() => {
    if (!focusedNodeId) return null; // null = "all visible"
    const s = new Set([focusedNodeId]);
    for (const id of adjacency.get(focusedNodeId) || []) s.add(id);
    return s;
  }, [focusedNodeId, adjacency]);

  const visibleNodes = useMemo(() => {
    if (!visibleIds) return nodes;
    return nodes.filter(n => visibleIds.has(n.id));
  }, [nodes, visibleIds]);

  const visibleEdges = useMemo(() => {
    if (!visibleIds) return edges;
    return edges.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to));
  }, [edges, visibleIds]);

  // Convert screen px to graph-space coords using current viewport.
  const screenToGraph = useCallback((screenX, screenY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    return {
      x: (screenX - rect.left - cx - viewport.x) / viewport.scale,
      y: (screenY - rect.top - cy - viewport.y) / viewport.scale,
    };
  }, [viewport]);

  // Mouse handlers ---------------------------------------------------------

  function handleNodeMouseDown(e, node) {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (linkingFrom) {
      if (linkingFrom !== node.id) {
        addEdge(linkingFrom, node.id);
      }
      setLinkingFrom(null);
      return;
    }
    // In focus mode positions are derived - dragging would silently
    // mutate node.x/y without any visible change. Just select instead.
    if (focusedNodeId) {
      setSelectedId(node.id);
      return;
    }
    const start = screenToGraph(e.clientX, e.clientY);
    draggingRef.current = {
      id: node.id,
      offsetX: node.x - start.x,
      offsetY: node.y - start.y,
      moved: false,
    };
    setSelectedId(node.id);
  }

  function handleMouseMove(e) {
    const drag = draggingRef.current;
    if (drag) {
      const p = screenToGraph(e.clientX, e.clientY);
      drag.moved = true;
      setNodes(prev => prev.map(n => n.id === drag.id ? { ...n, x: p.x + drag.offsetX, y: p.y + drag.offsetY } : n));
      return;
    }
    const pan = panRef.current;
    if (pan) {
      setViewport(v => ({ ...v, x: pan.startVX + (e.clientX - pan.startX), y: pan.startVY + (e.clientY - pan.startY) }));
    }
  }

  function handleMouseUp() {
    draggingRef.current = null;
    panRef.current = null;
  }

  function handleSvgMouseDown(e) {
    if (e.button !== 0) return;
    if (linkingFrom) { setLinkingFrom(null); return; }
    panRef.current = { startX: e.clientX, startY: e.clientY, startVX: viewport.x, startVY: viewport.y };
    setSelectedId(null);
  }

  function handleWheel(e) {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setViewport(v => ({ ...v, scale: Math.max(0.3, Math.min(2.5, v.scale * (1 + delta))) }));
  }

  // Graph mutations --------------------------------------------------------

  function addEdge(fromId, toId) {
    const key = edgeKey(fromId, toId);
    setEdges(prev => prev.some(e => edgeKey(e.from, e.to) === key) ? prev : [...prev, { from: fromId, to: toId, label: '' }]);
  }

  function removeEdge(fromId, toId) {
    const key = edgeKey(fromId, toId);
    setEdges(prev => prev.filter(e => edgeKey(e.from, e.to) !== key));
  }

  // Open the picker. Loads the user's notes and excludes any already on
  // the current map so the list shows only candidates worth pulling in.
  async function openPullNotes() {
    setAiOpen(false);
    setPullOpen(true);
    setPullSelected(new Set());
    setPullQuery('');
    setPullLoading(true);
    try {
      const d = await listNotes();
      const taken = new Set(nodes.filter(n => n.source === 'note').map(n => n.noteId));
      const list = (d.notes || []).filter(n => !taken.has(n.id));
      setPullNotes(list);
    } catch (e) {
      setPullNotes([]);
    }
    setPullLoading(false);
  }

  function togglePullNote(id) {
    setPullSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function confirmPullNotes() {
    if (pullSelected.size === 0) { setPullOpen(false); return; }
    const byId = new Map(pullNotes.map(n => [n.id, n]));
    const startIdx = nodes.length;
    const newNodes = [];
    let i = 0;
    for (const noteId of pullSelected) {
      const note = byId.get(noteId);
      if (!note) continue;
      // Soft spiral around (0,0) so they don't pile up; the auto-relax
      // pass spreads them further when the canvas first opens.
      const angle = (startIdx + i) * 0.9;
      const radius = 90 + (startIdx + i) * 28;
      newNodes.push({
        id: newId(),
        noteId: note.id,
        label: note.title || 'Untitled Note',
        source: 'note',
        color: NODE_PALETTE[(startIdx + i) % NODE_PALETTE.length],
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
      i += 1;
    }
    if (newNodes.length) setNodes(prev => [...prev, ...newNodes]);
    setPullOpen(false);
    setPullSelected(new Set());
  }

  function deleteNode(id) {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.from !== id && e.to !== id));
    if (selectedId === id) setSelectedId(null);
    if (linkingFrom === id) setLinkingFrom(null);
  }

  function renameNode(id, label) {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, label } : n));
  }

  function relaxLayout() {
    // Run a handful of relax steps so the layout settles immediately rather
    // than after dragging.
    setNodes(prev => {
      let out = prev;
      const fixed = new Set();
      for (let i = 0; i < 40; i++) out = relaxOnce(out, edges, fixed);
      return out;
    });
  }

  // Convert a topic / AI node into a real saved note. The graph node
  // keeps its id and position, but flips source='note' and gets wired
  // to the backing note via noteId. The note body is pre-seeded with
  // the rationale (if it came from an AI suggestion).
  async function makeNoteFromNode(node, seedBody = '') {
    if (!node || node.source === 'note' || creatingNoteFromId) return;
    setCreatingNoteFromId(node.id);
    try {
      const created = await createNote(node.label || 'Untitled Note', 'regular');
      const newNote = created.note;
      if (seedBody && seedBody.trim()) {
        try { await updateNote(newNote.id, { mainNotes: seedBody.trim() }); } catch {}
      }
      setNodes(prev => prev.map(n => n.id === node.id ? { ...n, source: 'note', noteId: newNote.id, label: newNote.title } : n));
    } catch (e) {
      console.error('Failed to make note', e);
    }
    setCreatingNoteFromId(null);
  }

  // Create a new note from scratch and drop a fresh node onto the map
  // (positioned near the focused node when drilled in, otherwise near
  // origin). The auto-save effect then persists the node.
  async function createNewNoteOnMap() {
    if (creatingNoteFromId === '__new__') return;
    setCreatingNoteFromId('__new__');
    try {
      const created = await createNote('Untitled Note', 'regular');
      const newNote = created.note;
      const anchor = focusedNode || null;
      const baseX = anchor ? anchor.x : 0;
      const baseY = anchor ? anchor.y : 0;
      const node = {
        id: `note_${newNote.id}`,
        noteId: newNote.id,
        label: newNote.title,
        source: 'note',
        color: randPaletteColor(),
        x: baseX + (Math.random() - 0.5) * 140,
        y: baseY + (Math.random() - 0.5) * 140,
      };
      setNodes(prev => [...prev, node]);
      if (anchor) {
        setEdges(prev => {
          const k = edgeKey(anchor.id, node.id);
          if (prev.some(e => edgeKey(e.from, e.to) === k)) return prev;
          return [...prev, { from: anchor.id, to: node.id, label: '' }];
        });
      }
      setSelectedId(node.id);
    } catch (e) {
      console.error('Failed to create note', e);
    }
    setCreatingNoteFromId(null);
  }

  // Ask the AI to draft a note for a given topic, then drop it on the
  // map (same anchor logic as createNewNoteOnMap - if the user has
  // drilled in, the new node is wired up to the focused one).
  async function generateNoteWithAI() {
    const topic = aiTopic.trim();
    if (!topic || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const system = `You are a study-note generator. Output ONLY valid JSON, no markdown fences, no prose. Shape: {"title": "...", "mainNotes": "..."}. Write mainNotes as plain text only - no markdown, no asterisks, no hashes, no bullet dashes. Use line breaks and indentation for structure. The note should be organized, dense, and useful for studying - not a paragraph of fluff.`;
      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          system,
          messages: [{ role: 'user', content: `Create a regular study note.\n\nTopic: ${topic}` }],
          max_tokens: 3000,
        }),
      });
      const text = result.content?.[0]?.text || '';
      let parsed = null;
      try { parsed = JSON.parse(text); } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
      }
      if (!parsed?.title) throw new Error('AI did not return a usable note.');

      const created = await createNote(parsed.title, 'regular');
      const newNote = created.note;
      if (parsed.mainNotes) {
        try { await updateNote(newNote.id, { mainNotes: parsed.mainNotes }); } catch {}
      }

      const anchor = focusedNode || null;
      const baseX = anchor ? anchor.x : 0;
      const baseY = anchor ? anchor.y : 0;
      const node = {
        id: `note_${newNote.id}`,
        noteId: newNote.id,
        label: newNote.title,
        source: 'note',
        color: randPaletteColor(),
        x: baseX + (Math.random() - 0.5) * 140,
        y: baseY + (Math.random() - 0.5) * 140,
      };
      setNodes(prev => [...prev, node]);
      if (anchor) {
        setEdges(prev => {
          const k = edgeKey(anchor.id, node.id);
          if (prev.some(e => edgeKey(e.from, e.to) === k)) return prev;
          return [...prev, { from: anchor.id, to: node.id, label: '' }];
        });
      }
      setSelectedId(node.id);
      setAiOpen(false);
      setAiTopic('');
    } catch (e) {
      setAiError(e?.message || 'Could not generate a note.');
    } finally {
      setAiBusy(false);
    }
  }

  // Inline note editor: when the selected node is a real note, fetch
  // its content and let the user edit title + body right in the side
  // panel. Saves are debounced - same pattern as NoteEditorPage.
  useEffect(() => {
    if (noteSaveTimerRef.current) { clearTimeout(noteSaveTimerRef.current); noteSaveTimerRef.current = null; }
    if (!selectedNode || selectedNode.source !== 'note' || !selectedNode.noteId) {
      setActiveNote(null);
      return;
    }
    setNoteLoading(true);
    let cancelled = false;
    getNote(selectedNode.noteId)
      .then(d => {
        if (cancelled) return;
        setActiveNote({
          id: selectedNode.noteId,
          title: d.note?.title || '',
          mainNotes: d.note?.mainNotes || '',
        });
      })
      .catch(() => { if (!cancelled) setActiveNote(null); })
      .finally(() => { if (!cancelled) setNoteLoading(false); });
    return () => { cancelled = true; };
  }, [selectedNode?.id, selectedNode?.source, selectedNode?.noteId]);

  function handleNoteFieldChange(field, value) {
    if (!activeNote) return;
    const next = { ...activeNote, [field]: value };
    setActiveNote(next);
    // Mirror title changes onto the graph node so the canvas label
    // tracks the rename in real time.
    if (field === 'title') {
      setNodes(prev => prev.map(n => n.noteId === activeNote.id ? { ...n, label: value || 'Untitled Note' } : n));
    }
    if (noteSaveTimerRef.current) clearTimeout(noteSaveTimerRef.current);
    noteSaveTimerRef.current = setTimeout(async () => {
      setNoteSaving(true);
      try { await updateNote(activeNote.id, { [field]: value }); } catch {}
      setNoteSaving(false);
    }, 800);
  }

  // Generate spaced-repetition flashcards for a single node. Persists the
  // graph first so a freshly-added node exists server-side before we ask the
  // AI for cards, then refreshes the SRS summary.
  async function generateCardsForNode(node) {
    if (!node || genNodeId) return;
    setGenNodeId(node.id);
    try {
      try { await saveGraph(nodes, edges); } catch {}
      await generateNodeFlashcards(srsMapId, node.id, {});
      loadSrs();
    } catch (e) {
      console.error('Failed to generate flashcards', e);
    }
    setGenNodeId(null);
  }

  const dueCount = srs?.summary?.due || 0;
  const nodeStats = selectedNode ? srs?.byNode?.[selectedNode.id] : null;

  // Render -----------------------------------------------------------------

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {focusedNode && (
            <button
              onClick={() => setFocusedNodeId(null)}
              className="flex items-center gap-1 text-[11px] text-white/55 hover:text-white/90 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors flex-shrink-0"
            >
              <ArrowLeft size={11} /> Map
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold text-white/90 truncate">
              {focusedNode ? focusedNode.label : 'Note Map'}
            </h2>
            <p className="text-[11px] text-white/35">
              {focusedNode
                ? <>Focus · {visibleNodes.length - 1} related · {visibleEdges.length} link{visibleEdges.length !== 1 ? 's' : ''}</>
                : <>{nodes.length} node{nodes.length !== 1 ? 's' : ''} · {edges.length} link{edges.length !== 1 ? 's' : ''}</>}
              {saving && <span className="ml-2 text-white/25">saving…</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant={dueCount > 0 ? 'secondary' : 'ghost'} onClick={() => setReviewOpen(true)}>
            <Brain size={13} /> Review
            {dueCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/15 text-white/80 text-[10px] font-semibold leading-none">{dueCount}</span>
            )}
          </Button>
          <Button size="sm" variant={pullOpen ? 'secondary' : 'ghost'} onClick={openPullNotes}>
            <FileText size={13} /> Pull from notes
          </Button>
          <Button size="sm" variant="ghost" onClick={createNewNoteOnMap} disabled={creatingNoteFromId === '__new__'}>
            <StickyNote size={13} /> {creatingNoteFromId === '__new__' ? 'Adding…' : 'Note'}
          </Button>
          <Button size="sm" variant={aiOpen ? 'secondary' : 'ghost'} onClick={() => { setAiError(null); setPullOpen(false); setAiOpen(true); }}>
            <Wand2 size={13} /> AI
          </Button>
          {!focusedNode && <Button size="sm" variant="ghost" onClick={relaxLayout}><RotateCw size={13} /> Relax</Button>}
        </div>
      </div>

      <div className="relative flex flex-1 min-h-0 gap-3">
        {/* Canvas */}
        <div className="flex-1 min-w-0 relative bg-white/[0.02] rounded-2xl border border-white/[0.07] overflow-hidden">
          <svg
            ref={svgRef}
            className="w-full h-full cursor-grab active:cursor-grabbing select-none"
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            style={{ minHeight: '420px' }}
          >
            <defs>
              <radialGradient id="nm-node-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g
              transform={`translate(${canvasSize.w / 2 + viewport.x}, ${canvasSize.h / 2 + viewport.y}) scale(${viewport.scale})`}
            >
              {/* Edges */}
              {visibleEdges.map(e => {
                const a = renderPositions.get(e.from);
                const b = renderPositions.get(e.to);
                if (!a || !b) return null;
                const isHi = selectedId && (e.from === selectedId || e.to === selectedId);
                return (
                  <line
                    key={`${e.from}-${e.to}`}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={isHi ? 'rgba(96,165,250,0.85)' : 'rgba(255,255,255,0.18)'}
                    strokeWidth={isHi ? 1.6 : 1}
                  />
                );
              })}

              {/* In-progress link line */}
              {linkingFrom && (() => {
                const a = renderPositions.get(linkingFrom);
                if (!a) return null;
                return (
                  <circle cx={a.x} cy={a.y} r="22" fill="none" stroke="rgba(96,165,250,0.6)" strokeDasharray="3 3" />
                );
              })()}

              {/* Nodes */}
              {visibleNodes.map(node => {
                const pos = renderPositions.get(node.id) || { x: node.x, y: node.y };
                const isSelected = node.id === selectedId;
                const isFocused = node.id === focusedNodeId;
                const isLinkSource = node.id === linkingFrom;
                const isNeighbor = selectedId && adjacency.get(selectedId)?.has(node.id);
                const dimmed = !focusedNodeId && selectedId && !isSelected && !isNeighbor;
                // Smaller radii in focus mode - the satellites should
                // read as supporting nodes around the centered topic.
                const baseR = node.source === 'note' ? 16 : 13;
                const focusR = isFocused ? 14 : 9;
                const r = focusedNodeId ? focusR : baseR;
                const fontSize = focusedNodeId && !isFocused ? 10 : 11;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onMouseDown={e => handleNodeMouseDown(e, node)}
                    onDoubleClick={e => {
                      e.stopPropagation();
                      if (node.source === 'note' && node.noteId && onOpenNote) onOpenNote(node.noteId);
                      else if (focusedNodeId) setFocusedNodeId(node.id);
                      else setFocusedNodeId(node.id);
                    }}
                    style={{ cursor: 'pointer', opacity: dimmed ? 0.35 : 1 }}
                  >
                    {(isSelected || isFocused) && <circle r={r + 8} fill="url(#nm-node-glow)" />}
                    <circle
                      r={r}
                      fill={node.color || '#60a5fa'}
                      stroke={isSelected || isLinkSource || isFocused ? '#ffffff' : 'rgba(255,255,255,0.25)'}
                      strokeWidth={isSelected || isLinkSource || isFocused ? 2 : 1}
                    />
                    {node.source === 'ai' && (
                      <circle r={r + 3} fill="none" stroke="rgba(167,139,250,0.6)" strokeDasharray="2 2" />
                    )}
                    <text
                      y={r + (focusedNodeId && !isFocused ? 11 : 14)}
                      textAnchor="middle"
                      fontSize={fontSize}
                      fill="rgba(255,255,255,0.85)"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {node.label.length > 24 ? node.label.slice(0, 22) + '…' : node.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Floating canvas hint */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-white/35 max-w-xs">
                <Lightbulb size={20} className="mx-auto mb-2 text-white/30" />
                <p className="text-xs mb-1">Your map is empty.</p>
                <p className="text-[11px]">Create a note or add a topic, then ask the AI for related ideas.</p>
              </div>
            </div>
          )}

          {/* Floating rename input */}
          {renaming && (() => {
            const n = nodes.find(nn => nn.id === renaming.id);
            if (!n) return null;
            const svg = svgRef.current;
            const rect = svg?.getBoundingClientRect();
            if (!rect) return null;
            const screenX = rect.width / 2 + viewport.x + n.x * viewport.scale;
            const screenY = rect.height / 2 + viewport.y + n.y * viewport.scale;
            return (
              <input
                autoFocus
                value={renaming.value}
                onChange={e => setRenaming({ ...renaming, value: e.target.value })}
                onBlur={() => { renameNode(renaming.id, renaming.value.trim() || 'Untitled'); setRenaming(null); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { renameNode(renaming.id, renaming.value.trim() || 'Untitled'); setRenaming(null); }
                  if (e.key === 'Escape') setRenaming(null);
                }}
                className="absolute px-2 py-1 rounded-lg bg-gray-100 dark:bg-[#1a1a1a] border border-blue-400/60 text-xs text-gray-900 dark:text-white outline-none shadow-lg"
                style={{ left: screenX - 60, top: screenY - 30, width: 120 }}
              />
            );
          })()}
        </div>

        {/* Side panel - selected-node editor takes the full height. */}
        <div className="w-[300px] flex-shrink-0 flex flex-col gap-3">
          {shareOpen && mapId ? (
            <div className="flex-1 flex flex-col min-h-[260px]">
              <ShareDialog
                item={{ id: mapId, type: 'noteMap', title: mapName || 'Note map' }}
                onClose={() => setShareOpen(false)}
                asPanel
              />
            </div>
          ) : (
          <div className="bg-white/[0.03] rounded-2xl border border-white/[0.07] flex-1 min-h-[260px] flex flex-col overflow-hidden">
            {pullOpen ? (
              /* Pull-from-notes picker - lives in the side tab instead of a
                 centered modal so it shares the note panel's real estate. */
              <div className="flex flex-col flex-1 min-h-0">
                <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-2 flex-shrink-0 border-b border-white/[0.04]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText size={13} className="text-white/55 flex-shrink-0" />
                    <span className="text-[11px] font-semibold text-white/75 uppercase tracking-wide truncate">Pull from notes</span>
                  </div>
                  <button onClick={() => setPullOpen(false)} className="text-white/35 hover:text-white/80 flex-shrink-0" title="Close"><X size={13} /></button>
                </div>
                <div className="px-3 pt-2.5 flex-shrink-0">
                  <input
                    value={pullQuery}
                    onChange={e => setPullQuery(e.target.value)}
                    placeholder="Search notes…"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.04] text-[12px] text-white/85 placeholder-white/30 outline-none focus:border-white/[0.12]"
                    autoFocus
                  />
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
                  {pullLoading ? (
                    <div className="flex items-center justify-center py-6 text-xs text-white/30">
                      <Loader2 size={14} className="animate-spin mr-2" /> Loading notes…
                    </div>
                  ) : pullNotes.length === 0 ? (
                    <p className="text-[11px] text-white/35 italic p-3 text-center">
                      {nodes.some(n => n.source === 'note')
                        ? 'All of your notes are already on this map.'
                        : "You don't have any notes yet."}
                    </p>
                  ) : (
                    pullNotes
                      .filter(n => !pullQuery.trim() || (n.title || '').toLowerCase().includes(pullQuery.trim().toLowerCase()))
                      .map(n => {
                        const checked = pullSelected.has(n.id);
                        return (
                          <label
                            key={n.id}
                            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-blue-500/10' : 'hover:bg-white/[0.04]'}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePullNote(n.id)}
                              className="w-3.5 h-3.5 accent-white"
                            />
                            <FileText size={13} className="text-white/40 shrink-0" />
                            <span className="text-[13px] text-white/80 truncate">{n.title || 'Untitled'}</span>
                          </label>
                        );
                      })
                  )}
                </div>
                <div className="px-3 py-2.5 flex items-center justify-between gap-2 flex-shrink-0 border-t border-white/[0.06]">
                  <span className="text-[11px] text-white/40">{pullSelected.size} selected</span>
                  <Button size="sm" onClick={confirmPullNotes} disabled={pullSelected.size === 0}>
                    <Plus size={12} /> Add {pullSelected.size || ''}
                  </Button>
                </div>
              </div>
            ) : aiOpen ? (
              /* AI note generator - also rendered in the side tab. Topic in,
                 note out; drops on the map and wires to the focused node. */
              <div className="flex flex-col flex-1 min-h-0">
                <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-2 flex-shrink-0 border-b border-white/[0.04]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Wand2 size={13} className="text-white/55 flex-shrink-0" />
                    <span className="text-[11px] font-semibold text-white/75 uppercase tracking-wide truncate">Generate with AI</span>
                  </div>
                  <button onClick={() => { if (!aiBusy) { setAiOpen(false); setAiError(null); } }} disabled={aiBusy} className="text-white/35 hover:text-white/80 flex-shrink-0 disabled:opacity-40" title="Close"><X size={13} /></button>
                </div>
                <form onSubmit={(e) => { e.preventDefault(); generateNoteWithAI(); }} className="flex-1 min-h-0 flex flex-col gap-2.5 px-3 pt-2.5 pb-3 overflow-y-auto">
                  <div className="flex items-start gap-2 rounded-xl border border-blue-400/20 bg-blue-500/[0.06] px-2.5 py-2 text-[11px] text-blue-100/85 leading-relaxed">
                    <Sparkles size={12} className="text-blue-300 mt-0.5 flex-shrink-0" />
                    <span>The AI writes a short, organized study note for your topic. It drops onto the map and connects to whatever node you're focused on.</span>
                  </div>
                  <input
                    autoFocus
                    value={aiTopic}
                    onChange={e => setAiTopic(e.target.value)}
                    placeholder="e.g. Photosynthesis, Eigenvectors"
                    className="w-full px-2.5 py-2 rounded-lg border border-white/[0.10] bg-white/[0.04] text-[13px] text-white/90 placeholder-white/30 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20"
                    disabled={aiBusy}
                  />
                  {aiError && (
                    <p className="text-[11px] text-rose-300/90 bg-rose-500/[0.08] border border-rose-400/[0.20] rounded-lg px-2.5 py-2">{aiError}</p>
                  )}
                  <Button type="submit" size="sm" disabled={!aiTopic.trim()} loading={aiBusy}>
                    {!aiBusy && <Wand2 size={12} />}
                    {aiBusy ? 'Generating…' : 'Generate'}
                  </Button>
                </form>
              </div>
            ) : selectedNode ? (
              <div className="flex flex-col flex-1 min-h-0">
                {/* Header */}
                <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-2 flex-shrink-0 border-b border-white/[0.04]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: selectedNode.color }} />
                    <span className="text-[11px] font-semibold text-white/75 uppercase tracking-wide truncate">
                      {selectedNode.source === 'note' ? 'Note' : selectedNode.source === 'ai' ? 'AI Topic' : 'Topic'}
                    </span>
                  </div>
                  {selectedNode.source === 'note' && (
                    <span className="text-[10px] text-white/35 flex-shrink-0">
                      {noteLoading ? 'Loading…' : noteSaving ? 'Saving…' : 'Saved'}
                    </span>
                  )}
                </div>

                {/* Title - editable for notes, static for topics */}
                <div className="px-3 pt-2 flex-shrink-0">
                  {selectedNode.source === 'note' && activeNote ? (
                    <input
                      value={activeNote.title}
                      onChange={e => handleNoteFieldChange('title', e.target.value)}
                      className="w-full text-[15px] font-bold bg-transparent border-none outline-none text-white/95 placeholder-white/25"
                      placeholder="Note title…"
                    />
                  ) : (
                    <p className="text-[14px] font-bold text-white/90 break-words">{selectedNode.label}</p>
                  )}
                </div>

                {/* Action row */}
                <div className="px-3 pt-2 pb-2 flex flex-wrap gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setFocusedNodeId(focusedNodeId === selectedNode.id ? null : selectedNode.id)}
                    className={`text-[10px] px-2 py-1 rounded-lg flex items-center gap-1 ${focusedNodeId === selectedNode.id ? 'bg-purple-500/25 text-purple-200' : 'bg-white/[0.05] hover:bg-white/[0.1] text-white/70'}`}
                  ><Focus size={10} /> {focusedNodeId === selectedNode.id ? 'Focused' : 'Focus'}</button>
                  {selectedNode.source !== 'note' && (
                    <button
                      onClick={() => setRenaming({ id: selectedNode.id, value: selectedNode.label })}
                      className="text-[10px] px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/70 flex items-center gap-1"
                    ><Pencil size={10} /> Rename</button>
                  )}
                  <button
                    onClick={() => setLinkingFrom(linkingFrom === selectedNode.id ? null : selectedNode.id)}
                    className={`text-[10px] px-2 py-1 rounded-lg flex items-center gap-1 ${linkingFrom === selectedNode.id ? 'bg-blue-500/25 text-blue-200' : 'bg-white/[0.05] hover:bg-white/[0.1] text-white/70'}`}
                  ><Link2 size={10} /> {linkingFrom === selectedNode.id ? 'Click target…' : 'Link'}</button>
                  {selectedNode.source === 'note' && selectedNode.noteId && onOpenNote && (
                    <button
                      onClick={() => onOpenNote(selectedNode.noteId)}
                      className="text-[10px] px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/70 flex items-center gap-1"
                    ><FileText size={10} /> Full editor</button>
                  )}
                  {selectedNode.source !== 'note' && (
                    <button
                      onClick={() => makeNoteFromNode(selectedNode)}
                      disabled={creatingNoteFromId === selectedNode.id}
                      className="text-[10px] px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 flex items-center gap-1 disabled:opacity-50"
                    ><StickyNote size={10} /> {creatingNoteFromId === selectedNode.id ? 'Saving…' : 'Make note'}</button>
                  )}
                  {selectedNode.source !== 'note' && (
                    <button
                      onClick={() => deleteNode(selectedNode.id)}
                      className="text-[10px] px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 flex items-center gap-1"
                    ><Trash2 size={10} /> Delete</button>
                  )}
                </div>

                {/* Flashcards strip - spaced repetition for this concept.
                    Works for any node type. */}
                <div className="px-3 pb-2 flex-shrink-0">
                  <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                    <Layers size={13} className="text-white/40 flex-shrink-0" />
                    {nodeStats ? (
                      <>
                        <span className="text-[11px] text-white/70 flex-1 min-w-0">
                          {nodeStats.total} card{nodeStats.total !== 1 ? 's' : ''}
                          {nodeStats.due > 0 && <span className="text-blue-300"> · {nodeStats.due} due</span>}
                        </span>
                        <button
                          onClick={() => generateCardsForNode(selectedNode)}
                          disabled={genNodeId === selectedNode.id}
                          className="text-[10px] px-2 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-white/70 flex items-center gap-1 disabled:opacity-50"
                        >
                          {genNodeId === selectedNode.id ? <><Loader2 size={10} className="animate-spin" /> …</> : <><Plus size={10} /> More</>}
                        </button>
                        <button
                          onClick={() => setReviewOpen(true)}
                          className="text-[10px] px-2 py-1 rounded-md bg-blue-500/15 hover:bg-blue-500/25 text-blue-200 flex items-center gap-1"
                        ><Brain size={10} /> Review</button>
                      </>
                    ) : (
                      <>
                        <span className="text-[11px] text-white/45 flex-1 min-w-0">No flashcards yet</span>
                        <button
                          onClick={() => generateCardsForNode(selectedNode)}
                          disabled={genNodeId === selectedNode.id}
                          className="text-[10px] px-2 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-white/70 flex items-center gap-1 disabled:opacity-50"
                        >
                          {genNodeId === selectedNode.id ? <><Loader2 size={10} className="animate-spin" /> Making…</> : <><Plus size={10} /> Make flashcards</>}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Body - for notes: live editor that auto-saves. For
                    non-notes: shows the rationale and connections list. */}
                {selectedNode.source === 'note' ? (
                  <div className="flex-1 min-h-0 flex flex-col px-3 pb-3">
                    <textarea
                      value={activeNote?.mainNotes || ''}
                      onChange={e => handleNoteFieldChange('mainNotes', e.target.value)}
                      placeholder={noteLoading ? 'Loading…' : 'Start writing… auto-saves as you type.'}
                      disabled={!activeNote}
                      data-bare
                      className="flex-1 min-h-[120px] w-full bg-white/[0.02] rounded-xl border border-white/[0.05] p-2.5 text-[12px] text-white/85 placeholder-white/25 resize-none outline-none focus:border-white/[0.12] leading-relaxed"
                    />
                    {(() => {
                      const neighbors = nodes.filter(n => adjacency.get(selectedNode.id)?.has(n.id));
                      if (neighbors.length === 0) return null;
                      return (
                        <div className="mt-2 flex-shrink-0">
                          <p className="text-[10px] font-semibold text-white/45 uppercase tracking-wide mb-1">Linked</p>
                          <div className="flex flex-wrap gap-1">
                            {neighbors.map(n => (
                              <button
                                key={n.id}
                                onClick={() => setSelectedId(n.id)}
                                className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-white/70 flex items-center gap-1 max-w-[140px]"
                              >
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: n.color }} />
                                <span className="truncate">{n.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
                    <p className="text-[10px] font-semibold text-white/45 uppercase tracking-wide mb-1.5">Connections</p>
                    {(() => {
                      const neighbors = nodes.filter(n => adjacency.get(selectedNode.id)?.has(n.id));
                      if (neighbors.length === 0) return <p className="text-[11px] text-white/30 italic">No links yet. Use "Link" then click another node.</p>;
                      return (
                        <div className="space-y-1">
                          {neighbors.map(n => (
                            <div key={n.id} className="flex items-center gap-1.5 group">
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: n.color }} />
                              <button
                                onClick={() => setSelectedId(n.id)}
                                className="flex-1 text-left text-[11px] text-white/75 hover:text-white truncate"
                              >{n.label}</button>
                              <button
                                onClick={() => removeEdge(selectedNode.id, n.id)}
                                className="text-white/20 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Unlink"
                              ><X size={10} /></button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8 px-4 text-center">
                <div>
                  <p className="text-[11px] text-white/35 mb-1">No node selected</p>
                  <p className="text-[10px] text-white/25">Click a node to inspect or write. Double-click to drill in.</p>
                </div>
                {mapId && (
                  <button
                    onClick={() => setShareOpen(true)}
                    className="flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/65 transition-colors border border-white/[0.07] rounded-lg px-3 py-1.5"
                  >
                    <Share2 size={12} /> Share map
                  </button>
                )}
              </div>
            )}
          </div>
          )}

        </div>

        <NoteMapReview
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          mapId={srsMapId}
          onChange={loadSrs}
        />
      </div>
    </div>
  );
}
