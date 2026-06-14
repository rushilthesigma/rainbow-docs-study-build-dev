import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Plus, Trash2, RotateCw, Link2, X, Focus, Pencil, ArrowLeft, StickyNote } from 'lucide-react';
import { updateSharedItem } from '../../api/share';

// SharedNoteMapEditor — renders a note map that was shared with the current
// user, through the ?shareId= access path (File & Note Sharing ADR-001).
//
// This mirrors the look and core interactions of the owner's NoteMap canvas
// (pan / zoom / select / drag / link / focus) but deliberately drops every
// feature that writes into the *recipient's* own account or the owner's
// underlying notes: no AI generation, no spaced-repetition, no "pull from
// notes", no inline note-body editing. You collaborate on the graph itself —
// the concept nodes and the links between them — and saves route to the
// OWNER's map.
//
// View permission → pan / zoom / select / focus only (no autosave).
// Edit permission → also drag, add topic nodes, link / unlink, rename and
// delete topic nodes; changes autosave back to the owner. A 403 mid-edit
// (access revoked or downgraded to view) stops further saves and bubbles up
// via onAccessLost so the host can swap in the right banner.

const NODE_PALETTE = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#fb7185', '#c084fc'];

function randPaletteColor() {
  return NODE_PALETTE[Math.floor(Math.random() * NODE_PALETTE.length)];
}

