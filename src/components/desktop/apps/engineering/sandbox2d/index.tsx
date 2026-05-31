import { useEffect, useRef, useState } from 'react';
import {
  MousePointer2,
  Move,
  Maximize2,
  RotateCcw,
  PenLine,
  Circle,
  Square,
  Droplets,
  Cable,
  Link,
  Cog,
  Route,
  Eraser,
  Hand,
  Play,
  Pause,
  SkipBack,
  ChevronLeft,
  StepForward,
  SkipForward,
  Trash2,
  ChevronDown,
  LayoutGrid,
  HelpCircle,
  Stethoscope,
  Sparkles,
  SendHorizontal,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react';
import { Sandbox2DIcon } from '@/apps/icons';
import type { AppModule } from '@/os/types';
import {
  useSandbox2DStore,
  type Tool,
  type GridStyle,
  makeWaterParticles,
} from '@/store/sandbox2dStore';
import {
  makeBody,
  makeBox,
  makeCircle,
} from '@/lib/physics2d/types';
import { makePin, makeSpring } from '@/lib/physics2d/constraints';
import { publishAppState } from '@/ai/screenScanner';
import { sendSandboxAdvisorMessage } from '@/api/sandboxAdvisor';
import Renderer from './Renderer';

const PRESET_COLORS = [
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
  '#fb923c',
  '#facc15',
  '#34d399',
  '#22d3ee',
  '#f87171',
];

const BG_PRESETS = [
  { color: '#0c0c14', label: 'Dark' },
  { color: '#060d1a', label: 'Navy' },
  { color: '#0d1117', label: 'Charcoal' },
  { color: '#111827', label: 'Gray' },
  { color: '#1e293b', label: 'Slate' },
  { color: '#5fb1f0', label: 'Sky' },
  { color: '#f8fafc', label: 'Light' },
];

// Algodoo-style material presets: density, restitution (bounciness), friction
const MATERIALS = [
  { name: 'Wood',   density: 0.7, restitution: 0.25, friction: 0.55, color: '#c08457' },
  { name: 'Metal',  density: 7.8, restitution: 0.15, friction: 0.35, color: '#94a3b8' },
  { name: 'Stone',  density: 2.6, restitution: 0.10, friction: 0.65, color: '#6b7280' },
  { name: 'Ice',    density: 0.92, restitution: 0.05, friction: 0.02, color: '#bae6fd' },
  { name: 'Rubber', density: 1.2, restitution: 0.85, friction: 0.85, color: '#f87171' },
  { name: 'Cloud',  density: 0.2, restitution: 0.4,  friction: 0.4,  color: '#e2e8f0' },
];

const GRID_COLOR_PRESETS = [
  { color: 'rgba(255,255,255,0.05)', label: 'Subtle' },
  { color: 'rgba(255,255,255,0.15)', label: 'White' },
  { color: 'rgba(99,102,241,0.25)', label: 'Indigo' },
  { color: 'rgba(16,185,129,0.22)', label: 'Green' },
];

const TRACER_COLORS = [
  '#fbbf24', // amber (default)
  '#f87171', // red
  '#60a5fa', // blue
  '#34d399', // green
  '#a78bfa', // purple
  '#f472b6', // pink
  '#22d3ee', // cyan
  '#ffffff', // white
];


// Returns "#rrggbb" for the <input type=color> picker. Strips rgba/hex8 alpha.
function hexFromCss(c: string): string {
  if (c.startsWith('#') && (c.length === 7 || c.length === 4)) return c.length === 7 ? c : c;
  if (c.startsWith('#') && c.length === 9) return c.slice(0, 7);
  return '#fbbf24';
}

interface ToolDef {
  id: Tool;
  icon: React.ReactNode;
  label: string;
  desc: string;
  how: string;
}

const TOOLS: ToolDef[] = [
  {
    id: 'select',
    icon: <MousePointer2 size={15} />,
    label: 'Select & Move',
    desc: 'Click a body to select it, then drag to move it around - works on dynamic bodies AND stiff (static) bodies.',
    how: 'Click → select · Drag → move · Shift+drag → rotate · Alt+drag → force-move dynamic body while sim runs · Right-click → context menu',
  },
  {
    id: 'pan',
    icon: <Move size={15} />,
    label: 'Pan Camera',
    desc: 'Drag to scroll the viewport. Click a body to select it without moving it.',
    how: 'Click body → select · Drag → pan camera · Scroll → zoom',
  },
  {
    id: 'resize',
    icon: <Maximize2 size={15} />,
    label: 'Resize Body',
    desc: 'Drag outward from a body to scale it up, inward to shrink it. Mass updates automatically.',
    how: 'Click on a body and drag - distance from center controls scale. Release to confirm.',
  },
  {
    id: 'rotate',
    icon: <RotateCcw size={15} />,
    label: 'Rotate Body',
    desc: 'Click a body and orbit your mouse around it to spin it to any angle. Works on both static and dynamic bodies.',
    how: 'Click on a body then drag in a circle around it. The angle follows your mouse. Drag empty space to pan.',
  },
  {
    id: 'draw',
    icon: <PenLine size={15} />,
    label: 'Freehand Sketch',
    desc: 'Draw any closed shape - it becomes a solid convex polygon body that obeys physics.',
    how: 'Click and drag to sketch a path. Release to create the body.',
  },
  {
    id: 'circle',
    icon: <Circle size={15} />,
    label: 'Circle',
    desc: 'Create a ball / wheel. Great for stacking, rolling, and using with the motor tool.',
    how: 'Click and drag - distance from start sets the radius.',
  },
  {
    id: 'box',
    icon: <Square size={15} />,
    label: 'Box',
    desc: 'Create a rectangle. Use a long thin box as a plank, ramp, or wall.',
    how: 'Click and drag two opposite corners.',
  },
  {
    id: 'water',
    icon: <Droplets size={15} />,
    label: 'Water',
    desc: 'Spray SPH fluid particles. They flow, pool, and collide with solid bodies.',
    how: 'Click and hold to keep spraying. Use Eraser to remove water, or Scene → Clear water.',
  },
  {
    id: 'spring',
    icon: <Cable size={15} />,
    label: 'Spring',
    desc: 'Connect two bodies with a stretchy spring. Pulls them toward their rest length.',
    how: 'Drag from one body to another. Release on a second body to create the spring.',
  },
  {
    id: 'hinge',
    icon: <Link size={15} />,
    label: 'Hinge / Pin',
    desc: 'Pin two bodies together at a point so they swing freely around it - or pin a body to the world.',
    how: 'Drag between two bodies for a hinge. Drag from a body to empty space to pin it to the world.',
  },
  {
    id: 'motor',
    icon: <Cog size={15} />,
    label: 'Motor',
    desc: 'Make a body spin. Combine with a hinge to build wheels, fans, gears, walkers.',
    how: 'Click a body to add/toggle a motor. Tune speed & torque in the right panel.',
  },
  {
    id: 'tracer',
    icon: <Route size={15} />,
    label: 'Tracer',
    desc: 'Draws a trailing line behind a body - perfect for plotting trajectories.',
    how: 'Click a body to toggle the tracer on or off.',
  },
  {
    id: 'push',
    icon: <Hand size={15} />,
    label: 'Push',
    desc: 'Brush nearby bodies and water with velocity - like blowing on them.',
    how: 'Click and drag in the direction you want to push.',
  },
  {
    id: 'eraser',
    icon: <Eraser size={15} />,
    label: 'Eraser',
    desc: 'Delete bodies and water particles you brush over.',
    how: 'Click or click-and-drag over what you want to delete.',
  },
];

function Sandbox2D({ appId }: { appId: string }) {
  const tool = useSandbox2DStore((s) => s.tool);
  const setTool = useSandbox2DStore((s) => s.setTool);
  const running = useSandbox2DStore((s) => s.running);
  const toggleRunning = useSandbox2DStore((s) => s.toggleRunning);
  const timeScale = useSandbox2DStore((s) => s.timeScale);
  const setTimeScale = useSandbox2DStore((s) => s.setTimeScale);
  const currentColor = useSandbox2DStore((s) => s.currentColor);
  const setColor = useSandbox2DStore((s) => s.setColor);
  const selectedId = useSandbox2DStore((s) => s.selectedId);
  const rev = useSandbox2DStore((s) => s.rev);
  const mutate = useSandbox2DStore((s) => s.mutate);
  const clear = useSandbox2DStore((s) => s.clear);
  const clearParticles = useSandbox2DStore((s) => s.clearParticles);
  const setGravity = useSandbox2DStore((s) => s.setGravity);
  const toggleMotor = useSandbox2DStore((s) => s.toggleMotor);
  const setMotorSpeed = useSandbox2DStore((s) => s.setMotorSpeed);
  const setMotorTorque = useSandbox2DStore((s) => s.setMotorTorque);
  const removeMotor = useSandbox2DStore((s) => s.removeMotor);
  const motors = useSandbox2DStore((s) => s.motors);
  const tracers = useSandbox2DStore((s) => s.tracers);
  const toggleTracer = useSandbox2DStore((s) => s.toggleTracer);
  const setTracerColor = useSandbox2DStore((s) => s.setTracerColor);
  const setTracerWidth = useSandbox2DStore((s) => s.setTracerWidth);
  const clearTracerPath = useSandbox2DStore((s) => s.clearTracerPath);
  const world = useSandbox2DStore((s) => s.world);
  const particles = useSandbox2DStore((s) => s.particles);

  // Canvas settings
  const snapEnabled = useSandbox2DStore((s) => s.snapEnabled);
  const snapSize = useSandbox2DStore((s) => s.snapSize);
  const setSnap = useSandbox2DStore((s) => s.setSnap);
  const setSnapSize = useSandbox2DStore((s) => s.setSnapSize);
  const bgColor = useSandbox2DStore((s) => s.bgColor);
  const setBgColor = useSandbox2DStore((s) => s.setBgColor);
  const gridVisible = useSandbox2DStore((s) => s.gridVisible);
  const setGridVisible = useSandbox2DStore((s) => s.setGridVisible);
  const gridColor = useSandbox2DStore((s) => s.gridColor);
  const setGridColor = useSandbox2DStore((s) => s.setGridColor);
  const gridStyle = useSandbox2DStore((s) => s.gridStyle);
  const setGridStyle = useSandbox2DStore((s) => s.setGridStyle);
  const gridSize = useSandbox2DStore((s) => s.gridSize);
  const setGridSize = useSandbox2DStore((s) => s.setGridSize);

  // Timeline
  const history = useSandbox2DStore((s) => s.history);
  const historyIdx = useSandbox2DStore((s) => s.historyIdx);
  const seekHistory = useSandbox2DStore((s) => s.seekHistory);
  const scrubReturn = useSandbox2DStore((s) => s.scrubReturn);

  const [presetsOpen, setPresetsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [horizonsOpen, setHorizonsOpen] = useState(false);
  const [nhMessages, setNhMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [nhInput, setNhInput] = useState('');
  const [nhStreaming, setNhStreaming] = useState(false);
  const nhAbortRef = useRef<(() => void) | null>(null);
  const nhScrollRef = useRef<HTMLDivElement>(null);

  function buildSceneContext() {
    const s = useSandbox2DStore.getState();
    return {
      bodyCount: s.world.bodies.length,
      staticBodies: s.world.bodies.filter(b => b.isStatic).length,
      dynamicBodies: s.world.bodies.filter(b => !b.isStatic).length,
      waterParticles: s.particles.length,
      constraintCount: s.world.constraints.length,
      motorCount: s.motors.size,
      gravity: s.world.gravity,
      running: s.running,
      timeScale: s.timeScale,
      bodyShapes: [...new Set(s.world.bodies.map(b => b.shape.kind))],
    };
  }

  function sendNhMessage(text: string) {
    if (!text.trim() || nhStreaming) return;
    const userMsg = { role: 'user' as const, content: text.trim() };
    const next = [...nhMessages, userMsg];
    setNhMessages(next);
    setNhInput('');
    setNhStreaming(true);

    let accumulated = '';
    setNhMessages(msgs => [...msgs, { role: 'assistant', content: '' }]);

    const abort = sendSandboxAdvisorMessage(
      { messages: next.map(m => ({ role: m.role, content: m.content })), sceneContext: buildSceneContext() },
      {
        onChunk: (chunk: string) => {
          accumulated += chunk;
          setNhMessages(msgs => {
            const copy = [...msgs];
            copy[copy.length - 1] = { role: 'assistant', content: accumulated };
            return copy;
          });
          nhScrollRef.current?.scrollTo({ top: nhScrollRef.current.scrollHeight, behavior: 'smooth' });
        },
        onDone: () => { setNhStreaming(false); nhAbortRef.current = null; },
        onError: (err: string) => {
          setNhMessages(msgs => {
            const copy = [...msgs];
            copy[copy.length - 1] = { role: 'assistant', content: `Sorry, something went wrong: ${err}` };
            return copy;
          });
          setNhStreaming(false);
          nhAbortRef.current = null;
        },
      },
    );
    nhAbortRef.current = abort;
  }

  function handlePlay() {
    const s = useSandbox2DStore.getState();
    if (!s.running && s.historyIdx >= 0) {
      useSandbox2DStore.setState({ history: s.history.slice(0, s.historyIdx + 1), historyIdx: -1, running: true });
    } else {
      toggleRunning();
    }
  }

  function handleStepForward() {
    const s = useSandbox2DStore.getState();
    if (s.historyIdx >= 0) {
      if (s.historyIdx < s.history.length - 1) s.seekHistory(s.historyIdx + 1);
      else s.scrubReturn();
    } else {
      stepOnce();
    }
  }

  // All keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === ' ' && !isInput) {
        e.preventDefault();
        const s = useSandbox2DStore.getState();
        if (!s.running && s.historyIdx >= 0) {
          useSandbox2DStore.setState({ history: s.history.slice(0, s.historyIdx + 1), historyIdx: -1, running: true });
        } else {
          s.toggleRunning();
        }
        return;
      }
      if ((e.key === 'r' || e.key === 'R') && !isInput) {
        const s = useSandbox2DStore.getState();
        if (s.history.length > 0) s.seekHistory(0);
        return;
      }
      if (e.key === ',' && !isInput) {
        const s = useSandbox2DStore.getState();
        const idx = s.historyIdx >= 0 ? s.historyIdx - 1 : s.history.length - 1;
        if (idx >= 0) s.seekHistory(idx);
        return;
      }
      if (e.key === '.' && !isInput) {
        const s = useSandbox2DStore.getState();
        if (s.historyIdx >= 0) {
          if (s.historyIdx < s.history.length - 1) s.seekHistory(s.historyIdx + 1);
          else s.scrubReturn();
        } else {
          s.world.step(1 / 60);
          useSandbox2DStore.setState({ rev: s.rev + 1 });
        }
        return;
      }
      if (e.key === 'End' && !isInput) {
        useSandbox2DStore.getState().scrubReturn();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        const s = useSandbox2DStore.getState();
        if (!s.selectedId) return;
        s.mutate((w) => w.remove(s.selectedId!));
        s.setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selected = selectedId ? world.bodies.find((b) => b.id === selectedId) : null;
  const selectedMotor = selected ? motors.get(selected.id) : undefined;
  const selectedTracer = selected ? tracers.get(selected.id) : undefined;

  // App state for AI scanner
  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `Sandbox 2D: ${world.bodies.length} bodies, ${particles.length} water particles. Sim ${running ? 'running' : 'paused'} at ${timeScale}×. Tool: ${tool}.`,
      state: {
        bodyCount: world.bodies.length,
        particleCount: particles.length,
        running,
        tool,
        gravity: world.gravity,
      },
    }));
  }, [appId, running, timeScale, tool, rev, particles.length]);

  function addFloor() {
    const floor = makeBody(makeBox(12, 0.3), {
      pos: { x: 0, y: 4 },
      isStatic: true,
    });
    mutate((w) => w.add(floor));
  }

  function addContainer() {
    const opts = { isStatic: true };
    mutate((w) => {
      w.add(makeBody(makeBox(6, 0.25), { pos: { x: 0, y: 4.5 }, ...opts }));
      w.add(makeBody(makeBox(0.25, 4.5), { pos: { x: -6, y: 0.25 }, ...opts }));
      w.add(makeBody(makeBox(0.25, 4.5), { pos: { x: 6, y: 0.25 }, ...opts }));
    });
  }

  function stepOnce() {
    useSandbox2DStore.getState().world.step(1 / 60);
    useSandbox2DStore.setState({ rev: useSandbox2DStore.getState().rev + 1 });
  }

  return (
    <div className="flex h-full relative">
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} currentTool={tool} />}
      {doctorOpen && <DoctorModal onClose={() => setDoctorOpen(false)} />}
      {/* Left toolbar */}
      <div className="w-12 shrink-0 border-r border-white/10 bg-black/25 flex flex-col items-center py-2 gap-0.5 chrome">
        {TOOLS.map(({ id, icon, label }, i) => (
          <div key={id}>
            {(i === 4 || i === 7 || i === 8 || i === 12 || i === 13) && (
              <div className="my-1 h-px w-6 bg-white/15" />
            )}
            <button
              title={label}
              onClick={() => setTool(id)}
              className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                tool === id
                  ? 'bg-accent text-white'
                  : 'text-white/70 hover:bg-white/10'
              }`}
            >
              {icon}
            </button>
          </div>
        ))}

        {/* Color divider */}
        <div className="mt-auto mb-1 h-px w-6 bg-white/15" />

        {/* Color presets */}
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            title={c}
            onClick={() => setColor(c)}
            className={`w-6 h-6 rounded-md border-2 transition-all ${
              currentColor === c ? 'border-white scale-110' : 'border-transparent hover:border-white/40'
            }`}
            style={{ background: c }}
          />
        ))}
      </div>

      {/* Center */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="h-8 flex items-center px-2 gap-1 border-b border-white/10 chrome shrink-0">
          {/* Transport: ⏮ ⏪ ▶/⏸ ⏭ */}
          <div className="flex items-center gap-0.5 mr-0.5">
            <button
              title="Rewind to start [R]"
              onClick={() => { if (history.length > 0) seekHistory(0); }}
              disabled={history.length === 0}
              className="w-7 h-6 flex items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              <SkipBack size={12} />
            </button>
            <button
              title="Step back [,]"
              onClick={() => {
                const idx = historyIdx >= 0 ? historyIdx - 1 : history.length - 1;
                if (idx >= 0) seekHistory(idx);
              }}
              disabled={history.length === 0 || historyIdx === 0}
              className="w-7 h-6 flex items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              title={(running ? 'Pause' : 'Play') + ' [Space]'}
              onClick={handlePlay}
              className={`flex items-center gap-1 px-2 h-6 rounded-md text-xs font-medium transition-colors min-w-[52px] justify-center ${
                historyIdx >= 0
                  ? 'bg-amber-500/30 text-amber-300 hover:bg-amber-500/40'
                  : 'bg-accent hover:bg-accent-hover text-white'
              }`}
            >
              {running ? <Pause size={12} /> : <Play size={12} />}
              {running ? 'Pause' : historyIdx >= 0 ? 'Resume' : 'Run'}
            </button>
            <button
              title="Step forward [.]"
              onClick={handleStepForward}
              className="w-7 h-6 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors"
            >
              <StepForward size={12} />
            </button>
            <button
              title="Jump to present [End]"
              onClick={() => scrubReturn()}
              disabled={historyIdx === -1}
              className="w-7 h-6 flex items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              <SkipForward size={12} />
            </button>
          </div>

          <div className="h-4 w-px bg-white/15 mx-0.5" />

          {/* Snap toggle */}
          <button
            title={snapEnabled ? 'Snap to grid: ON - click to disable' : 'Snap to grid: OFF - click to enable'}
            onClick={() => setSnap(!snapEnabled)}
            className={`flex items-center gap-1 px-2 h-6 rounded-md text-xs transition-colors ${
              snapEnabled
                ? 'bg-indigo-500/30 text-indigo-300 hover:bg-indigo-500/40'
                : 'text-white/55 hover:bg-white/10'
            }`}
          >
            <LayoutGrid size={11} />
            Snap
          </button>

          {snapEnabled && (
            <select
              value={snapSize}
              onChange={(e) => setSnapSize(parseFloat(e.target.value))}
              className="h-6 rounded-md text-[11px] bg-white/5 border border-white/10 px-1 text-white/70 outline-none"
            >
              <option value="0.25">¼m</option>
              <option value="0.5">½m</option>
              <option value="1">1m</option>
              <option value="2">2m</option>
            </select>
          )}

          <div className="h-4 w-px bg-white/15 mx-0.5" />

          {/* Scene presets */}
          <div className="relative">
            <button
              onClick={() => setPresetsOpen((o) => !o)}
              className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
            >
              Scene <ChevronDown size={11} />
            </button>
            {presetsOpen && (
              <div className="absolute top-full left-0 mt-1 glass-strong rounded-md min-w-[180px] py-1 z-30 shadow-window max-h-[420px] overflow-y-auto">
                <div className="px-3 py-1 text-[10px] uppercase text-white/35 tracking-wider">Build blocks</div>
                <PresetBtn label="Add floor" onClick={() => { addFloor(); setPresetsOpen(false); }} />
                <PresetBtn label="Add container" onClick={() => { addContainer(); setPresetsOpen(false); }} />
                <PresetBtn label="Ball pit" onClick={() => { ballPit(); setPresetsOpen(false); }} />
                <div className="my-1 h-px bg-white/10" />
                <div className="px-3 py-1 text-[10px] uppercase text-white/35 tracking-wider">Demos</div>
                <PresetBtn label="Pendulum" onClick={() => { demoPendulum(); setPresetsOpen(false); }} />
                <PresetBtn label="Newton's cradle" onClick={() => { demoNewtonsCradle(); setPresetsOpen(false); }} />
                <PresetBtn label="Wrecking ball" onClick={() => { demoWreckingBall(); setPresetsOpen(false); }} />
                <PresetBtn label="Domino chain" onClick={() => { demoDominoes(); setPresetsOpen(false); }} />
                <PresetBtn label="Box tower" onClick={() => { demoTower(); setPresetsOpen(false); }} />
                <PresetBtn label="See-saw" onClick={() => { demoSeesaw(); setPresetsOpen(false); }} />
                <PresetBtn label="Car with motors" onClick={() => { demoCar(); setPresetsOpen(false); }} />
                <PresetBtn label="Water funnel" onClick={() => { demoFunnel(); setPresetsOpen(false); }} />
                <div className="my-1 h-px bg-white/10" />
                <PresetBtn label="Clear water" onClick={() => { clearParticles(); setPresetsOpen(false); }} />
                <PresetBtn label="Clear all" danger onClick={() => { clear(); setPresetsOpen(false); }} />
              </div>
            )}
          </div>

          {/* Gravity presets */}
          <div className="h-4 w-px bg-white/15 mx-0.5" />
          <span className="text-[10px] text-white/45">Gravity</span>
          <button onClick={() => setGravity(0, 9.81)} className="px-1.5 h-6 rounded-md text-[10px] hover:bg-white/10" title="Normal gravity">↓</button>
          <button onClick={() => setGravity(0, -9.81)} className="px-1.5 h-6 rounded-md text-[10px] hover:bg-white/10" title="Reverse gravity">↑</button>
          <button onClick={() => setGravity(0, 0)} className="px-1.5 h-6 rounded-md text-[10px] hover:bg-white/10" title="Zero gravity">0g</button>
          <button onClick={() => setGravity(0, 2)} className="px-1.5 h-6 rounded-md text-[10px] hover:bg-white/10" title="Moon gravity">🌙</button>

          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-white/55">
            Speed
            <input
              type="range"
              min={0.1}
              max={8}
              step={0.1}
              value={timeScale}
              onChange={(e) => setTimeScale(parseFloat(e.target.value))}
              className="w-20"
            />
            <span className="font-mono w-8 text-right">{timeScale.toFixed(2)}×</span>

            <div className="h-4 w-px bg-white/15 mx-1" />

            <button
              onClick={() => setDoctorOpen(true)}
              title="Scan the scene for common problems and offer one-click fixes"
              className="flex items-center gap-1 px-2 h-6 rounded-md text-xs bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-200"
            >
              <Stethoscope size={12} />
              AI Doctor
            </button>

            <button
              onClick={() => setHorizonsOpen(o => !o)}
              title="New Horizons - chat with an AI advisor about your scene"
              className={`flex items-center gap-1 px-2 h-6 rounded-md text-xs transition-colors ${
                horizonsOpen
                  ? 'bg-gradient-to-r from-violet-500/40 to-pink-500/40 text-white'
                  : 'bg-gradient-to-r from-violet-500/20 to-pink-500/20 hover:from-violet-500/35 hover:to-pink-500/35 text-violet-200'
              }`}
            >
              <Sparkles size={12} />
              New Horizons
            </button>

            <button
              onClick={() => setHelpOpen(true)}
              title="What do the tools do? (?)"
              className="flex items-center gap-1 px-2 h-6 rounded-md text-xs bg-white/5 hover:bg-white/15 text-white/80"
            >
              <HelpCircle size={12} />
              Help
            </button>
          </div>
        </div>

        {/* Timeline scrubber - only visible once history exists */}
        {history.length > 1 && (
          <div className="flex items-center gap-2 px-3 h-7 border-b border-white/10 bg-black/20 shrink-0">
            {/* time label */}
            <span className={`text-[10px] font-mono w-10 shrink-0 tabular-nums ${historyIdx >= 0 ? 'text-amber-300' : 'text-white/35'}`}>
              {historyIdx >= 0 ? `${(historyIdx / 30).toFixed(1)}s` : 'live'}
            </span>

            {/* scrubber */}
            <input
              type="range"
              min={0}
              max={history.length - 1}
              value={historyIdx >= 0 ? historyIdx : history.length - 1}
              step={1}
              onChange={(e) => {
                const idx = parseInt(e.target.value);
                if (idx >= history.length - 1) scrubReturn();
                else seekHistory(idx);
              }}
              className="flex-1 cursor-pointer"
              style={{ accentColor: historyIdx >= 0 ? '#f59e0b' : '#6366f1' }}
            />

            {/* total duration */}
            <span className="text-[10px] font-mono text-white/30 w-10 text-right shrink-0 tabular-nums">
              {((history.length - 1) / 30).toFixed(1)}s
            </span>

            {/* jump-to-live button when scrubbing */}
            {historyIdx >= 0 && (
              <button
                onClick={() => scrubReturn()}
                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 hover:bg-amber-500/40 shrink-0 transition-colors"
              >
                live ▶
              </button>
            )}
          </div>
        )}

        {/* Canvas + New Horizons panel */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 relative">
            <Renderer />
          </div>

          {/* New Horizons chat panel */}
          {horizonsOpen && (
            <div className="w-72 shrink-0 flex flex-col border-l border-violet-500/30 bg-black/60 backdrop-blur-sm">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-violet-500/20 bg-gradient-to-r from-violet-600/20 to-pink-600/20">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={13} className="text-violet-300" />
                  <span className="text-sm font-semibold text-white">New Horizons</span>
                </div>
                <button
                  onClick={() => setHorizonsOpen(false)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/50 hover:text-white"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Messages */}
              <div ref={nhScrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                {nhMessages.length === 0 && (
                  <div className="text-xs text-white/40 text-center pt-4 leading-relaxed">
                    Ask how to make your scene more interesting, what physics to explore, or how to build something specific.
                  </div>
                )}
                {nhMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-violet-600/50 text-white'
                        : 'bg-white/8 text-white/90'
                    }`}>
                      {m.content || (nhStreaming && i === nhMessages.length - 1 ? (
                        <span className="opacity-50">…</span>
                      ) : '')}
                    </div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="p-2 border-t border-violet-500/20">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={nhInput}
                    onChange={(e) => setNhInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendNhMessage(nhInput); } }}
                    placeholder="Ask the advisor…"
                    className="flex-1 bg-white/8 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-violet-400/50"
                  />
                  <button
                    onClick={() => sendNhMessage(nhInput)}
                    disabled={!nhInput.trim() || nhStreaming}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-violet-600/50 hover:bg-violet-600/70 disabled:opacity-30 text-white transition-colors"
                  >
                    <SendHorizontal size={13} />
                  </button>
                </div>

                {/* Quick prompts */}
                {nhMessages.length === 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {[
                      'How can I make this more interesting?',
                      'What should I add next?',
                      'How do I make things bouncier?',
                    ].map((p) => (
                      <button
                        key={p}
                        onClick={() => sendNhMessage(p)}
                        className="text-[10px] px-2 py-1 rounded-full bg-violet-500/15 hover:bg-violet-500/30 text-violet-300 transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="w-52 shrink-0 border-l border-white/10 bg-black/25 flex flex-col chrome overflow-y-auto">
        {/* World */}
        <div className="p-3 border-b border-white/10">
          <div className="text-[10px] uppercase text-white/45 mb-2">World</div>
          <NumRow
            label="g.x"
            value={world.gravity.x}
            step={0.5}
            onChange={(v) => setGravity(v, world.gravity.y)}
          />
          <NumRow
            label="g.y"
            value={world.gravity.y}
            step={0.5}
            onChange={(v) => setGravity(world.gravity.x, v)}
          />
          <div className="mt-2 flex items-center justify-between text-xs text-white/55">
            <span>Bodies</span>
            <span className="font-mono">{world.bodies.length}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-white/55">
            <span>Water</span>
            <span className="font-mono">{particles.length}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-white/55">
            <span>Constraints</span>
            <span className="font-mono">{world.constraints.length}</span>
          </div>
        </div>

        {/* Canvas settings */}
        <div className="p-3 border-b border-white/10">
          <div className="text-[10px] uppercase text-white/45 mb-2">Canvas</div>

          <div className="text-[10px] text-white/40 mb-1">Background</div>
          <div className="flex gap-1 flex-wrap mb-3">
            {BG_PRESETS.map(({ color, label }) => (
              <button
                key={color}
                title={label}
                onClick={() => setBgColor(color)}
                className={`w-5 h-5 rounded border-2 transition-all ${
                  bgColor === color ? 'border-white scale-110' : 'border-white/20 hover:border-white/50'
                }`}
                style={{ background: color }}
              />
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-white/70 text-xs mb-2">
            <input
              type="checkbox"
              checked={gridVisible}
              onChange={(e) => setGridVisible(e.target.checked)}
            />
            Show grid
          </label>

          {gridVisible && (
            <>
              <div className="text-[10px] text-white/40 mb-1">Grid style</div>
              <div className="flex gap-1 mb-2">
                {(['lines', 'dots', 'none'] as GridStyle[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setGridStyle(s)}
                    className={`flex-1 py-0.5 rounded-md text-[10px] transition-colors capitalize ${
                      gridStyle === s ? 'bg-accent text-white' : 'hover:bg-white/10 text-white/50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="text-[10px] text-white/40 mb-1">Grid color</div>
              <div className="flex gap-1 flex-wrap mb-2">
                {GRID_COLOR_PRESETS.map(({ color, label }) => (
                  <button
                    key={label}
                    title={label}
                    onClick={() => setGridColor(color)}
                    className={`w-5 h-5 rounded border-2 transition-all ${
                      gridColor === color ? 'border-white scale-110' : 'border-white/20 hover:border-white/50'
                    }`}
                    style={{ background: color }}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-white/50 shrink-0">Grid size</span>
                <select
                  value={gridSize}
                  onChange={(e) => setGridSize(parseFloat(e.target.value))}
                  className="flex-1 bg-white/5 border border-white/10 rounded-md px-1 py-0.5 text-xs text-white outline-none"
                >
                  <option value="0.25">0.25 m</option>
                  <option value="0.5">0.5 m</option>
                  <option value="1">1 m</option>
                  <option value="2">2 m</option>
                  <option value="5">5 m</option>
                </select>
              </div>
            </>
          )}
        </div>

        {/* Selected body */}
        <div className="p-3 flex-1">
          <div className="text-[10px] uppercase text-white/45 mb-2">Body</div>
          {!selected ? (
            <div className="text-xs text-white/35">Click a body to select.<br />Right-click for context menu.</div>
          ) : (
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-white/75 capitalize">{selected.shape.kind}</span>
                <span className="font-mono text-[10px] text-white/35">{selected.id}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-10 text-white/50 text-xs">angle</span>
                <input
                  type="number"
                  value={+((selected.angle * 180 / Math.PI) % 360).toFixed(1)}
                  step={15}
                  onChange={(e) => {
                    const deg = parseFloat(e.target.value) || 0;
                    selected.angle = deg * Math.PI / 180;
                    selected.sleeping = false;
                    mutate(() => {});
                  }}
                  className="flex-1 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5 text-xs font-mono text-white outline-none min-w-0"
                />
                <span className="text-white/35 text-[10px]">°</span>
              </div>
              <NumRow
                label="mass"
                value={selected.mass}
                step={0.1}
                onChange={(v) => {
                  selected.mass = Math.max(0, v);
                  selected.invMass = selected.mass > 0 ? 1 / selected.mass : 0;
                }}
              />
              <NumRow
                label="rest."
                value={selected.restitution}
                step={0.05}
                onChange={(v) => (selected.restitution = Math.max(0, Math.min(1, v)))}
              />
              <NumRow
                label="μ"
                value={selected.friction}
                step={0.05}
                onChange={(v) => (selected.friction = Math.max(0, Math.min(2, v)))}
              />

              <div className="pt-1">
                <div className="text-[10px] uppercase text-white/40 mb-1">Material</div>
                <MaterialPicker
                  onApply={(m) => {
                    selected.restitution = m.restitution;
                    selected.friction = m.friction;
                    selected.color = m.color;
                    if (!selected.isStatic) {
                      // recompute mass from density × area
                      const area =
                        selected.shape.kind === 'circle'
                          ? Math.PI * selected.shape.radius * selected.shape.radius
                          : Math.abs(
                              selected.shape.vertices.reduce((s, p, i, a) => {
                                const q = a[(i + 1) % a.length];
                                return s + (p.x * q.y - q.x * p.y);
                              }, 0) / 2,
                            );
                      const newMass = Math.max(0.01, m.density * area);
                      const ratio = newMass / Math.max(selected.mass, 1e-6);
                      selected.mass = newMass;
                      selected.invMass = 1 / newMass;
                      selected.inertia *= ratio;
                      selected.invInertia = selected.inertia > 0 ? 1 / selected.inertia : 0;
                    }
                    mutate(() => {});
                  }}
                />
              </div>

              <label className="flex items-center gap-1.5 text-white/70">
                <input
                  type="checkbox"
                  checked={selected.isStatic}
                  onChange={(e) => {
                    selected.isStatic = e.target.checked;
                    if (e.target.checked) {
                      selected.invMass = 0;
                      selected.invInertia = 0;
                    } else if (selected.mass > 0) {
                      selected.invMass = 1 / selected.mass;
                      selected.invInertia =
                        selected.inertia > 0 ? 1 / selected.inertia : 0;
                    }
                  }}
                />
                Static
              </label>
              <label className="flex items-center gap-1.5 text-white/70">
                <input
                  type="checkbox"
                  checked={selected.lockRotation}
                  onChange={(e) => (selected.lockRotation = e.target.checked)}
                />
                Lock rotation
              </label>

              {/* Motor section */}
              {selectedMotor ? (
                <div className="mt-2 pt-2 border-t border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] uppercase text-white/45">
                    <span>Motor</span>
                    <button
                      onClick={() => removeMotor(selected.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      ×
                    </button>
                  </div>
                  <label className="flex items-center gap-1.5 text-white/70">
                    <input
                      type="checkbox"
                      checked={selectedMotor.active}
                      onChange={() => toggleMotor(selected.id)}
                    />
                    Active
                  </label>
                  <NumRow
                    label="speed"
                    value={selectedMotor.speed}
                    step={0.5}
                    onChange={(v) => setMotorSpeed(selected.id, v)}
                  />
                  <NumRow
                    label="torque"
                    value={selectedMotor.torque}
                    step={1}
                    onChange={(v) => setMotorTorque(selected.id, Math.max(0, v))}
                  />
                </div>
              ) : (
                <button
                  onClick={() => toggleMotor(selected.id)}
                  className="mt-1 w-full px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-xs text-white/60"
                >
                  + Add motor
                </button>
              )}

              {/* Tracer section */}
              {selectedTracer ? (
                <div className="mt-2 pt-2 border-t border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] uppercase text-white/45">
                    <span>Tracer</span>
                    <button
                      onClick={() => toggleTracer(selected.id)}
                      className="text-red-400 hover:text-red-300"
                      title="Remove tracer"
                    >
                      ×
                    </button>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/40 mb-1">Color</div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {TRACER_COLORS.map((c) => (
                        <button
                          key={c}
                          title={c}
                          onClick={() => setTracerColor(selected.id, c)}
                          className={`w-5 h-5 rounded transition-all border-2 ${selectedTracer.color === c ? 'border-white scale-110' : 'border-transparent hover:border-white/40'}`}
                          style={{ background: c }}
                        />
                      ))}
                      <input
                        type="color"
                        value={hexFromCss(selectedTracer.color)}
                        onChange={(e) => setTracerColor(selected.id, e.target.value)}
                        title="Custom color"
                        className="w-6 h-6 rounded cursor-pointer bg-transparent border border-white/20"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/40 mb-1 flex items-center justify-between">
                      <span>Width</span>
                      <span className="font-mono text-white/55">{selectedTracer.width.toFixed(2)} m</span>
                    </div>
                    <input
                      type="range"
                      min={0.01}
                      max={0.4}
                      step={0.01}
                      value={selectedTracer.width}
                      onChange={(e) => setTracerWidth(selected.id, parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <button
                    onClick={() => clearTracerPath(selected.id)}
                    className="w-full px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[11px] text-white/65"
                  >
                    Clear trail
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => toggleTracer(selected.id)}
                  className="mt-1 w-full px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-xs text-white/60"
                >
                  + Add tracer
                </button>
              )}

              <button
                onClick={() => mutate((w) => w.remove(selected.id))}
                className="mt-2 w-full px-2 py-1 rounded-md bg-red-500/15 hover:bg-red-500/30 text-red-400 text-xs"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="p-3 border-t border-white/10 text-[10px] text-white/40 space-y-0.5">
          <div><span className="text-white/60">Space</span> play/pause · <span className="text-white/60">R</span> rewind to start</div>
          <div><span className="text-white/60">,</span> step back · <span className="text-white/60">.</span> step forward</div>
          <div><span className="text-white/60">Del</span> delete selected body</div>
          <div>Shift+drag → rotate · Alt+drag → force-move</div>
          <div>Right-drag → pan · Right-click body → menu</div>
          <div>Scroll → zoom · ⌘⇧- / ⌘⇧+ → zoom out/in</div>
        </div>
      </div>
    </div>
  );

  function ballPit() {
    mutate((w) => {
      w.add(makeBody(makeBox(8, 0.25), { pos: { x: 0, y: 5 }, isStatic: true }));
      w.add(makeBody(makeBox(0.25, 5), { pos: { x: -8, y: 0 }, isStatic: true }));
      w.add(makeBody(makeBox(0.25, 5), { pos: { x: 8, y: 0 }, isStatic: true }));
    });
    const colors = PRESET_COLORS;
    for (let i = 0; i < 20; i++) {
      const r = 0.2 + Math.random() * 0.25;
      const body = makeBody(makeCircle(r), {
        pos: { x: (Math.random() - 0.5) * 14, y: -5 + Math.random() * -3 },
        density: 0.8 + Math.random() * 0.6,
        restitution: 0.3 + Math.random() * 0.4,
        friction: 0.3,
        color: colors[i % colors.length],
      });
      mutate((w) => w.add(body));
    }
  }

  // ── Demo scenes ────────────────────────────────────────────────────────
  function clearAndFloor() {
    clear();
    mutate((w) => {
      w.add(makeBody(makeBox(15, 0.3), { pos: { x: 0, y: 5 }, isStatic: true }));
    });
  }

  function demoPendulum() {
    clearAndFloor();
    mutate((w) => {
      // World Y is positive-downward. Floor at y=5, anchor up high at y=-3.
      const anchor = { x: 0, y: -3 };
      const ropeLen = 4;
      const startAng = Math.PI / 3; // 60° off vertical
      const bob = makeBody(makeCircle(0.45), {
        pos: {
          x: anchor.x + Math.sin(startAng) * ropeLen,
          y: anchor.y + Math.cos(startAng) * ropeLen,
        },
        density: 4,
        restitution: 0.2,
        friction: 0.3,
        color: '#fbbf24',
      });
      bob.angle = startAng;
      w.add(bob);
      // Pin a virtual point above the bob (in body-local frame) to the world anchor.
      // That virtual point acts like the top of a rope of length `ropeLen`.
      w.addConstraint(makePin(bob, null, { x: 0, y: -ropeLen }, anchor));
    });
  }

  function demoNewtonsCradle() {
    clearAndFloor();
    mutate((w) => {
      const beamY = -5;
      const beam = makeBody(makeBox(3.5, 0.1), { pos: { x: 0, y: beamY }, isStatic: true });
      w.add(beam);
      const r = 0.35;
      const spacing = r * 2 + 0.005;
      const ropeLen = 3.5;
      for (let i = -2; i <= 2; i++) {
        const xAttach = i * spacing;
        // Default: hangs straight down. Leftmost ball starts 60° off vertical.
        const ang = i === -2 ? -Math.PI / 3 : 0;
        const ball = makeBody(makeCircle(r), {
          pos: {
            x: xAttach + Math.sin(ang) * ropeLen,
            y: beamY + 0.1 + Math.cos(ang) * ropeLen,
          },
          density: 5,
          restitution: 0.95,
          friction: 0.02,
          color: '#94a3b8',
        });
        ball.angle = ang;
        w.add(ball);
        w.addConstraint(
          makePin(ball, beam, { x: 0, y: -ropeLen }, { x: xAttach, y: 0.1 }),
        );
      }
    });
  }

  function demoWreckingBall() {
    clearAndFloor();
    mutate((w) => {
      // Crane arm (static)
      const crane = makeBody(makeBox(2.5, 0.15), { pos: { x: -3, y: -6 }, isStatic: true });
      w.add(crane);
      const tip = { x: -5.5, y: -6 };
      // Chain links
      let prev: any = null;
      let prevAnchor = tip;
      for (let i = 0; i < 5; i++) {
        const link = makeBody(makeBox(0.05, 0.25), {
          pos: { x: -5.5, y: -5.5 + i * 0.5 },
          density: 2,
          color: '#a3a3a3',
        });
        w.add(link);
        w.addConstraint(makePin(link, prev, { x: 0, y: -0.25 }, prev ? { x: 0, y: 0.25 } : prevAnchor));
        prev = link;
        prevAnchor = { x: 0, y: 0.25 };
      }
      // The ball
      const ball = makeBody(makeCircle(0.7), {
        pos: { x: -5.5, y: -2.5 },
        density: 15,
        restitution: 0.2,
        friction: 0.5,
        color: '#374151',
      });
      w.add(ball);
      w.addConstraint(makePin(ball, prev, { x: 0, y: -0.7 }, { x: 0, y: 0.25 }));
      // A little tower to demolish
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 3; col++) {
          w.add(
            makeBody(makeBox(0.35, 0.35), {
              pos: { x: 4 + col * 0.72, y: 4.3 - row * 0.7 - 0.35 },
              density: 1,
              color: PRESET_COLORS[(row + col) % PRESET_COLORS.length],
            }),
          );
        }
      }
    });
  }

  function demoDominoes() {
    clearAndFloor();
    mutate((w) => {
      for (let i = 0; i < 14; i++) {
        w.add(
          makeBody(makeBox(0.08, 0.7), {
            pos: { x: -6 + i * 0.9, y: 4.0 },
            density: 1,
            color: i === 0 ? '#f87171' : PRESET_COLORS[i % PRESET_COLORS.length],
          }),
        );
      }
      // A ball poised to tip the first domino when sim starts
      w.add(
        makeBody(makeCircle(0.45), {
          pos: { x: -7.5, y: -1 },
          density: 1.5,
          restitution: 0.25,
          color: '#fbbf24',
        }),
      );
    });
  }

  function demoTower() {
    clearAndFloor();
    mutate((w) => {
      const rows = 12;
      for (let r = 0; r < rows; r++) {
        const offset = (r % 2 === 0) ? 0 : 0.3;
        for (let c = 0; c < 3; c++) {
          w.add(
            makeBody(makeBox(0.4, 0.35), {
              pos: { x: -0.9 + c * 0.85 + offset, y: 4.3 - r * 0.72 - 0.35 },
              density: 1.2,
              friction: 0.6,
              restitution: 0.05,
              color: PRESET_COLORS[(r + c) % PRESET_COLORS.length],
            }),
          );
        }
      }
    });
  }

  function demoSeesaw() {
    clearAndFloor();
    mutate((w) => {
      const fulcrum = makeBody(makeBox(0.3, 0.5), { pos: { x: 0, y: 4.5 }, isStatic: true });
      w.add(fulcrum);
      const plank = makeBody(makeBox(3.5, 0.12), {
        pos: { x: 0, y: 4 },
        density: 1.2,
        friction: 0.5,
        color: '#c08457',
      });
      w.add(plank);
      w.addConstraint(makePin(plank, fulcrum, { x: 0, y: 0.12 }, { x: 0, y: -0.5 }));
      // Light ball on one side
      w.add(makeBody(makeCircle(0.35), { pos: { x: -2.5, y: 2 }, density: 0.8, color: '#34d399' }));
      // Heavy ball drops from above the other side
      w.add(makeBody(makeCircle(0.5), { pos: { x: 2.5, y: -3 }, density: 8, color: '#ef4444' }));
    });
  }

  function demoCar() {
    clearAndFloor();
    const wheelIds: string[] = [];
    mutate((w) => {
      // Ramp on the right side to drive up
      w.add(makeBody(makeBox(3, 0.15), { pos: { x: 6, y: 4 }, isStatic: true, angle: -0.3 }));
      // Chassis
      const chassis = makeBody(makeBox(0.9, 0.18), {
        pos: { x: -5, y: 3.2 },
        density: 1.5,
        color: '#6366f1',
      });
      w.add(chassis);
      // Wheels
      const wheelL = makeBody(makeCircle(0.32), {
        pos: { x: -5.7, y: 3.7 },
        density: 1.5,
        friction: 1.4,
        restitution: 0.1,
        color: '#1f2937',
      });
      const wheelR = makeBody(makeCircle(0.32), {
        pos: { x: -4.3, y: 3.7 },
        density: 1.5,
        friction: 1.4,
        restitution: 0.1,
        color: '#1f2937',
      });
      w.add(wheelL);
      w.add(wheelR);
      w.addConstraint(makePin(wheelL, chassis, { x: 0, y: 0 }, { x: -0.7, y: 0.5 }));
      w.addConstraint(makePin(wheelR, chassis, { x: 0, y: 0 }, { x: 0.7, y: 0.5 }));
      wheelIds.push(wheelL.id, wheelR.id);
    });
    // Add spinning motors on both wheels so the car drives forward
    const store = useSandbox2DStore.getState();
    for (const id of wheelIds) {
      store.toggleMotor(id);
      store.setMotorSpeed(id, 6);
      store.setMotorTorque(id, 30);
    }
  }

  function demoFunnel() {
    clearAndFloor();
    mutate((w) => {
      // Funnel walls (V shape)
      w.add(makeBody(makeBox(2.5, 0.12), { pos: { x: -1.7, y: 0 }, isStatic: true, angle: 0.5 }));
      w.add(makeBody(makeBox(2.5, 0.12), { pos: { x: 1.7, y: 0 }, isStatic: true, angle: -0.5 }));
      // Catch basin below
      w.add(makeBody(makeBox(3, 0.12), { pos: { x: 0, y: 3 }, isStatic: true }));
      w.add(makeBody(makeBox(0.12, 1.5), { pos: { x: -3, y: 2.2 }, isStatic: true }));
      w.add(makeBody(makeBox(0.12, 1.5), { pos: { x: 3, y: 2.2 }, isStatic: true }));
    });
    // Pour a stream of water
    const store = useSandbox2DStore.getState();
    for (let i = 0; i < 80; i++) {
      store.addParticles(makeWaterParticles(((Math.random() - 0.5) * 2), -4 - Math.random() * 2, 3));
    }
  }
}

function NumRow({
  label,
  value,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-white/50 text-xs">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? +value.toFixed(4) : 0}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="flex-1 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5 text-xs font-mono text-white outline-none min-w-0"
      />
    </div>
  );
}

function HelpModal({ onClose, currentTool }: { onClose: () => void; currentTool: Tool }) {
  // Escape key closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[640px] max-w-full max-h-full overflow-y-auto rounded-2xl bg-gray-950/95 border border-white/10 shadow-2xl text-white"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-gray-950/95 backdrop-blur">
          <div>
            <div className="text-lg font-semibold">What do the tools do?</div>
            <div className="text-xs text-white/55 mt-0.5">
              Algodoo-style sandbox - click any tool on the left, then read its row below.
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md hover:bg-white/10 flex items-center justify-center text-white/70"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {TOOLS.map((t) => {
            const active = t.id === currentTool;
            return (
              <div
                key={t.id}
                className={`rounded-xl border p-3 flex gap-3 transition-colors ${
                  active
                    ? 'border-indigo-400/60 bg-indigo-500/10'
                    : 'border-white/10 bg-white/[0.03]'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${
                    active ? 'bg-accent text-white' : 'bg-white/10 text-white/75'
                  }`}
                >
                  {t.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.label}</span>
                    {active && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200">
                        active
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/65 mt-1 leading-relaxed">{t.desc}</div>
                  <div className="text-[11px] text-white/40 mt-1 font-mono leading-relaxed">
                    {t.how}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-white/10 text-[11px] text-white/55 leading-relaxed">
          <div className="font-medium text-white/75 mb-1">Camera & global</div>
          2-finger scroll → pan · Pinch → zoom · ⌘⇧- / ⌘⇧+ → zoom ·
          Right-drag → pan · Alt+drag or Middle-click drag → pan ·
          Right-click a body (no drag) → context menu (duplicate, pin, change color, motor, …)
        </div>
      </div>
    </div>
  );
}

function MaterialPicker({
  onApply,
}: {
  onApply: (m: typeof MATERIALS[number]) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {MATERIALS.map((m) => (
        <button
          key={m.name}
          onClick={() => onApply(m)}
          className="flex flex-col items-center gap-1 px-1 py-1.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors"
          title={`density ${m.density} · bounce ${m.restitution} · μ ${m.friction}`}
        >
          <span
            className="w-5 h-5 rounded-sm border border-white/20"
            style={{ background: m.color }}
          />
          <span className="text-[10px] text-white/70">{m.name}</span>
        </button>
      ))}
    </div>
  );
}

function PresetBtn({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full text-left px-3 py-1 text-xs hover:bg-white/10 ${
        danger ? 'text-red-400' : ''
      }`}
    >
      {label}
    </button>
  );
}

// ─── AI Doctor ──────────────────────────────────────────────────────────────
type DoctorSeverity = 'info' | 'warn' | 'error' | 'ok';
interface DoctorIssue {
  id: string;
  severity: DoctorSeverity;
  title: string;
  detail: string;
  fixLabel?: string;
  fix?: () => void;
}

function diagnose(): DoctorIssue[] {
  const s = useSandbox2DStore.getState();
  const { world, particles, motors, tracers, running, bgColor } = s;
  const bodies = world.bodies;
  const dyn = bodies.filter((b) => !b.isStatic);
  const stat = bodies.filter((b) => b.isStatic);
  const issues: DoctorIssue[] = [];

  if (bodies.length === 0) {
    issues.push({
      id: 'empty',
      severity: 'info',
      title: 'Scene is empty',
      detail: 'Nothing to simulate yet. Drop in a floor and a few objects to get going.',
      fixLabel: 'Add floor + ball pit',
      fix: () => {
        s.mutate((w) => {
          w.add(makeBody(makeBox(12, 0.3), { pos: { x: 0, y: 4 }, isStatic: true }));
          for (let i = 0; i < 8; i++) {
            w.add(
              makeBody(makeCircle(0.3), {
                pos: { x: (i - 4) * 0.8, y: -2 },
                color: PRESET_COLORS[i % PRESET_COLORS.length],
              }),
            );
          }
        });
      },
    });
    return issues;
  }

  // No floor - every dynamic body would fall forever
  if (dyn.length > 0 && stat.length === 0) {
    issues.push({
      id: 'no-floor',
      severity: 'warn',
      title: 'No floor or static body',
      detail: 'Dynamic bodies will fall off-screen forever. Add a floor so they have something to land on.',
      fixLabel: 'Add floor',
      fix: () => {
        const lowest = Math.max(...dyn.map((b) => b.pos.y));
        s.mutate((w) =>
          w.add(makeBody(makeBox(15, 0.3), { pos: { x: 0, y: lowest + 3 }, isStatic: true })),
        );
      },
    });
  }

  // Gravity issues
  const g = world.gravity;
  if (Math.abs(g.x) < 0.01 && Math.abs(g.y) < 0.01) {
    issues.push({
      id: 'zero-g',
      severity: 'info',
      title: 'Gravity is zero',
      detail: 'Bodies will drift in straight lines forever. Fine for spaceships - odd for terrestrial scenes.',
      fixLabel: 'Set Earth gravity',
      fix: () => s.setGravity(0, 9.81),
    });
  } else if (g.y < 0) {
    issues.push({
      id: 'rev-g',
      severity: 'info',
      title: 'Gravity is upward',
      detail: `Gravity y is ${g.y.toFixed(2)} - things will fall upward. Cool effect, often not intended.`,
      fixLabel: 'Flip to normal',
      fix: () => s.setGravity(g.x, Math.abs(g.y || 9.81)),
    });
  }

  // Sim paused but user might be wondering why nothing moves
  if (!running) {
    issues.push({
      id: 'paused',
      severity: 'info',
      title: 'Simulation is paused',
      detail: "Press Run (or Space) to let physics start. Nothing will move until you do.",
      fixLabel: 'Press Run',
      fix: () => s.setRunning(true),
    });
  }

  // Tracers on but trail empty + paused: warn
  for (const [bodyId, t] of tracers) {
    if (t.points.length === 0 && !running) {
      issues.push({
        id: `tracer-empty-${bodyId}`,
        severity: 'info',
        title: 'Tracer has no trail yet',
        detail: 'Tracers only record points while the sim is running. Press Run to start drawing.',
        fixLabel: 'Press Run',
        fix: () => s.setRunning(true),
      });
      break; // only show once
    }
  }

  // Tracer invisible because color ≈ background
  for (const [bodyId, t] of tracers) {
    if (sameColor(t.color, bgColor)) {
      issues.push({
        id: `tracer-invis-${bodyId}`,
        severity: 'warn',
        title: 'Tracer is invisible',
        detail: `Tracer color matches the background. Pick a brighter color so the trail shows up.`,
        fixLabel: 'Reset to amber',
        fix: () => s.setTracerColor(bodyId, '#fbbf24'),
      });
    }
  }

  // Motors on static bodies do nothing (already filtered, but warn user)
  for (const [bodyId, m] of motors) {
    const b = bodies.find((bb) => bb.id === bodyId);
    if (b?.isStatic) {
      issues.push({
        id: `motor-static-${bodyId}`,
        severity: 'warn',
        title: 'Motor on a static body',
        detail: 'Static bodies ignore motors. Make the body dynamic, or move the motor to a different body.',
        fixLabel: 'Make body dynamic',
        fix: () => {
          b.isStatic = false;
          if (b.mass > 0) {
            b.invMass = 1 / b.mass;
            b.invInertia = b.inertia > 0 ? 1 / b.inertia : 0;
          }
          s.mutate(() => {});
        },
      });
      if (m.active === false) {
        // also noted, but skip - the static issue is the louder one
      }
    }
  }

  // Springs / pins where both ends are static - they do nothing
  for (const c of world.constraints) {
    if (c.kind === 'spring' || c.kind === 'pin' || c.kind === 'distance') {
      const aStat = c.a.isStatic;
      const bStat = c.b ? c.b.isStatic : true; // pin to world is "static end"
      if (aStat && bStat) {
        issues.push({
          id: `cst-frozen-${c.a.id}-${c.b?.id ?? 'world'}`,
          severity: 'warn',
          title: 'Constraint between two immovable points',
          detail: `A ${c.kind} between two static (or world-pinned) bodies has no observable effect - neither side can move.`,
        });
        break; // one is enough to make the point
      }
    }
  }

  // Perf warnings
  if (particles.length > 600) {
    issues.push({
      id: 'too-many-particles',
      severity: 'warn',
      title: 'A lot of water particles',
      detail: `${particles.length} particles is near the cap. The sim may stutter on slower machines.`,
      fixLabel: 'Clear water',
      fix: () => s.clearParticles(),
    });
  }
  if (bodies.length > 120) {
    issues.push({
      id: 'too-many-bodies',
      severity: 'warn',
      title: `Lots of bodies (${bodies.length})`,
      detail: 'Performance may dip. Consider deleting unused bodies or scaling the scene down.',
    });
  }

  // Overlap / interpenetration check - sample-based, only for circles
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i], B = bodies[j];
      if (A.isStatic && B.isStatic) continue;
      if (A.shape.kind !== 'circle' || B.shape.kind !== 'circle') continue;
      const dx = A.pos.x - B.pos.x;
      const dy = A.pos.y - B.pos.y;
      const minD = A.shape.radius + B.shape.radius;
      if (dx * dx + dy * dy < minD * minD * 0.7) {
        issues.push({
          id: 'interpenetration',
          severity: 'warn',
          title: 'Bodies are overlapping at rest',
          detail: 'At least two bodies are inside each other before the sim starts. They may explode apart violently when you press Run.',
        });
        i = bodies.length;
        break;
      }
    }
  }

  if (issues.length === 0) {
    issues.push({
      id: 'ok',
      severity: 'ok',
      title: 'Looks good!',
      detail: 'No common issues found. Have fun - your scene is in a healthy state.',
    });
  }

  return issues;
}

function sameColor(a: string, b: string): boolean {
  return a.replace(/\s/g, '').toLowerCase() === b.replace(/\s/g, '').toLowerCase();
}

function DoctorModal({ onClose }: { onClose: () => void }) {
  const [issues, setIssues] = useState<DoctorIssue[]>(() => diagnose());
  // Re-subscribe to rev so the issue list refreshes after each one-click fix
  const rev = useSandbox2DStore((s) => s.rev);
  useEffect(() => {
    setIssues(diagnose());
  }, [rev]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tone = (s: DoctorSeverity) =>
    s === 'error'
      ? { wrap: 'border-red-500/40 bg-red-500/10', icon: <AlertTriangle size={16} className="text-red-300" /> }
      : s === 'warn'
        ? { wrap: 'border-amber-500/40 bg-amber-500/10', icon: <AlertTriangle size={16} className="text-amber-300" /> }
        : s === 'ok'
          ? { wrap: 'border-emerald-500/40 bg-emerald-500/10', icon: <CheckCircle2 size={16} className="text-emerald-300" /> }
          : { wrap: 'border-white/15 bg-white/[0.04]', icon: <Info size={16} className="text-sky-300" /> };

  return (
    <div
      className="absolute inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-full max-h-full overflow-y-auto rounded-2xl bg-gray-950/95 border border-white/10 shadow-2xl text-white"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-gray-950/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-emerald-300" />
            <div>
              <div className="text-lg font-semibold">AI Doctor</div>
              <div className="text-xs text-white/55 mt-0.5">
                Checks your scene for common problems and offers one-click fixes.
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md hover:bg-white/10 flex items-center justify-center text-white/70"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {issues.map((iss) => {
            const t = tone(iss.severity);
            return (
              <div key={iss.id} className={`rounded-xl border p-3 ${t.wrap}`}>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">{t.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{iss.title}</div>
                    <div className="text-xs text-white/65 mt-1 leading-relaxed">{iss.detail}</div>
                    {iss.fix && (
                      <button
                        onClick={() => {
                          iss.fix!();
                          setIssues(diagnose());
                        }}
                        className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 text-xs font-medium"
                      >
                        <Sparkles size={11} />
                        {iss.fixLabel ?? 'Fix it'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between">
          <button
            onClick={() => setIssues(diagnose())}
            className="text-xs text-white/55 hover:text-white/80"
          >
            Re-scan
          </button>
          <div className="text-[11px] text-white/40">
            {issues.length} {issues.length === 1 ? 'item' : 'items'}
          </div>
        </div>
      </div>
    </div>
  );
}

const module: AppModule = {
  manifest: {
    id: 'sandbox2d',
    name: 'Sandbox 2D',
    description: 'Algodoo-style interactive physics sandbox with SPH fluid, freehand drawing, motors, and hinges',
    icon: Sandbox2DIcon,
    defaultSize: { width: 1100, height: 680 },
    accent: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
  },
  Component: Sandbox2D,
};

export default module;
