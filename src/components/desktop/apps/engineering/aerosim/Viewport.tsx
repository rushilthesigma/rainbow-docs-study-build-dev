import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useAerosimStore } from '@/store/aerosimStore';
import { generateAirfoil, naca4Custom, placeShape } from '@/lib/cfd/naca';
import type { Vec2 } from '@/lib/physics2d/math';
import { advectRK2, makeFlowField } from '@/lib/cfd/potential';
import { aero } from '@/lib/cfd/aero';
import {
  makeGrid,
  stampObstacle,
  step as fluidStep,
  vorticity,
  IX,
  type Grid as FluidGrid,
} from '@/lib/cfd/stableFluids';

const FLOW_DOMAIN = { x: -3.5, y: -2, w: 7, h: 4 };
const FLUID_W = 192;
const FLUID_H = 96;

export default function Viewport() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 50, near: 0.05, far: 200 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      style={{ background: 'transparent' }}
    >
      <color attach="background" args={['#070b16']} />
      <fog attach="fog" args={['#070b16', 14, 34]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 5]} intensity={1.25} castShadow />
      <directionalLight position={[-5, -3, -6]} intensity={0.45} />
      <directionalLight position={[0, 2, 8]} intensity={0.35} color="#9ec5ff" />

      <CameraSwitcher />
      <SceneContents />

      <Grid
        args={[20, 20]}
        cellColor="#1f2937"
        sectionColor="#334155"
        sectionThickness={1}
        cellThickness={0.6}
        fadeDistance={30}
        infiniteGrid
        position={[0, 0, -0.05]}
      />
      <OrbitControls enableDamping makeDefault />
      <GizmoHelper alignment="top-right" margin={[60, 50]}>
        <GizmoViewport axisColors={["#ef4444", "#22c55e", "#0ea5e9"]} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  );
}

function CameraSwitcher() {
  const threeD = useAerosimStore((s) => s.threeD);
  const { camera } = useThree();
  useEffect(() => {
    if (!threeD) {
      camera.position.set(0, 0, 6);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.set(3.5, 3, 5);
      camera.lookAt(0, 0, 0);
    }
  }, [threeD, camera]);
  return null;
}

function SceneContents() {
  const mode = useAerosimStore((s) => s.mode);
  const threeD = useAerosimStore((s) => s.threeD);
  const aoaDeg = useAerosimStore((s) => s.aoaDeg);
  const chord = useAerosimStore((s) => s.chord);
  const aoa = (aoaDeg * Math.PI) / 180;

  return (
    <>
      <AirfoilMesh chord={chord} aoa={aoa} threeD={threeD} />
      {mode === 'simple' ? (
        <>
          <FlowVis chord={chord} aoa={aoa} />
          {!threeD && <ForceVectors chord={chord} aoa={aoa} />}
        </>
      ) : (
        <FluidField chord={chord} aoa={aoa} />
      )}
    </>
  );
}

/** Resolve the active 2D outline (unit-chord verts) from the current source. */
export function useActiveSilhouette(): Vec2[] {
  const source = useAerosimStore((s) => s.source);
  const airfoil = useAerosimStore((s) => s.airfoil);
  const customM = useAerosimStore((s) => s.customM);
  const customP = useAerosimStore((s) => s.customP);
  const customT = useAerosimStore((s) => s.customT);
  const imported = useAerosimStore((s) => s.imported);
  return useMemo(() => {
    if (source === 'import' && imported?.silhouette.length) return imported.silhouette;
    if (source === 'naca') return naca4Custom(customM, customP, customT, 60);
    return generateAirfoil(airfoil, 60);
  }, [source, airfoil, customM, customP, customT, imported]);
}

