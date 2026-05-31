import { useEffect, useRef, useState } from 'react';
import {
  useSandbox2DStore,
  findBodyAt,
  makeWaterParticles,
  convexHull,
  dpSimplify,
} from '@/store/sandbox2dStore';
import {
  makeBody,
  makeCircle,
  makeBox,
  makePolygonFromVertices,
  type Body,
} from '@/lib/physics2d/types';
import { makePin, makeSpring, worldAnchor, type Constraint, type SpringConstraint } from '@/lib/physics2d/constraints';

const BASE_SCALE = 42; // px per world meter at zoom=1

const PRESET_COLORS = [
  '#60a5fa', '#a78bfa', '#f472b6', '#fb923c',
  '#facc15', '#34d399', '#22d3ee', '#f87171',
];

// Algodoo-style diagonal hatching for static bodies. Drawn in body-local space.
function drawHatchRect(
  ctx: CanvasRenderingContext2D,
  mnx: number,
  mny: number,
  mxx: number,
  mxy: number,
  scale: number,
) {
  const step = 0.22;
  ctx.strokeStyle = 'rgba(15,23,42,0.45)';
  ctx.lineWidth = 1.1 / scale;
  ctx.beginPath();
  const span = (mxx - mnx) + (mxy - mny);
  for (let d = mnx - span; d < mxx + span; d += step) {
    ctx.moveTo(d, mny);
    ctx.lineTo(d + (mxy - mny), mxy);
  }
  ctx.stroke();
}

function drawStaticHatch(
  ctx: CanvasRenderingContext2D,
  radius: number,
  scale: number,
  circle: boolean,
) {
  ctx.save();
  ctx.beginPath();
  if (circle) ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.clip();
  drawHatchRect(ctx, -radius, -radius, radius, radius, scale);
  ctx.restore();
}

function distPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-10) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function findConstraintAt(constraints: Constraint[], wx: number, wy: number, threshold: number): Constraint | null {
  for (let i = constraints.length - 1; i >= 0; i--) {
    const cst = constraints[i];
    const wa = worldAnchor(cst.a, cst.anchorA);
    const wb = cst.b ? worldAnchor(cst.b, cst.anchorB) : cst.anchorB;
    if (distPointToSegment(wx, wy, wa.x, wa.y, wb.x, wb.y) < threshold) return cst;
  }
  return null;
}

interface CtxMenu {
  containerX: number;
  containerY: number;
  body: Body;
  velVx: string;
  velVy: string;
}

