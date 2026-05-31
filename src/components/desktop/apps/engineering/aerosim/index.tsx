import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, BarChart3, X, Upload, Play, Pause, RotateCcw, Box } from 'lucide-react';
import { AeroIcon } from '@/apps/icons';
import type { AppModule } from '@/os/types';
import { useAerosimStore, type AeroMode, type VizMode } from '@/store/aerosimStore';
import {
  AIRFOILS,
  type AirfoilId,
  generateAirfoil,
  naca4Custom,
  placeShape,
} from '@/lib/cfd/naca';
import { makeFlowField } from '@/lib/cfd/potential';
import type { Vec2 } from '@/lib/physics2d/math';
import { aero } from '@/lib/cfd/aero';

const presetVerts = (id: AirfoilId): Vec2[] => generateAirfoil(id, 60);
const nacaFor = (m: number, p: number, t: number): Vec2[] => naca4Custom(m, p, t, 60);
const placeShapeLite = (v: Vec2[], chord: number, aoa: number): Vec2[] =>
  placeShape(v, { x: 0, y: 0 }, chord, aoa);
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';
import { parseOBJ, parseSTL, extractSilhouette } from '@/lib/cfd/customShape';
import { useModelerStore } from '@/store/modelerStore';
import { useLibraryStore, geometryFromJSON } from '@/store/libraryStore';
import { toast } from '@/store/toastStore';
import Viewport from './Viewport';