function AirfoilMesh({
  chord,
  aoa,
  threeD,
}: {
  chord: number;
  aoa: number;
  threeD: boolean;
}) {
  const source = useAerosimStore((s) => s.source);
  const imported = useAerosimStore((s) => s.imported);
  const verts = useActiveSilhouette();

  const V = useAerosimStore((s) => s.V);
  const airfoil = useAerosimStore((s) => s.airfoil);

  const { geom, colored } = useMemo(() => {
    // In 3D mode, prefer the *actual* imported mesh so users see their model.
    if (threeD && source === 'import' && imported?.geometry) {
      const g = imported.geometry.clone();
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      const size = bb.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const s = (chord * 2.4) / maxDim;
      g.center();
      g.scale(s, s, s);
      g.rotateZ(-aoa);
      return { geom: g, colored: false };
    }
    const placed = placeShape(verts, { x: 0, y: 0 }, chord, aoa);
    const shape = new THREE.Shape();
    shape.moveTo(placed[0].x, -placed[0].y);
    for (let i = 1; i < placed.length; i++) shape.lineTo(placed[i].x, -placed[i].y);
    shape.lineTo(placed[0].x, -placed[0].y);
    const g = threeD
      ? (() => {
          const ex = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false });
          ex.center();
          return ex as THREE.BufferGeometry;
        })()
      : new THREE.ShapeGeometry(shape);

    // Surface-pressure (Cp) vertex coloring from the potential-flow field.
    const isCyl = source === 'preset' && airfoil === 'cylinder';
    const field = makeFlowField({ V, aoa, chord, isCylinder: isCyl, center: { x: 0, y: 0 } });
    const pos = g.getAttribute('position');
    const colArr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      // Sample slightly outside the surface so we're in the flow, not at 0.
      const px = pos.getX(i);
      const py = -pos.getY(i);
      const vv = field.velocity({ x: px * 1.04, y: py * 1.04 });
      const sp = Math.hypot(vv.x, vv.y);
      // Cp = 1 - (V/Vinf)^2 ; clamp to [-3, 1]
      const cp = Math.max(-3, Math.min(1, 1 - (sp / Math.max(0.001, V)) ** 2));
      // Map: Cp=1 → red (stagnation/high pressure), 0 → pale, −3 → blue (suction)
      const t = (cp + 3) / 4; // 0..1, 1 = high pressure
      const c = pressureColor(t);
      colArr[i * 3] = c.r;
      colArr[i * 3 + 1] = c.g;
      colArr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    return { geom: g, colored: true };
  }, [verts, chord, aoa, threeD, source, imported, V, airfoil]);

  return (
    <mesh geometry={geom} castShadow receiveShadow>
      <meshStandardMaterial
        color={colored ? '#ffffff' : '#e2e8f0'}
        vertexColors={colored}
        metalness={0.25}
        roughness={0.45}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/** Pressure colormap: t=1 → red (high), 0.5 → pale, 0 → deep blue (suction). */
function pressureColor(t: number): { r: number; g: number; b: number } {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  if (t > 0.5) {
    const k = (t - 0.5) * 2; // 0..1
    return { r: 0.93, g: 0.93 - 0.66 * k, b: 0.93 - 0.74 * k };
  }
  const k = t * 2; // 0..1
  return { r: 0.18 + 0.75 * k, g: 0.42 + 0.51 * k, b: 0.93 };
}

/* ---- Turbo-ish colormap: blue → cyan → green → amber → red ---- */
const CMAP: [number, number, number][] = [
  [0.20, 0.30, 0.85],
  [0.13, 0.83, 0.93],
  [0.20, 0.78, 0.38],
  [0.96, 0.70, 0.16],
  [0.94, 0.27, 0.22],
];
function speedColor(t: number, out: { r: number; g: number; b: number }) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const f = t * (CMAP.length - 1);
  const i = Math.min(CMAP.length - 2, Math.floor(f));
  const k = f - i;
  const a = CMAP[i];
  const b = CMAP[i + 1];
  out.r = a[0] + (b[0] - a[0]) * k;
  out.g = a[1] + (b[1] - a[1]) * k;
  out.b = a[2] + (b[2] - a[2]) * k;
}

/**
 * Dense traced streamlines + animated glow tracers. Each frame nothing is
 * re-integrated unless the flow params change - the streamlines are static
 * geometry colored by local speed, and a set of glowing tracer points ride
 * along them to convey motion. This reads like Fusion 360's flow viz.
 */
