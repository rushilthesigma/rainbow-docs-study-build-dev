import { useEffect, useRef } from 'react';
import { makeGrid, randomFill, step as stepGrid } from '../../lib/conway';

// Live Conway's Game of Life wallpaper, ported from EngOS.
//
// Renders into a full-screen canvas behind the desktop. Pauses when the
// tab is hidden (visibilitychange listener nudges the step timer). The
// pattern is re-seeded every 60s, or earlier if it goes static — keeps
// the wallpaper from settling into still lifes for the rest of the
// session.
export default function ConwayWallpaper() {
  const canvasRef = useRef(null);
  const gridRef = useRef(null);
  const lastStep = useRef(0);
  const lastReseed = useRef(0);
  const sinceChange = useRef(0);

  useEffect(() => {
    const onVis = () => { lastStep.current = performance.now(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    let cellPx = 14;
    let W = 0;
    let H = 0;

    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      cellPx = w > 1600 ? 18 : w > 1200 ? 16 : 14;
      W = Math.ceil(w / cellPx) + 2;
      H = Math.ceil(h / cellPx) + 2;
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = makeGrid(W, H, true);
      randomFill(g, 0.18);
      gridRef.current = g;
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    const STEP_MS = 220;
    let prev = new Uint8Array(W * H);
    const draw = () => {
      const ctx = c.getContext('2d');
      const g = gridRef.current;
      if (!ctx || !g) return;
      // Background — soft engineering navy, matches the conway fallback CSS.
      const grd = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
      grd.addColorStop(0, '#0f172a');
      grd.addColorStop(1, '#020617');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      // Live cells as glowing cyan squares.
      for (let y = 0; y < g.H; y++) {
        for (let x = 0; x < g.W; x++) {
          if (g.cells[y * g.W + x]) {
            const cx = x * cellPx;
            const cy = y * cellPx;
            ctx.fillStyle = 'rgba(34, 211, 238, 0.55)';
            ctx.fillRect(cx + 1, cy + 1, cellPx - 2, cellPx - 2);
          }
        }
      }
      // Subtle vignette so the dock + menu bar pop a little.
      const vg = ctx.createRadialGradient(
        window.innerWidth / 2, window.innerHeight / 2,
        Math.min(window.innerWidth, window.innerHeight) * 0.4,
        window.innerWidth / 2, window.innerHeight / 2,
        Math.max(window.innerWidth, window.innerHeight) * 0.8,
      );
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    };
    const loop = (now) => {
      if (!document.hidden && gridRef.current) {
        const g = gridRef.current;
        if (now - lastStep.current > STEP_MS) {
          const next = stepGrid(g);
          let diff = 0;
          if (prev.length === next.length) {
            for (let i = 0; i < next.length; i++) if (prev[i] !== next[i]) diff++;
          } else {
            diff = next.length;
          }
          prev = next.slice();
          g.cells = next;
          lastStep.current = now;
          if (diff < 5) sinceChange.current++;
          else sinceChange.current = 0;
          // If the grid has been quiet for ~5s, or it's been 60s since the
          // last reseed, inject a handful of random clusters to keep things
          // alive. Without this the wallpaper goes static within minutes.
          if (sinceChange.current > 20 || now - lastReseed.current > 60_000) {
            const spots = 6 + Math.floor(Math.random() * 4);
            for (let s = 0; s < spots; s++) {
              const cx = Math.floor(Math.random() * g.W);
              const cy = Math.floor(Math.random() * g.H);
              for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                  const x = ((cx + dx) % g.W + g.W) % g.W;
                  const y = ((cy + dy) % g.H + g.H) % g.H;
                  if (Math.random() < 0.5) g.cells[y * g.W + x] = 1;
                }
              }
            }
            lastReseed.current = now;
            sinceChange.current = 0;
          }
          draw();
        }
      }
      raf = requestAnimationFrame(loop);
    };

    draw();
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0" style={{ pointerEvents: 'none' }} />;
}
