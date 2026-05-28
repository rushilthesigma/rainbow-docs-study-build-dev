import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Activity,
  Trash2,
  Plus,
  Download,
  BookOpen,
  ChevronDown,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  X,
  MousePointer2,
  Zap,
  Move,
  Crosshair,
  RotateCcw,
} from 'lucide-react';
import { CircuitSimIcon } from '@/apps/icons';
import type { AppModule } from '@/os/types';
import {
  COMPONENT_SPECS,
  useCircuitSimStore,
  buildNodes,
} from '@/store/circuitSimStore';
import type { CompType, CircuitComp } from '@/lib/circuitSolver/types';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';
import { CIRCUIT_PRESETS, type CircuitPreset } from '@/lib/circuitSolver/presets';

const PALETTE_ORDER: CompType[] = [
  'battery',
  'vsource',
  'vsource_ac',
  'isource',
  'resistor',
  'potentiometer',
  'capacitor',
  'inductor',
  'switch',
  'diode',
  'led',
  'lamp',
  'fuse',
  'voltmeter',
  'ammeter',
  'opamp',
  'ground',
];

/* ── Manhattan path helper ───────────────────────────────────────────
   Takes an ordered array of {x,y} anchor points and returns an SVG
   path string that routes H-then-V between consecutive pairs.
   With just two points this is a standard 2-segment schematic wire;
   with waypoints it threads through every locked bend. */
function manhattanPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const pr = pts[i - 1];
    const cu = pts[i];
    // Go horizontal to cu.x (at pr.y), then vertical to cu.y
    if (pr.x !== cu.x) d += ` L ${cu.x},${pr.y}`;
    d += ` L ${cu.x},${cu.y}`;
  }
  return d;
}