const N_LINES = 130;
const STEPS = 240;
const STEP_DT = 0.018;

function FlowVis({ chord, aoa }: { chord: number; aoa: number }) {
  const V = useAerosimStore((s) => s.V);
  const airfoil = useAerosimStore((s) => s.airfoil);
  const source = useAerosimStore((s) => s.source);
  const isCyl = source === 'preset' && airfoil === 'cylinder';

  // Build the static streamline geometry + tracer scaffolding when params change.
  const { lineGeom, polylines } = useMemo(() => {
    const field = makeFlowField({ V, aoa, chord, isCylinder: isCyl, center: { x: 0, y: 0 } });
    const polylines: { x: number; y: number; spd: number }[][] = [];
    const x0 = FLOW_DOMAIN.x + 0.15;
    for (let i = 0; i < N_LINES; i++) {
      const y0 = -FLOW_DOMAIN.h * 0.95 + (i / (N_LINES - 1)) * FLOW_DOMAIN.h * 1.9;
      const pts: { x: number; y: number; spd: number }[] = [];
      let p = { x: x0, y: y0 };
      for (let s = 0; s < STEPS; s++) {
        const v = field.velocity(p);
        const spd = Math.hypot(v.x, v.y);
        pts.push({ x: p.x, y: p.y, spd });
        p = advectRK2(field, p, STEP_DT);
        if (
          p.x > FLOW_DOMAIN.x + FLOW_DOMAIN.w + 0.5 ||
          p.x < FLOW_DOMAIN.x - 0.5 ||
          Math.abs(p.y) > FLOW_DOMAIN.h * 1.4
        )
          break;
      }
      if (pts.length > 4) polylines.push(pts);
    }
    // Pack into a lineSegments buffer (consecutive pairs)
    let segCount = 0;
    for (const pl of polylines) segCount += pl.length - 1;
    const positions = new Float32Array(segCount * 6);
    const colors = new Float32Array(segCount * 6);
    const vmax = Math.max(0.001, V * 1.7);
    const c0 = { r: 0, g: 0, b: 0 };
    const c1 = { r: 0, g: 0, b: 0 };
    let o = 0;
    for (const pl of polylines) {
      for (let j = 0; j < pl.length - 1; j++) {
        const a = pl[j];
        const b = pl[j + 1];
        positions[o] = a.x;
        positions[o + 1] = -a.y;
        positions[o + 2] = 0;
        positions[o + 3] = b.x;
        positions[o + 4] = -b.y;
        positions[o + 5] = 0;
        speedColor(a.spd / vmax, c0);
        speedColor(b.spd / vmax, c1);
        colors[o] = c0.r;
        colors[o + 1] = c0.g;
        colors[o + 2] = c0.b;
        colors[o + 3] = c1.r;
        colors[o + 4] = c1.g;
        colors[o + 5] = c1.b;
        o += 6;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { lineGeom: g, polylines };
  }, [V, aoa, chord, isCyl]);

  // Animated tracer points riding along a subset of streamlines
  const TRACERS = Math.min(polylines.length, 90);
  const tracerGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRACERS * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRACERS * 3), 3));
    return g;
  }, [TRACERS]);
  const phase = useRef<number[]>([]);
  if (phase.current.length !== TRACERS) {
    phase.current = Array.from({ length: TRACERS }, () => Math.random());
  }

  useFrame((_, dt) => {
    if (!useAerosimStore.getState().running) return;
    const pos = tracerGeom.attributes.position.array as Float32Array;
    const col = tracerGeom.attributes.color.array as Float32Array;
    const c = { r: 0, g: 0, b: 0 };
    const vmax = Math.max(0.001, V * 1.7);
    const speedFactor = Math.min(0.06, dt) * (0.5 + V / 60);
    for (let i = 0; i < TRACERS; i++) {
      phase.current[i] += speedFactor * 0.25;
      if (phase.current[i] > 1) phase.current[i] -= 1;
      const pl = polylines[Math.floor((i / TRACERS) * polylines.length)];
      if (!pl || pl.length < 2) continue;
      const idx = Math.min(pl.length - 1, Math.floor(phase.current[i] * pl.length));
      const pt = pl[idx];
      pos[i * 3] = pt.x;
      pos[i * 3 + 1] = -pt.y;
      pos[i * 3 + 2] = 0.02;
      speedColor(pt.spd / vmax, c);
      col[i * 3] = Math.min(1, c.r * 1.4);
      col[i * 3 + 1] = Math.min(1, c.g * 1.4);
      col[i * 3 + 2] = Math.min(1, c.b * 1.4);
    }
    tracerGeom.attributes.position.needsUpdate = true;
    tracerGeom.attributes.color.needsUpdate = true;
  });

  return (
    <group>
      <lineSegments geometry={lineGeom}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.55}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>
      <points geometry={tracerGeom}>
        <pointsMaterial
          vertexColors
          size={0.13}
          sizeAttenuation
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

