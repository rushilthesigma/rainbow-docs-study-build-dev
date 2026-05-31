import { useEffect, useRef, useState } from 'react';
import {
  Grid3x3,
  Play,
  Trash2,
  MousePointer2,
  Circle,
  Minus,
  Anchor,
  ArrowDown,
  BookOpen,
  ChevronDown,
} from 'lucide-react';
import type { AppModule } from '@/os/types';
import { useFeaStore, type FeaTool } from '@/store/feaStore';
import { FEA_PRESETS } from '@/lib/fea/presets';
import { ENG_MATERIALS } from '@/lib/materials/engineering';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';
import { toast } from '@/store/toastStore';

const PX = 60; // px per metre
const OX = 80;
const OY = 360; // screen origin (y flips)

const sx = (x: number) => OX + x * PX;
const sy = (y: number) => OY - y * PX;
const wx = (px: number) => (px - OX) / PX;
const wy = (py: number) => (OY - py) / PX;

function stressColor(stress: number, maxStress: number): string {
  if (maxStress < 1) return '#64748b';
  const t = Math.max(-1, Math.min(1, stress / maxStress));
  if (t >= 0) {
    // tension → red
    const k = t;
    return `rgb(${Math.round(120 + 135 * k)},${Math.round(120 - 90 * k)},${Math.round(120 - 90 * k)})`;
  }
  const k = -t; // compression → blue
  return `rgb(${Math.round(120 - 90 * k)},${Math.round(120 - 40 * k)},${Math.round(120 + 135 * k)})`;
}

