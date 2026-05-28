import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { BarChart3, Upload } from 'lucide-react';
import type { AppModule } from '@/os/types';
import { useVizStore } from '@/store/vizStore';
import {
  DATASET_DEFS,
  histogram,
  parseCSV,
  scalarStats,
  type DataPoint,
} from '@/lib/viz/datasets';
import {
  COLORMAP_IDS,
  colormapCSS,
  sampleColormap,
  type ColormapId,
} from '@/lib/viz/colormaps';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';
import { toast } from '@/store/toastStore';

function filteredPoints(): { pts: DataPoint[]; min: number; max: number } {
  const s = useVizStore.getState();
  const { points } = s.dataset;
  const { min, max } = scalarStats(points);
  const span = max - min || 1;
  let pts = points;
  if (s.filter === 'threshold') {
    const lo = min + s.thLow * span;
    const hi = min + s.thHigh * span;
    pts = points.filter((p) => p.s >= lo && p.s <= hi);
  } else if (s.filter === 'slice') {
    const axis = s.sliceAxis;
    // domain is roughly [-2, 2]
    const center = -2 + s.slicePos * 4;
    const half = s.sliceThickness * 4;
    pts = points.filter((p) => Math.abs((p[axis] as number) - center) <= half);
  }
  return { pts, min, max };
}

function PointCloud() {
  const rev = useVizStore((s) => s.rev);
  const colormap = useVizStore((s) => s.colormap);
  const filter = useVizStore((s) => s.filter);
  const thLow = useVizStore((s) => s.thLow);
  const thHigh = useVizStore((s) => s.thHigh);
  const sliceAxis = useVizStore((s) => s.sliceAxis);
  const slicePos = useVizStore((s) => s.slicePos);
  const sliceThickness = useVizStore((s) => s.sliceThickness);
  const pointSize = useVizStore((s) => s.pointSize);
  const opacity = useVizStore((s) => s.opacity);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const { pts, min, max } = useMemo(
    () => filteredPoints(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rev, filter, thLow, thHigh, sliceAxis, slicePos, sliceThickness],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const col = { r: 0, g: 0, b: 0 };
    const span = max - min || 1;
    const color = new THREE.Color();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      dummy.position.set(p.x, p.z, -p.y); // y-up for three
      dummy.scale.setScalar(pointSize);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      sampleColormap(colormap, (p.s - min) / span, col);
      color.setRGB(col.r, col.g, col.b);
      mesh.setColorAt(i, color);
    }
    mesh.count = pts.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [pts, colormap, pointSize, min, max]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, Math.max(1, pts.length)]}
      key={pts.length}
    >
      <sphereGeometry args={[1, 8, 8]} />
      <meshStandardMaterial
        vertexColors
        transparent
        opacity={opacity}
        roughness={0.5}
        metalness={0.1}
      />
    </instancedMesh>
  );
}