/** Lift (perpendicular) + drag (streamwise) arrows anchored at quarter-chord. */
function ForceVectors({ chord }: { chord: number; aoa: number }) {
  const airfoil = useAerosimStore((s) => s.airfoil);
  const customM = useAerosimStore((s) => s.customM);
  const customT = useAerosimStore((s) => s.customT);
  const source = useAerosimStore((s) => s.source);
  const V = useAerosimStore((s) => s.V);
  const rho = useAerosimStore((s) => s.rho);
  const aoaDeg = useAerosimStore((s) => s.aoaDeg);
  const r = useMemo(
    () =>
      aero({
        airfoil,
        aoa: (aoaDeg * Math.PI) / 180,
        V,
        rho,
        chord,
        alphaZero: source === 'naca' ? -1.07 * customM * 100 * (Math.PI / 180) : undefined,
        cd0: source === 'naca' ? 0.005 + customT * 0.04 : undefined,
      }),
    [airfoil, aoaDeg, V, rho, chord, source, customM, customT],
  );
  const liftLen = Math.max(0.15, Math.min(2.4, Math.abs(r.cl) * 0.9));
  const dragLen = Math.max(0.1, Math.min(2.0, r.cd * 14));
  return (
    <group>
      {/* Lift: green, points up (−y is up in screen space here) */}
      <Arrow color="#22c55e" from={[0, 0, 0.05]} to={[0, Math.sign(r.cl || 1) * liftLen, 0.05]} />
      {/* Drag: orange, points downstream (+x) */}
      <Arrow color="#f59e0b" from={[0, 0, 0.05]} to={[dragLen, 0, 0.05]} />
    </group>
  );
}

function Arrow({
  color,
  from,
  to,
}: {
  color: string;
  from: [number, number, number];
  to: [number, number, number];
}) {
  const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const len = dir.length() || 0.001;
  const origin = new THREE.Vector3(...from);
  const arrow = useMemo(() => {
    const a = new THREE.ArrowHelper(
      dir.clone().normalize(),
      origin,
      len,
      new THREE.Color(color).getHex(),
      Math.min(0.22, len * 0.3),
      Math.min(0.12, len * 0.16),
    );
    return a;
  }, [color, from[0], from[1], to[0], to[1], len]);
  // Dispose the previous ArrowHelper's geometries/materials when it changes
  // (it's rebuilt on every AoA / speed change).
  useEffect(() => {
    return () => {
      arrow.dispose();
    };
  }, [arrow]);
  return <primitive object={arrow} />;
}


