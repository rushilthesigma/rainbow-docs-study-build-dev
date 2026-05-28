import { useEffect } from 'react';
import {
  MousePointer2,
  Circle,
  Square,
  Triangle,
  Pentagon,
  Hexagon,
  Link2,
  Cable,
  Pin,
  Eraser,
  Play,
  Pause,
  RotateCcw,
  ChevronDown,
  Beaker,
} from 'lucide-react';
import { PhysicsIcon } from '@/apps/icons';
import type { AppModule } from '@/os/types';
import Renderer from './Renderer';
import { usePhysicsBenchStore, type Tool } from '@/store/physicsBenchStore';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';
import { makeBody, makeCircle, makeBox, makeRegularPolygon, type Body } from '@/lib/physics2d/types';
import { DEMOS, type DemoId } from '@/lib/physics2d/demos';
import { MATERIALS, findMaterial } from '@/lib/physics2d/materials';
import { useState, useRef } from 'react';

function PhysicsBench({ appId }: { appId: string }) {
  const tool = usePhysicsBenchStore((s) => s.tool);
  const setTool = usePhysicsBenchStore((s) => s.setTool);
  const running = usePhysicsBenchStore((s) => s.running);
  const toggleRunning = usePhysicsBenchStore((s) => s.toggleRunning);
  const timeScale = usePhysicsBenchStore((s) => s.timeScale);
  const setTimeScale = usePhysicsBenchStore((s) => s.setTimeScale);
  const debug = usePhysicsBenchStore((s) => s.debug);
  const setDebug = usePhysicsBenchStore((s) => s.setDebug);
  const loadDemo = usePhysicsBenchStore((s) => s.loadDemo);
  const selectedId = usePhysicsBenchStore((s) => s.selectedId);
  const rev = usePhysicsBenchStore((s) => s.rev);
  const mutate = usePhysicsBenchStore((s) => s.mutate);
  const setGravity = usePhysicsBenchStore((s) => s.setGravity);
  const setIterations = usePhysicsBenchStore((s) => s.setIterations);

  const [demosOpen, setDemosOpen] = useState(false);

  // Publish scanner snapshot
  useEffect(() => {
    return publishAppState(appId, () => {
      const w = usePhysicsBenchStore.getState().world;
      const sel = selectedId ? w.bodies.find((b) => b.id === selectedId) : null;
      return {
        summary: `PhysicsBench has ${w.bodies.length} bodies and ${w.constraints.length} constraints. Gravity (m/s²): (${w.gravity.x.toFixed(2)}, ${w.gravity.y.toFixed(2)}). Sim is ${running ? 'running' : 'paused'} at ${timeScale}× time. ${sel ? `Selected: ${sel.id} (${sel.shape.kind})` : ''}`,
        state: {
          gravity: w.gravity,
          iterations: w.iterations,
          bodyCount: w.bodies.length,
          constraintCount: w.constraints.length,
          stats: w.stats,
          selected: sel
            ? {
                id: sel.id,
                shape: sel.shape.kind,
                pos: sel.pos,
                vel: sel.vel,
                mass: sel.mass,
                restitution: sel.restitution,
                friction: sel.friction,
              }
            : null,
        },
      };
    });
  }, [appId, selectedId, running, timeScale, rev]);

  // Register AI tools
  useAppTools(appId, [
    {
      toolName: 'spawn_body',
      description:
        'Add a body. shape ∈ {circle, box, polygon}. params: radius (circle), halfW/halfH (box), n + radius (polygon), mass OR material, restitution, friction, isStatic. Coordinates are meters; +y points DOWN.',
      input_schema: {
        type: 'object',
        properties: {
          shape: { type: 'string', enum: ['circle', 'box', 'polygon'] },
          x: { type: 'number' },
          y: { type: 'number' },
          radius: { type: 'number' },
          halfW: { type: 'number' },
          halfH: { type: 'number' },
          n: { type: 'number', description: 'Number of sides for polygon (3-16)' },
          mass: { type: 'number' },
          material: { type: 'string', description: 'Optional material id (overrides density/friction/restitution): steel, aluminum, wood, plastic, rubber, ice, glass, concrete, foam, bouncy' },
          restitution: { type: 'number' },
          friction: { type: 'number' },
          isStatic: { type: 'string', description: 'true to make a static body' },
          color: { type: 'string' },
        },
        required: ['shape', 'x', 'y'],
      },
      handler: ({ shape, x, y, radius, halfW, halfH, n, mass, material, restitution, friction, isStatic, color }: any) => {
        const mat = material ? findMaterial(String(material)) : undefined;
        const params: any = {
          pos: { x: Number(x), y: Number(y) },
          mass,
          density: mat?.density,
          restitution: restitution ?? mat?.restitution,
          friction: friction ?? mat?.friction,
          isStatic: String(isStatic) === 'true',
          color: color ?? mat?.color,
        };
        let body: Body;
        if (shape === 'circle') {
          body = makeBody(makeCircle(Number(radius ?? 0.4)), params);
        } else if (shape === 'polygon') {
          body = makeBody(makeRegularPolygon(Number(n ?? 5), Number(radius ?? 0.4)), params);
        } else {
          body = makeBody(makeBox(Number(halfW ?? 0.4), Number(halfH ?? 0.4)), params);
        }
        mutate((w) => w.add(body));
        return { id: body.id };
      },
    },
    {
      toolName: 'set_material',
      description: 'Set the active material used for next spawned bodies. ids: steel, aluminum, wood, plastic, rubber, ice, glass, concrete, foam, bouncy.',
      input_schema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: ({ id }: any) => {
        if (!findMaterial(String(id))) throw new Error('unknown material');
        usePhysicsBenchStore.getState().setMaterial(String(id));
        return { ok: true };
      },
    },
    {
      toolName: 'set_gravity',
      description: 'Set the world gravity vector (m/s²). Default is (0, 9.81). Negative y is up.',
      input_schema: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        required: ['x', 'y'],
      },
      handler: ({ x, y }: any) => {
        setGravity(Number(x), Number(y));
        return { gravity: { x: Number(x), y: Number(y) } };
      },
    },
    {
      toolName: 'apply_force',
      description: 'Apply a force (Newtons) to a body in world coordinates for one step.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          fx: { type: 'number' },
          fy: { type: 'number' },
        },
        required: ['id', 'fx', 'fy'],
      },
      handler: ({ id, fx, fy }: any) => {
        const w = usePhysicsBenchStore.getState().world;
        const b = w.bodies.find((x) => x.id === id);
        if (!b) throw new Error(`No body ${id}`);
        w.applyForce(b, { x: Number(fx), y: Number(fy) });
        return { ok: true };
      },
    },
    {
      toolName: 'run_simulation',
      description: 'Run the simulator for N fixed timesteps (1/60 s each) without rendering pauses.',
      input_schema: {
        type: 'object',
        properties: { steps: { type: 'number' } },
        required: ['steps'],
      },
      handler: ({ steps }: any) => {
        const w = usePhysicsBenchStore.getState().world;
        for (let i = 0; i < Math.min(2000, Math.max(1, Math.floor(Number(steps)))); i++) {
          w.step(1 / 60);
        }
        return { stats: w.stats };
      },
    },
    {
      toolName: 'load_demo',
      description: `Load a preset scene. One of: ${DEMOS.map((d) => d.id).join(', ')}.`,
      input_schema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: ({ id }: any) => {
        loadDemo(id as DemoId);
        return { ok: true };
      },
    },
    {
      toolName: 'get_state',
      description:
        'Return the full simulation state: bodies (id, shape, pos, vel, mass, friction, restitution, isStatic), constraints, and gravity.',
      input_schema: { type: 'object', properties: {} },
      handler: () => {
        const w = usePhysicsBenchStore.getState().world;
        return {
          gravity: w.gravity,
          iterations: w.iterations,
          bodies: w.bodies.map((b) => ({
            id: b.id,
            shape: b.shape.kind,
            pos: b.pos,
            vel: b.vel,
            angle: b.angle,
            mass: b.mass,
            friction: b.friction,
            restitution: b.restitution,
            isStatic: b.isStatic,
          })),
          constraints: w.constraints.map((c) => ({
            id: c.id,
            kind: c.kind,
            a: c.a.id,
            b: c.b?.id ?? null,
          })),
          stats: w.stats,
        };
      },
    },
    {
      toolName: 'remove_body',
      description: 'Remove a body and any constraints attached to it.',
      input_schema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: ({ id }: any) => {
        mutate((w) => w.remove(String(id)));
        return { ok: true };
      },
    },
    {
      toolName: 'clear',
      description: 'Remove every body and constraint.',
      input_schema: { type: 'object', properties: {} },
      handler: () => {
        mutate((w) => w.clear());
        return { ok: true };
      },
    },
  ]);

  const world = usePhysicsBenchStore.getState().world;
  const selected = selectedId ? world.bodies.find((b) => b.id === selectedId) : null;

  return (
    <div className="flex h-full">
      {/* Left toolbar */}
      <div className="w-12 shrink-0 border-r border-white/10 bg-black/25 flex flex-col items-center py-2 gap-1 chrome">
        <ToolBtn tool="select" current={tool} onClick={setTool}>
          <MousePointer2 size={15} />
        </ToolBtn>
        <ToolBtn tool="circle" current={tool} onClick={setTool}>
          <Circle size={15} />
        </ToolBtn>
        <ToolBtn tool="box" current={tool} onClick={setTool}>
          <Square size={15} />
        </ToolBtn>
        <ToolBtn tool="triangle" current={tool} onClick={setTool}>
          <Triangle size={15} />
        </ToolBtn>
        <ToolBtn tool="pentagon" current={tool} onClick={setTool}>
          <Pentagon size={15} />
        </ToolBtn>
        <ToolBtn tool="hexagon" current={tool} onClick={setTool}>
          <Hexagon size={15} />
        </ToolBtn>
        <div className="my-1 h-px w-6 bg-white/15" />
        <ToolBtn tool="rope" current={tool} onClick={setTool}>
          <Link2 size={15} />
        </ToolBtn>
        <ToolBtn tool="spring" current={tool} onClick={setTool}>
          <Cable size={15} />
        </ToolBtn>
        <ToolBtn tool="pin" current={tool} onClick={setTool}>
          <Pin size={15} />
        </ToolBtn>
        <div className="my-1 h-px w-6 bg-white/15" />
        <ToolBtn tool="eraser" current={tool} onClick={setTool}>
          <Eraser size={15} />
        </ToolBtn>
      </div>

      {/* Center: canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-8 flex items-center px-2 gap-1 border-b border-white/10 chrome">
          <button
            onClick={toggleRunning}
            className="flex items-center gap-1 px-2 h-6 rounded-md text-xs bg-accent hover:bg-accent-hover text-white"
          >
            {running ? <Pause size={12} /> : <Play size={12} />}
            {running ? 'Pause' : 'Run'}
          </button>
          <button
            onClick={() => {
              const w = usePhysicsBenchStore.getState().world;
              w.step(1 / 60);
              usePhysicsBenchStore.setState({ rev: usePhysicsBenchStore.getState().rev + 1 });
            }}
            className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
          >
            Step
          </button>
          <div className="relative">
            <button
              onClick={() => setDemosOpen((o) => !o)}
              className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
            >
              <RotateCcw size={12} /> Demos <ChevronDown size={11} />
            </button>
            {demosOpen && (
              <div className="absolute top-full left-0 mt-1 glass-strong rounded-md min-w-[180px] py-1 z-30 shadow-window">
                {DEMOS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      loadDemo(d.id);
                      setDemosOpen(false);
                    }}
                    className="block w-full text-left px-2 py-1 text-xs hover:bg-white/10"
                    title={d.description}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <MaterialPicker />
          <ImportObjButton />
          <SubstanceFootprint />
          <div className="ml-2 flex items-center gap-2 text-[11px] text-white/65">
            Time
            <input
              type="range"
              min={0.1}
              max={2}
              step={0.05}
              value={timeScale}
              onChange={(e) => setTimeScale(parseFloat(e.target.value))}
              className="w-24"
            />
            <span className="font-mono w-8 text-right">{timeScale.toFixed(2)}×</span>
          </div>
        </div>
        <div className="flex-1 relative">
          <Renderer />
        </div>
        {/* Debug toggle row */}
        <div className="h-7 flex items-center gap-3 px-2 border-t border-white/10 text-[11px] text-white/65 chrome">
          {(
            [
              ['velocity', 'v'],
              ['forces', 'F'],
              ['aabb', 'AABB'],
              ['contacts', 'contacts'],
              ['sleep', 'sleep'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={debug[k]}
                onChange={(e) => setDebug(k, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="w-56 shrink-0 border-l border-white/10 bg-black/25 flex flex-col chrome">
        <div className="p-3 border-b border-white/10">
          <div className="text-[10px] uppercase text-white/45 mb-2">World</div>
          <NumberRow
            label="g.x"
            value={world.gravity.x}
            onChange={(v) => setGravity(v, world.gravity.y)}
          />
          <NumberRow
            label="g.y"
            value={world.gravity.y}
            onChange={(v) => setGravity(world.gravity.x, v)}
          />
          <NumberRow
            label="iters"
            value={world.iterations}
            onChange={(v) => setIterations(Math.round(v))}
            step={1}
          />
        </div>

        <div className="p-3 flex-1 overflow-y-auto">
          <div className="text-[10px] uppercase text-white/45 mb-2">
            Body Properties
          </div>
          {!selected ? (
            <div className="text-xs text-white/45">Select a body to edit.</div>
          ) : (
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="text-white/75">{selected.shape.kind}</div>
                <div className="font-mono text-[10px] text-white/40">{selected.id}</div>
              </div>
              <NumberRow
                label="mass"
                value={selected.mass}
                onChange={(v) => {
                  selected.mass = Math.max(0, v);
                  selected.invMass = selected.mass > 0 ? 1 / selected.mass : 0;
                }}
              />
              <NumberRow
                label="rest"
                value={selected.restitution}
                onChange={(v) => (selected.restitution = Math.max(0, Math.min(1, v)))}
                step={0.05}
              />
              <NumberRow
                label="μ"
                value={selected.friction}
                onChange={(v) => (selected.friction = Math.max(0, Math.min(2, v)))}
                step={0.05}
              />
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={selected.lockRotation}
                  onChange={(e) => (selected.lockRotation = e.target.checked)}
                />
                Lock rotation
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={selected.isStatic}
                  onChange={(e) => {
                    selected.isStatic = e.target.checked;
                    if (e.target.checked) {
                      selected.invMass = 0;
                      selected.invInertia = 0;
                      selected.vel = { x: 0, y: 0 };
                      selected.angularVel = 0;
                    } else if (selected.mass > 0) {
                      selected.invMass = 1 / selected.mass;
                      selected.invInertia = selected.inertia > 0 ? 1 / selected.inertia : 0;
                    }
                  }}
                />
                Static
              </label>
              <button
                onClick={() => mutate((w) => w.remove(selected.id))}
                className="mt-2 w-full px-2 py-1 rounded-md bg-traffic-red/20 hover:bg-traffic-red/40 text-traffic-red text-xs"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MaterialPicker() {
  const current = usePhysicsBenchStore((s) => s.currentMaterial);
  const set = usePhysicsBenchStore((s) => s.setMaterial);
  const [open, setOpen] = useState(false);
  const mat = findMaterial(current);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
        title="Material applied to next spawned body"
      >
        <Beaker size={12} />
        <span
          className="w-2 h-2 rounded-sm border border-white/20"
          style={{ background: mat?.color ?? '#94a3b8' }}
        />
        {mat?.label ?? 'Material'} <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 glass-strong rounded-md min-w-[170px] py-1 z-30 shadow-window">
          {MATERIALS.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                set(m.id);
                setOpen(false);
              }}
              className={`w-full text-left px-2 py-1 text-xs flex items-center gap-2 hover:bg-white/10 ${
                m.id === current ? 'bg-white/10' : ''
              }`}
            >
              <span className="w-3 h-3 rounded-sm border border-white/20" style={{ background: m.color }} />
              <span className="flex-1">{m.label}</span>
              <span className="font-mono text-[10px] text-white/45">ρ={m.density}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ImportObjButton() {
  const ref = useRef<HTMLInputElement>(null);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const [{ parseOBJ, parseSTL, extractSilhouette }, types, toastMod] = await Promise.all([
        import('@/lib/cfd/customShape'),
        import('@/lib/physics2d/types'),
        import('@/store/toastStore'),
      ]);
      const ext = f.name.toLowerCase().split('.').pop();
      const geom =
        ext === 'stl' ? parseSTL(await f.arrayBuffer()) : parseOBJ(await f.text());
      const sil = extractSilhouette(geom);
      if (sil.length < 3) {
        toastMod.toast.error('Import failed', 'No usable 2D cross-section in that model.');
        return;
      }
      const matId = usePhysicsBenchStore.getState().currentMaterial;
      const mat = findMaterial(matId);
      const verts = sil.map((p) => ({ x: (p.x - 0.5) * 1.4, y: -p.y * 1.4 }));
      const body = types.makeBody(types.makePolygonFromVertices(verts), {
        pos: { x: 0, y: -4 },
        density: mat?.density,
        restitution: mat?.restitution,
        friction: mat?.friction,
        color: mat?.color,
        label: f.name.replace(/\.(obj|stl)$/i, ''),
      });
      usePhysicsBenchStore.getState().mutate((w) => w.add(body));
      toastMod.toast.success('Imported', `${f.name} as ${mat?.label ?? 'body'}`);
    } catch (err) {
      const { toast } = await import('@/store/toastStore');
      toast.error('Import failed', (err as Error).message);
    } finally {
      e.target.value = '';
    }
  };
  return (
    <>
      <button
        onClick={() => ref.current?.click()}
        className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
        title="Import a CAD mesh (.obj/.stl) as a rigid body (uses the selected material)"
      >
        Import CAD
      </button>
      <input ref={ref} type="file" accept=".obj,.stl" hidden onChange={onFile} />
    </>
  );
}

function SubstanceFootprint() {
  const current = usePhysicsBenchStore((s) => s.currentMaterial);
  const mat = findMaterial(current);
  if (!mat) return null;
  return (
    <div className="hidden md:flex items-center gap-2 ml-2 text-[10px] text-white/55 font-mono">
      <span>ρ {mat.density}</span>
      <span>e {mat.restitution}</span>
      <span>μ {mat.friction}</span>
    </div>
  );
}

function ToolBtn({
  tool,
  current,
  onClick,
  children,
}: {
  tool: Tool;
  current: Tool;
  onClick: (t: Tool) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onClick(tool)}
      title={tool}
      className={`w-8 h-8 rounded-md flex items-center justify-center ${
        current === tool ? 'bg-accent text-white' : 'text-white/75 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

function NumberRow({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-10 text-white/55 text-xs">{label}</div>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="flex-1 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5 outline-none text-xs font-mono text-white min-w-0"
      />
    </div>
  );
}

const module: AppModule = {
  manifest: {
    id: 'physicsbench',
    name: 'PhysicsBench',
    description: 'Custom 2D rigid-body physics sandbox (no external libs)',
    icon: PhysicsIcon,
    defaultSize: { width: 1000, height: 640 },
    accent: 'linear-gradient(135deg, #ec4899 0%, #f59e0b 100%)',
  },
  Component: PhysicsBench,
};

export default module;