function AeroSim({ appId }: { appId: string }) {
  const airfoil = useAerosimStore((s) => s.airfoil);
  const aoaDeg = useAerosimStore((s) => s.aoaDeg);
  const V = useAerosimStore((s) => s.V);
  const rho = useAerosimStore((s) => s.rho);
  const chord = useAerosimStore((s) => s.chord);
  const mode = useAerosimStore((s) => s.mode);
  const viz = useAerosimStore((s) => s.viz);
  const threeD = useAerosimStore((s) => s.threeD);
  const sweep = useAerosimStore((s) => s.sweep);
  const useCustom = useAerosimStore((s) => s.useCustom);
  const customM = useAerosimStore((s) => s.customM);
  const customP = useAerosimStore((s) => s.customP);
  const customT = useAerosimStore((s) => s.customT);
  const setUseCustom = useAerosimStore((s) => s.setUseCustom);
  const setCustomM = useAerosimStore((s) => s.setCustomM);
  const setCustomP = useAerosimStore((s) => s.setCustomP);
  const setCustomT = useAerosimStore((s) => s.setCustomT);

  const setAirfoil = useAerosimStore((s) => s.setAirfoil);
  const setAoaDeg = useAerosimStore((s) => s.setAoaDeg);
  const setV = useAerosimStore((s) => s.setV);
  const setRho = useAerosimStore((s) => s.setRho);
  const setChord = useAerosimStore((s) => s.setChord);
  const setMode = useAerosimStore((s) => s.setMode);
  const setViz = useAerosimStore((s) => s.setViz);
  const setThreeD = useAerosimStore((s) => s.setThreeD);
  const setSweep = useAerosimStore((s) => s.setSweep);
  const source = useAerosimStore((s) => s.source);
  const imported = useAerosimStore((s) => s.imported);
  const setImported = useAerosimStore((s) => s.setImported);
  const running = useAerosimStore((s) => s.running);
  const setRunning = useAerosimStore((s) => s.setRunning);
  const fileRef = useRef<HTMLInputElement>(null);

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.toLowerCase().split('.').pop();
      let geom;
      if (ext === 'stl') geom = parseSTL(await file.arrayBuffer());
      else geom = parseOBJ(await file.text());
      const sil = extractSilhouette(geom);
      if (sil.length < 3) {
        toast.error('Import failed', 'Could not extract a cross-section from that mesh.');
      } else {
        setImported({
          name: file.name.replace(/\.(obj|stl)$/i, ''),
          silhouette: sil,
          geometry: geom,
        });
        toast.success('Model imported', `${file.name} - testing its silhouette in the flow.`);
      }
    } catch (err) {
      toast.error('Import failed', (err as Error).message);
    } finally {
      e.target.value = '';
    }
  };

  const importFromModeler = () => {
    const m = useModelerStore.getState();
    const sel = m.selectedId ? m.objects.find((o) => o.id === m.selectedId) : null;
    const obj = sel ?? m.objects[m.objects.length - 1];
    if (!obj) {
      toast.warn(
        'Modeler3D scene is empty',
        'Build something in Modeler3D first, or use “From Library” for saved models.',
      );
      return;
    }
    const sil = extractSilhouette(obj.geometry);
    if (sil.length < 3) {
      toast.error('Import failed', 'That object has no usable cross-section.');
      return;
    }
    setImported({ name: obj.name, silhouette: sil, geometry: obj.geometry.clone() });
    toast.success('Imported from Modeler3D', `Testing "${obj.name}".`);
  };

  const results = useMemo(
    () =>
      aero({
        airfoil,
        aoa: (aoaDeg * Math.PI) / 180,
        V,
        rho,
        chord,
        // When the user is driving a custom NACA, override the empirical
        // values so analytics actually track their slider changes.
        alphaZero: useCustom ? -1.07 * customM * 100 * (Math.PI / 180) : undefined,
        cd0: useCustom ? 0.005 + customT * 0.04 : undefined,
      }),
    [airfoil, aoaDeg, V, rho, chord, useCustom, customM, customT],
  );

  // Publish for the AI scanner
  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `AeroSim showing ${useCustom ? `custom NACA ${Math.round(customM * 100)}${Math.round(customP * 10)}${String(Math.round(customT * 100)).padStart(2, '0')}` : airfoil} at ${aoaDeg.toFixed(1)}° AoA, V = ${V} m/s, ρ = ${rho} kg/m³, chord = ${chord} m. Cl = ${results.cl.toFixed(3)}, Cd = ${results.cd.toFixed(4)}, L/D = ${results.ld.toFixed(2)}, Re = ${results.re.toExponential(2)}.${results.stalled ? ' Airfoil is STALLED.' : ''} Mode: ${mode}${threeD ? ' (3D)' : ''}.`,
      state: {
        airfoil,
        aoaDeg,
        V,
        rho,
        chord,
        mode,
        viz,
        threeD,
        results,
      },
    }));
  }, [appId, airfoil, aoaDeg, V, rho, chord, mode, viz, threeD, results]);

  // AI tools
  useAppTools(appId, [
    {
      toolName: 'set_airfoil',
      description: `Switch to a preset airfoil. One of: ${AIRFOILS.map((a) => a.id).join(', ')}.`,
      input_schema: {
        type: 'object',
        properties: { id: { type: 'string', enum: AIRFOILS.map((a) => a.id) } },
        required: ['id'],
      },
      handler: ({ id }: any) => {
        setAirfoil(id as AirfoilId);
        return { ok: true };
      },
    },
    {
      toolName: 'set_airspeed',
      description: 'Set the freestream velocity in m/s (0.5 to 300).',
      input_schema: {
        type: 'object',
        properties: { v: { type: 'number' } },
        required: ['v'],
      },
      handler: ({ v }: any) => {
        setV(Number(v));
        return { V: Number(v) };
      },
    },
    {
      toolName: 'set_aoa',
      description: 'Set the angle of attack in degrees (-30 to +30).',
      input_schema: {
        type: 'object',
        properties: { degrees: { type: 'number' } },
        required: ['degrees'],
      },
      handler: ({ degrees }: any) => {
        setAoaDeg(Number(degrees));
        return { aoaDeg: Number(degrees) };
      },
    },
    {
      toolName: 'set_density',
      description: 'Set the freestream air density in kg/m³ (default 1.225).',
      input_schema: {
        type: 'object',
        properties: { rho: { type: 'number' } },
        required: ['rho'],
      },
      handler: ({ rho: r }: any) => {
        setRho(Number(r));
        return { rho: Number(r) };
      },
    },
    {
      toolName: 'set_chord',
      description: 'Set the airfoil chord length in meters.',
      input_schema: {
        type: 'object',
        properties: { chord: { type: 'number' } },
        required: ['chord'],
      },
      handler: ({ chord: c }: any) => {
        setChord(Number(c));
        return { chord: Number(c) };
      },
    },
    {
      toolName: 'set_mode',
      description:
        'Switch visualization mode. "simple" = analytic potential-flow streamlines. "advanced" = grid-based stable-fluids solver.',
      input_schema: {
        type: 'object',
        properties: { mode: { type: 'string', enum: ['simple', 'advanced'] } },
        required: ['mode'],
      },
      handler: ({ mode: m }: any) => {
        setMode(m as AeroMode);
        return { ok: true };
      },
    },
    {
      toolName: 'get_results',
      description:
        'Return current aerodynamic coefficients: Cl, Cd, L/D, Reynolds number, lift force per unit span (N/m), drag force per unit span (N/m), and stalled flag.',
      input_schema: { type: 'object', properties: {} },
      handler: () => results,
    },
    {
      toolName: 'run_sweep',
      description:
        'Sweep one parameter and return tabulated (parameter, Cl, Cd, L/D) data. param ∈ {aoa, V, rho, chord}.',
      input_schema: {
        type: 'object',
        properties: {
          param: { type: 'string', enum: ['aoa', 'V', 'rho', 'chord'] },
          start: { type: 'number' },
          end: { type: 'number' },
          steps: { type: 'number' },
        },
        required: ['param', 'start', 'end', 'steps'],
      },
      handler: ({ param, start, end, steps }: any) => {
        const N = Math.max(2, Math.min(100, Math.round(Number(steps))));
        const s = Number(start);
        const e = Number(end);
        const data = [] as { x: number; cl: number; cd: number; ld: number }[];
        const baseAoa = (aoaDeg * Math.PI) / 180;
        for (let i = 0; i < N; i++) {
          const x = s + ((e - s) * i) / (N - 1);
          const out = aero({
            airfoil,
            aoa: param === 'aoa' ? (x * Math.PI) / 180 : baseAoa,
            V: param === 'V' ? x : V,
            rho: param === 'rho' ? x : rho,
            chord: param === 'chord' ? x : chord,
          });
          data.push({ x, cl: out.cl, cd: out.cd, ld: out.ld });
        }
        setSweep(data);
        return data;
      },
    },
  ]);

  return (
    <div className="flex h-full flex-col">
      {/* Top toolbar */}
      <div className="h-9 shrink-0 flex items-center gap-1 px-2 border-b border-white/10 chrome">
        <button
          onClick={() => setRunning(!running)}
          className="flex items-center gap-1 px-2 h-6 rounded-md text-xs bg-accent hover:bg-accent-hover text-white"
        >
          {running ? <Pause size={12} /> : <Play size={12} />}
          {running ? 'Pause' : 'Run'} flow
        </button>
        <button
          onClick={() => useAerosimStore.getState().bump()}
          title="Reset flow field"
          className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <div className="mx-1 w-px h-4 bg-white/15" />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
          title="Import a CAD mesh (.obj or .stl) and test its cross-section"
        >
          <Upload size={12} /> Import file
        </button>
        <LibraryImportMenu
          onPick={(name, geom) => {
            const sil = extractSilhouette(geom);
            if (sil.length < 3) {
              toast.error('Import failed', 'That model has no usable cross-section.');
              return;
            }
            setImported({ name, silhouette: sil, geometry: geom });
            toast.success('Imported from Library', `Testing "${name}".`);
          }}
        />
        <button
          onClick={importFromModeler}
          className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
          title="Pull the current Modeler3D object"
        >
          <Box size={12} /> From Modeler3D
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".obj,.stl"
          hidden
          onChange={onImportFile}
        />
        {source === 'import' && imported && (
          <div className="flex items-center gap-1.5 ml-1 px-2 h-6 rounded-md bg-accent/20 text-accent text-[11px]">
            <Box size={11} />
            <span className="font-mono max-w-[140px] truncate">{imported.name}</span>
            <button
              onClick={() => setImported(null)}
              className="hover:text-white"
              title="Clear imported model"
            >
              <X size={11} />
            </button>
          </div>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-white/70 cursor-pointer">
          <input
            type="checkbox"
            checked={threeD}
            onChange={(e) => setThreeD(e.target.checked)}
          />
          3D view
        </label>
      </div>

      <div className="flex flex-1 min-h-0">
      {/* Three.js viewport */}
      <div className="flex-1 relative min-w-0">
        <Viewport />

        {/* Top-left HUD */}
        <div className="absolute top-2 left-2 glass-strong rounded-md px-2 py-1.5 text-[11px] text-white/85 font-mono space-y-0.5 pointer-events-none">
          <div>
            shape{' '}
            <span className="text-accent">
              {source === 'import' && imported
                ? imported.name
                : useCustom
                  ? `NACA ${Math.round(customM * 100)}${Math.round(customP * 10)}${String(Math.round(customT * 100)).padStart(2, '0')}`
                  : airfoil}
            </span>
          </div>
          <div>V <span className="text-accent">{V.toFixed(1)}</span> m/s</div>
          <div>α <span className="text-accent">{aoaDeg.toFixed(1)}°</span></div>
          <div>Re <span className="text-accent">{results.re.toExponential(2)}</span></div>
        </div>

        {/* Velocity colorbar */}
        <div className="absolute bottom-3 left-3 glass-strong rounded-md px-2 py-1.5 pointer-events-none">
          <div className="text-[9px] uppercase tracking-wide text-white/55 mb-1">
            Flow speed
          </div>
          <div
            className="w-36 h-2.5 rounded-full"
            style={{
              background:
                'linear-gradient(90deg, #334dd9 0%, #22d3ee 28%, #33c761 52%, #f5b329 75%, #ef4438 100%)',
            }}
          />
          <div className="flex justify-between text-[9px] text-white/45 font-mono mt-0.5">
            <span>slow</span>
            <span>fast</span>
          </div>
        </div>

        {/* Sweep popup */}
        {sweep && <SweepPanel onClose={() => setSweep(null)} />}
      </div>

      {/* Right panel */}
      <div className="w-64 shrink-0 border-l border-white/10 bg-black/25 flex flex-col chrome">
        {/* Mode tabs */}
        <div className="flex items-center border-b border-white/10">
          {(['simple', 'advanced'] as AeroMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 h-8 text-xs ${
                mode === m ? 'text-white border-b-2 border-accent -mb-px' : 'text-white/55 hover:text-white/85'
              }`}
            >
              {m === 'simple' ? 'Simple' : 'Advanced'}
            </button>
          ))}
        </div>

        <div className="p-3 space-y-3 overflow-y-auto">
          <div>
            <Label>Airfoil</Label>
            <select
              value={useCustom ? '__custom__' : airfoil}
              onChange={(e) => {
                if (e.target.value === '__custom__') setUseCustom(true);
                else setAirfoil(e.target.value as AirfoilId);
              }}
              className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs outline-none"
            >
              {AIRFOILS.map((a) => (
                <option key={a.id} value={a.id} className="bg-zinc-800">
                  {a.label}
                </option>
              ))}
              <option value="__custom__" className="bg-zinc-800">Custom NACA…</option>
            </select>
          </div>
          {useCustom && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-2 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-white/45">Custom NACA</div>
              <SliderRow
                label="M (camber)"
                suffix=""
                min={0}
                max={0.09}
                step={0.005}
                value={customM}
                onChange={setCustomM}
              />
              <SliderRow
                label="P (cmb pos)"
                suffix=""
                min={0.1}
                max={0.9}
                step={0.05}
                value={customP}
                onChange={setCustomP}
              />
              <SliderRow
                label="T (thickness)"
                suffix=""
                min={0.04}
                max={0.3}
                step={0.005}
                value={customT}
                onChange={setCustomT}
              />
              <div className="text-[10px] text-white/45 font-mono">
                ≈ NACA {Math.round(customM * 100)}{Math.round(customP * 10)}{String(Math.round(customT * 100)).padStart(2, '0')}
              </div>
            </div>
          )}

          <SliderRow label="Airspeed" suffix="m/s" min={0.5} max={120} step={0.5} value={V} onChange={setV} />
          <SliderRow label="AoA" suffix="°" min={-15} max={20} step={0.5} value={aoaDeg} onChange={setAoaDeg} />
          <SliderRow
            label="Density"
            suffix="kg/m³"
            min={0.05}
            max={5}
            step={0.005}
            value={rho}
            onChange={setRho}
          />
          <SliderRow label="Chord" suffix="m" min={0.1} max={3} step={0.05} value={chord} onChange={setChord} />

          {mode === 'advanced' && (
            <div>
              <Label>Visualization</Label>
              <div className="grid grid-cols-3 gap-1">
                {(['streamlines', 'vorticity', 'pressure'] as VizMode[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setViz(v)}
                    className={`text-[11px] py-1 rounded-md ${
                      viz === v ? 'bg-accent text-white' : 'bg-white/5 hover:bg-white/10 text-white/75'
                    }`}
                  >
                    {v === 'streamlines' ? 'speed' : v}
                  </button>
                ))}
              </div>
            </div>
          )}


          <div className="border-t border-white/10 pt-3">
            <div className="text-[10px] uppercase text-white/45 mb-1.5">Results</div>
            <ResultRow label="Cl" value={results.cl.toFixed(3)} />
            <ResultRow label="Cd" value={results.cd.toFixed(4)} />
            <ResultRow label="L/D" value={results.ld.toFixed(2)} />
            <ResultRow label="Re" value={results.re.toExponential(2)} />
            <ResultRow label="L'" value={`${results.lift.toFixed(1)} N/m`} />
            <ResultRow label="D'" value={`${results.drag.toFixed(1)} N/m`} />
            <ResultRow label="α₀" value={`${results.alphaZeroDeg.toFixed(2)}°`} />
            {results.stalled && (
              <div className="text-traffic-red text-[11px] mt-1 font-mono">⚠ STALLED</div>
            )}
          </div>

          <CpPlot />

          <div className="border-t border-white/10 pt-3">
            <div className="text-[10px] uppercase text-white/45 mb-1.5">
              Surface Cp legend
            </div>
            <div
              className="h-3 rounded-full"
              style={{
                background:
                  'linear-gradient(90deg, #2e6bed 0%, #7aa8ee 35%, #ededed 50%, #edb04a 70%, #ed4438 100%)',
              }}
            />
            <div className="flex justify-between text-[10px] text-white/45 font-mono mt-0.5">
              <span>−Cp (suction)</span>
              <span>+Cp (stagnation)</span>
            </div>
          </div>

          <SweepButton />
        </div>
      </div>
      </div>
    </div>
  );
}

function LibraryImportMenu({
  onPick,
}: {
  onPick: (name: string, geom: ReturnType<typeof geometryFromJSON>) => void;
}) {
  const models = useLibraryStore((s) => s.models);
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
        title="Import a model you saved to the Library"
      >
        <Box size={12} /> From Library
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 glass-strong rounded-md min-w-[200px] max-h-64 overflow-y-auto py-1 z-30 shadow-window">
          {models.length === 0 && (
            <div className="px-2 py-1.5 text-[11px] text-white/45">
              No saved models. In Modeler3D click “Save to Library”.
            </div>
          )}
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onPick(m.name, geometryFromJSON(m.geom));
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1 text-xs hover:bg-white/10 flex items-center gap-2"
            >
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: m.color }}
              />
              <span className="truncate">{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CpPlot() {
  const V = useAerosimStore((s) => s.V);
  const aoaDeg = useAerosimStore((s) => s.aoaDeg);
  const chord = useAerosimStore((s) => s.chord);
  const source = useAerosimStore((s) => s.source);
  const airfoil = useAerosimStore((s) => s.airfoil);
  const customM = useAerosimStore((s) => s.customM);
  const customP = useAerosimStore((s) => s.customP);
  const customT = useAerosimStore((s) => s.customT);
  const imported = useAerosimStore((s) => s.imported);

  const { upper, lower, cpMin } = useMemo(() => {
    const verts =
      source === 'import' && imported?.silhouette.length
        ? imported.silhouette
        : source === 'naca'
          ? nacaFor(customM, customP, customT)
          : presetVerts(airfoil);
    const aoa = (aoaDeg * Math.PI) / 180;
    const isCyl = source === 'preset' && airfoil === 'cylinder';
    const field = makeFlowField({ V, aoa, chord, isCylinder: isCyl, center: { x: 0, y: 0 } });
    const placed = placeShapeLite(verts, chord, aoa);
    const up: { x: number; cp: number }[] = [];
    const lo: { x: number; cp: number }[] = [];
    let mn = 1;
    for (const p of placed) {
      const vv = field.velocity({ x: p.x * 1.04, y: p.y * 1.04 });
      const sp = Math.hypot(vv.x, vv.y);
      const cp = Math.max(-3, Math.min(1, 1 - (sp / Math.max(0.001, V)) ** 2));
      mn = Math.min(mn, cp);
      const xc = (p.x + chord * 0.25) / chord;
      (p.y >= 0 ? up : lo).push({ x: Math.max(0, Math.min(1, xc)), cp });
    }
    up.sort((a, b) => a.x - b.x);
    lo.sort((a, b) => a.x - b.x);
    return { upper: up, lower: lo, cpMin: mn };
  }, [V, aoaDeg, chord, source, airfoil, customM, customP, customT, imported]);

  const W = 224;
  const H = 110;
  const PAD = 16;
  // Cp axis inverted (aero convention: −Cp up)
  const cpHi = 1;
  const cpLo = Math.min(-3, Math.floor(cpMin));
  const xp = (xc: number) => PAD + xc * (W - 2 * PAD);
  const yp = (cp: number) => PAD + ((cp - cpHi) / (cpLo - cpHi)) * (H - 2 * PAD);
  const path = (pts: { x: number; cp: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xp(p.x).toFixed(1)},${yp(p.cp).toFixed(1)}`).join(' ');

  return (
    <div className="border-t border-white/10 pt-3">
      <div className="text-[10px] uppercase text-white/45 mb-1.5">Cp vs x/c</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="bg-black/30 rounded-md">
        <line x1={PAD} y1={yp(0)} x2={W - PAD} y2={yp(0)} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.25)" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgba(255,255,255,0.25)" />
        <path d={path(upper)} fill="none" stroke="#22d3ee" strokeWidth={1.4} />
        <path d={path(lower)} fill="none" stroke="#f59e0b" strokeWidth={1.4} />
        <text x={PAD + 2} y={PAD + 2} fill="#22d3ee" fontSize={8} fontFamily="monospace">upper</text>
        <text x={PAD + 36} y={PAD + 2} fill="#f59e0b" fontSize={8} fontFamily="monospace">lower</text>
        <text x={W - PAD} y={H - PAD + 10} fill="rgba(255,255,255,0.45)" fontSize={8} fontFamily="monospace" textAnchor="end">x/c</text>
      </svg>
    </div>
  );
}

function SweepButton() {
  const setSweep = useAerosimStore((s) => s.setSweep);
  const airfoil = useAerosimStore((s) => s.airfoil);
  const V = useAerosimStore((s) => s.V);
  const rho = useAerosimStore((s) => s.rho);
  const chord = useAerosimStore((s) => s.chord);
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-white/10 pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-2 py-1 rounded-md text-xs bg-white/5 hover:bg-white/10"
      >
        <span className="flex items-center gap-1.5">
          <BarChart3 size={12} /> AoA sweep
        </span>
        <ChevronDown size={11} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {open && (
        <div className="mt-1.5 px-2 py-1.5 rounded-md bg-white/5 text-[11px] text-white/65 space-y-1.5">
          <div>Sweep AoA from −10° to +18° (30 steps)</div>
          <button
            onClick={() => {
              const data = [] as { x: number; cl: number; cd: number; ld: number }[];
              for (let i = 0; i < 30; i++) {
                const deg = -10 + (28 * i) / 29;
                const out = aero({
                  airfoil,
                  aoa: (deg * Math.PI) / 180,
                  V,
                  rho,
                  chord,
                });
                data.push({ x: deg, cl: out.cl, cd: out.cd, ld: out.ld });
              }
              setSweep(data);
            }}
            className="w-full px-2 py-1 rounded-md bg-accent hover:bg-accent-hover text-white text-xs"
          >
            Run sweep
          </button>
        </div>
      )}
    </div>
  );
}

function SweepPanel({ onClose }: { onClose: () => void }) {
  const sweep = useAerosimStore((s) => s.sweep)!;
  // SVG plot of Cl(α) and L/D(α)
  const W = 320,
    H = 180,
    PAD = 24;
  const xs = sweep.map((d) => d.x);
  const cls = sweep.map((d) => d.cl);
  const lds = sweep.map((d) => d.ld);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...cls, ...lds.map((v) => v / 30));
  const yMax = Math.max(...cls, ...lds.map((v) => v / 30));
  const xp = (x: number) => PAD + ((x - xMin) / (xMax - xMin)) * (W - 2 * PAD);
  const yp = (y: number) => H - PAD - ((y - yMin) / (yMax - yMin || 1)) * (H - 2 * PAD);

  const clPath = sweep.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xp(d.x)},${yp(d.cl)}`).join(' ');
  const ldPath = sweep.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xp(d.x)},${yp(d.ld / 30)}`).join(' ');

  return (
    <div className="absolute top-2 right-2 glass-strong rounded-lg p-2 shadow-window">
      <div className="flex items-center mb-1">
        <div className="text-[11px] font-semibold">Sweep results</div>
        <button onClick={onClose} className="ml-auto p-0.5 rounded hover:bg-white/10">
          <X size={11} />
        </button>
      </div>
      <svg width={W} height={H} className="bg-black/40 rounded">
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgba(255,255,255,0.3)" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.3)" />
        <path d={clPath} stroke="#22d3ee" strokeWidth={1.5} fill="none" />
        <path d={ldPath} stroke="#fbbf24" strokeWidth={1.2} fill="none" strokeDasharray="3 2" />
        <text x={PAD} y={PAD - 6} fill="#22d3ee" fontSize={10} fontFamily="monospace">
          Cl
        </text>
        <text x={PAD + 30} y={PAD - 6} fill="#fbbf24" fontSize={10} fontFamily="monospace">
          L/D ÷ 30
        </text>
        <text x={W - PAD - 8} y={H - PAD + 12} fill="rgba(255,255,255,0.55)" fontSize={9} fontFamily="monospace">
          {xMax.toFixed(1)}
        </text>
        <text x={PAD} y={H - PAD + 12} fill="rgba(255,255,255,0.55)" fontSize={9} fontFamily="monospace">
          {xMin.toFixed(1)}
        </text>
      </svg>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase text-white/45 mb-1">{children}</div>;
}

function SliderRow({
  label,
  suffix,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-white/65 mb-0.5">
        <span>{label}</span>
        <span className="font-mono text-white/85">
          {value.toFixed(step < 0.1 ? 3 : step < 1 ? 1 : 0)} {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[12px] font-mono py-0.5">
      <span className="text-white/55">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

const module: AppModule = {
  manifest: {
    id: 'aerosim',
    name: 'AeroSim',
    description: 'NACA airfoils, lift/drag, streamlines & stable-fluids CFD',
    icon: AeroIcon,
    defaultSize: { width: 1040, height: 640 },
    accent: 'linear-gradient(135deg, #0ea5e9 0%, #22d3ee 100%)',
  },
  Component: AeroSim,
};

export default module;