function Viewport() {
  return (
    <Canvas camera={{ position: [6, 5, 7], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={['#070b16']} />
      <fog attach="fog" args={['#070b16', 16, 38]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[6, 9, 5]} intensity={1.1} />
      <directionalLight position={[-5, -3, -5]} intensity={0.35} />
      <PointCloud />
      <gridHelper args={[10, 10, '#243049', '#18213a']} position={[0, -2.2, 0]} />
      <OrbitControls enableDamping makeDefault />
      <GizmoHelper alignment="top-right" margin={[60, 50]}>
        <GizmoViewport axisColors={['#ef4444', '#22c55e', '#0ea5e9']} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  );
}

function DataViz({ appId }: { appId: string }) {
  const dataset = useVizStore((s) => s.dataset);
  const colormap = useVizStore((s) => s.colormap);
  const filter = useVizStore((s) => s.filter);
  const thLow = useVizStore((s) => s.thLow);
  const thHigh = useVizStore((s) => s.thHigh);
  const sliceAxis = useVizStore((s) => s.sliceAxis);
  const slicePos = useVizStore((s) => s.slicePos);
  const sliceThickness = useVizStore((s) => s.sliceThickness);
  const pointSize = useVizStore((s) => s.pointSize);
  const opacity = useVizStore((s) => s.opacity);
  const loadBuiltin = useVizStore((s) => s.loadBuiltin);
  const setDataset = useVizStore((s) => s.setDataset);
  const setColormap = useVizStore((s) => s.setColormap);
  const setFilter = useVizStore((s) => s.setFilter);
  const setThreshold = useVizStore((s) => s.setThreshold);
  const setSliceAxis = useVizStore((s) => s.setSliceAxis);
  const setSlicePos = useVizStore((s) => s.setSlicePos);
  const setSliceThickness = useVizStore((s) => s.setSliceThickness);
  const setPointSize = useVizStore((s) => s.setPointSize);
  const setOpacity = useVizStore((s) => s.setOpacity);
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => scalarStats(dataset.points), [dataset]);
  const hist = useMemo(() => histogram(dataset.points), [dataset]);
  const visibleCount = useMemo(
    () => filteredPoints().pts.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataset, filter, thLow, thHigh, sliceAxis, slicePos, sliceThickness],
  );

  useAppTools(appId, [
    {
      toolName: 'load_dataset',
      description: `Load a built-in dataset. id one of: ${DATASET_DEFS.map((d) => d.id).join(', ')}.`,
      input_schema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: ({ id }: any) => {
        loadBuiltin(String(id));
        return { ok: true, points: useVizStore.getState().dataset.points.length };
      },
    },
    {
      toolName: 'set_filter',
      description: 'Set the active filter: points | threshold | slice (+ params).',
      input_schema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['points', 'threshold', 'slice'] },
          low: { type: 'number' },
          high: { type: 'number' },
          axis: { type: 'string', enum: ['x', 'y', 'z'] },
          pos: { type: 'number' },
        },
        required: ['mode'],
      },
      handler: ({ mode, low, high, axis, pos }: any) => {
        setFilter(mode);
        if (low !== undefined || high !== undefined)
          setThreshold(Number(low ?? 0), Number(high ?? 1));
        if (axis) setSliceAxis(axis);
        if (pos !== undefined) setSlicePos(Number(pos));
        return { ok: true };
      },
    },
    {
      toolName: 'set_colormap',
      description: `Set the colormap. one of: ${COLORMAP_IDS.join(', ')}.`,
      input_schema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: ({ id }: any) => {
        setColormap(id as ColormapId);
        return { ok: true };
      },
    },
    {
      toolName: 'get_stats',
      description: 'Return scalar field statistics for the active dataset.',
      input_schema: { type: 'object', properties: {} },
      handler: () => ({ ...scalarStats(dataset.points), scalar: dataset.scalarName }),
    },
  ]);

  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `DataViz: dataset "${dataset.name}" (${dataset.points.length} pts), scalar ${dataset.scalarName} [${stats.min.toFixed(3)}, ${stats.max.toFixed(3)}], filter ${filter}, colormap ${colormap}, ${visibleCount} pts shown.`,
      state: { dataset: dataset.id, filter, colormap, stats },
    }));
  }, [appId, dataset, filter, colormap, stats, visibleCount]);

  const onCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const ds = parseCSV(await f.text());
      if (!ds.points.length) throw new Error('No x,y,z[,scalar] rows found');
      setDataset(ds);
      toast.success('Dataset loaded', `${ds.points.length} points`);
    } catch (err) {
      toast.error('CSV load failed', (err as Error).message);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 relative min-w-0">
        <Viewport />
        <div className="absolute top-2 left-2 glass-strong rounded-md px-2 py-1.5 text-[11px] font-mono text-white/85 pointer-events-none">
          <div>{dataset.name}</div>
          <div className="text-white/55">
            {visibleCount.toLocaleString()} / {dataset.points.length.toLocaleString()} pts
          </div>
        </div>
        {/* colorbar */}
        <div className="absolute bottom-3 left-3 glass-strong rounded-md px-2 py-1.5 pointer-events-none">
          <div className="text-[9px] uppercase tracking-wide text-white/55 mb-1">
            {dataset.scalarName}
          </div>
          <div className="w-40 h-2.5 rounded-full" style={{ background: colormapCSS(colormap) }} />
          <div className="flex justify-between text-[9px] text-white/45 font-mono mt-0.5">
            <span>{stats.min.toFixed(2)}</span>
            <span>{stats.max.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="w-64 shrink-0 border-l border-white/10 bg-black/25 flex flex-col chrome overflow-y-auto">
        <div className="p-3 border-b border-white/10 space-y-2">
          <div className="text-[10px] uppercase text-white/45">Dataset</div>
          <select
            value={dataset.id}
            onChange={(e) => loadBuiltin(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs outline-none"
          >
            {DATASET_DEFS.map((d) => (
              <option key={d.id} value={d.id} className="bg-zinc-800">
                {d.name}
              </option>
            ))}
            {dataset.id === 'csv' && (
              <option value="csv" className="bg-zinc-800">
                Imported CSV
              </option>
            )}
          </select>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 text-xs"
          >
            <Upload size={12} /> Import CSV file
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt" hidden onChange={onCSV} />
          <ManualEntry />
        </div>

        <div className="p-3 border-b border-white/10 space-y-2">
          <div className="text-[10px] uppercase text-white/45">Filter</div>
          <div className="grid grid-cols-3 gap-1">
            {(['points', 'threshold', 'slice'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setFilter(m)}
                className={`text-[11px] py-1 rounded-md ${
                  filter === m ? 'bg-accent text-white' : 'bg-white/5 hover:bg-white/10 text-white/70'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {filter === 'threshold' && (
            <div className="space-y-1.5">
              <Slider label="low" value={thLow} onChange={(v) => setThreshold(v, thHigh)} />
              <Slider label="high" value={thHigh} onChange={(v) => setThreshold(thLow, v)} />
            </div>
          )}
          {filter === 'slice' && (
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {(['x', 'y', 'z'] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setSliceAxis(a)}
                    className={`flex-1 py-0.5 rounded text-[11px] ${
                      sliceAxis === a ? 'bg-accent text-white' : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    {a.toUpperCase()}
                  </button>
                ))}
              </div>
              <Slider label="pos" value={slicePos} onChange={setSlicePos} />
              <Slider label="thick" value={sliceThickness} onChange={setSliceThickness} />
            </div>
          )}
        </div>

        <div className="p-3 border-b border-white/10 space-y-2">
          <div className="text-[10px] uppercase text-white/45">Appearance</div>
          <div className="grid grid-cols-5 gap-1">
            {COLORMAP_IDS.map((c) => (
              <button
                key={c}
                onClick={() => setColormap(c)}
                title={c}
                className={`h-6 rounded ${colormap === c ? 'ring-2 ring-accent' : ''}`}
                style={{ background: colormapCSS(c) }}
              />
            ))}
          </div>
          <Slider label="size" value={pointSize / 0.5} onChange={(v) => setPointSize(v * 0.5)} />
          <Slider label="opacity" value={opacity} onChange={setOpacity} />
        </div>

        <div className="p-3 flex-1">
          <div className="text-[10px] uppercase text-white/45 mb-1.5 flex items-center gap-1">
            <BarChart3 size={11} /> {dataset.scalarName} histogram
          </div>
          <div className="flex items-end gap-0.5 h-20">
            {hist.map((v, i) => (
              <div
                key={i}
                className="flex-1 bg-accent/70 rounded-sm"
                style={{ height: `${(v / Math.max(...hist, 1)) * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-2 text-[11px] font-mono text-white/65 space-y-0.5">
            <div>min {stats.min.toFixed(4)}</div>
            <div>max {stats.max.toFixed(4)}</div>
            <div>mean {stats.mean.toFixed(4)}</div>
            <div>n {stats.count.toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualEntry() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('x, y, z, value\n0,0,0,1\n1,0,0,0.5\n0,1,0,0.7\n1,1,1,0.2');
  const setDataset = useVizStore((s) => s.setDataset);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 text-xs"
      >
        ✎ Enter data manually
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          <div className="text-[10px] text-white/45">
            One point per line: <span className="font-mono">x,y,z,value</span> (header optional)
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            rows={7}
            className="w-full bg-black/40 border border-white/10 rounded-md p-2 font-mono text-[11px] outline-none resize-y"
          />
          <button
            onClick={async () => {
              const { parseCSV } = await import('@/lib/viz/datasets');
              const { toast } = await import('@/store/toastStore');
              const ds = parseCSV(text);
              if (ds.points.length < 1) {
                toast.error('No data', 'Need at least one "x,y,z[,value]" row.');
                return;
              }
              setDataset({ ...ds, name: 'Manual entry' });
              toast.success('Loaded', `${ds.points.length} points`);
            }}
            className="w-full px-2 py-1 rounded-md bg-accent hover:bg-accent-hover text-white text-xs"
          >
            Load these points
          </button>
        </div>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-white/65">
      <span className="w-12">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1"
      />
      <span className="font-mono w-9 text-right">{value.toFixed(2)}</span>
    </div>
  );
}

const module: AppModule = {
  manifest: {
    id: 'dataviz',
    name: 'DataViz',
    description: 'Scientific data visualization — fields, filters, colormaps',
    icon: BarChart3,
    defaultSize: { width: 1060, height: 660 },
    accent: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
  },
  Component: DataViz,
};

export default module;
