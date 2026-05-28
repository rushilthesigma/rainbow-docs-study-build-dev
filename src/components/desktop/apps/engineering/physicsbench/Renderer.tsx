import { useEffect, useRef } from 'react';
import { usePhysicsBenchStore, findBodyAt, type Tool } from '@/store/physicsBenchStore';
import {
  makeBody,
  makeCircle,
  makeBox,
  makeRegularPolygon,
  type Body,
} from '@/lib/physics2d/types';
import { makeDistance, makePin, makeSpring, worldAnchor } from '@/lib/physics2d/constraints';
import { findMaterial } from '@/lib/physics2d/materials';

/**
 * The viewport maps world units (meters) to canvas pixels. Origin is centered.
 * Y goes down in screen and world (positive gravity = down).
 */
const SCALE = 28; // px per world meter

export default function Renderer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const step = usePhysicsBenchStore((s) => s.step);
  const tool = usePhysicsBenchStore((s) => s.tool);
  const setSelected = usePhysicsBenchStore((s) => s.setSelected);
  const selectedId = usePhysicsBenchStore((s) => s.selectedId);

  // Pan offset (in pixels)
  const camRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{
    body: Body;
    grabLocal: { x: number; y: number };
  } | null>(null);
  const panRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const wireRef = useRef<{
    fromBody: Body;
    fromLocal: { x: number; y: number };
    cursor: { x: number; y: number };
  } | null>(null);

  // The rAF loop captures `draw` as a closure. We refresh a ref every render
  // so the loop always calls the latest draw fn (which closes over the latest
  // selectedId, debug toggles, tool, etc.).
  const drawRef = useRef<() => void>(() => {});
  drawRef.current = draw;

  // Animation loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      step(dt);
      drawRef.current();
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

  const screenToWorld = (e: React.MouseEvent | MouseEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const cam = camRef.current;
    return {
      x: (cx - r.width / 2 - cam.x) / (SCALE * cam.zoom),
      y: (cy - r.height / 2 - cam.y) / (SCALE * cam.zoom),
    };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      const r = canvasRef.current!.getBoundingClientRect();
      panRef.current = {
        x: e.clientX,
        y: e.clientY,
        cx: camRef.current.x,
        cy: camRef.current.y,
      };
      void r;
      return;
    }
    const wp = screenToWorld(e);
    const world = usePhysicsBenchStore.getState().world;
    const body = findBodyAt(world, wp.x, wp.y);

    if (tool === 'select') {
      setSelected(body?.id ?? null);
      if (body && !body.isStatic) {
        const c = Math.cos(-body.angle);
        const s = Math.sin(-body.angle);
        const lx = (wp.x - body.pos.x) * c - (wp.y - body.pos.y) * s;
        const ly = (wp.x - body.pos.x) * s + (wp.y - body.pos.y) * c;
        dragRef.current = { body, grabLocal: { x: lx, y: ly } };
      }
    } else if (tool === 'circle' || tool === 'box' || tool === 'triangle' || tool === 'pentagon' || tool === 'hexagon') {
      const matId = usePhysicsBenchStore.getState().currentMaterial;
      const mat = findMaterial(matId);
      const params = mat
        ? {
            pos: wp,
            density: mat.density,
            restitution: mat.restitution,
            friction: mat.friction,
            color: mat.color,
          }
        : { pos: wp, restitution: 0.3, friction: 0.5 };
      let body: Body;
      if (tool === 'circle') body = makeBody(makeCircle(0.3 + Math.random() * 0.2), params);
      else if (tool === 'box') body = makeBody(makeBox(0.35, 0.35), params);
      else if (tool === 'triangle') body = makeBody(makeRegularPolygon(3, 0.45), params);
      else if (tool === 'pentagon') body = makeBody(makeRegularPolygon(5, 0.42), params);
      else body = makeBody(makeRegularPolygon(6, 0.4), params);
      spawn(body);
    } else if (tool === 'rope' || tool === 'spring' || tool === 'pin') {
      if (!body) return;
      const c = Math.cos(-body.angle);
      const s = Math.sin(-body.angle);
      const lx = (wp.x - body.pos.x) * c - (wp.y - body.pos.y) * s;
      const ly = (wp.x - body.pos.x) * s + (wp.y - body.pos.y) * c;
      wireRef.current = { fromBody: body, fromLocal: { x: lx, y: ly }, cursor: wp };
    } else if (tool === 'eraser') {
      if (body) {
        usePhysicsBenchStore.getState().mutate((w) => w.remove(body.id));
      }
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (panRef.current) {
      camRef.current.x = panRef.current.cx + (e.clientX - panRef.current.x);
      camRef.current.y = panRef.current.cy + (e.clientY - panRef.current.y);
      return;
    }
    if (dragRef.current) {
      const wp = screenToWorld(e);
      const body = dragRef.current.body;
      // Move body so the grab point stays under the cursor
      const c = Math.cos(body.angle);
      const s = Math.sin(body.angle);
      const grabWorldX = body.pos.x + dragRef.current.grabLocal.x * c - dragRef.current.grabLocal.y * s;
      const grabWorldY = body.pos.y + dragRef.current.grabLocal.x * s + dragRef.current.grabLocal.y * c;
      const dx = wp.x - grabWorldX;
      const dy = wp.y - grabWorldY;
      body.pos.x += dx;
      body.pos.y += dy;
      body.vel.x = dx / 0.016;
      body.vel.y = dy / 0.016;
      body.sleeping = false;
      body.sleepTimer = 0;
    } else if (wireRef.current) {
      wireRef.current.cursor = screenToWorld(e);
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (panRef.current) {
      panRef.current = null;
      return;
    }
    dragRef.current = null;
    if (wireRef.current) {
      const wp = screenToWorld(e);
      const world = usePhysicsBenchStore.getState().world;
      const target = findBodyAt(world, wp.x, wp.y);
      const w = wireRef.current;
      usePhysicsBenchStore.getState().mutate((W) => {
        const from = w.fromBody;
        if (target && target !== from) {
          const c = Math.cos(-target.angle);
          const s = Math.sin(-target.angle);
          const lx = (wp.x - target.pos.x) * c - (wp.y - target.pos.y) * s;
          const ly = (wp.x - target.pos.x) * s + (wp.y - target.pos.y) * c;
          if (tool === 'rope')
            W.addConstraint(makeDistance(from, target, w.fromLocal, { x: lx, y: ly }));
          else if (tool === 'spring')
            W.addConstraint(makeSpring(from, target, w.fromLocal, { x: lx, y: ly }, 60, 0.5));
          else if (tool === 'pin')
            W.addConstraint(makePin(from, target, w.fromLocal, { x: lx, y: ly }));
        } else {
          // Pin to world point
          const wpoint = worldAnchor(from, w.fromLocal);
          if (tool === 'rope') W.addConstraint(makeDistance(from, null, w.fromLocal, wpoint));
          else if (tool === 'spring')
            W.addConstraint(makeSpring(from, null, w.fromLocal, wpoint, 60, 0.5));
          else if (tool === 'pin') W.addConstraint(makePin(from, null, w.fromLocal, wpoint));
        }
      });
      wireRef.current = null;
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const k = Math.exp(-e.deltaY * 0.0015);
    camRef.current.zoom = Math.max(0.4, Math.min(3, camRef.current.zoom * k));
  };

  function spawn(body: Body) {
    usePhysicsBenchStore.getState().mutate((w) => w.add(body));
  }

  function draw() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const r = c.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);

    // Background
    const grd = ctx.createLinearGradient(0, 0, 0, r.height);
    grd.addColorStop(0, '#0f172a');
    grd.addColorStop(1, '#020617');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, r.width, r.height);

    const cam = camRef.current;
    const tx = r.width / 2 + cam.x;
    const ty = r.height / 2 + cam.y;
    const scale = SCALE * cam.zoom;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);
    ctx.lineWidth = 1 / scale;

    // World grid (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    const gridStep = 1;
    const left = -tx / scale - gridStep;
    const right = (r.width - tx) / scale + gridStep;
    const top = -ty / scale - gridStep;
    const bot = (r.height - ty) / scale + gridStep;
    ctx.beginPath();
    for (let x = Math.floor(left); x < right; x += gridStep) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bot);
    }
    for (let y = Math.floor(top); y < bot; y += gridStep) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();

    const state = usePhysicsBenchStore.getState();
    const world = state.world;
    const debug = state.debug;

    // Constraints
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 2 / scale;
    for (const cst of world.constraints) {
      const wa = worldAnchor(cst.a, cst.anchorA);
      const wb = cst.b ? worldAnchor(cst.b, cst.anchorB) : cst.anchorB;
      ctx.beginPath();
      if (cst.kind === 'spring') {
        // Draw zigzag
        const dx = wb.x - wa.x;
        const dy = wb.y - wa.y;
        const L = Math.hypot(dx, dy) || 1;
        const ux = dx / L;
        const uy = dy / L;
        const px = -uy;
        const py = ux;
        const coils = 6;
        ctx.moveTo(wa.x, wa.y);
        for (let i = 1; i < coils; i++) {
          const t = i / coils;
          const cx = wa.x + dx * t + px * 0.08 * (i % 2 === 0 ? 1 : -1);
          const cy = wa.y + dy * t + py * 0.08 * (i % 2 === 0 ? 1 : -1);
          ctx.lineTo(cx, cy);
        }
        ctx.lineTo(wb.x, wb.y);
        ctx.strokeStyle = '#f0abfc';
      } else {
        ctx.moveTo(wa.x, wa.y);
        ctx.lineTo(wb.x, wb.y);
        ctx.strokeStyle = cst.kind === 'pin' ? '#fbbf24' : '#94a3b8';
      }
      ctx.stroke();
      // Anchor dots
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(wa.x, wa.y, 2 / scale, 0, Math.PI * 2);
      ctx.arc(wb.x, wb.y, 2 / scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bodies
    for (const b of world.bodies) {
      ctx.save();
      ctx.translate(b.pos.x, b.pos.y);
      ctx.rotate(b.angle);
      ctx.fillStyle = b.color;
      ctx.strokeStyle = b.id === selectedId ? '#0A84FF' : 'rgba(0,0,0,0.45)';
      ctx.lineWidth = (b.id === selectedId ? 2.4 : 1.4) / scale;
      if (b.sleeping && debug.sleep) {
        ctx.globalAlpha = 0.45;
      }
      if (b.shape.kind === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, b.shape.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Orientation tick
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(b.shape.radius, 0);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.stroke();
      } else {
        ctx.beginPath();
        const verts = b.shape.vertices;
        ctx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // Velocity vectors
      if (debug.velocity && !b.isStatic) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1.5 / scale;
        ctx.beginPath();
        ctx.moveTo(b.pos.x, b.pos.y);
        ctx.lineTo(b.pos.x + b.vel.x * 0.1, b.pos.y + b.vel.y * 0.1);
        ctx.stroke();
      }
      // Forces — show gravity in red
      if (debug.forces && !b.isStatic) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5 / scale;
        ctx.beginPath();
        ctx.moveTo(b.pos.x, b.pos.y);
        ctx.lineTo(b.pos.x + world.gravity.x * 0.05, b.pos.y + world.gravity.y * 0.05);
        ctx.stroke();
      }
      // AABBs
      if (debug.aabb) {
        const a = world.lastAABBs.get(b.id);
        if (a) {
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1 / scale;
          ctx.strokeRect(a.minX, a.minY, a.maxX - a.minX, a.maxY - a.minY);
        }
      }
    }

    // Contacts
    if (debug.contacts) {
      ctx.fillStyle = '#fbbf24';
      for (const m of world.lastManifolds) {
        for (const cp of m.contacts) {
          ctx.beginPath();
          ctx.arc(cp.point.x, cp.point.y, 3 / scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Pending wire preview
    if (wireRef.current) {
      const wa = worldAnchor(wireRef.current.fromBody, wireRef.current.fromLocal);
      ctx.strokeStyle = '#0A84FF';
      ctx.setLineDash([0.12, 0.08]);
      ctx.lineWidth = 1.4 / scale;
      ctx.beginPath();
      ctx.moveTo(wa.x, wa.y);
      ctx.lineTo(wireRef.current.cursor.x, wireRef.current.cursor.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    // Overlay text (stats)
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px "JetBrains Mono", monospace';
    const s = world.stats;
    ctx.fillText(
      `bodies ${s.bodies}  pairs ${s.pairs}  contacts ${s.contacts}  awake ${s.awakeBodies}`,
      10,
      r.height - 12,
    );
  }

  // While wire is being dragged, listen on window so we don't lose mouseup
  useEffect(() => {
    const onUp = (e: MouseEvent) => {
      if (wireRef.current || dragRef.current || panRef.current) {
        onMouseUp(e as unknown as React.MouseEvent);
      }
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  const cursor = cursorForTool(tool);
  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block"
        style={{ cursor }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

function cursorForTool(t: Tool): string {
  if (t === 'select') return 'default';
  if (t === 'eraser') return 'not-allowed';
  if (t === 'rope' || t === 'spring' || t === 'pin') return 'crosshair';
  return 'cell';
}