/* Stable-fluids grid + textured plane visualization */
function FluidField({
  chord,
  aoa,
}: {
  chord: number;
  aoa: number;
}) {
  const V = useAerosimStore((s) => s.V);
  const viz = useAerosimStore((s) => s.viz);
  const verts = useActiveSilhouette();

  const gridRef = useRef<FluidGrid>(makeGrid(FLUID_W, FLUID_H));
  const tex = useRef<THREE.DataTexture>();

  // Lazy-init texture
  if (!tex.current) {
    const data = new Uint8Array(FLUID_W * FLUID_H * 4);
    const t = new THREE.DataTexture(data, FLUID_W, FLUID_H, THREE.RGBAFormat);
    t.needsUpdate = true;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    tex.current = t;
  }

  // Re-stamp obstacle whenever shape changes
  useEffect(() => {
    const g = gridRef.current;
    const placed = placeShape(verts, { x: 0, y: 0 }, chord, aoa);
    // Map world (FLOW_DOMAIN) → grid cells
    const toGrid = (p: { x: number; y: number }) => ({
      x: ((p.x - FLOW_DOMAIN.x) / FLOW_DOMAIN.w) * (FLUID_W - 2) + 1,
      y: ((p.y + FLOW_DOMAIN.h / 2) / FLOW_DOMAIN.h) * (FLUID_H - 2) + 1,
    });
    const poly = placed.map(toGrid);
    stampObstacle(g, poly);
  }, [verts, chord, aoa]);

  useFrame((_, dtRaw) => {
    if (!useAerosimStore.getState().running) return;
    const g = gridRef.current;
    // Roughly match Re by scaling viscosity; cap dt for stability
    const dt = Math.min(0.05, dtRaw) * 1.0;
    const inflow = Math.max(0.2, Math.min(2.0, V / 30));
    fluidStep(g, dt, 5e-5, 1e-4, inflow);

    // Write texture
    const data = tex.current!.image.data as Uint8Array;
    let maxSpd = 1e-6;
    let maxAbsVort = 1e-6;
    for (let j = 0; j < g.H; j++) {
      for (let i = 0; i < g.W; i++) {
        const u = g.u[IX(g.W, i, j)];
        const v = g.v[IX(g.W, i, j)];
        const sp = Math.hypot(u, v);
        if (sp > maxSpd) maxSpd = sp;
        if (viz === 'vorticity') {
          const w = Math.abs(vorticity(g, i, j));
          if (w > maxAbsVort) maxAbsVort = w;
        }
      }
    }
    const norm = (x: number, m: number) => Math.min(1, Math.max(0, x / m));
    for (let j = 0; j < g.H; j++) {
      for (let i = 0; i < g.W; i++) {
        const idx = (j * g.W + i) * 4;
        const k = IX(g.W, i, j);
        if (g.solid[k]) {
          data[idx + 0] = 32;
          data[idx + 1] = 36;
          data[idx + 2] = 44;
          data[idx + 3] = 255;
          continue;
        }
        if (viz === 'streamlines') {
          const sp = Math.hypot(g.u[k], g.v[k]);
          const t = norm(sp, maxSpd);
          data[idx + 0] = Math.floor(40 + 200 * t);
          data[idx + 1] = Math.floor(60 + 60 * (1 - t));
          data[idx + 2] = Math.floor(220 - 180 * t);
          data[idx + 3] = 255;
        } else if (viz === 'vorticity') {
          const w = vorticity(g, i, j);
          const t = w / Math.max(1e-6, maxAbsVort); // -1..1
          const pos = Math.max(0, t);
          const neg = Math.max(0, -t);
          data[idx + 0] = Math.floor(220 * pos + 30);
          data[idx + 1] = Math.floor(30);
          data[idx + 2] = Math.floor(220 * neg + 30);
          data[idx + 3] = 255;
        } else {
          // Pressure ≈ -|v|² (Bernoulli, scaled)
          const sp2 = g.u[k] * g.u[k] + g.v[k] * g.v[k];
          const t = norm(sp2, maxSpd * maxSpd);
          // High pressure: red, low pressure: blue
          data[idx + 0] = Math.floor(30 + 200 * (1 - t));
          data[idx + 1] = 60;
          data[idx + 2] = Math.floor(30 + 200 * t);
          data[idx + 3] = 255;
        }
      }
    }
    tex.current!.needsUpdate = true;
  });

  return (
    <mesh position={[0, 0, -0.02]}>
      <planeGeometry args={[FLOW_DOMAIN.w, FLOW_DOMAIN.h]} />
      <meshBasicMaterial map={tex.current} transparent opacity={0.85} />
    </mesh>
  );
}
