import { useEffect, useRef, useState } from 'react';
import { FilePlus, Save, Upload, Play, Pause, Table2, RotateCcw, BookOpen, ChevronDown } from 'lucide-react';
import { LogicLabIcon } from '@/apps/icons';
import type { AppModule } from '@/os/types';
import Palette from './Palette';
import Canvas from './Canvas';
import Properties from './Properties';
import TruthTableView from './TruthTable';
import { useLogicLabStore } from '@/store/logicLabStore';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';
import type { GateType, Circuit, Bit } from '@/lib/logicsim/types';
import { pinId } from '@/lib/logicsim/types';
import { PRESETS } from '@/lib/logicsim/presets';

function LogicLab({ appId }: { appId: string }) {
  const tick = useLogicLabStore((s) => s.tick);
  const running = useLogicLabStore((s) => s.running);
  const setRunning = useLogicLabStore((s) => s.setRunning);
  const newCircuit = useLogicLabStore((s) => s.newCircuit);
  const serialize = useLogicLabStore((s) => s.serialize);
  const load = useLogicLabStore((s) => s.load);
  const components = useLogicLabStore((s) => s.components);
  const connections = useLogicLabStore((s) => s.connections);
  const [showTable, setShowTable] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);

  // Animation loop driving the simulator
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (useLogicLabStore.getState().running) tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tick]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveFile = () => {
    const data = serialize();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'circuit.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const loadFile = () => fileInputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Circuit;
      load(parsed);
    } catch (err) {
      const { toast } = await import('@/store/toastStore');
      toast.error('Failed to load circuit', (err as Error).message);
    } finally {
      e.target.value = '';
    }
  };

  // Publish state for the AI scanner
  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `LogicLab has ${components.length} component(s) and ${connections.length} connection(s). Components: ${components
        .map((c) => `${c.type}(${c.id})`)
        .join(', ')}. Simulation is ${useLogicLabStore.getState().running ? 'running' : 'paused'}.`,
      state: {
        components: components.map((c) => ({
          id: c.id,
          type: c.type,
          x: c.x,
          y: c.y,
          state: c.state,
        })),
        connections: connections.map((c) => ({ id: c.id, from: c.from, to: c.to })),
      },
    }));
  }, [appId, components, connections]);

  // AI tools
  useAppTools(appId, [
    {
      toolName: 'spawn_gate',
      description:
        'Add a logic component to the canvas. type is one of: input, output, not, and, or, nand, nor, xor, xnor, clock, seg7. Returns the new component id.',
      input_schema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['input', 'output', 'not', 'and', 'or', 'nand', 'nor', 'xor', 'xnor', 'clock', 'seg7'],
          },
          x: { type: 'number', description: 'Canvas X coordinate' },
          y: { type: 'number', description: 'Canvas Y coordinate' },
        },
        required: ['type', 'x', 'y'],
      },
      handler: ({ type, x, y }: any) =>
        ({ id: useLogicLabStore.getState().addComponent(type as GateType, Number(x), Number(y)) }),
    },
    {
      toolName: 'connect',
      description:
        'Connect an output pin to an input pin. Pin ids are "<componentId>:<pinName>" where pinName is "out", "a", "b", "in", or for seg7 "d0".."d3". Returns the connection id.',
      input_schema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Source pin id (an output pin)' },
          to: { type: 'string', description: 'Target pin id (an input pin)' },
        },
        required: ['from', 'to'],
      },
      handler: ({ from, to }: any) => {
        const store = useLogicLabStore.getState();
        store.beginWire(String(from));
        const c = store.completeWire(String(to));
        if (!c) throw new Error('Invalid connection');
        return { id: c.id };
      },
    },
    {
      toolName: 'set_input',
      description: 'Set the value of an INPUT switch component (0 or 1).',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'INPUT component id' },
          value: { type: 'number', description: '0 or 1' },
        },
        required: ['id', 'value'],
      },
      handler: ({ id, value }: any) => {
        useLogicLabStore.getState().updateState(String(id), { value: Number(value) === 1 ? 1 : 0 });
        return { ok: true };
      },
    },
    {
      toolName: 'remove',
      description: 'Remove a component (and all its connections) from the canvas.',
      input_schema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: ({ id }: any) => {
        useLogicLabStore.getState().removeComponent(String(id));
        return { ok: true };
      },
    },
    {
      toolName: 'get_state',
      description: 'Get the full circuit state: components, connections, and current pin values.',
      input_schema: { type: 'object', properties: {} },
      handler: () => {
        const s = useLogicLabStore.getState();
        return {
          components: s.components.map((c) => ({
            id: c.id,
            type: c.type,
            x: c.x,
            y: c.y,
            state: c.state,
          })),
          connections: s.connections,
          pinValues: Object.fromEntries(
            Array.from(s.pinValues.entries()).map(([k, v]: [string, Bit]) => [k, v]),
          ),
          oscillating: Array.from(s.oscillating),
        };
      },
    },
    {
      toolName: 'clear',
      description: 'Clear all components and connections (new circuit).',
      input_schema: { type: 'object', properties: {} },
      handler: () => {
        useLogicLabStore.getState().newCircuit();
        return { ok: true };
      },
    },
    {
      toolName: 'generate_circuit',
      description:
        'Convenience scaffolding: given an array of components and connections, replace the current circuit with that layout. Components: {id?, type, x, y, state?}. Connections: {from, to}. Pin ids are resolved relative to provided component ids.',
      input_schema: {
        type: 'object',
        properties: {
          components: { type: 'array', description: 'Array of {id?, type, x, y, state?}' },
          connections: { type: 'array', description: 'Array of {from, to} with pin ids "<id>:<pin>"' },
        },
        required: ['components'],
      },
      handler: ({ components: comps, connections: conns }: any) => {
        const store = useLogicLabStore.getState();
        store.newCircuit();
        const idMap = new Map<string, string>();
        const newIds: string[] = [];
        for (const c of comps ?? []) {
          const newId = store.addComponent(c.type as GateType, Number(c.x), Number(c.y));
          if (c.id) idMap.set(c.id, newId);
          if (c.state) useLogicLabStore.getState().updateState(newId, c.state);
          newIds.push(newId);
        }
        for (const w of conns ?? []) {
          const remap = (s: string) => {
            const [cid, pname] = String(s).split(':');
            return pinId(idMap.get(cid) ?? cid, pname);
          };
          const from = remap(w.from);
          const to = remap(w.to);
          useLogicLabStore.getState().beginWire(from);
          useLogicLabStore.getState().completeWire(to);
        }
        return { ids: newIds };
      },
    },
  ]);

  return (
    <div className="flex flex-col h-full relative">
      {/* Top bar */}
      <div className="flex items-center gap-1 px-2 h-9 border-b border-white/10 chrome">
        <ToolbarButton onClick={() => { newCircuit(); setShowTable(false); }} title="New">
          <FilePlus size={13} /> New
        </ToolbarButton>
        <ToolbarButton onClick={saveFile} title="Save">
          <Save size={13} /> Save
        </ToolbarButton>
        <ToolbarButton onClick={loadFile} title="Load">
          <Upload size={13} /> Load
        </ToolbarButton>
        <input ref={fileInputRef} type="file" accept=".json" hidden onChange={onFile} />
        <div className="mx-1 w-px h-4 bg-white/15" />
        <ToolbarButton onClick={() => setRunning(!running)} title={running ? 'Pause' : 'Run'} accent>
          {running ? <Pause size={13} /> : <Play size={13} />}
          {running ? 'Pause' : 'Run'}
        </ToolbarButton>
        <ToolbarButton onClick={() => useLogicLabStore.getState().resettle()} title="Resettle">
          <RotateCcw size={13} /> Step
        </ToolbarButton>
        <div className="mx-1 w-px h-4 bg-white/15" />
        <ToolbarButton onClick={() => setShowTable(true)} title="Truth Table">
          <Table2 size={13} /> Truth Table
        </ToolbarButton>
        <ToolbarButton
          onClick={() => {
            const s = useLogicLabStore.getState();
            if (!s.components.length) return;
            // Compute bounds, fit viewport
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const c of s.components) {
              if (c.x < minX) minX = c.x;
              if (c.y < minY) minY = c.y;
              if (c.x > maxX) maxX = c.x;
              if (c.y > maxY) maxY = c.y;
            }
            const pad = 80;
            s.setViewport({ x: minX - pad, y: minY - pad });
          }}
          title="Center on circuit"
        >
          ⌂ Center
        </ToolbarButton>
        <div className="mx-1 w-px h-4 bg-white/15" />
        <div className="relative">
          <button
            onClick={() => setPresetsOpen((o) => !o)}
            className="flex items-center gap-1 px-2 h-7 rounded-md text-xs hover:bg-white/10 text-white/80"
          >
            <BookOpen size={13} /> Templates <ChevronDown size={11} />
          </button>
          {presetsOpen && (
            <div className="absolute top-full left-0 mt-1 glass-strong rounded-md min-w-[220px] py-1 z-30 shadow-window">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    load(p.build());
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
      </div>

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        <Palette />
        <div className="flex-1 relative min-w-0">
          <Canvas />
          <div className="absolute bottom-2 left-2 text-[10px] text-white/45 font-mono pointer-events-none bg-black/45 px-2 py-1 rounded">
            wheel = zoom · shift-drag = pan · click out-pin then in-pin = wire · shift-click wire = delete · del = delete component
          </div>
        </div>
        <Properties />
      </div>

      {showTable && <TruthTableView onClose={() => setShowTable(false)} />}
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  title,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1 px-2 h-7 rounded-md text-xs ${
        accent ? 'bg-accent hover:bg-accent-hover text-white' : 'hover:bg-white/10 text-white/80'
      }`}
    >
      {children}
    </button>
  );
}

const module: AppModule = {
  manifest: {
    id: 'logiclab',
    name: 'LogicLab',
    description: 'Build and simulate digital logic circuits',
    icon: LogicLabIcon,
    defaultSize: { width: 980, height: 620 },
    accent: 'linear-gradient(135deg, #22c55e 0%, #0ea5e9 100%)',
  },
  Component: LogicLab,
};

export default module;