function CircuitSim({ appId }: { appId: string }) {
  const components = useCircuitSimStore((s) => s.components);
  const selectedId = useCircuitSimStore((s) => s.selectedId);
  const wiringFrom = useCircuitSimStore((s) => s.wiringFrom);
  const wiringWaypoints = useCircuitSimStore((s) => s.wiringWaypoints);
  const probes = useCircuitSimStore((s) => s.probes);
  const dc = useCircuitSimStore((s) => s.dc);
  const transient = useCircuitSimStore((s) => s.transient);
  const scopeMode = useCircuitSimStore((s) => s.scopeMode);
  const duration = useCircuitSimStore((s) => s.duration);
  const dt = useCircuitSimStore((s) => s.dt);
  const [breadboard, setBreadboard] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(true);

  const addComponent = useCircuitSimStore((s) => s.addComponent);
  const removeComponent = useCircuitSimStore((s) => s.removeComponent);
  const moveComponent = useCircuitSimStore((s) => s.moveComponent);
  const setSelected = useCircuitSimStore((s) => s.setSelected);
  const setValue = useCircuitSimStore((s) => s.setValue);
  const beginWire = useCircuitSimStore((s) => s.beginWire);
  const cancelWire = useCircuitSimStore((s) => s.cancelWire);
  const completeWire = useCircuitSimStore((s) => s.completeWire);
  const addWiringWaypoint = useCircuitSimStore((s) => s.addWiringWaypoint);
  const addProbe = useCircuitSimStore((s) => s.addProbe);
  const removeProbe = useCircuitSimStore((s) => s.removeProbe);
  const runDC = useCircuitSimStore((s) => s.runDC);
  const runTransient = useCircuitSimStore((s) => s.runTransient);
  const setScopeMode = useCircuitSimStore((s) => s.setScopeMode);
  const setDuration = useCircuitSimStore((s) => s.setDuration);
  const setDt = useCircuitSimStore((s) => s.setDt);
  const clear = useCircuitSimStore((s) => s.clear);
  const snapshotNow = useCircuitSimStore((s) => s.snapshotNow);

  const selected = selectedId ? components.find((c) => c.id === selectedId) ?? null : null;

  /* Palette placement stagger — avoids stacking components at a single point */
  const placeIdxRef = useRef(0);
  const nextPlacePos = () => {
    const idx = placeIdxRef.current % 20;
    placeIdxRef.current++;
    const col = idx % 5;
    const row = Math.floor(idx / 5);
    return { x: 80 + col * 100, y: 80 + row * 80 };
  };

  /* Pin voltage overlay — computed from last DC solve */
  const pinVoltages = useMemo<Record<string, number>>(() => {
    if (!dc || !components.length) return {};
    const { pinNode } = buildNodes(components);
    const map: Record<string, number> = {};
    for (const [pinId, nodeId] of pinNode.entries()) {
      const v = dc.nodeVoltages[nodeId];
      if (v !== undefined) map[pinId] = v;
    }
    return map;
  }, [dc, components]);

  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `CircuitSim has ${components.filter((c) => c.type !== 'wire').length} components and ${components.filter((c) => c.type === 'wire').length} wires. ${probes.length} probe(s). Last DC result: ${dc ? 'available' : 'none'}.`,
      state: {
        components: components.map((c) => ({
          id: c.id,
          type: c.type,
          x: c.x,
          y: c.y,
          value: c.value,
          freq: c.freq,
        })),
        probes: probes.map((p) => ({ node: p.node })),
        dc,
      },
    }));
  }, [appId, components, probes, dc]);

  useAppTools(appId, [
    {
      toolName: 'add_component',
      description:
        'Add an analog component. type: resistor | capacitor | inductor | vsource | vsource_ac | isource | diode | ground. value is in SI base units (Ω, F, H, V, A). Returns the component id and the pin ids you can connect.',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: PALETTE_ORDER as unknown as string[] },
          x: { type: 'number' },
          y: { type: 'number' },
          value: { type: 'number' },
          freq: { type: 'number' },
        },
        required: ['type', 'x', 'y'],
      },
      handler: ({ type, x, y, value, freq }: any) => {
        const id = addComponent(type as CompType, Number(x), Number(y));
        if (value !== undefined || freq !== undefined) {
          setValue(id, Number(value ?? COMPONENT_SPECS[type as CompType].defaultValue), freq !== undefined ? Number(freq) : undefined);
        }
        const c = useCircuitSimStore.getState().components.find((x) => x.id === id)!;
        return { id, pins: c.pins };
      },
    },
    {
      toolName: 'connect_nodes',
      description: 'Wire two pin ids together. Pin ids look like "<componentId>.<pinName>".',
      input_schema: {
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' } },
        required: ['a', 'b'],
      },
      handler: ({ a, b }: any) => {
        useCircuitSimStore.getState().beginWire(String(a));
        useCircuitSimStore.getState().completeWire(String(b));
        return { ok: true };
      },
    },
    {
      toolName: 'run_dc_analysis',
      description: 'Solve the DC operating point. Returns node voltages and branch currents.',
      input_schema: { type: 'object', properties: {} },
      handler: () => runDC(),
    },
    {
      toolName: 'run_transient',
      description: 'Solve transient analysis. duration in s, dt in s. Returns t and node voltage arrays.',
      input_schema: {
        type: 'object',
        properties: {
          duration: { type: 'number' },
          dt: { type: 'number' },
        },
        required: ['duration', 'dt'],
      },
      handler: ({ duration: d, dt: t }: any) => {
        setDuration(Number(d));
        setDt(Number(t));
        const r = runTransient();
        const stride = Math.max(1, Math.floor(r.t.length / 200));
        const t_ = r.t.filter((_, i) => i % stride === 0);
        const nv: Record<string, number[]> = {};
        for (const [k, arr] of Object.entries(r.nodeVoltages)) {
          nv[k] = arr.filter((_, i) => i % stride === 0);
        }
        return { t: t_, nodeVoltages: nv };
      },
    },
    {
      toolName: 'probe',
      description: 'Add an oscilloscope probe on a node.',
      input_schema: {
        type: 'object',
        properties: { node: { type: 'string' } },
        required: ['node'],
      },
      handler: ({ node }: any) => {
        addProbe(String(node));
        return { ok: true };
      },
    },
    {
      toolName: 'clear_circuit',
      description: 'Remove all components and probes.',
      input_schema: { type: 'object', properties: {} },
      handler: () => { clear(); return { ok: true }; },
    },
  ]);

  return (
    <div className="flex h-full">
      {/* ── Palette ─────────────────────────────────────────────── */}
      <div className="w-[136px] shrink-0 border-r border-white/10 bg-black/20 p-2 chrome flex flex-col gap-1 overflow-y-auto">
        <div className="text-[10px] uppercase tracking-wide text-white/45 px-1 pb-1">Components</div>
        {PALETTE_ORDER.map((t) => {
          const spec = COMPONENT_SPECS[t];
          return (
            <button
              key={t}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/x-engos-comp', t)}
              onClick={() => {
                const pos = nextPlacePos();
                addComponent(t, pos.x, pos.y);
              }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-left text-xs transition-colors"
            >
              <span className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-[11px] font-mono shrink-0">
                {spec.symbol}
              </span>
              <span className="truncate text-[11px]">{spec.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Top bar ─────────────────────────────────────────── */}
        <div className="h-9 px-2 flex items-center gap-1 border-b border-white/10 chrome shrink-0">
          <button
            onClick={() => {
              try {
                runDC();
                import('@/store/toastStore').then(({ toast }) =>
                  toast.success('DC operating point', 'Solved — voltages shown at each pin.'),
                );
              } catch (e) {
                import('@/store/toastStore').then(({ toast }) =>
                  toast.error('DC solve failed', (e as Error).message),
                );
              }
            }}
            className="flex items-center gap-1 px-2 h-6 rounded-md text-xs bg-accent hover:bg-accent-hover text-white"
          >
            <Play size={12} /> DC
          </button>
          <button
            onClick={() => {
              try {
                runTransient();
                import('@/store/toastStore').then(({ toast }) =>
                  toast.success('Transient analysis', 'Done.'),
                );
              } catch (e) {
                import('@/store/toastStore').then(({ toast }) =>
                  toast.error('Transient failed', (e as Error).message),
                );
              }
            }}
            className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
          >
            <Activity size={12} /> Transient
          </button>
          <div className="ml-2 flex items-center gap-1 text-[11px] text-white/65">
            <span className="hidden sm:inline">dur</span>
            <input
              type="number"
              value={duration}
              step={1e-3}
              min={1e-6}
              onChange={(e) => setDuration(parseFloat(e.target.value) || 1e-3)}
              className="w-14 bg-white/5 border border-white/10 rounded px-1 py-0.5 font-mono text-xs outline-none"
            />
            s · dt
            <input
              type="number"
              value={dt}
              step={1e-5}
              min={1e-9}
              onChange={(e) => setDt(parseFloat(e.target.value) || 1e-5)}
              className="w-14 bg-white/5 border border-white/10 rounded px-1 py-0.5 font-mono text-xs outline-none"
            />
            s
          </div>
          <div className="ml-auto flex items-center gap-1">
            <PresetMenu
              onPick={(preset) => {
                useCircuitSimStore.getState().clear();
                const store = useCircuitSimStore.getState();
                const idMap = new Map<string, string>();
                for (const c of preset.components) {
                  const newId = store.addComponent(c.type, c.x, c.y);
                  idMap.set(c.id, newId);
                  store.setValue(newId, c.value, c.freq);
                  if (c.initial !== undefined) store.setInitial(newId, c.initial);
                }
                for (const [a, b] of preset.wires) {
                  const remap = (s: string) => {
                    const [cid, p] = s.split('.');
                    const r = idMap.get(cid);
                    return r ? `${r}.${p}` : s;
                  };
                  store.beginWire(remap(a));
                  store.completeWire(remap(b));
                }
              }}
            />
            <button
              onClick={() => setBreadboard((b) => !b)}
              className={`flex items-center gap-1 px-2 h-6 rounded-md text-xs ${
                breadboard ? 'bg-accent text-white' : 'hover:bg-white/10'
              }`}
              title="Toggle breadboard background"
            >
              BB
            </button>
            <button
              onClick={() => setScopeOpen((o) => !o)}
              className={`flex items-center gap-1 px-2 h-6 rounded-md text-xs ${
                scopeOpen ? 'bg-white/10 text-white' : 'hover:bg-white/10 text-white/65'
              }`}
              title={scopeOpen ? 'Hide oscilloscope' : 'Show oscilloscope'}
            >
              {scopeOpen ? <PanelRightClose size={12} /> : <PanelRightOpen size={12} />}
              <span className="hidden sm:inline">Scope</span>
            </button>
            <button
              onClick={clear}
              className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10 text-white/70"
              title="Clear circuit"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* ── Canvas area ─────────────────────────────────────── */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            <CircuitCanvas
              components={components}
              selectedId={selectedId}
              wiringFrom={wiringFrom}
              wiringWaypoints={wiringWaypoints}
              pinVoltages={pinVoltages}
              onSelect={(id) => setSelected(id)}
              onMove={moveComponent}
              onDropType={(t, x, y) => addComponent(t, x, y)}
              onPinClick={(pin) => {
                if (wiringFrom) completeWire(pin);
                else beginWire(pin);
              }}
              onCancelWire={cancelWire}
              onDelete={removeComponent}
              onAddWaypoint={addWiringWaypoint}
              onSnapshotNow={snapshotNow}
              breadboard={breadboard}
            />
            <ShortcutBar wiringActive={!!wiringFrom} waypointCount={wiringWaypoints.length} selectedId={selectedId} />
          </div>

          {scopeOpen && (
            <Oscilloscope
              transient={transient}
              probes={probes}
              mode={scopeMode}
              setMode={setScopeMode}
              removeProbe={removeProbe}
              onClose={() => setScopeOpen(false)}
            />
          )}
        </div>
      </div>

      {/* ── Right panel: properties + nodes ─────────────────── */}
      <div className="w-52 shrink-0 border-l border-white/10 bg-black/25 flex flex-col chrome">
        <div className="p-3 border-b border-white/10">
          <div className="text-[10px] uppercase text-white/45 mb-2">Selection</div>
          {!selected ? (
            <div className="text-xs text-white/45">Select a component</div>
          ) : (
            <SelectedProps
              comp={selected}
              onValue={(v, f) => setValue(selected.id, v, f)}
              onDelete={() => removeComponent(selected.id)}
            />
          )}
        </div>
        <div className="p-3 overflow-y-auto flex-1">
          <div className="text-[10px] uppercase text-white/45 mb-1">Nodes & probes</div>
          <NodesList onProbe={(n) => addProbe(n)} />
        </div>
      </div>
    </div>
  );
}

/* ── Shortcut hint bar ───────────────────────────────────────────── */
function ShortcutBar({
  wiringActive,
  waypointCount,
  selectedId,
}: {
  wiringActive: boolean;
  waypointCount: number;
  selectedId: string | null;
}) {
  const hints = wiringActive
    ? [
        { icon: <Zap size={10} />, key: 'Click component / pin', label: 'complete wire' },
        { icon: <Crosshair size={10} />, key: 'Click canvas', label: `lock turn${waypointCount ? ` (${waypointCount})` : ''}` },
        { icon: <X size={10} />, key: 'Right-click / Esc', label: 'cancel' },
      ]
    : [
        { icon: <Zap size={10} />, key: 'Click component', label: 'start wire (snaps to pin)' },
        { icon: <Move size={10} />, key: 'Drag', label: 'move' },
        { icon: <X size={10} />, key: 'Shift+click wire', label: 'delete wire' },
        { icon: <X size={10} />, key: 'Del', label: 'delete' },
        { icon: <RotateCcw size={10} />, key: 'Ctrl+Z', label: 'undo' },
      ];

  return (
    <div className="h-8 shrink-0 flex items-center gap-1.5 px-3 border-t border-white/[0.06] bg-black/30 overflow-x-auto">
      {wiringActive && (
        <span className="flex items-center gap-1 mr-1 px-2 py-0.5 rounded-full bg-accent/20 border border-accent/30 text-accent text-[10px] font-medium whitespace-nowrap">
          <Zap size={9} /> Wiring…
        </span>
      )}
      {hints.map((h, i) => (
        <span key={i} className="flex items-center gap-1 whitespace-nowrap text-[10px] text-white/45">
          {i > 0 && <span className="text-white/20 select-none">·</span>}
          <kbd
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/[0.07] border border-white/10 text-white/70 font-sans font-medium"
            style={{ fontSize: 10 }}
          >
            {h.icon}
            {h.key}
          </kbd>
          <span>{h.label}</span>
        </span>
      ))}
    </div>
  );
}

/* ── SelectedProps ───────────────────────────────────────────────── */
function SelectedProps({
  comp,
  onValue,
  onDelete,
}: {
  comp: CircuitComp;
  onValue: (v: number, freq?: number) => void;
  onDelete: () => void;
}) {
  const spec = COMPONENT_SPECS[comp.type];
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-white/75">{spec.label}</span>
        <span className="font-mono text-[10px] text-white/40">{comp.id}</span>
      </div>
      {spec.unit && (
        <label className="flex items-center gap-2">
          <span className="w-10 text-white/55">{spec.unit}</span>
          <input
            type="number"
            value={comp.value}
            step={spec.defaultValue / 10 || 1}
            onChange={(e) => onValue(parseFloat(e.target.value) || 0, comp.freq)}
            className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 font-mono outline-none"
          />
        </label>
      )}
      {comp.type === 'vsource_ac' && (
        <label className="flex items-center gap-2">
          <span className="w-10 text-white/55">Hz</span>
          <input
            type="number"
            value={comp.freq ?? 60}
            step={1}
            onChange={(e) => onValue(comp.value, parseFloat(e.target.value) || 60)}
            className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 font-mono outline-none"
          />
        </label>
      )}
      {comp.type === 'switch' && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!comp.initial}
            onChange={(e) => useCircuitSimStore.getState().setInitial(comp.id, e.target.checked ? 1 : 0)}
          />
          <span className="text-white/75">Closed (conducting)</span>
        </label>
      )}
      {comp.type === 'potentiometer' && (
        <label className="flex items-center gap-2">
          <span className="w-10 text-white/55">wiper</span>
          <input
            type="range"
            min={0.01}
            max={0.99}
            step={0.01}
            value={comp.initial ?? 0.5}
            onChange={(e) =>
              useCircuitSimStore.getState().setInitial(comp.id, parseFloat(e.target.value))
            }
            className="flex-1"
          />
          <span className="font-mono w-9 text-right">{((comp.initial ?? 0.5) * 100).toFixed(0)}%</span>
        </label>
      )}
      <button
        onClick={onDelete}
        className="w-full px-2 py-1 rounded-md bg-traffic-red/20 hover:bg-traffic-red/40 text-traffic-red text-xs"
      >
        Delete
      </button>
    </div>
  );
}

/* ── NodesList ───────────────────────────────────────────────────── */
function NodesList({ onProbe }: { onProbe: (n: string) => void }) {
  const components = useCircuitSimStore((s) => s.components);
  const dc = useCircuitSimStore((s) => s.dc);
  const probes = useCircuitSimStore((s) => s.probes);
  const removeProbe = useCircuitSimStore((s) => s.removeProbe);
  const nodes = useMemo(() => buildNodes(components).nodes, [components]);
  if (!nodes.length) return <div className="text-xs text-white/45">No nodes yet.</div>;
  return (
    <div className="space-y-1 text-xs">
      {nodes.map((n) => {
        const v = dc?.nodeVoltages[n];
        const probe = probes.find((p) => p.node === n);
        return (
          <div key={n} className="flex items-center gap-1 bg-white/5 rounded-md px-1.5 py-1">
            <span className="font-mono truncate flex-1 text-[11px]">{n.split('.')[0]}</span>
            <span className="font-mono text-[11px] text-white/65 tabular-nums">
              {v !== undefined ? `${v.toFixed(3)} V` : ''}
            </span>
            {probe ? (
              <button
                onClick={() => removeProbe(probe.id)}
                title="Remove probe"
                className="w-5 h-5 rounded-sm shrink-0"
                style={{ background: probe.color }}
              />
            ) : (
              <button
                onClick={() => onProbe(n)}
                title="Add probe"
                className="w-5 h-5 rounded-sm bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
              >
                <Plus size={10} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── CircuitCanvas ───────────────────────────────────────────────── */
function CircuitCanvas({
  components,
  selectedId,
  wiringFrom,
  wiringWaypoints,
  pinVoltages,
  onSelect,
  onMove,
  onDropType,
  onPinClick,
  onCancelWire,
  onDelete,
  onAddWaypoint,
  onSnapshotNow,
  breadboard,
}: {
  components: CircuitComp[];
  selectedId: string | null;
  wiringFrom: string | null;
  wiringWaypoints: { x: number; y: number }[];
  pinVoltages: Record<string, number>;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onDropType: (t: CompType, x: number, y: number) => void;
  onPinClick: (pinId: string) => void;
  onCancelWire: () => void;
  onDelete: (id: string) => void;
  onAddWaypoint: (x: number, y: number) => void;
  onSnapshotNow: () => void;
  breadboard: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);

  const undo = useCircuitSimStore((s) => s.undo);
  const redo = useCircuitSimStore((s) => s.redo);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && wiringFrom) onCancelWire();
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedId &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement?.tagName ?? '').toUpperCase())
      ) {
        onDelete(selectedId);
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'y' || (e.shiftKey && e.key === 'z'))
      ) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wiringFrom, selectedId, onCancelWire, onDelete, undo, redo]);

  const pinPos = (c: CircuitComp, pin: string): { x: number; y: number } => {
    const spec = COMPONENT_SPECS[c.type];
    if (c.type === 'ground') return { x: c.x + spec.width / 2, y: c.y };
    if (c.type === 'diode' || c.type === 'led') {
      return pin === 'a'
        ? { x: c.x, y: c.y + spec.height / 2 }
        : { x: c.x + spec.width, y: c.y + spec.height / 2 };
    }
    if (
      c.type === 'vsource' ||
      c.type === 'vsource_ac' ||
      c.type === 'isource' ||
      c.type === 'battery' ||
      c.type === 'ammeter' ||
      c.type === 'voltmeter' ||
      c.type === 'lamp'
    ) {
      return pin === 'p' || pin === 'a'
        ? { x: c.x + spec.width / 2, y: c.y }
        : { x: c.x + spec.width / 2, y: c.y + spec.height };
    }
    if (c.type === 'potentiometer') {
      if (pin === 'a') return { x: c.x, y: c.y + spec.height / 2 };
      if (pin === 'b') return { x: c.x + spec.width, y: c.y + spec.height / 2 };
      return { x: c.x + spec.width / 2, y: c.y };
    }
    if (c.type === 'opamp') {
      if (pin === 'p') return { x: c.x, y: c.y + spec.height * 0.3 };
      if (pin === 'n') return { x: c.x, y: c.y + spec.height * 0.7 };
      return { x: c.x + spec.width, y: c.y + spec.height / 2 };
    }
    return pin === 'a'
      ? { x: c.x, y: c.y + spec.height / 2 }
      : { x: c.x + spec.width, y: c.y + spec.height / 2 };
  };

  const screenToCanvas = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Snap a canvas coordinate to the 20px grid */
  const snap = (v: number) => Math.round(v / 20) * 20;

  /** Handler for clicks on background (rect or svg element directly) */
  const handleBgMouseDown = (e: React.MouseEvent) => {
    if (wiringFrom) {
      const p = screenToCanvas(e);
      onAddWaypoint(snap(p.x), snap(p.y));
    } else {
      onSelect(null);
    }
  };

  const wires = components.filter((c) => c.type === 'wire');
  const shapes = components.filter((c) => c.type !== 'wire');

  return (
    <svg
      ref={svgRef}
      className="flex-1 block"
      style={{ background: '#0b1020', cursor: wiringFrom ? 'crosshair' : 'default' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const t = e.dataTransfer.getData('text/x-engos-comp') as CompType;
        if (!t) return;
        const p = screenToCanvas(e);
        onDropType(t, p.x, p.y);
      }}
      onMouseMove={(e) => {
        const p = screenToCanvas(e);
        if (wiringFrom) {
          // Snap cursor to grid while wiring — wire segments align cleanly
          setCursor({ x: snap(p.x), y: snap(p.y) });
        } else {
          setCursor(p);
        }
      }}
      onMouseLeave={() => setCursor(null)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (wiringFrom) onCancelWire();
      }}
    >
      <defs>
        <pattern id="ckt-grid" width={20} height={20} patternUnits="userSpaceOnUse">
          <circle cx={1} cy={1} r={0.7} fill="rgba(255,255,255,0.16)" />
        </pattern>
        <pattern id="bb-holes" width={14} height={14} patternUnits="userSpaceOnUse">
          <rect width={14} height={14} fill="#1c2433" />
          <rect x={5} y={5} width={4} height={4} rx={1} fill="#0b0f17" />
        </pattern>
      </defs>

      {/* Background — click handler lives here so all empty-space clicks route correctly */}
      {breadboard ? (
        <g>
          <rect width={size.w} height={size.h} fill="#243049" onMouseDown={handleBgMouseDown} />
          <rect x={0} y={10} width={size.w} height={4} fill="#b91c1c" opacity={0.5} onMouseDown={handleBgMouseDown} />
          <rect x={0} y={size.h - 14} width={size.w} height={4} fill="#1d4ed8" opacity={0.5} onMouseDown={handleBgMouseDown} />
          <rect x={0} y={28} width={size.w} height={size.h - 56} fill="url(#bb-holes)" onMouseDown={handleBgMouseDown} />
          <rect x={0} y={size.h / 2 - 6} width={size.w} height={12} fill="#1a2233" onMouseDown={handleBgMouseDown} />
        </g>
      ) : (
        <rect width={size.w} height={size.h} fill="url(#ckt-grid)" onMouseDown={handleBgMouseDown} />
      )}

      {/* ── Completed wires ─────────────────────────────────────── */}
      {wires.map((w) => {
        const [aId, aPin] = (w.pins.a ?? '').split('.');
        const [bId, bPin] = (w.pins.b ?? '').split('.');
        const a = components.find((c) => c.id === aId);
        const b = components.find((c) => c.id === bId);
        if (!a || !b) return null;
        const ap = pinPos(a, aPin);
        const bp = pinPos(b, bPin);
        const pts = [ap, ...(w.waypoints ?? []), bp];
        const d = manhattanPath(pts);
        const hovered = hoveredWireId === w.id;
        return (
          <path
            key={w.id}
            d={d}
            stroke={hovered ? '#fbbf24' : '#94a3b8'}
            strokeWidth={hovered ? 2.5 : 1.5}
            fill="none"
            style={{ cursor: hovered ? 'pointer' : 'default', transition: 'stroke 0.1s, stroke-width 0.1s' }}
            onMouseEnter={() => setHoveredWireId(w.id)}
            onMouseLeave={() => setHoveredWireId(null)}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (e.shiftKey) onDelete(w.id);
            }}
          >
            <title>shift-click to delete</title>
          </path>
        );
      })}

      {/* ── Wire-in-progress ──────────────────────────────────────── */}
      {wiringFrom && cursor && (() => {
        const [cid, pin] = wiringFrom.split('.');
        const comp = components.find((c) => c.id === cid);
        if (!comp) return null;
        const start = pinPos(comp, pin);
        const pts = [start, ...wiringWaypoints, cursor];
        const d = manhattanPath(pts);
        return (
          <g pointerEvents="none">
            {/* Wire path */}
            <path
              d={d}
              stroke="#0A84FF"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              fill="none"
            />
            {/* Locked waypoint squares */}
            {wiringWaypoints.map((wp, i) => (
              <rect
                key={i}
                x={wp.x - 4}
                y={wp.y - 4}
                width={8}
                height={8}
                rx={1.5}
                fill="#0A84FF"
                stroke="#0f172a"
                strokeWidth={1.2}
                opacity={0.9}
              />
            ))}
            {/* Live cursor dot */}
            <circle cx={cursor.x} cy={cursor.y} r={4} fill="#0A84FF" opacity={0.75} />
          </g>
        );
      })()}

      {/* ── Components ───────────────────────────────────────────── */}
      {shapes.map((c) => (
        <CompShape
          key={c.id}
          comp={c}
          selected={c.id === selectedId}
          wiringActive={!!wiringFrom}
          pinVoltages={pinVoltages}
          onSelect={() => onSelect(c.id)}
          onMove={(nx, ny) => onMove(c.id, nx, ny)}
          onPinClick={(pin) => onPinClick(`${c.id}.${pin}`)}
          onSnapshotNow={onSnapshotNow}
          screenToCanvas={screenToCanvas}
        />
      ))}
    </svg>
  );
}