export default function Renderer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera state
  const camRef = useRef({ x: 0, y: 0, zoom: 1 });

  // Interaction state refs
  const dragRef = useRef<{
    body: Body;
    grabLocal: { x: number; y: number };
    rotateMode: boolean;
    startAngle: number;
    startMouseAngle: number;
  } | null>(null);
  const drawActiveRef = useRef(false);
  const drawPathRef = useRef<{ x: number; y: number }[]>([]);
  const dragCreateRef = useRef<{
    start: { x: number; y: number };
    kind: 'circle' | 'box';
  } | null>(null);
  const wireRef = useRef<{
    fromBody: Body;
    fromLocal: { x: number; y: number };
    cursor: { x: number; y: number };
    kind: 'spring' | 'hinge';
  } | null>(null);
  const panRef = useRef<{ mx: number; my: number; cx: number; cy: number } | null>(null);
  const rightDragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const waterRef = useRef(false);
  const pushRef = useRef<{ last: { x: number; y: number } } | null>(null);
  const resizeRef = useRef<{
    body: Body;
    startDist: number;
    origRadius?: number;
    origVerts?: { x: number; y: number }[];
    origMass: number;
    origInertia: number;
  } | null>(null);
  const cursorWorldRef = useRef({ x: 0, y: 0 });
  const hoverBodyIdRef = useRef<string | null>(null);
  const hoverConstraintIdRef = useRef<string | null>(null);
  const tickCountRef = useRef(0);

  const [selectedConstraintId, setSelectedConstraintId] = useState<string | null>(null);
  const [constraintMenuPos, setConstraintMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Stable draw fn ref so rAF closure always calls current version
  const drawFnRef = useRef<() => void>(() => {});
  drawFnRef.current = draw;

  const step = useSandbox2DStore((s) => s.step);
  const tool = useSandbox2DStore((s) => s.tool);
  // Subscribe to rev so mutations (toggle static, color change, etc.) re-render the context menu
  const rev = useSandbox2DStore((s) => s.rev);
  const motors = useSandbox2DStore((s) => s.motors);
  const tracers = useSandbox2DStore((s) => s.tracers);

  const [contextMenu, setContextMenu] = useState<CtxMenu | null>(null);
  const [hoveringBody, setHoveringBody] = useState(false);

  // Animation loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      step(dt);
      // Record snapshot every 2nd frame while running (≈30 snapshots/sec)
      const ss = useSandbox2DStore.getState();
      if (ss.running && ss.historyIdx === -1) {
        tickCountRef.current ^= 1;
        if (tickCountRef.current === 0) ss.recordFrame();
      }
      drawFnRef.current();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    const c = canvasRef.current;
    if (!el || !c) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = r.width * dpr;
      c.height = r.height * dpr;
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const onPointer = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('[data-ctx-menu]')) {
        setContextMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  // Cmd+Shift+Minus / Cmd+Shift+Plus to zoom out / in
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.metaKey || !e.shiftKey) return;
      if (e.key === '-') {
        e.preventDefault();
        camRef.current.zoom = Math.max(0.08, camRef.current.zoom * 0.91);
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        camRef.current.zoom = Math.min(20, camRef.current.zoom * 1.1);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Delete / Backspace removes the selected constraint; Escape dismisses it
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelectedConstraintId(null);
        setConstraintMenuPos(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedConstraintId) {
        const cid = selectedConstraintId;
        useSandbox2DStore.getState().mutate((w) => {
          w.constraints = w.constraints.filter((c) => c.id !== cid);
        });
        setSelectedConstraintId(null);
        setConstraintMenuPos(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedConstraintId]);

  function screenToWorld(e: MouseEvent | React.MouseEvent) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const cam = camRef.current;
    const scale = BASE_SCALE * cam.zoom;
    return {
      x: (e.clientX - r.left - r.width / 2 - cam.x) / scale,
      y: (e.clientY - r.top - r.height / 2 - cam.y) / scale,
    };
  }

  function localAnchor(body: Body, wp: { x: number; y: number }) {
    const c = Math.cos(-body.angle);
    const s = Math.sin(-body.angle);
    return {
      x: (wp.x - body.pos.x) * c - (wp.y - body.pos.y) * s,
      y: (wp.x - body.pos.x) * s + (wp.y - body.pos.y) * c,
    };
  }

  function snapWorld(wp: { x: number; y: number }) {
    const { snapEnabled, snapSize } = useSandbox2DStore.getState();
    if (!snapEnabled) return wp;
    const s = snapSize;
    return { x: Math.round(wp.x / s) * s, y: Math.round(wp.y / s) * s };
  }

  function spawnWater(wp: { x: number; y: number }) {
    useSandbox2DStore.getState().addParticles(makeWaterParticles(wp.x, wp.y, 5));
  }

  function eraseAt(wp: { x: number; y: number }) {
    const R2 = 0.45 * 0.45;
    const state = useSandbox2DStore.getState();
    const kept = state.particles.filter(
      (p) => (p.x - wp.x) ** 2 + (p.y - wp.y) ** 2 > R2,
    );
    if (kept.length !== state.particles.length) {
      state.particles.length = 0;
      for (const p of kept) state.particles.push(p);
    }
  }

  function onMouseDown(e: React.MouseEvent) {
    // Right-click: start pan tracking; context menu fires on release if no movement
    if (e.button === 2) {
      rightDragRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
      panRef.current = { mx: e.clientX, my: e.clientY, cx: camRef.current.x, cy: camRef.current.y };
      return;
    }

    if (e.button !== 0 && e.button !== 1) return;
    // Close context menu on canvas click
    if (contextMenu) { setContextMenu(null); return; }

    const wp = screenToWorld(e);
    cursorWorldRef.current = wp;

    if (e.button === 1 || e.altKey) {
      panRef.current = { mx: e.clientX, my: e.clientY, cx: camRef.current.x, cy: camRef.current.y };
      return;
    }

    const state = useSandbox2DStore.getState();
    const { tool: t, world } = state;
    const body = findBodyAt(world, wp.x, wp.y);

    if (t === 'pan') {
      if (body) state.setSelected(body.id);
      else state.setSelected(null);
      panRef.current = { mx: e.clientX, my: e.clientY, cx: camRef.current.x, cy: camRef.current.y };
      return;
    }

    if (t === 'resize') {
      if (body) {
        const dx = wp.x - body.pos.x;
        const dy = wp.y - body.pos.y;
        const startDist = Math.max(Math.hypot(dx, dy), 0.05);
        resizeRef.current = {
          body,
          startDist,
          origRadius: body.shape.kind === 'circle' ? body.shape.radius : undefined,
          origVerts: body.shape.kind === 'polygon'
            ? body.shape.vertices.map((v) => ({ x: v.x, y: v.y }))
            : undefined,
          origMass: body.mass,
          origInertia: body.inertia,
        };
      }
      return;
    }

    if (t === 'rotate') {
      if (body) {
        state.setSelected(body.id);
        const startMouseAngle = Math.atan2(wp.y - body.pos.y, wp.x - body.pos.x);
        dragRef.current = {
          body,
          grabLocal: { x: 0, y: 0 },
          rotateMode: true,
          startAngle: body.angle,
          startMouseAngle,
        };
      } else {
        state.setSelected(null);
        panRef.current = { mx: e.clientX, my: e.clientY, cx: camRef.current.x, cy: camRef.current.y };
      }
      return;
    }

    if (t === 'select') {
      if (body) {
        state.setSelected(body.id);
        setSelectedConstraintId(null);
        setConstraintMenuPos(null);
        const startMouseAngle = Math.atan2(wp.y - body.pos.y, wp.x - body.pos.x);
        dragRef.current = {
          body,
          grabLocal: localAnchor(body, wp),
          rotateMode: e.shiftKey,
          startAngle: body.angle,
          startMouseAngle,
        };
      } else {
        const hitThreshold = 10 / (BASE_SCALE * camRef.current.zoom);
        const cst = findConstraintAt(world.constraints, wp.x, wp.y, hitThreshold);
        if (cst) {
          state.setSelected(null);
          setSelectedConstraintId(cst.id);
          const container = containerRef.current!;
          const r = container.getBoundingClientRect();
          setConstraintMenuPos({ x: e.clientX - r.left, y: e.clientY - r.top });
        } else {
          state.setSelected(null);
          setSelectedConstraintId(null);
          setConstraintMenuPos(null);
          panRef.current = { mx: e.clientX, my: e.clientY, cx: camRef.current.x, cy: camRef.current.y };
        }
      }
    } else if (t === 'draw') {
      drawActiveRef.current = true;
      drawPathRef.current = [snapWorld(wp)];
    } else if (t === 'circle' || t === 'box') {
      dragCreateRef.current = { start: snapWorld(wp), kind: t };
    } else if (t === 'water') {
      waterRef.current = true;
      spawnWater(wp);
    } else if (t === 'spring' || t === 'hinge') {
      if (body) {
        wireRef.current = {
          fromBody: body,
          fromLocal: localAnchor(body, wp),
          cursor: wp,
          kind: t === 'spring' ? 'spring' : 'hinge',
        };
      }
    } else if (t === 'motor') {
      if (body) state.toggleMotor(body.id);
    } else if (t === 'tracer') {
      if (body) state.toggleTracer(body.id);
    } else if (t === 'eraser') {
      if (body) state.mutate((w) => w.remove(body.id));
      eraseAt(wp);
    } else if (t === 'push') {
      pushRef.current = { last: wp };
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    const wp = screenToWorld(e);
    cursorWorldRef.current = wp;

    if (panRef.current) {
      camRef.current.x = panRef.current.cx + (e.clientX - panRef.current.mx);
      camRef.current.y = panRef.current.cy + (e.clientY - panRef.current.my);
      if (rightDragRef.current && !rightDragRef.current.moved) {
        const dx = e.clientX - rightDragRef.current.startX;
        const dy = e.clientY - rightDragRef.current.startY;
        if (dx * dx + dy * dy > 16) rightDragRef.current.moved = true;
      }
      return;
    }

    if (dragRef.current) {
      const drag = dragRef.current;
      // Allow toggling rotate mode mid-drag with Shift
      if (e.shiftKey && !drag.rotateMode) {
        drag.rotateMode = true;
        drag.startAngle = drag.body.angle;
        drag.startMouseAngle = Math.atan2(wp.y - drag.body.pos.y, wp.x - drag.body.pos.x);
      } else if (!e.shiftKey && drag.rotateMode) {
        drag.rotateMode = false;
        drag.grabLocal = localAnchor(drag.body, wp);
      }
      const { body, grabLocal, rotateMode } = drag;

      if (rotateMode) {
        // Rotate body around its center as the mouse orbits around it
        const ang = Math.atan2(wp.y - body.pos.y, wp.x - body.pos.x);
        const newAngle = drag.startAngle + (ang - drag.startMouseAngle);
        body.angle = newAngle;
        body.angularVel = 0;
        if (body.isStatic) body.sleeping = false; // force AABB refresh
        return;
      }

      const target = snapWorld(wp);
      const c = Math.cos(body.angle);
      const s = Math.sin(body.angle);
      const grabWx = body.pos.x + grabLocal.x * c - grabLocal.y * s;
      const grabWy = body.pos.y + grabLocal.x * s + grabLocal.y * c;
      const dx = target.x - grabWx;
      const dy = target.y - grabWy;

      // Static ("stiff") bodies and paused-sim bodies always move directly so
      // you can rearrange the scene freely - just like Algodoo's grab tool.
      // Dynamic bodies in a running sim get a velocity impulse so collisions
      // stay smooth. Hold Alt while dragging a running dynamic body to force-move it.
      const running = useSandbox2DStore.getState().running;
      if (body.isStatic || !running || e.altKey) {
        body.pos.x += dx;
        body.pos.y += dy;
        body.vel.x = 0;
        body.vel.y = 0;
        body.angularVel = 0;
        // Wake the body so the next physics step sees its new position for
        // collision purposes (broadphase pairs both-sleeping bodies).
        body.sleeping = false;
      } else {
        body.vel.x += dx * 15;
        body.vel.y += dy * 15;
        body.sleeping = false;
      }
      return;
    }

    if (resizeRef.current) {
      const r = resizeRef.current;
      const dx = wp.x - r.body.pos.x;
      const dy = wp.y - r.body.pos.y;
      const dist = Math.max(Math.hypot(dx, dy), 0.05);
      const scale = dist / r.startDist;
      const sh = r.body.shape;
      if (sh.kind === 'circle' && r.origRadius !== undefined) {
        sh.radius = Math.max(0.05, r.origRadius * scale);
      } else if (sh.kind === 'polygon' && r.origVerts) {
        const scaledVerts = r.origVerts.map((v) => ({ x: v.x * scale, y: v.y * scale }));
        const newShape = makePolygonFromVertices(scaledVerts);
        sh.vertices.length = 0;
        for (const v of newShape.vertices) sh.vertices.push(v);
        sh.normals.length = 0;
        for (const n of newShape.normals) sh.normals.push(n);
      }
      r.body.mass = Math.max(0.001, r.origMass * scale * scale);
      r.body.invMass = r.body.isStatic ? 0 : 1 / r.body.mass;
      r.body.inertia = Math.max(0.001, r.origInertia * scale * scale * scale * scale);
      r.body.invInertia = r.body.isStatic ? 0 : (r.body.inertia > 0 ? 1 / r.body.inertia : 0);
      r.body.sleeping = false;
      return;
    }

    if (drawActiveRef.current) {
      const path = drawPathRef.current;
      const last = path[path.length - 1];
      const snapped = snapWorld(wp);
      if (Math.hypot(snapped.x - last.x, snapped.y - last.y) > 0.05) path.push(snapped);
    }

    if (wireRef.current) wireRef.current.cursor = wp;

    if (waterRef.current) spawnWater(wp);

    if (pushRef.current) {
      const dvx = (wp.x - pushRef.current.last.x) * 9;
      const dvy = (wp.y - pushRef.current.last.y) * 9;
      const { world, particles } = useSandbox2DStore.getState();
      const R2 = 0.7 * 0.7;
      for (const b of world.bodies) {
        if (b.isStatic) continue;
        const dx = b.pos.x - wp.x;
        const dy = b.pos.y - wp.y;
        if (dx * dx + dy * dy < R2) {
          b.vel.x += dvx;
          b.vel.y += dvy;
          b.sleeping = false;
        }
      }
      const pR2 = 0.55 * 0.55;
      for (const p of particles) {
        if ((p.x - wp.x) ** 2 + (p.y - wp.y) ** 2 < pR2) {
          p.vx += dvx * 0.6;
          p.vy += dvy * 0.6;
        }
      }
      pushRef.current.last = wp;
    }

    if (e.buttons === 1 && useSandbox2DStore.getState().tool === 'eraser') {
      const body = findBodyAt(useSandbox2DStore.getState().world, wp.x, wp.y);
      if (body) useSandbox2DStore.getState().mutate((w) => w.remove(body.id));
      eraseAt(wp);
    }

    // Hover highlight (select and resize tools, when not actively dragging/resizing)
    const currentTool = useSandbox2DStore.getState().tool;
    if ((currentTool === 'select' || currentTool === 'resize' || currentTool === 'rotate') && !dragRef.current && !resizeRef.current) {
      const hover = findBodyAt(useSandbox2DStore.getState().world, wp.x, wp.y);
      const newId = hover?.id ?? null;
      hoverBodyIdRef.current = newId;
      const isHov = newId !== null;
      if (isHov !== hoveringBody) setHoveringBody(isHov);
      // Constraint hover
      if (currentTool === 'select' && !isHov) {
        const threshold = 10 / (BASE_SCALE * camRef.current.zoom);
        const hovCst = findConstraintAt(useSandbox2DStore.getState().world.constraints, wp.x, wp.y, threshold);
        hoverConstraintIdRef.current = hovCst?.id ?? null;
      } else {
        hoverConstraintIdRef.current = null;
      }
    } else if (hoverBodyIdRef.current !== null) {
      hoverBodyIdRef.current = null;
      hoverConstraintIdRef.current = null;
      if (hoveringBody) setHoveringBody(false);
    }
  }

  function onMouseUp(e: MouseEvent | React.MouseEvent) {
    const wp = screenToWorld(e as React.MouseEvent);
    panRef.current = null;
    rightDragRef.current = null;
    dragRef.current = null;
    waterRef.current = false;
    pushRef.current = null;
    resizeRef.current = null;

    const state = useSandbox2DStore.getState();

    if (drawActiveRef.current) {
      drawActiveRef.current = false;
      const path = drawPathRef.current;
      if (path.length >= 3) {
        const simplified = dpSimplify(path, 0.06);
        const hull = convexHull(simplified);
        if (hull.length >= 3) {
          const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
          const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
          const local = hull.map((p) => ({ x: p.x - cx, y: p.y - cy }));
          const body = makeBody(makePolygonFromVertices(local), {
            pos: { x: cx, y: cy },
            density: 1,
            restitution: 0.3,
            friction: 0.5,
            color: state.currentColor,
          });
          state.addBody(body);
        }
      }
      drawPathRef.current = [];
    }

    if (dragCreateRef.current) {
      const { start, kind } = dragCreateRef.current;
      const end = snapWorld(wp);
      const dist = Math.hypot(end.x - start.x, end.y - start.y);
      if (dist > 0.06) {
        let body: Body;
        if (kind === 'circle') {
          body = makeBody(makeCircle(Math.max(0.1, dist)), {
            pos: start,
            density: 1,
            restitution: 0.3,
            friction: 0.5,
            color: state.currentColor,
          });
        } else {
          const hw = Math.max(0.06, Math.abs(end.x - start.x) / 2);
          const hh = Math.max(0.06, Math.abs(end.y - start.y) / 2);
          body = makeBody(makeBox(hw, hh), {
            pos: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
            density: 1,
            restitution: 0.3,
            friction: 0.5,
            color: state.currentColor,
          });
        }
        state.addBody(body);
      }
      dragCreateRef.current = null;
    }

    if (wireRef.current) {
      const { fromBody, fromLocal, kind } = wireRef.current;
      const world = state.world;
      const toBody = findBodyAt(world, wp.x, wp.y);
      if (toBody && toBody !== fromBody) {
        const toLocal = localAnchor(toBody, wp);
        if (kind === 'spring') {
          world.addConstraint(makeSpring(fromBody, toBody, fromLocal, toLocal, 80, 2));
        } else {
          world.addConstraint(makePin(fromBody, toBody, fromLocal, toLocal));
        }
        state.mutate(() => {});
      } else if (!toBody && kind === 'hinge') {
        world.addConstraint(makePin(fromBody, null, fromLocal, wp));
        state.mutate(() => {});
      }
      wireRef.current = null;
    }
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    // Suppress context menu if this was a right-drag pan
    if (rightDragRef.current?.moved) {
      rightDragRef.current = null;
      return;
    }
    rightDragRef.current = null;
    setSelectedConstraintId(null);
    setConstraintMenuPos(null);
    const container = containerRef.current!;
    const r = container.getBoundingClientRect();
    const containerX = e.clientX - r.left;
    const containerY = e.clientY - r.top;
    const wp = screenToWorld(e);
    const { world } = useSandbox2DStore.getState();
    const body = findBodyAt(world, wp.x, wp.y);
    if (body) {
      setContextMenu({
        containerX,
        containerY,
        body,
        velVx: body.vel.x.toFixed(2),
        velVy: body.vel.y.toFixed(2),
      });
    } else {
      setContextMenu(null);
    }
  }

  // Attach wheel listener natively (passive:false) so preventDefault actually blocks
  // the outer container from scrolling/panning when the user scrolls over the canvas.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();
      const r = c!.getBoundingClientRect();
      const cam = camRef.current;
      if (e.ctrlKey) {
        const mx = e.clientX - r.left - r.width / 2;
        const my = e.clientY - r.top - r.height / 2;
        const factor = e.deltaY < 0 ? 1.1 : 0.91;
        const newZoom = Math.max(0.08, Math.min(20, cam.zoom * factor));
        const ratio = newZoom / cam.zoom;
        cam.x = mx - (mx - cam.x) * ratio;
        cam.y = my - (my - cam.y) * ratio;
        cam.zoom = newZoom;
      } else {
        cam.x -= e.deltaX;
        cam.y -= e.deltaY;
      }
    }
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, []);

  function draw() {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const W = r.width;
    const H = r.height;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    const state = useSandbox2DStore.getState();
    const { bgColor, gridVisible, gridColor, gridStyle, gridSize } = state;

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    const cam = camRef.current;
    const scale = BASE_SCALE * cam.zoom;
    const tx = W / 2 + cam.x;
    const ty = H / 2 + cam.y;

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    // World-space grid
    if (gridVisible && gridStyle !== 'none') {
      const baseStep = gridSize;
      const gridStep = cam.zoom < 0.15 ? baseStep * 10 : cam.zoom < 0.4 ? baseStep * 5 : baseStep;
      const left = (-tx / scale) - gridStep;
      const right = ((W - tx) / scale) + gridStep;
      const top = (-ty / scale) - gridStep;
      const bot = ((H - ty) / scale) + gridStep;

      if (gridStyle === 'lines') {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1 / scale;
        ctx.beginPath();
        for (let x = Math.ceil(left / gridStep) * gridStep; x < right; x += gridStep) {
          ctx.moveTo(x, top);
          ctx.lineTo(x, bot);
        }
        for (let y = Math.ceil(top / gridStep) * gridStep; y < bot; y += gridStep) {
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
        }
        ctx.stroke();
      } else {
        // dots
        const dotR = 1.5 / scale;
        ctx.fillStyle = gridColor;
        for (let x = Math.ceil(left / gridStep) * gridStep; x < right; x += gridStep) {
          for (let y = Math.ceil(top / gridStep) * gridStep; y < bot; y += gridStep) {
            ctx.fillRect(x - dotR / 2, y - dotR / 2, dotR, dotR);
          }
        }
      }

      // Snap-grid highlight overlay when snap is enabled
      const { snapEnabled, snapSize } = state;
      if (snapEnabled && snapSize !== gridStep) {
        const sStep = snapSize;
        ctx.strokeStyle = 'rgba(99,102,241,0.18)';
        ctx.lineWidth = 0.5 / scale;
        ctx.setLineDash([0.08, 0.08]);
        ctx.beginPath();
        for (let x = Math.ceil(left / sStep) * sStep; x < right; x += sStep) {
          ctx.moveTo(x, top);
          ctx.lineTo(x, bot);
        }
        for (let y = Math.ceil(top / sStep) * sStep; y < bot; y += sStep) {
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Origin crosshair
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5 / scale;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(-0.3, 0);
    ctx.lineTo(0.3, 0);
    ctx.moveTo(0, -0.3);
    ctx.lineTo(0, 0.3);
    ctx.stroke();

    const { world, selectedId, tracers: storeTracers, motors: storeMotors, particles } = state;

    // ── Tracers ──────────────────────────────────────────────────────
    for (const [, t] of storeTracers) {
      if (t.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(t.points[0].x, t.points[0].y);
      for (let i = 1; i < t.points.length; i++) ctx.lineTo(t.points[i].x, t.points[i].y);
      ctx.strokeStyle = t.color;
      ctx.lineWidth = Math.max(0.5 / scale, t.width);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.stroke();
    }

    // ── Water particles ──────────────────────────────────────────────
    if (particles.length > 0) {
      const pRadius = 0.1;
      ctx.fillStyle = 'rgba(56,189,248,0.7)';
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, pRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── Constraints ──────────────────────────────────────────────────
    for (const cst of world.constraints) {
      const wa = worldAnchor(cst.a, cst.anchorA);
      const wb = cst.b ? worldAnchor(cst.b, cst.anchorB) : cst.anchorB;
      const isSelCst = cst.id === selectedConstraintId;
      const isHovCst = cst.id === hoverConstraintIdRef.current && !isSelCst;
      ctx.lineWidth = (isSelCst ? 3 : isHovCst ? 2.5 : 1.5) / scale;

      if (cst.kind === 'spring') {
        const dx = wb.x - wa.x;
        const dy = wb.y - wa.y;
        const L = Math.hypot(dx, dy) || 1;
        const ux = dx / L;
        const uy = dy / L;
        const px = -uy;
        const py = ux;
        const coils = 9;
        ctx.beginPath();
        ctx.moveTo(wa.x, wa.y);
        for (let i = 1; i < coils; i++) {
          const t = i / coils;
          ctx.lineTo(
            wa.x + dx * t + px * 0.07 * (i % 2 === 0 ? 1 : -1),
            wa.y + dy * t + py * 0.07 * (i % 2 === 0 ? 1 : -1),
          );
        }
        ctx.lineTo(wb.x, wb.y);
        ctx.strokeStyle = isSelCst ? '#e879f9' : isHovCst ? '#d8b4fe' : '#f0abfc';
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(wa.x, wa.y);
        ctx.lineTo(wb.x, wb.y);
        const baseColor = cst.kind === 'pin' ? '#fbbf24' : '#94a3b8';
        ctx.strokeStyle = isSelCst ? '#ffffff' : isHovCst ? 'rgba(255,255,255,0.6)' : baseColor;
        ctx.stroke();
      }

      const anchorR = (isSelCst ? 4 : 2.5) / scale;
      ctx.fillStyle = isSelCst ? '#ffffff' : '#fbbf24';
      ctx.beginPath();
      ctx.arc(wa.x, wa.y, anchorR, 0, Math.PI * 2);
      ctx.arc(wb.x, wb.y, anchorR, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Bodies ───────────────────────────────────────────────────────
    const hoverId = hoverBodyIdRef.current;
    for (const b of world.bodies) {
      const isSelected = b.id === selectedId;
      const isHover = b.id === hoverId && !isSelected;
      ctx.save();
      ctx.translate(b.pos.x, b.pos.y);
      ctx.rotate(b.angle);

      if (b.isStatic) {
        ctx.fillStyle = 'rgba(110,124,148,0.85)';
        ctx.strokeStyle = isSelected || isHover ? '#ffffff' : '#3b475a';
      } else {
        ctx.fillStyle = b.color;
        ctx.strokeStyle = isSelected
          ? '#ffffff'
          : isHover
            ? 'rgba(255,255,255,0.75)'
            : 'rgba(0,0,0,0.45)';
      }
      ctx.lineWidth = (isSelected ? 2.5 : isHover ? 2 : 1.2) / scale;

      if (b.shape.kind === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, b.shape.radius, 0, Math.PI * 2);
        ctx.fill();
        if (b.isStatic) drawStaticHatch(ctx, b.shape.radius, scale, true);
        ctx.stroke();
        // orientation tick
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(b.shape.radius * 0.8, 0);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
      } else {
        const v = b.shape.vertices;
        ctx.beginPath();
        ctx.moveTo(v[0].x, v[0].y);
        for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
        ctx.closePath();
        ctx.fill();
        if (b.isStatic) {
          // Compute local AABB once per draw for hatching
          let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
          for (const p of v) {
            if (p.x < mnx) mnx = p.x;
            if (p.y < mny) mny = p.y;
            if (p.x > mxx) mxx = p.x;
            if (p.y > mxy) mxy = p.y;
          }
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(v[0].x, v[0].y);
          for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
          ctx.closePath();
          ctx.clip();
          drawHatchRect(ctx, mnx, mny, mxx, mxy, scale);
          ctx.restore();
        }
        ctx.stroke();
      }
      ctx.restore();

      // Motor ring indicator
      if (storeMotors.has(b.id)) {
        const m = storeMotors.get(b.id)!;
        const rInd =
          (b.shape.kind === 'circle' ? b.shape.radius : 0.22) + 0.14;
        ctx.save();
        ctx.translate(b.pos.x, b.pos.y);
        ctx.strokeStyle = m.active ? '#4ade80' : '#6b7280';
        ctx.lineWidth = 2.5 / scale;
        ctx.beginPath();
        if (m.speed >= 0) {
          ctx.arc(0, 0, rInd, 0, Math.PI * 1.65);
        } else {
          ctx.arc(0, 0, rInd, Math.PI, Math.PI * 2.65);
        }
        ctx.stroke();
        const tipAngle = m.speed >= 0 ? Math.PI * 1.65 : Math.PI * 2.65;
        ctx.fillStyle = m.active ? '#4ade80' : '#6b7280';
        ctx.beginPath();
        ctx.arc(
          rInd * Math.cos(tipAngle),
          rInd * Math.sin(tipAngle),
          3 / scale,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
      }

      // Tracer dot marker (matches the tracer's color)
      const tr = storeTracers.get(b.id);
      if (tr) {
        ctx.fillStyle = tr.color;
        ctx.beginPath();
        ctx.arc(b.pos.x, b.pos.y, 3.5 / scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── Freehand draw preview ─────────────────────────────────────────
    if (drawActiveRef.current && drawPathRef.current.length > 1) {
      const path = drawPathRef.current;
      const color = useSandbox2DStore.getState().currentColor;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.closePath();
      ctx.fillStyle = color + '44';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8 / scale;
      ctx.fill();
      ctx.stroke();
    }

    // ── Circle/box drag-create preview ───────────────────────────────
    if (dragCreateRef.current) {
      const { start, kind } = dragCreateRef.current;
      const cur = snapWorld(cursorWorldRef.current);
      const color = useSandbox2DStore.getState().currentColor;
      ctx.strokeStyle = color;
      ctx.fillStyle = color + '33';
      ctx.lineWidth = 1.8 / scale;
      if (kind === 'circle') {
        const rad = Math.hypot(cur.x - start.x, cur.y - start.y);
        ctx.beginPath();
        ctx.arc(start.x, start.y, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        const x = Math.min(start.x, cur.x);
        const y = Math.min(start.y, cur.y);
        const w = Math.abs(cur.x - start.x);
        const h = Math.abs(cur.y - start.y);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
    }

    // ── Spring/hinge wire preview ─────────────────────────────────────
    if (wireRef.current) {
      const wa = worldAnchor(wireRef.current.fromBody, wireRef.current.fromLocal);
      ctx.strokeStyle = wireRef.current.kind === 'spring' ? '#f0abfc' : '#fbbf24';
      ctx.lineWidth = 1.5 / scale;
      ctx.setLineDash([0.1, 0.07]);
      ctx.beginPath();
      ctx.moveTo(wa.x, wa.y);
      ctx.lineTo(wireRef.current.cursor.x, wireRef.current.cursor.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Push brush indicator ──────────────────────────────────────────
    if (pushRef.current) {
      const cur = cursorWorldRef.current;
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, 0.7, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ── Rotate arc indicator ──────────────────────────────────────────
    if (dragRef.current?.rotateMode) {
      const b = dragRef.current.body;
      const cur = cursorWorldRef.current;
      const rad = Math.max(Math.hypot(cur.x - b.pos.x, cur.y - b.pos.y), 0.15);
      const startAng = dragRef.current.startAngle;
      const curAng = b.angle;
      // Sweep arc
      ctx.strokeStyle = 'rgba(251,191,36,0.65)';
      ctx.lineWidth = 1.5 / scale;
      ctx.setLineDash([0.12, 0.08]);
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, rad, startAng, curAng, curAng < startAng);
      ctx.stroke();
      ctx.setLineDash([]);
      // Radial line
      ctx.strokeStyle = 'rgba(251,191,36,0.4)';
      ctx.lineWidth = 1 / scale;
      ctx.setLineDash([0.08, 0.06]);
      ctx.beginPath();
      ctx.moveTo(b.pos.x, b.pos.y);
      ctx.lineTo(cur.x, cur.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Dot at cursor
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, 4 / scale, 0, Math.PI * 2);
      ctx.fill();
      // Angle label - draw in screen space
      const screenX = tx + b.pos.x * scale;
      const screenY = ty + b.pos.y * scale;
      const degStr = `${(curAng * 180 / Math.PI).toFixed(1)}°`;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(degStr, screenX + 8, screenY - 8);
      ctx.restore();
    }

    // ── Resize handle line ────────────────────────────────────────────
    if (resizeRef.current) {
      const cur = cursorWorldRef.current;
      const b = resizeRef.current.body;
      ctx.strokeStyle = 'rgba(99,102,241,0.75)';
      ctx.lineWidth = 1.5 / scale;
      ctx.setLineDash([0.1, 0.07]);
      ctx.beginPath();
      ctx.moveTo(b.pos.x, b.pos.y);
      ctx.lineTo(cur.x, cur.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#6366f1';
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, 4.5 / scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // ── HUD ───────────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `11px "JetBrains Mono", monospace`;
    ctx.fillText(
      `bodies ${world.bodies.length}  water ${particles.length}  zoom ${(camRef.current.zoom).toFixed(2)}×`,
      10,
      H - 10,
    );
  }

  // Global mouseup so we don't lose drag release outside canvas
  useEffect(() => {
    const up = (e: MouseEvent) => {
      if (
        dragRef.current ||
        drawActiveRef.current ||
        dragCreateRef.current ||
        wireRef.current ||
        waterRef.current ||
        pushRef.current ||
        resizeRef.current ||
        panRef.current
      ) {
        onMouseUp(e);
      }
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  void rev;
  const isHoveringBody = (tool === 'select' || tool === 'resize' || tool === 'rotate') && hoveringBody;
  const isDragging = !!dragRef.current;
  const isResizing = !!resizeRef.current;
  const isPanning = !!panRef.current;
  const cursor =
    tool === 'eraser'
      ? 'not-allowed'
      : tool === 'draw'
        ? 'crosshair'
        : tool === 'water'
          ? 'cell'
          : tool === 'spring' || tool === 'hinge'
            ? 'crosshair'
            : tool === 'push'
              ? 'grab'
              : tool === 'motor' || tool === 'tracer'
                ? 'pointer'
                : tool === 'circle' || tool === 'box'
                  ? 'crosshair'
                  : tool === 'pan'
                    ? isPanning ? 'grabbing' : 'grab'
                    : tool === 'resize'
                      ? isResizing ? 'nwse-resize' : (isHoveringBody ? 'nwse-resize' : 'default')
                      : tool === 'rotate'
                        ? isDragging ? 'grabbing' : (isHoveringBody ? 'crosshair' : 'default')
                        : isDragging
                          ? 'grabbing'
                          : isHoveringBody
                            ? 'grab'
                            : 'default';

  // ── Context menu helpers ──────────────────────────────────────────────────
  function ctxToggleStatic() {
    if (!contextMenu) return;
    const b = contextMenu.body;
    b.isStatic = !b.isStatic;
    if (b.isStatic) {
      b.invMass = 0;
      b.invInertia = 0;
      b.vel.x = 0;
      b.vel.y = 0;
      b.angularVel = 0;
    } else if (b.mass > 0) {
      b.invMass = 1 / b.mass;
      b.invInertia = b.inertia > 0 ? 1 / b.inertia : 0;
    }
    useSandbox2DStore.getState().mutate(() => {});
  }

  function ctxPinToWorld() {
    if (!contextMenu) return;
    const b = contextMenu.body;
    const state = useSandbox2DStore.getState();
    state.world.addConstraint(makePin(b, null, { x: 0, y: 0 }, { x: b.pos.x, y: b.pos.y }));
    state.mutate(() => {});
    setContextMenu(null);
  }

  function ctxApplyVelocity() {
    if (!contextMenu) return;
    const vx = parseFloat(contextMenu.velVx);
    const vy = parseFloat(contextMenu.velVy);
    if (!isNaN(vx)) contextMenu.body.vel.x = vx;
    if (!isNaN(vy)) contextMenu.body.vel.y = vy;
    useSandbox2DStore.getState().mutate(() => {});
  }

  const containerW = containerRef.current?.clientWidth ?? 800;
  const containerH = containerRef.current?.clientHeight ?? 600;

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block"
        style={{ cursor }}
        onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e); }}
        onMouseMove={(e) => { e.stopPropagation(); onMouseMove(e); }}
        onMouseUp={(e) => { e.stopPropagation(); onMouseUp(e); }}
        onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e); }}
      />

      {/* ── Constraint selection panel ── */}
      {selectedConstraintId && constraintMenuPos && (() => {
        const cst = useSandbox2DStore.getState().world.constraints.find((c) => c.id === selectedConstraintId);
        if (!cst) return null;
        const label = cst.kind === 'spring' ? 'Spring' : cst.kind === 'pin' ? 'Pin / Hinge' : 'Distance';
        const springCst = cst.kind === 'spring' ? cst as SpringConstraint : null;
        return (
          <div
            data-constraint-panel="true"
            className="absolute z-50 rounded-xl border border-white/10 bg-gray-950/95 backdrop-blur shadow-2xl text-xs text-white select-none overflow-hidden"
            style={{
              left: Math.min(constraintMenuPos.x, containerW - 200),
              top: Math.max(4, constraintMenuPos.y - 90),
              minWidth: 175,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="px-3 py-2 border-b border-white/10 bg-white/5">
              <div className="font-semibold text-white/90">{label}</div>
              {springCst && (
                <div className="text-white/40 font-mono text-[10px] mt-0.5">
                  k = {springCst.stiffness} · rest = {springCst.restLength.toFixed(2)}
                </div>
              )}
              <div className="text-white/30 text-[10px] mt-0.5">Delete / ⌫ to remove</div>
            </div>
            <button
              className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-500/15 transition-colors"
              onClick={() => {
                const cid = selectedConstraintId;
                useSandbox2DStore.getState().mutate((w) => {
                  w.constraints = w.constraints.filter((c) => c.id !== cid);
                });
                setSelectedConstraintId(null);
                setConstraintMenuPos(null);
              }}
            >
              Delete
            </button>
          </div>
        );
      })()}

      {/* ── Algodoo-style right-click context menu ── */}
      {contextMenu && (
        <div
          data-ctx-menu="true"
          className="absolute z-50 rounded-xl border border-white/10 bg-gray-950/95 backdrop-blur shadow-2xl text-xs text-white select-none overflow-hidden"
          style={{
            left: Math.min(contextMenu.containerX, containerW - 220),
            top: Math.min(contextMenu.containerY, containerH - 360),
            minWidth: 210,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Info header */}
          <div className="px-3 py-2 border-b border-white/10 bg-white/5">
            <div className="font-semibold text-white/90 capitalize flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: contextMenu.body.isStatic ? '#64748b' : contextMenu.body.color }}
              />
              {contextMenu.body.shape.kind}
              {contextMenu.body.shape.kind === 'circle' &&
                <span className="text-white/40 font-normal"> · r = {contextMenu.body.shape.radius.toFixed(3)}</span>}
              {contextMenu.body.shape.kind === 'polygon' &&
                <span className="text-white/40 font-normal"> · {contextMenu.body.shape.vertices.length} verts</span>}
            </div>
            <div className="text-white/40 mt-0.5 font-mono leading-relaxed">
              pos ({contextMenu.body.pos.x.toFixed(2)}, {contextMenu.body.pos.y.toFixed(2)})<br />
              vel ({contextMenu.body.vel.x.toFixed(2)}, {contextMenu.body.vel.y.toFixed(2)})<br />
              mass {contextMenu.body.mass.toFixed(3)} · {contextMenu.body.isStatic ? 'static' : 'dynamic'}
            </div>
          </div>

          {/* Duplicate */}
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-white/8 transition-colors"
            onClick={() => { useSandbox2DStore.getState().duplicateBody(contextMenu.body.id); setContextMenu(null); }}
          >
            Duplicate
          </button>

          <div className="h-px bg-white/8 mx-2" />

          {/* Toggle static */}
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-white/8 transition-colors flex items-center justify-between"
            onClick={ctxToggleStatic}
          >
            <span>{contextMenu.body.isStatic ? 'Make dynamic' : 'Make static'}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${contextMenu.body.isStatic ? 'bg-amber-500/25 text-amber-300' : 'bg-blue-500/25 text-blue-300'}`}>
              {contextMenu.body.isStatic ? 'static' : 'dynamic'}
            </span>
          </button>

          {/* Pin to world */}
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-white/8 transition-colors"
            onClick={ctxPinToWorld}
          >
            Pin to world
          </button>

          {/* Lock rotation */}
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-white/8 transition-colors flex items-center justify-between"
            onClick={() => {
              contextMenu.body.lockRotation = !contextMenu.body.lockRotation;
              useSandbox2DStore.getState().mutate(() => {});
            }}
          >
            <span>Lock rotation</span>
            <span className={`w-3 h-3 rounded border ${contextMenu.body.lockRotation ? 'bg-indigo-500 border-indigo-400' : 'border-white/30'}`} />
          </button>

          <div className="h-px bg-white/8 mx-2" />

          {/* Set velocity */}
          <div className="px-3 py-2">
            <div className="text-white/45 mb-1.5">Velocity</div>
            <div className="flex gap-2">
              <div className="flex items-center gap-1 flex-1">
                <span className="text-white/35 text-[10px] w-5">vx</span>
                <input
                  type="number"
                  step="0.1"
                  className="w-full bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5 text-xs font-mono text-white outline-none focus:border-indigo-500/60"
                  value={contextMenu.velVx}
                  onChange={(e) => setContextMenu((m) => m ? { ...m, velVx: e.target.value } : null)}
                  onBlur={ctxApplyVelocity}
                  onKeyDown={(e) => { if (e.key === 'Enter') ctxApplyVelocity(); }}
                />
              </div>
              <div className="flex items-center gap-1 flex-1">
                <span className="text-white/35 text-[10px] w-5">vy</span>
                <input
                  type="number"
                  step="0.1"
                  className="w-full bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5 text-xs font-mono text-white outline-none focus:border-indigo-500/60"
                  value={contextMenu.velVy}
                  onChange={(e) => setContextMenu((m) => m ? { ...m, velVy: e.target.value } : null)}
                  onBlur={ctxApplyVelocity}
                  onKeyDown={(e) => { if (e.key === 'Enter') ctxApplyVelocity(); }}
                />
              </div>
            </div>
          </div>

          <div className="h-px bg-white/8 mx-2" />

          {/* Change color */}
          <div className="px-3 py-2">
            <div className="text-white/45 mb-1.5">Color</div>
            <div className="flex gap-1.5 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className={`w-5 h-5 rounded transition-all border-2 ${contextMenu.body.color === c ? 'border-white scale-110' : 'border-transparent hover:border-white/50'}`}
                  style={{ background: c }}
                  onClick={() => {
                    contextMenu.body.color = c;
                    useSandbox2DStore.getState().mutate(() => {});
                  }}
                />
              ))}
            </div>
          </div>

          <div className="h-px bg-white/8 mx-2" />

          {/* Motor */}
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-white/8 transition-colors flex items-center justify-between"
            onClick={() => { useSandbox2DStore.getState().toggleMotor(contextMenu.body.id); }}
          >
            Motor
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${motors.has(contextMenu.body.id) ? 'bg-green-500/25 text-green-300' : 'text-white/30'}`}>
              {motors.has(contextMenu.body.id) ? 'on' : 'off'}
            </span>
          </button>

          {/* Tracer */}
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-white/8 transition-colors flex items-center justify-between"
            onClick={() => { useSandbox2DStore.getState().toggleTracer(contextMenu.body.id); }}
          >
            Tracer
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tracers.has(contextMenu.body.id) ? 'bg-amber-500/25 text-amber-300' : 'text-white/30'}`}>
              {tracers.has(contextMenu.body.id) ? 'on' : 'off'}
            </span>
          </button>

          <div className="h-px bg-white/8 mx-2" />

          {/* Delete */}
          <button
            className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-500/15 transition-colors"
            onClick={() => {
              useSandbox2DStore.getState().mutate((w) => w.remove(contextMenu.body.id));
              setContextMenu(null);
            }}
          >
            Delete body
          </button>
        </div>
      )}
    </div>
  );
}