function FEAForge({ appId }: { appId: string }) {
  const model = useFeaStore((s) => s.model);
  const tool = useFeaStore((s) => s.tool);
  const result = useFeaStore((s) => s.result);
  const selectedNode = useFeaStore((s) => s.selectedNode);
  const elementFrom = useFeaStore((s) => s.elementFrom);
  const showDeformed = useFeaStore((s) => s.showDeformed);
  const dispScale = useFeaStore((s) => s.dispScale);
  const setTool = useFeaStore((s) => s.setTool);
  const addNode = useFeaStore((s) => s.addNode);
  const moveNode = useFeaStore((s) => s.moveNode);
  const toggleSupport = useFeaStore((s) => s.toggleSupport);
  const setLoad = useFeaStore((s) => s.setLoad);
  const beginElement = useFeaStore((s) => s.beginElement);
  const finishElement = useFeaStore((s) => s.finishElement);
  const removeNode = useFeaStore((s) => s.removeNode);
  const select = useFeaStore((s) => s.select);
  const setShowDeformed = useFeaStore((s) => s.setShowDeformed);
  const setDispScale = useFeaStore((s) => s.setDispScale);
  const loadPreset = useFeaStore((s) => s.loadPreset);
  const clear = useFeaStore((s) => s.clear);
  const solve = useFeaStore((s) => s.solve);
  const materialId = useFeaStore((s) => s.materialId);
  const setMaterial = useFeaStore((s) => s.setMaterial);
  const yieldStress = useFeaStore((s) => s.yieldStress);

  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);

  const node = (id: string) => model.nodes.find((n) => n.id === id);

  useAppTools(appId, [
    {
      toolName: 'add_node',
      description: 'Add a node at (x,y) metres. Returns its id.',
      input_schema: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        required: ['x', 'y'],
      },
      handler: ({ x, y }: any) => ({ id: addNode(Number(x), Number(y)) }),
    },
    {
      toolName: 'add_element',
      description: 'Connect two nodes with a bar element. Pass node ids a and b.',
      input_schema: {
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' } },
        required: ['a', 'b'],
      },
      handler: ({ a, b }: any) => {
        beginElement(String(a));
        finishElement(String(b));
        return { ok: true };
      },
    },
    {
      toolName: 'set_support',
      description: 'Pin a node (fix both DOFs) or release it. Toggles.',
      input_schema: {
        type: 'object',
        properties: { node: { type: 'string' } },
        required: ['node'],
      },
      handler: ({ node: nd }: any) => {
        toggleSupport(String(nd));
        return { ok: true };
      },
    },
    {
      toolName: 'set_load',
      description: 'Apply a nodal load (N). fx,fy in Newtons.',
      input_schema: {
        type: 'object',
        properties: {
          node: { type: 'string' },
          fx: { type: 'number' },
          fy: { type: 'number' },
        },
        required: ['node', 'fx', 'fy'],
      },
      handler: ({ node: nd, fx, fy }: any) => {
        setLoad(String(nd), Number(fx), Number(fy));
        return { ok: true };
      },
    },
    {
      toolName: 'solve_fea',
      description: 'Run the truss FEA solve. Returns max displacement/stress + per-member forces.',
      input_schema: { type: 'object', properties: {} },
      handler: () => {
        const r = solve();
        return {
          unstable: r.unstable,
          maxDisp: r.maxDisp,
          maxStress: r.maxStress,
          elements: r.elements.map((e) => ({ id: e.id, force: e.force, stress: e.stress })),
        };
      },
    },
    {
      toolName: 'load_preset',
      description: `Load an example structure. one of: ${FEA_PRESETS.map((p) => p.id).join(', ')}.`,
      input_schema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: ({ id }: any) => {
        loadPreset(String(id));
        return { ok: true };
      },
    },
  ]);

  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `FEAForge: ${model.nodes.length} nodes, ${model.elements.length} bar elements, ${model.loads.length} loads. ${
        result
          ? `Solved: maxDisp ${result.maxDisp.toExponential(2)} m, maxStress ${(result.maxStress / 1e6).toFixed(1)} MPa${result.unstable ? ' (UNSTABLE)' : ''}.`
          : 'Not solved yet.'
      }`,
      state: { nodes: model.nodes.length, elements: model.elements.length, result: result ? { maxDisp: result.maxDisp, maxStress: result.maxStress } : null },
    }));
  }, [appId, model, result]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useFeaStore.setState({ elementFrom: null });
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNode)
        removeNode(selectedNode);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedNode, removeNode]);

  const runSolve = () => {
    const r = solve();
    if (r.unstable) toast.warn('Unstable structure', 'Not enough supports - it is a mechanism.');
    else
      toast.success(
        'Solved',
        `max δ ${r.maxDisp.toExponential(2)} m · max σ ${(r.maxStress / 1e6).toFixed(1)} MPa`,
      );
  };

  const onCanvasDown = (e: React.MouseEvent) => {
    if ((e.target as SVGElement).tagName !== 'svg') return;
    if (tool === 'node') {
      const r = svgRef.current!.getBoundingClientRect();
      addNode(
        Math.round(wx(e.clientX - r.left) * 4) / 4,
        Math.round(wy(e.clientY - r.top) * 4) / 4,
      );
    } else {
      select(null);
      useFeaStore.setState({ elementFrom: null });
    }
  };

  const dispOf = (id: string) =>
    result && showDeformed ? result.disp[id] ?? { ux: 0, uy: 0 } : { ux: 0, uy: 0 };

  return (
    <div className="flex h-full">
      {/* tool rail */}
      <div className="w-12 shrink-0 border-r border-white/10 bg-black/25 flex flex-col items-center py-2 gap-1 chrome">
        {(
          [
            ['select', MousePointer2],
            ['node', Circle],
            ['element', Minus],
            ['support', Anchor],
            ['load', ArrowDown],
          ] as [FeaTool, any][]
        ).map(([t, Icon]) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            title={t}
            className={`w-8 h-8 rounded-md flex items-center justify-center ${
              tool === t ? 'bg-accent text-white' : 'text-white/70 hover:bg-white/10'
            }`}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-9 px-2 flex items-center gap-1 border-b border-white/10 chrome">
          <button
            onClick={runSolve}
            className="flex items-center gap-1 px-2 h-6 rounded-md text-xs bg-accent hover:bg-accent-hover text-white"
          >
            <Play size={12} /> Solve
          </button>
          <label className="ml-2 flex items-center gap-1 text-[11px] text-white/65">
            <input
              type="checkbox"
              checked={showDeformed}
              onChange={(e) => setShowDeformed(e.target.checked)}
            />
            deformed
          </label>
          <span className="ml-2 text-[11px] text-white/55">exaggerate</span>
          {[0.25, 1, 3, 10].map((f) => (
            <button
              key={f}
              onClick={() => setDispScale(dispScale * f)}
              className="px-1.5 h-6 rounded-md text-[11px] hover:bg-white/10 text-white/70"
              title="Multiply the deformed-shape scale"
            >
              ×{f}
            </button>
          ))}
          <span className="text-[10px] font-mono text-white/40 w-16">
            {dispScale > 999 ? dispScale.toExponential(1) : dispScale.toFixed(0)}
          </span>
          <select
            value={materialId}
            onChange={(e) => setMaterial(e.target.value)}
            title="Member material (sets E and yield)"
            className="ml-2 bg-white/5 border border-white/10 rounded-md px-1.5 h-6 text-[11px] outline-none max-w-[150px]"
          >
            {ENG_MATERIALS.map((m) => (
              <option key={m.id} value={m.id} className="bg-zinc-800">
                {m.label}
              </option>
            ))}
          </select>
          <div className="relative ml-2">
            <button
              onClick={() => setPresetsOpen((o) => !o)}
              className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
            >
              <BookOpen size={12} /> Examples <ChevronDown size={11} />
            </button>
            {presetsOpen && (
              <div className="absolute top-full left-0 mt-1 glass-strong rounded-md min-w-[220px] py-1 z-30 shadow-window">
                {FEA_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      loadPreset(p.id);
                      setPresetsOpen(false);
                    }}
                    title={p.description}
                    className="block w-full text-left px-2 py-1 text-xs hover:bg-white/10"
                  >
                    <div className="font-medium text-white">{p.name}</div>
                    <div className="text-[10px] text-white/50 truncate">{p.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={clear}
            className="ml-auto flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>

        <div className="flex-1 overflow-auto" style={{ background: '#0b1020' }}>
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            className="block min-h-[480px]"
            onMouseDown={onCanvasDown}
            onMouseMove={(e) => {
              const r = svgRef.current!.getBoundingClientRect();
              setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
            }}
          >
            <defs>
              <pattern id="feagrid" width={PX / 2} height={PX / 2} patternUnits="userSpaceOnUse">
                <circle cx={0.5} cy={0.5} r={0.6} fill="rgba(255,255,255,0.12)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#feagrid)" />

            {/* undeformed (faint when results shown) */}
            {model.elements.map((el) => {
              const a = node(el.a);
              const b = node(el.b);
              if (!a || !b) return null;
              return (
                <line
                  key={`u${el.id}`}
                  x1={sx(a.x)}
                  y1={sy(a.y)}
                  x2={sx(b.x)}
                  y2={sy(b.y)}
                  stroke={result && showDeformed ? 'rgba(255,255,255,0.12)' : '#64748b'}
                  strokeWidth={result && showDeformed ? 1 : 3}
                />
              );
            })}

            {/* deformed + stress-colored */}
            {result &&
              showDeformed &&
              model.elements.map((el) => {
                const a = node(el.a);
                const b = node(el.b);
                if (!a || !b) return null;
                const da = dispOf(el.a);
                const db = dispOf(el.b);
                const er = result.elements.find((x) => x.id === el.id);
                return (
                  <line
                    key={`d${el.id}`}
                    x1={sx(a.x + da.ux * dispScale)}
                    y1={sy(a.y + da.uy * dispScale)}
                    x2={sx(b.x + db.ux * dispScale)}
                    y2={sy(b.y + db.uy * dispScale)}
                    stroke={stressColor(er?.stress ?? 0, result.maxStress)}
                    strokeWidth={4}
                    strokeLinecap="round"
                  >
                    <title>{`${el.id}: ${(er?.force ?? 0).toFixed(0)} N, ${((er?.stress ?? 0) / 1e6).toFixed(1)} MPa`}</title>
                  </line>
                );
              })}

            {/* element-in-progress */}
            {elementFrom && cursor && node(elementFrom) && (
              <line
                x1={sx(node(elementFrom)!.x)}
                y1={sy(node(elementFrom)!.y)}
                x2={cursor.x}
                y2={cursor.y}
                stroke="#0A84FF"
                strokeWidth={2}
                strokeDasharray="5 3"
                pointerEvents="none"
              />
            )}

            {/* loads */}
            {model.loads.map((ld) => {
              const a = node(ld.node);
              if (!a) return null;
              const mag = Math.hypot(ld.fx, ld.fy) || 1;
              const ux = (ld.fx / mag) * 42;
              const uy = (-ld.fy / mag) * 42;
              return (
                <g key={`l${ld.node}`} pointerEvents="none">
                  <line
                    x1={sx(a.x)}
                    y1={sy(a.y)}
                    x2={sx(a.x) + ux}
                    y2={sy(a.y) + uy}
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                  />
                  <circle cx={sx(a.x) + ux} cy={sy(a.y) + uy} r={3} fill="#f59e0b" />
                  <text
                    x={sx(a.x) + ux + 6}
                    y={sy(a.y) + uy}
                    fontSize={10}
                    fill="#f59e0b"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {(mag / 1000).toFixed(1)}kN
                  </text>
                </g>
              );
            })}

            {/* nodes */}
            {model.nodes.map((nd) => (
              <NodeView
                key={nd.id}
                id={nd.id}
                selected={nd.id === selectedNode}
                tool={tool}
                onSelect={() => select(nd.id)}
                onMove={(x, y) => moveNode(nd.id, x, y)}
                onTool={() => {
                  if (tool === 'support') toggleSupport(nd.id);
                  else if (tool === 'load') {
                    // select the node - the load is edited inline in the panel
                    select(nd.id);
                  } else if (tool === 'element') {
                    if (elementFrom) finishElement(nd.id);
                    else beginElement(nd.id);
                  } else select(nd.id);
                }}
                svgRef={svgRef}
              />
            ))}
          </svg>
        </div>
      </div>

      {/* results panel */}
      <div className="w-60 shrink-0 border-l border-white/10 bg-black/25 flex flex-col chrome overflow-y-auto">
        <SelectedNodePanel />
        <div className="p-3 border-b border-white/10">
          <div className="text-[10px] uppercase text-white/45 mb-2">Results</div>
          {!result ? (
            <div className="text-xs text-white/45">Press Solve.</div>
          ) : result.unstable ? (
            <div className="text-traffic-red text-xs">
              Structure is unstable (mechanism). Add more supports/members.
            </div>
          ) : (
            <div className="space-y-1 text-[12px] font-mono">
              <Row k="max δ" v={`${result.maxDisp.toExponential(3)} m`} />
              <Row k="max σ" v={`${(result.maxStress / 1e6).toFixed(2)} MPa`} />
              <Row
                k="utilisation"
                v={`${((result.maxStress / yieldStress) * 100).toFixed(0)}% σy`}
              />
              <Row k="members" v={String(result.elements.length)} />
              {result.maxStress >= yieldStress && (
                <div className="text-traffic-red text-[11px] pt-1">
                  ⚠ a member exceeds yield - the structure would fail
                </div>
              )}
              {(() => {
                const sorted = [...result.elements].sort((a, b) => b.force - a.force);
                const tension = sorted[0];
                const comp = sorted[sorted.length - 1];
                return (
                  <div className="pt-2 mt-1 border-t border-white/10 space-y-0.5">
                    <div className="text-[10px] uppercase text-white/45">
                      Governing members
                    </div>
                    {tension && tension.force > 0 && (
                      <div className="flex justify-between">
                        <span className="text-rose-400">↑ tension {tension.id}</span>
                        <span>{(tension.force / 1000).toFixed(2)} kN</span>
                      </div>
                    )}
                    {comp && comp.force < 0 && (
                      <div className="flex justify-between">
                        <span className="text-sky-400">↓ compr. {comp.id}</span>
                        <span>{(comp.force / 1000).toFixed(2)} kN</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        <div className="p-3 border-b border-white/10">
          <div className="text-[10px] uppercase text-white/45 mb-1">Legend</div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-4 h-2 rounded" style={{ background: 'rgb(255,30,30)' }} />
            tension
            <span className="w-4 h-2 rounded ml-2" style={{ background: 'rgb(30,80,255)' }} />
            compression
          </div>
        </div>
        {result && !result.unstable && (
          <div className="p-3 flex-1">
            <div className="text-[10px] uppercase text-white/45 mb-1.5">Member forces</div>
            <div className="space-y-0.5 text-[11px] font-mono">
              {result.elements
                .slice()
                .sort((a, b) => Math.abs(b.force) - Math.abs(a.force))
                .map((e) => (
                  <div key={e.id} className="flex justify-between">
                    <span className="text-white/55">{e.id}</span>
                    <span style={{ color: stressColor(e.stress, result.maxStress) }}>
                      {e.force >= 0 ? '+' : ''}
                      {(e.force / 1000).toFixed(2)} kN
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SelectedNodePanel() {
  const selectedNode = useFeaStore((s) => s.selectedNode);
  const node = useFeaStore((s) => s.model.nodes.find((n) => n.id === selectedNode));
  const load = useFeaStore((s) =>
    s.model.loads.find((l) => l.node === selectedNode),
  );
  const setLoad = useFeaStore((s) => s.setLoad);
  const toggleSupport = useFeaStore((s) => s.toggleSupport);
  const removeNode = useFeaStore((s) => s.removeNode);
  if (!node) {
    return (
      <div className="p-3 border-b border-white/10 text-xs text-white/45">
        Select a node to edit its support &amp; load.
      </div>
    );
  }
  const fx = load?.fx ?? 0;
  const fy = load?.fy ?? 0;
  const fixed = node.fixX || node.fixY;
  return (
    <div className="p-3 border-b border-white/10 space-y-2">
      <div className="text-[10px] uppercase text-white/45">
        Node {node.id} · {node.x.toFixed(2)}, {node.y.toFixed(2)} m
      </div>
      <button
        onClick={() => toggleSupport(node.id)}
        className={`w-full px-2 py-1 rounded-md text-xs ${
          fixed ? 'bg-emerald-500/30 text-emerald-300' : 'bg-white/10 hover:bg-white/15'
        }`}
      >
        {fixed ? 'Pinned support (click to release)' : 'Add pinned support'}
      </button>
      <div className="text-[10px] uppercase text-white/45 pt-1">Load (N)</div>
      <label className="flex items-center gap-2 text-xs">
        <span className="w-8 text-white/55">Fx</span>
        <input
          type="number"
          value={fx}
          step={100}
          onChange={(e) => setLoad(node.id, parseFloat(e.target.value) || 0, fy)}
          className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 font-mono outline-none"
        />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <span className="w-8 text-white/55">Fy</span>
        <input
          type="number"
          value={fy}
          step={100}
          onChange={(e) => setLoad(node.id, fx, parseFloat(e.target.value) || 0)}
          className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 font-mono outline-none"
        />
      </label>
      <button
        onClick={() => removeNode(node.id)}
        className="w-full px-2 py-1 rounded-md text-xs bg-traffic-red/20 hover:bg-traffic-red/40 text-traffic-red"
      >
        Delete node
      </button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-white/55">{k}</span>
      <span className="text-white">{v}</span>
    </div>
  );
}

function NodeView({
  id,
  selected,
  tool,
  onSelect,
  onMove,
  onTool,
  svgRef,
}: {
  id: string;
  selected: boolean;
  tool: FeaTool;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onTool: () => void;
  svgRef: React.RefObject<SVGSVGElement>;
}) {
  const nd = useFeaStore((s) => s.model.nodes.find((n) => n.id === id));
  const drag = useRef(false);
  if (!nd) return null;
  const fixed = nd.fixX || nd.fixY;
  return (
    <g transform={`translate(${sx(nd.x)}, ${sy(nd.y)})`}>
      {fixed && (
        <polygon
          points="0,6 -8,18 8,18"
          fill="none"
          stroke="#22c55e"
          strokeWidth={1.5}
        />
      )}
      <circle
        r={selected ? 7 : 5}
        fill={selected ? '#0A84FF' : '#cbd5e1'}
        stroke="#0b1020"
        strokeWidth={1.5}
        style={{ cursor: tool === 'select' ? 'move' : 'pointer' }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect();
          if (tool !== 'select') {
            onTool();
            return;
          }
          drag.current = true;
          const mv = (ev: MouseEvent) => {
            if (!drag.current || !svgRef.current) return;
            const r = svgRef.current.getBoundingClientRect();
            onMove(
              Math.round(wx(ev.clientX - r.left) * 4) / 4,
              Math.round(wy(ev.clientY - r.top) * 4) / 4,
            );
          };
          const up = () => {
            drag.current = false;
            window.removeEventListener('mousemove', mv);
            window.removeEventListener('mouseup', up);
          };
          window.addEventListener('mousemove', mv);
          window.addEventListener('mouseup', up);
        }}
      >
        <title>{id}</title>
      </circle>
    </g>
  );
}

const module: AppModule = {
  manifest: {
    id: 'feaforge',
    name: 'FEAForge',
    description: 'Truss/frame finite-element analysis - direct stiffness solver',
    icon: Grid3x3,
    defaultSize: { width: 1080, height: 680 },
    accent: 'linear-gradient(135deg, #db2777 0%, #f59e0b 100%)',
  },
  Component: FEAForge,
};

export default module;