/* ── CompShape ───────────────────────────────────────────────────── */
function CompShape({
  comp,
  selected,
  wiringActive,
  pinVoltages,
  onSelect,
  onMove,
  onPinClick,
  onSnapshotNow,
  screenToCanvas,
}: {
  comp: CircuitComp;
  selected: boolean;
  wiringActive: boolean;
  pinVoltages: Record<string, number>;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  /** Called with just the pin name; CircuitCanvas prepends the compId */
  onPinClick: (pin: string) => void;
  onSnapshotNow: () => void;
  screenToCanvas: (e: { clientX: number; clientY: number }) => { x: number; y: number };
}) {
  const spec = COMPONENT_SPECS[comp.type];
  const stroke = selected ? '#0A84FF' : wiringActive ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.55)';

  /* Pin positions relative to component origin */
  const pinPoints = spec.pins.map((pin) => {
    let x = 0, y = 0;
    if (comp.type === 'ground') { x = spec.width / 2; y = 0; }
    else if (comp.type === 'diode' || comp.type === 'led') {
      x = pin === 'a' ? 0 : spec.width; y = spec.height / 2;
    } else if (
      comp.type === 'vsource' || comp.type === 'vsource_ac' ||
      comp.type === 'isource' || comp.type === 'battery' ||
      comp.type === 'ammeter' || comp.type === 'voltmeter' || comp.type === 'lamp'
    ) {
      x = spec.width / 2; y = (pin === 'p' || pin === 'a') ? 0 : spec.height;
    } else if (comp.type === 'potentiometer') {
      if (pin === 'a') { x = 0; y = spec.height / 2; }
      else if (pin === 'b') { x = spec.width; y = spec.height / 2; }
      else { x = spec.width / 2; y = 0; }
    } else if (comp.type === 'opamp') {
      if (pin === 'p') { x = 0; y = spec.height * 0.3; }
      else if (pin === 'n') { x = 0; y = spec.height * 0.7; }
      else { x = spec.width; y = spec.height / 2; }
    } else {
      x = pin === 'a' ? 0 : spec.width; y = spec.height / 2;
    }
    return { name: pin, x, y };
  });

  const onBodyDown = (e: React.MouseEvent) => {
    e.stopPropagation();

    /* Always find the nearest pin — used for both wiring and click-to-wire */
    const p0 = screenToCanvas(e);
    const relX = p0.x - comp.x;
    const relY = p0.y - comp.y;
    const nearest = pinPoints.length > 0
      ? pinPoints.reduce(
          (best, pp) => {
            const dist = Math.hypot(relX - pp.x, relY - pp.y);
            return dist < best.dist ? { pin: pp.name, dist } : best;
          },
          { pin: pinPoints[0].name, dist: Infinity },
        )
      : null;

    /* While wiring: body click immediately completes wire at nearest pin */
    if (wiringActive) {
      if (nearest) onPinClick(nearest.pin);
      return;
    }

    /* Not wiring: select the component, then distinguish drag vs click.
       - Drag (> 6 px movement)  → move component
       - Click (no significant movement) → start a wire from nearest pin
       This means clicking any two components auto-creates a wire between
       their nearest pins — no need to hit tiny pin dots precisely. */
    onSelect();
    let didDrag = false;
    let snapshotted = false;
    const originX = comp.x;
    const originY = comp.y;

    const onMv = (ev: MouseEvent) => {
      const np = screenToCanvas(ev);
      if (Math.hypot(np.x - p0.x, np.y - p0.y) > 6) {
        if (!snapshotted) {
          onSnapshotNow(); // snapshot before first pixel of movement
          snapshotted = true;
        }
        didDrag = true;
        onMove(originX + np.x - p0.x, originY + np.y - p0.y);
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMv);
      window.removeEventListener('mouseup', onUp);
      /* Click (no drag) → start wire from nearest pin */
      if (!didDrag && nearest) {
        onPinClick(nearest.pin); // beginWire called in parent since !wiringActive
      }
    };

    window.addEventListener('mousemove', onMv);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <g transform={`translate(${comp.x}, ${comp.y})`}>
      {/* ── Body shape ── */}
      {comp.type === 'ground' ? (
        <g onMouseDown={onBodyDown} style={{ cursor: wiringActive ? 'crosshair' : 'move' }}>
          <line x1={spec.width / 2} y1={0} x2={spec.width / 2} y2={8} stroke={stroke} strokeWidth={1.4} />
          <line x1={4} y1={8} x2={spec.width - 4} y2={8} stroke={stroke} strokeWidth={1.4} />
          <line x1={9} y1={14} x2={spec.width - 9} y2={14} stroke={stroke} strokeWidth={1.4} />
          <line x1={13} y1={20} x2={spec.width - 13} y2={20} stroke={stroke} strokeWidth={1.4} />
        </g>
      ) : comp.type === 'vsource' || comp.type === 'vsource_ac' || comp.type === 'isource' ? (
        <g onMouseDown={onBodyDown} style={{ cursor: wiringActive ? 'crosshair' : 'move' }}>
          <circle
            cx={spec.width / 2}
            cy={spec.height / 2}
            r={spec.width / 2 - 4}
            fill={wiringActive ? 'rgba(10,132,255,0.06)' : 'rgba(255,255,255,0.04)'}
            stroke={stroke}
            strokeWidth={wiringActive ? 1.8 : 1.4}
          />
          <text x={spec.width / 2} y={spec.height / 2 + 4} textAnchor="middle" fontSize={11} fill="white" fontFamily="JetBrains Mono, monospace" pointerEvents="none">
            {spec.symbol}
          </text>
          <text x={spec.width / 2} y={spec.height + 12} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.65)" fontFamily="JetBrains Mono, monospace" pointerEvents="none">
            {fmtValue(comp.value, spec.unit)}{comp.type === 'vsource_ac' ? `@${comp.freq}Hz` : ''}
          </text>
          {/* Polarity indicators for voltage sources */}
          <text x={spec.width / 2} y={8} textAnchor="middle" fontSize={8} fill="rgba(96,165,250,0.75)" fontFamily="monospace" pointerEvents="none">+</text>
          <text x={spec.width / 2} y={spec.height - 1} textAnchor="middle" fontSize={8} fill="rgba(248,113,113,0.75)" fontFamily="monospace" pointerEvents="none">−</text>
        </g>
      ) : comp.type === 'diode' ? (
        <g onMouseDown={onBodyDown} style={{ cursor: wiringActive ? 'crosshair' : 'move' }}>
          <polygon
            points={`6,4 ${spec.width - 6},${spec.height / 2} 6,${spec.height - 4}`}
            fill={wiringActive ? 'rgba(10,132,255,0.06)' : 'rgba(255,255,255,0.08)'}
            stroke={stroke}
            strokeWidth={1.4}
          />
          <line x1={spec.width - 6} y1={4} x2={spec.width - 6} y2={spec.height - 4} stroke={stroke} strokeWidth={1.5} />
        </g>
      ) : (
        <g onMouseDown={onBodyDown} style={{ cursor: wiringActive ? 'crosshair' : 'move' }}>
          <rect
            width={spec.width}
            height={spec.height}
            rx={4}
            fill={wiringActive ? 'rgba(10,132,255,0.06)' : 'rgba(255,255,255,0.05)'}
            stroke={stroke}
            strokeWidth={wiringActive ? 1.8 : 1.4}
          />
          <text
            x={spec.width / 2}
            y={spec.height / 2 + 4}
            textAnchor="middle"
            fontSize={11}
            fill="white"
            fontFamily="JetBrains Mono, monospace"
            pointerEvents="none"
          >
            {spec.symbol}
          </text>
          <text
            x={spec.width / 2}
            y={spec.height + 12}
            textAnchor="middle"
            fontSize={10}
            fill="rgba(255,255,255,0.65)"
            fontFamily="JetBrains Mono, monospace"
            pointerEvents="none"
          >
            {fmtValue(comp.value, spec.unit)}
          </text>
        </g>
      )}

      {/* ── Pin dots + voltage overlay ── */}
      {pinPoints.map((p) => {
        const pinId = `${comp.id}.${p.name}`;
        const voltage = pinVoltages[pinId];
        /* Determine label anchor based on pin edge */
        const onLeft = p.x <= spec.width * 0.25;
        const onTop = p.y <= spec.height * 0.25;
        const onBottom = p.y >= spec.height * 0.75;
        const lblX = onLeft ? p.x - 5 : p.x + 5;
        const lblY = onTop ? p.y - 4 : onBottom ? p.y + 10 : p.y - 6;
        const anchor = onLeft ? 'end' : 'start';

        return (
          <g key={p.name}>
            <circle
              cx={p.x}
              cy={p.y}
              r={wiringActive ? 6 : 4}
              fill={wiringActive ? '#0A84FF' : '#475569'}
              stroke="#0f172a"
              strokeWidth={1}
              onMouseDown={(e) => {
                e.stopPropagation();
                onPinClick(p.name);
              }}
              style={{ cursor: 'crosshair' }}
              opacity={wiringActive ? 0.85 : 1}
            >
              <title>{p.name}</title>
            </circle>
            {/* DC voltage label — hidden while wiring to reduce clutter */}
            {voltage !== undefined && !wiringActive && (
              <text
                x={lblX}
                y={lblY}
                fontSize={7.5}
                fill="rgba(251,191,36,0.85)"
                fontFamily="JetBrains Mono, monospace"
                textAnchor={anchor}
                pointerEvents="none"
              >
                {voltage.toFixed(2)}V
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function fmtValue(v: number, unit: string): string {
  if (!unit) return '';
  const absV = Math.abs(v);
  if (absV >= 1e9) return `${(v / 1e9).toFixed(1)}G${unit}`;
  if (absV >= 1e6) return `${(v / 1e6).toFixed(1)}M${unit}`;
  if (absV >= 1e3) return `${(v / 1e3).toFixed(2)}k${unit}`;
  if (absV >= 1) return `${v.toFixed(2)}${unit}`;
  if (absV >= 1e-3) return `${(v * 1e3).toFixed(2)}m${unit}`;
  if (absV >= 1e-6) return `${(v * 1e6).toFixed(1)}µ${unit}`;
  if (absV >= 1e-9) return `${(v * 1e9).toFixed(1)}n${unit}`;
  return `${v.toExponential(2)}${unit}`;
}

/* ── Oscilloscope ────────────────────────────────────────────────── */
function Oscilloscope({
  transient,
  probes,
  mode,
  setMode,
  removeProbe,
  onClose,
}: {
  transient: ReturnType<typeof useCircuitSimStore.getState>['transient'];
  probes: ReturnType<typeof useCircuitSimStore.getState>['probes'];
  mode: 'time' | 'fft';
  setMode: (m: 'time' | 'fft') => void;
  removeProbe: (id: string) => void;
  onClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const W = 300;
  const H = 220;
  const PAD = 28;

  const exportCSV = () => {
    if (!transient || !probes.length) return;
    const cols = ['t', ...probes.map((p) => p.node)];
    const lines = [cols.join(',')];
    for (let i = 0; i < transient.t.length; i++) {
      const row = [transient.t[i]];
      for (const p of probes) row.push(transient.nodeVoltages[p.node]?.[i] ?? 0);
      lines.push(row.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scope.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  let yMin = -1, yMax = 1;
  if (transient && probes.length) {
    yMin = Infinity; yMax = -Infinity;
    for (const p of probes) {
      const arr = transient.nodeVoltages[p.node] ?? [];
      for (const v of arr) {
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    else { const pad = (yMax - yMin) * 0.1; yMin -= pad; yMax += pad; }
  }

  const tMin = transient?.t[0] ?? 0;
  const tMax = transient ? transient.t[transient.t.length - 1] : 1;
  const xp = (t: number) => PAD + ((t - tMin) / (tMax - tMin || 1)) * (W - 2 * PAD);
  const yp = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin || 1)) * (H - 2 * PAD);

  return (
    <div
      className="shrink-0 border-l border-white/10 bg-black/30 flex flex-col chrome transition-all duration-200 overflow-hidden"
      style={{ width: collapsed ? 36 : 300 }}
    >
      {/* Header */}
      <div className="h-9 flex items-center px-2 gap-1 border-b border-white/10 shrink-0">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white shrink-0"
          title={collapsed ? 'Expand oscilloscope' : 'Collapse oscilloscope'}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>

        {!collapsed && (
          <>
            <div className="text-[11px] font-semibold whitespace-nowrap">Scope</div>
            <div className="ml-1 flex">
              {(['time', 'fft'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-1.5 h-5 text-[10px] rounded-md ${
                    mode === m ? 'bg-accent text-white' : 'hover:bg-white/10 text-white/65'
                  }`}
                >
                  {m === 'time' ? 'Time' : 'FFT'}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-0.5">
              <button onClick={exportCSV} className="p-1 rounded hover:bg-white/10" title="Export CSV">
                <Download size={11} />
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white"
                title="Close scope"
              >
                <X size={11} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="p-2 flex-1 overflow-y-auto">
          {probes.length === 0 && (
            <div className="text-[11px] text-white/40 text-center mt-8 leading-relaxed px-2">
              Add probes from the<br />nodes panel →
            </div>
          )}
          {probes.length > 0 && (
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block rounded-md bg-black/40">
              {/* Grid lines */}
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={f}
                  x1={PAD}
                  y1={PAD + f * (H - 2 * PAD)}
                  x2={W - PAD}
                  y2={PAD + f * (H - 2 * PAD)}
                  stroke="rgba(255,255,255,0.06)"
                />
              ))}
              {/* Axes */}
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgba(255,255,255,0.25)" />
              <line x1={PAD} y1={PAD / 2} x2={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.25)" />
              {yMin < 0 && yMax > 0 && (
                <line
                  x1={PAD}
                  y1={yp(0)}
                  x2={W - PAD}
                  y2={yp(0)}
                  stroke="rgba(255,255,255,0.18)"
                  strokeDasharray="3 3"
                />
              )}
              <text x={PAD - 4} y={PAD / 2 + 4} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="monospace" textAnchor="end">
                {yMax.toFixed(1)}V
              </text>
              <text x={PAD - 4} y={H - PAD + 4} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="monospace" textAnchor="end">
                {yMin.toFixed(1)}V
              </text>
              <text x={W - PAD} y={H - 4} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="monospace" textAnchor="end">
                {tMax.toExponential(1)}s
              </text>

              {transient &&
                probes.map((p) => {
                  const arr = transient.nodeVoltages[p.node] ?? [];
                  if (mode === 'fft') {
                    const fft = quickFFT(arr.slice(0, 256));
                    const norm = fft.map((c) => Math.hypot(c[0], c[1]));
                    const max = Math.max(...norm) || 1;
                    const path = norm
                      .slice(0, fft.length / 2)
                      .map((m, i) => {
                        const x = PAD + (i / (fft.length / 2)) * (W - 2 * PAD);
                        const y = H - PAD - (m / max) * (H - 2 * PAD);
                        return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
                      })
                      .join(' ');
                    return <path key={p.id} d={path} stroke={p.color} strokeWidth={1.2} fill="none" />;
                  }
                  const path = arr
                    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xp(transient.t[i])},${yp(v)}`)
                    .join(' ');
                  return (
                    <g key={p.id}>
                      <path d={path} stroke={p.color} strokeWidth={1.5} fill="none" />
                      <path
                        d={`${path} L ${xp(transient.t[arr.length - 1])},${H - PAD} L ${xp(transient.t[0])},${H - PAD} Z`}
                        fill={p.color}
                        fillOpacity={0.08}
                      />
                    </g>
                  );
                })}

              {/* Legend */}
              {probes.map((p, i) => (
                <g key={p.id} transform={`translate(${PAD + 4}, ${PAD / 2 + 2 + i * 13})`}>
                  <rect width={8} height={8} rx={1} fill={p.color} />
                  <text x={12} y={8} fill="white" fontSize={8} fontFamily="monospace">
                    {p.node.split('.')[0]}
                  </text>
                </g>
              ))}
            </svg>
          )}

          {/* Probe list */}
          <div className="mt-2 space-y-1">
            {probes.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 bg-white/5 rounded-md px-2 py-1 text-xs">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
                <span className="font-mono text-[11px] truncate flex-1">{p.node.split('.')[0]}</span>
                <button onClick={() => removeProbe(p.id)} className="text-white/40 hover:text-white/80">
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function quickFFT(input: number[]): Array<[number, number]> {
  const N = input.length;
  const out: Array<[number, number]> = [];
  for (let k = 0; k < N; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const phi = (-2 * Math.PI * k * n) / N;
      re += input[n] * Math.cos(phi);
      im += input[n] * Math.sin(phi);
    }
    out.push([re / N, im / N]);
  }
  return out;
}

/* ── PresetMenu ──────────────────────────────────────────────────── */
function PresetMenu({ onPick }: { onPick: (p: CircuitPreset) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
      >
        <BookOpen size={12} /> <span className="hidden sm:inline">Templates</span> <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 glass-strong rounded-md min-w-[240px] py-1 z-30 shadow-window">
          {CIRCUIT_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => { onPick(p); setOpen(false); }}
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
  );
}

const module: AppModule = {
  manifest: {
    id: 'circuitsim',
    name: 'CircuitSim',
    description: 'Analog circuits with MNA solver, transient analysis, scope',
    icon: CircuitSimIcon,
    defaultSize: { width: 1100, height: 680 },
    accent: 'linear-gradient(135deg, #facc15 0%, #f97316 100%)',
  },
  Component: CircuitSim,
};

export default module;