function newId() {
  return `n_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Tiny force-directed relax step — same shape as NoteMap's, so a freshly
// added topic doesn't pile onto (0,0).
function relaxOnce(nodes, edges, fixedSet) {
  if (nodes.length === 0) return nodes;
  const next = nodes.map(n => ({ ...n, fx: 0, fy: 0 }));
  const byId = new Map(next.map(n => [n.id, n]));
  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const a = next[i], b = next[j];
      let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = (Math.random() - 0.5) * 0.5; dy = (Math.random() - 0.5) * 0.5; d2 = 0.5; }
      const d = Math.sqrt(d2);
      const force = 9000 / d2;
      a.fx += (dx / d) * force; a.fy += (dy / d) * force;
      b.fx -= (dx / d) * force; b.fy -= (dy / d) * force;
    }
  }
  const targetLen = 130;
  for (const e of edges) {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const force = (d - targetLen) * 0.05;
    a.fx += (dx / d) * force; a.fy += (dy / d) * force;
    b.fx -= (dx / d) * force; b.fy -= (dy / d) * force;
  }
  for (const n of next) { n.fx -= n.x * 0.015; n.fy -= n.y * 0.015; }
  for (const n of next) {
    if (fixedSet.has(n.id)) continue;
    n.x += Math.max(-30, Math.min(30, n.fx));
    n.y += Math.max(-30, Math.min(30, n.fy));
  }
  return next.map(({ fx, fy, ...rest }) => rest);
}

export default function SharedNoteMapEditor({ share, map, canEdit, inline = false, onAccessLost }) {
  const [nodes, setNodes] = useState(() => map?.nodes || []);
  const [edges, setEdges] = useState(() => map?.edges || []);
  const [selectedId, setSelectedId] = useState(null);
  const [linkingFrom, setLinkingFrom] = useState(null);
  const [renaming, setRenaming] = useState(null); // { id, value }
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: 480 });
  const [saving, setSaving] = useState(false);
  // Set locally the instant a save 403s, so we stop autosaving before the
  // canEdit prop catches up on the next render.
  const [blocked, setBlocked] = useState(false);

  const editable = canEdit && !blocked;

  const svgRef = useRef(null);
  const draggingRef = useRef(null);
  const panRef = useRef(null);
  const saveTimerRef = useRef(null);
  const dirtyRef = useRef(false);

  // Re-seed from the server copy whenever the host reloads the share (a fresh
  // map object identity means new owner state to show).
  useEffect(() => {
    setNodes(map?.nodes || []);
    setEdges(map?.edges || []);
    dirtyRef.current = false;
  }, [map]);

  // Track the SVG's pixel size so the graph centers correctly (SVG <g>
  // transforms don't take % values).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setCanvasSize(prev => (prev.w === rect.width && prev.h === rect.height) ? prev : { w: rect.width, h: rect.height });
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
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  // Debounced autosave back to the owner's map. Only fires after a real edit
  // (dirtyRef) and only with edit permission.
  useEffect(() => {
    if (!editable || !dirtyRef.current) return undefined;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await updateSharedItem('noteMap', share.itemId, share.id, { nodes, edges });
        dirtyRef.current = false;
      } catch (e) {
        if (e.status === 403) {
          setBlocked(true);
          onAccessLost?.(/permission required/i.test(e.message) ? 'downgraded' : 'revoked');
        }
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [nodes, edges, editable, share.itemId, share.id, onAccessLost]);

  // Mark a mutation so the autosave effect knows there's something to persist.
  const mutate = useCallback((fn) => { dirtyRef.current = true; fn(); }, []);

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

  const renderPositions = useMemo(() => {
    const m = new Map();
    if (!focusedNodeId || !focusedNode) {
      for (const n of nodes) m.set(n.id, { x: n.x, y: n.y });
      return m;
    }
    m.set(focusedNodeId, { x: 0, y: 0 });
    const neighborIds = Array.from(adjacency.get(focusedNodeId) || []);
    const r = Math.max(110, 70 + neighborIds.length * 10);
    neighborIds.forEach((id, i) => {
      const angle = (i / Math.max(1, neighborIds.length)) * Math.PI * 2 - Math.PI / 2;
      m.set(id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    });
    return m;
  }, [focusedNodeId, focusedNode, nodes, adjacency]);

  const visibleIds = useMemo(() => {
    if (!focusedNodeId) return null;
    const s = new Set([focusedNodeId]);
    for (const id of adjacency.get(focusedNodeId) || []) s.add(id);
    return s;
  }, [focusedNodeId, adjacency]);
  const visibleNodes = useMemo(() => visibleIds ? nodes.filter(n => visibleIds.has(n.id)) : nodes, [nodes, visibleIds]);
  const visibleEdges = useMemo(() => visibleIds ? edges.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to)) : edges, [edges, visibleIds]);

  const screenToGraph = useCallback((screenX, screenY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
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
      if (editable && linkingFrom !== node.id) addEdge(linkingFrom, node.id);
      setLinkingFrom(null);
      return;
    }
    setSelectedId(node.id);
    // In focus mode positions are derived, and view-only never drags.
    if (focusedNodeId || !editable) return;
    const start = screenToGraph(e.clientX, e.clientY);
    draggingRef.current = { id: node.id, offsetX: node.x - start.x, offsetY: node.y - start.y };
  }

  function handleMouseMove(e) {
    const drag = draggingRef.current;
    if (drag) {
      const p = screenToGraph(e.clientX, e.clientY);
      mutate(() => setNodes(prev => prev.map(n => n.id === drag.id ? { ...n, x: p.x + drag.offsetX, y: p.y + drag.offsetY } : n)));
      return;
    }
    const pan = panRef.current;
    if (pan) setViewport(v => ({ ...v, x: pan.startVX + (e.clientX - pan.startX), y: pan.startVY + (e.clientY - pan.startY) }));
  }

  function handleMouseUp() { draggingRef.current = null; panRef.current = null; }

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

  // Graph mutations (edit only) -------------------------------------------
  function addEdge(fromId, toId) {
    mutate(() => setEdges(prev => prev.some(e => edgeKey(e.from, e.to) === edgeKey(fromId, toId)) ? prev : [...prev, { from: fromId, to: toId, label: '' }]));
  }
  function removeEdge(fromId, toId) {
    mutate(() => setEdges(prev => prev.filter(e => edgeKey(e.from, e.to) !== edgeKey(fromId, toId))));
  }
  function deleteNode(id) {
    mutate(() => {
      setNodes(prev => prev.filter(n => n.id !== id));
      setEdges(prev => prev.filter(e => e.from !== id && e.to !== id));
    });
    if (selectedId === id) setSelectedId(null);
    if (linkingFrom === id) setLinkingFrom(null);
    if (focusedNodeId === id) setFocusedNodeId(null);
  }
  function renameNode(id, label) {
    mutate(() => setNodes(prev => prev.map(n => n.id === id ? { ...n, label } : n)));
  }
  function addTopic() {
    const anchor = focusedNode || null;
    const baseX = anchor ? anchor.x : 0;
    const baseY = anchor ? anchor.y : 0;
    const node = {
      id: newId(), label: 'New topic', source: 'topic', color: randPaletteColor(),
      x: baseX + (Math.random() - 0.5) * 140, y: baseY + (Math.random() - 0.5) * 140,
    };
    mutate(() => {
      setNodes(prev => [...prev, node]);
      if (anchor) setEdges(prev => prev.some(e => edgeKey(e.from, e.to) === edgeKey(anchor.id, node.id)) ? prev : [...prev, { from: anchor.id, to: node.id, label: '' }]);
    });
    setSelectedId(node.id);
    setRenaming({ id: node.id, value: node.label });
  }
  function relaxLayout() {
    mutate(() => setNodes(prev => {
      let out = prev;
      const fixed = new Set();
      for (let i = 0; i < 40; i++) out = relaxOnce(out, edges, fixed);
      return out;
    }));
  }

  const height = inline ? undefined : '60vh';

  return (
    <div className={`flex ${inline ? 'flex-col h-full min-h-0' : 'flex-col'} gap-3`} style={inline ? undefined : { height }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {focusedNode && (
            <button
              onClick={() => setFocusedNodeId(null)}
              className="flex items-center gap-1 text-[11px] text-white/55 hover:text-white/90 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors"
            >
              <ArrowLeft size={11} /> Map
            </button>
          )}
          <p className="text-[11px] text-white/40 truncate">
            {focusedNode
              ? <>Focus · {visibleNodes.length - 1} related · {visibleEdges.length} link{visibleEdges.length !== 1 ? 's' : ''}</>
              : <>{nodes.length} node{nodes.length !== 1 ? 's' : ''} · {edges.length} link{edges.length !== 1 ? 's' : ''}</>}
            {saving && <span className="ml-2 text-white/25">saving…</span>}
          </p>
        </div>
        {editable && (
          <div className="flex items-center gap-1.5">
            <button onClick={addTopic} className="text-[11px] px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/75 flex items-center gap-1 transition-colors">
              <Plus size={12} /> Topic
            </button>
            {!focusedNode && (
              <button onClick={relaxLayout} className="text-[11px] px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/75 flex items-center gap-1 transition-colors">
                <RotateCw size={12} /> Relax
              </button>
            )}
          </div>
        )}
      </div>

      <div className="relative flex flex-1 min-h-0 gap-3">
        {/* Canvas */}
        <div className="flex-1 min-w-0 relative bg-white/[0.02] rounded-2xl border border-white/[0.07] overflow-hidden" style={inline ? undefined : { height }}>
          <svg
            ref={svgRef}
            className="w-full h-full cursor-grab active:cursor-grabbing select-none"
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            style={{ minHeight: inline ? '420px' : '50vh' }}
          >
            <defs>
              <radialGradient id="snm-node-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g transform={`translate(${canvasSize.w / 2 + viewport.x}, ${canvasSize.h / 2 + viewport.y}) scale(${viewport.scale})`}>
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

              {linkingFrom && (() => {
                const a = renderPositions.get(linkingFrom);
                if (!a) return null;
                return <circle cx={a.x} cy={a.y} r="22" fill="none" stroke="rgba(96,165,250,0.6)" strokeDasharray="3 3" />;
              })()}

              {visibleNodes.map(node => {
                const pos = renderPositions.get(node.id) || { x: node.x, y: node.y };
                const isSelected = node.id === selectedId;
                const isFocused = node.id === focusedNodeId;
                const isLinkSource = node.id === linkingFrom;
                const isNeighbor = selectedId && adjacency.get(selectedId)?.has(node.id);
                const dimmed = !focusedNodeId && selectedId && !isSelected && !isNeighbor;
                const baseR = node.source === 'note' ? 16 : 13;
                const focusR = isFocused ? 14 : 9;
                const r = focusedNodeId ? focusR : baseR;
                const fontSize = focusedNodeId && !isFocused ? 10 : 11;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onMouseDown={e => handleNodeMouseDown(e, node)}
                    onDoubleClick={e => { e.stopPropagation(); setFocusedNodeId(node.id); }}
                    style={{ cursor: 'pointer', opacity: dimmed ? 0.35 : 1 }}
                  >
                    {(isSelected || isFocused) && <circle r={r + 8} fill="url(#snm-node-glow)" />}
                    <circle
                      r={r}
                      fill={node.color || '#60a5fa'}
                      stroke={isSelected || isLinkSource || isFocused ? '#ffffff' : 'rgba(255,255,255,0.25)'}
                      strokeWidth={isSelected || isLinkSource || isFocused ? 2 : 1}
                    />
                    {node.source === 'note' && (
                      <circle r={r - 6} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                    )}
                    <text
                      y={r + (focusedNodeId && !isFocused ? 11 : 14)}
                      textAnchor="middle"
                      fontSize={fontSize}
                      fill="rgba(255,255,255,0.85)"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {(node.label || '').length > 24 ? node.label.slice(0, 22) + '…' : node.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-white/35 max-w-xs">
                <p className="text-xs mb-1">This map is empty.</p>
                {editable && <p className="text-[11px]">Add a topic to start building it out.</p>}
              </div>
            </div>
          )}

          {/* Floating rename input */}
          {renaming && (() => {
            const n = nodes.find(nn => nn.id === renaming.id);
            if (!n) return null;
            const rect = svgRef.current?.getBoundingClientRect();
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
                className="absolute px-2 py-1 rounded-lg bg-[#1a1a1a] border border-blue-400/60 text-xs text-white outline-none shadow-lg"
                style={{ left: screenX - 60, top: screenY - 30, width: 120 }}
              />
            );
          })()}
        </div>

        {/* Side panel — selected node inspector */}
        <div className="w-[260px] flex-shrink-0 flex flex-col">
          <div className="bg-white/[0.03] rounded-2xl border border-white/[0.07] flex-1 min-h-[220px] flex flex-col overflow-hidden">
            {selectedNode ? (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="px-3 pt-3 pb-2 flex items-center gap-1.5 flex-shrink-0 border-b border-white/[0.04]">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: selectedNode.color }} />
                  <span className="text-[11px] font-semibold text-white/75 uppercase tracking-wide truncate">
                    {selectedNode.source === 'note' ? 'Note' : 'Topic'}
                  </span>
                </div>

                <div className="px-3 pt-2 flex-shrink-0">
                  <p className="text-[14px] font-bold text-white/90 break-words">{selectedNode.label}</p>
                  {selectedNode.source === 'note' && (
                    <p className="text-[10.5px] text-white/35 mt-0.5">Note content stays with the owner.</p>
                  )}
                </div>

                {editable && (
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
                    {selectedNode.source !== 'note' && (
                      <button
                        onClick={() => deleteNode(selectedNode.id)}
                        className="text-[10px] px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 flex items-center gap-1"
                      ><Trash2 size={10} /> Delete</button>
                    )}
                  </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
                  <p className="text-[10px] font-semibold text-white/45 uppercase tracking-wide mb-1.5 mt-1">Connections</p>
                  {(() => {
                    const neighbors = nodes.filter(n => adjacency.get(selectedNode.id)?.has(n.id));
                    if (neighbors.length === 0) return <p className="text-[11px] text-white/30 italic">No links yet.{editable ? ' Use "Link" then click another node.' : ''}</p>;
                    return (
                      <div className="space-y-1">
                        {neighbors.map(n => (
                          <div key={n.id} className="flex items-center gap-1.5 group">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: n.color }} />
                            <button
                              onClick={() => setSelectedId(n.id)}
                              className="flex-1 text-left text-[11px] text-white/75 hover:text-white truncate"
                            >{n.label}</button>
                            {editable && (
                              <button
                                onClick={() => removeEdge(selectedNode.id, n.id)}
                                className="text-white/20 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Unlink"
                              ><X size={10} /></button>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="text-center text-white/35 py-8 px-4">
                <StickyNote size={18} className="mx-auto mb-2 text-white/25" />
                <p className="text-[11px] mb-1">No node selected</p>
                <p className="text-[10px]">Click a node to inspect it. Double-click to drill in.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
