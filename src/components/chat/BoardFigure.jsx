import { useRef } from 'react';
import { parseBoard } from '../../utils/boardDSL';

// Renders a parsed `board` figure as a real SVG on a dark "chalkboard" panel
// (theme-independent so it reads in both light and dark mode). When `animate`
// is on, the figure DRAWS ITSELF like a teacher: each stroke reveals via an
// animated stroke-dashoffset, points/labels fade in just after their stroke,
// all sequenced in draw order. Defensive: a null/empty board renders nothing;
// one bad primitive never breaks the rest.

const VW = 480;
const PLANE_H = 300;
const LINE_H = 132;
const PAD = 34;

const INK = '#cbd5e1';
const FAINT = 'rgba(148,163,184,0.16)';
const SUBTLE = 'rgba(203,213,225,0.55)';
const DEFAULT = '#60a5fa';

function dashFor(d) { return d ? '5 4' : undefined; }
function fmtNum(v) {
  if (!Number.isFinite(v)) return '';
  const r = Math.round(v * 100) / 100;
  return String(r);
}
function cleanLabel(s) {
  // MVP: labels may contain $..$ KaTeX — render the inner text plainly for now.
  return String(s || '').replace(/\$/g, '');
}
function prefersReduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

// A sequencing clock that hands out per-element animation styles in draw order.
// drawStyle() = a self-drawing stroke (needs pathLength="1" on the element);
// fadeStyle() = a quick fade-in (points, labels, arrowheads);
// bgFade() = the coordinate frame, revealed up front; bump() = a manual pause.
function makeClock(animate, nStrokes) {
  const budget = 3.0;
  const step = Math.max(0.22, Math.min(0.7, budget / Math.max(1, nStrokes)));
  let t = 0;
  return {
    animate,
    drawStyle(scale = 1) {
      if (!animate) return undefined;
      const dur = step * scale;
      const delay = t;
      t += dur * 0.82;
      return { strokeDasharray: 1, strokeDashoffset: 1, animation: `bf-draw ${dur.toFixed(2)}s ease-out ${delay.toFixed(2)}s forwards` };
    },
    fadeStyle() {
      if (!animate) return undefined;
      const delay = t;
      t += 0.1;
      return { opacity: 0, animation: `bf-fade .3s ease-out ${delay.toFixed(2)}s forwards` };
    },
    bgFade() {
      if (!animate) return undefined;
      return { opacity: 0, animation: 'bf-fade .4s ease-out 0s forwards' };
    },
    bump(d) { if (animate) t += d; },
  };
}

export default function BoardFigure({ src, animate = true }) {
  const board = useRef(null);
  // Parse once per mount (src is stable for a committed message).
  if (board.current === null) {
    try { board.current = parseBoard(src) || false; } catch { board.current = false; }
  }
  // Decide animation once per mount instance.
  const animRef = useRef(null);
  if (animRef.current === null) animRef.current = !!animate && !prefersReduced();

  const b = board.current;
  if (!b || !b.primitives.length) return null;

  const notes = b.primitives.filter(p => p.t === 'note').map(p => p.text).filter(Boolean);
  const fg = b.primitives.filter(p => !['note', 'axes', 'grid'].includes(p.t)).length;
  const clk = makeClock(animRef.current, fg);
  const body = b.oneDim ? renderNumberLine(b, clk) : renderPlane(b, clk);
  if (!body) return null;

  return (
    <figure className="my-3 not-prose rounded-xl border border-white/10 bg-[#0c1322] overflow-hidden">
      {b.caption && (
        <figcaption className="px-3 pt-2 text-[11px] font-medium text-white/45">
          {cleanLabel(b.caption)}
        </figcaption>
      )}
      <div className="px-2 py-1">
        <svg
          width="100%"
          viewBox={`0 0 ${VW} ${b.oneDim ? LINE_H : PLANE_H}`}
          role="img"
          aria-label={cleanLabel(b.caption) || 'Tutor figure'}
          style={{ display: 'block', maxWidth: '100%' }}
        >
          <defs>
            <marker id="bf-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          <style>{'@keyframes bf-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}@keyframes bf-fade{to{opacity:1}}'}</style>
          {body}
        </svg>
      </div>
      {notes.length > 0 && (
        <div className="px-3 pb-2 space-y-0.5">
          {notes.map((t, i) => (
            <p key={i} className="text-[11px] text-white/55 leading-snug">{cleanLabel(t)}</p>
          ))}
        </div>
      )}
    </figure>
  );
}

// ───────────────────────── 2-D PLANE ─────────────────────────
function renderPlane(board, clk) {
  const prims = board.primitives.filter(p => p.t !== 'note');
  const xs = [];
  const ys = [];
  const add = (x, y) => { if (Number.isFinite(x)) xs.push(x); if (Number.isFinite(y)) ys.push(y); };

  for (const p of prims) {
    switch (p.t) {
      case 'point': add(p.x, p.y); break;
      case 'line': case 'arrow': add(p.x1, p.y1); add(p.x2, p.y2); break;
      case 'circle': add(p.cx - p.r, p.cy - p.r); add(p.cx + p.r, p.cy + p.r); break;
      case 'arc': add(p.cx - p.r, p.cy - p.r); add(p.cx + p.r, p.cy + p.r); break;
      case 'poly': p.pts.forEach(([x, y]) => add(x, y)); break;
      case 'angle': add(p.vx, p.vy); add(p.ax, p.ay); add(p.bx, p.by); break;
      case 'label': add(p.x, p.y); break;
      default: break;
    }
  }

  const plotPrims = prims.filter(p => p.t === 'plot');

  let xmin, xmax, ymin, ymax;
  if (board.view) {
    ({ xmin, xmax, ymin, ymax } = board.view);
  } else {
    for (const p of plotPrims) {
      const a = p.from != null ? p.from : (xs.length ? Math.min(...xs) : -10);
      const bb = p.to != null ? p.to : (xs.length ? Math.max(...xs) : 10);
      add(a, undefined); add(bb, undefined);
      const lo = Math.min(a, bb), hi = Math.max(a, bb);
      const N = 80;
      for (let i = 0; i <= N; i++) {
        const x = lo + (hi - lo) * (i / N);
        const y = p.fn(x);
        if (Number.isFinite(y)) ys.push(y);
      }
    }
    if (!xs.length) { xmin = -10; xmax = 10; } else { xmin = Math.min(...xs); xmax = Math.max(...xs); }
    if (!ys.length) { ymin = -10; ymax = 10; } else { ymin = Math.min(...ys); ymax = Math.max(...ys); }
    const px = (xmax - xmin) * 0.08 || 1;
    const py = (ymax - ymin) * 0.08 || 1;
    xmin -= px; xmax += px; ymin -= py; ymax += py;
  }
  if (!(xmax > xmin)) { xmin -= 1; xmax += 1; }
  if (!(ymax > ymin)) { ymin -= 1; ymax += 1; }

  const plotW = VW - 2 * PAD;
  const plotH = PLANE_H - 2 * PAD;
  let sx = plotW / (xmax - xmin);
  let sy = plotH / (ymax - ymin);
  let offX = 0, offY = 0;
  if (board.equalAspect) {
    const s = Math.min(sx, sy);
    offX = (plotW - s * (xmax - xmin)) / 2;
    offY = (plotH - s * (ymax - ymin)) / 2;
    sx = sy = s;
  }
  const X = (x) => PAD + offX + (x - xmin) * sx;
  const Y = (y) => PAD + offY + (plotH - (y - ymin) * sy);
  const inX = (x) => x >= xmin && x <= xmax;
  const inY = (y) => y >= ymin && y <= ymax;

  const els = [];
  let k = 0;
  const key = () => `e${k++}`;

  // grid + axes first — the coordinate frame fades in up front
  for (const p of prims) {
    if (p.t === 'grid') {
      const step = p.step || 1;
      if ((xmax - xmin) / step <= 40) {
        for (let g = Math.ceil(xmin / step) * step; g <= xmax; g += step) {
          els.push(<line key={key()} x1={X(g)} y1={Y(ymin)} x2={X(g)} y2={Y(ymax)} stroke={FAINT} strokeWidth="1" style={clk.bgFade()} />);
        }
      }
      if ((ymax - ymin) / step <= 40) {
        for (let g = Math.ceil(ymin / step) * step; g <= ymax; g += step) {
          els.push(<line key={key()} x1={X(xmin)} y1={Y(g)} x2={X(xmax)} y2={Y(g)} stroke={FAINT} strokeWidth="1" style={clk.bgFade()} />);
        }
      }
    }
  }
  for (const p of prims) {
    if (p.t === 'axes') {
      const y0 = inY(0) ? 0 : ymin;
      const x0 = inX(0) ? 0 : xmin;
      els.push(<line key={key()} x1={X(xmin)} y1={Y(y0)} x2={X(xmax)} y2={Y(y0)} stroke={SUBTLE} strokeWidth="1.4" markerEnd="url(#bf-arrow)" style={clk.bgFade()} />);
      els.push(<line key={key()} x1={X(x0)} y1={Y(ymin)} x2={X(x0)} y2={Y(ymax)} stroke={SUBTLE} strokeWidth="1.4" markerEnd="url(#bf-arrow)" style={clk.bgFade()} />);
      if (xmax - xmin <= 24) {
        for (let g = Math.ceil(xmin); g <= xmax; g++) {
          if (g === 0) continue;
          els.push(<line key={key()} x1={X(g)} y1={Y(y0) - 3} x2={X(g)} y2={Y(y0) + 3} stroke={SUBTLE} strokeWidth="1" style={clk.bgFade()} />);
          els.push(<text key={key()} x={X(g)} y={Y(y0) + 14} fill={SUBTLE} fontSize="9" textAnchor="middle" style={clk.bgFade()}>{fmtNum(g)}</text>);
        }
      }
      if (ymax - ymin <= 24) {
        for (let g = Math.ceil(ymin); g <= ymax; g++) {
          if (g === 0) continue;
          els.push(<text key={key()} x={X(x0) - 6} y={Y(g) + 3} fill={SUBTLE} fontSize="9" textAnchor="end" style={clk.bgFade()}>{fmtNum(g)}</text>);
        }
      }
      if (p.xlabel) els.push(<text key={key()} x={X(xmax) - 4} y={Y(y0) - 6} fill={SUBTLE} fontSize="10" textAnchor="end" style={clk.bgFade()}>{cleanLabel(p.xlabel)}</text>);
      if (p.ylabel) els.push(<text key={key()} x={X(x0) + 6} y={Y(ymax) + 10} fill={SUBTLE} fontSize="10" style={clk.bgFade()}>{cleanLabel(p.ylabel)}</text>);
    }
  }
  clk.bump(0.3); // let the frame settle before the teacher starts drawing

  // foreground primitives — each drawn in order
  for (const p of prims) {
    const col = p.color || (p.t === 'plot' ? DEFAULT : INK);
    switch (p.t) {
      case 'plot': {
        const a = p.from != null ? p.from : xmin;
        const bb = p.to != null ? p.to : xmax;
        const lo = Math.min(a, bb), hi = Math.max(a, bb);
        const N = 240;
        let d = '';
        let penDown = false;
        let prevYpx = null;
        for (let i = 0; i <= N; i++) {
          const x = lo + (hi - lo) * (i / N);
          const y = p.fn(x);
          if (!Number.isFinite(y) || y < ymin - (ymax - ymin) * 2 || y > ymax + (ymax - ymin) * 2) {
            penDown = false; prevYpx = null; continue;
          }
          const pxv = X(x), py = Y(Math.max(ymin - 1, Math.min(ymax + 1, y)));
          if (!penDown) { d += `M${pxv.toFixed(1)},${py.toFixed(1)}`; penDown = true; }
          else if (prevYpx != null && Math.abs(py - prevYpx) > plotH * 1.4) { d += `M${pxv.toFixed(1)},${py.toFixed(1)}`; }
          else { d += `L${pxv.toFixed(1)},${py.toFixed(1)}`; }
          prevYpx = py;
        }
        if (d) els.push(<path key={key()} d={d} pathLength="1" fill="none" stroke={col} strokeWidth={p.weight || 2} strokeLinecap="round" strokeLinejoin="round" style={clk.drawStyle(1.6)} />);
        if (p.label) els.push(<text key={key()} x={X(hi) - 2} y={Y(p.fn(hi)) - 6} fill={col} fontSize="11" textAnchor="end" style={clk.fadeStyle()}>{cleanLabel(p.label)}</text>);
        break;
      }
      case 'line': {
        const drawn = p.dash ? clk.fadeStyle() : clk.drawStyle();
        els.push(<line key={key()} x1={X(p.x1)} y1={Y(p.y1)} x2={X(p.x2)} y2={Y(p.y2)} pathLength="1" stroke={col} strokeWidth={p.weight || 2} strokeDasharray={dashFor(p.dash)} strokeLinecap="round" style={drawn} />);
        if (p.label) els.push(<text key={key()} x={(X(p.x1) + X(p.x2)) / 2} y={(Y(p.y1) + Y(p.y2)) / 2 - 5} fill={col} fontSize="11" textAnchor="middle" style={clk.fadeStyle()}>{cleanLabel(p.label)}</text>);
        break;
      }
      case 'arrow': {
        els.push(<line key={key()} x1={X(p.x1)} y1={Y(p.y1)} x2={X(p.x2)} y2={Y(p.y2)} stroke={col} strokeWidth={p.weight || 2} strokeDasharray={dashFor(p.dash)} strokeLinecap="round" markerEnd="url(#bf-arrow)" style={clk.fadeStyle()} />);
        if (p.label) els.push(<text key={key()} x={X(p.x2) + 6} y={Y(p.y2) - 4} fill={col} fontSize="11" style={clk.fadeStyle()}>{cleanLabel(p.label)}</text>);
        break;
      }
      case 'circle': {
        els.push(<ellipse key={key()} cx={X(p.cx)} cy={Y(p.cy)} rx={Math.abs(p.r * sx)} ry={Math.abs(p.r * sy)} pathLength="1" fill="none" stroke={col} strokeWidth={p.weight || 2} strokeDasharray={p.dash ? dashFor(p.dash) : undefined} style={p.dash ? clk.fadeStyle() : clk.drawStyle(1.3)} />);
        if (p.label) els.push(<text key={key()} x={X(p.cx)} y={Y(p.cy) - Math.abs(p.r * sy) - 4} fill={col} fontSize="11" textAnchor="middle" style={clk.fadeStyle()}>{cleanLabel(p.label)}</text>);
        break;
      }
      case 'arc': {
        const a0 = (p.a0 * Math.PI) / 180, a1 = (p.a1 * Math.PI) / 180;
        const N = 48;
        let d = '';
        for (let i = 0; i <= N; i++) {
          const a = a0 + (a1 - a0) * (i / N);
          const pxv = X(p.cx + p.r * Math.cos(a));
          const py = Y(p.cy + p.r * Math.sin(a));
          d += (i === 0 ? 'M' : 'L') + pxv.toFixed(1) + ',' + py.toFixed(1);
        }
        els.push(<path key={key()} d={d} pathLength="1" fill="none" stroke={col} strokeWidth={p.weight || 2} strokeLinecap="round" style={clk.drawStyle()} />);
        if (p.label) {
          const am = (a0 + a1) / 2;
          els.push(<text key={key()} x={X(p.cx + p.r * 1.18 * Math.cos(am))} y={Y(p.cy + p.r * 1.18 * Math.sin(am))} fill={col} fontSize="11" textAnchor="middle" style={clk.fadeStyle()}>{cleanLabel(p.label)}</text>);
        }
        break;
      }
      case 'poly': {
        const pts = p.pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
        const El = p.closed ? 'polygon' : 'polyline';
        els.push(<El key={key()} points={pts} pathLength="1" fill={p.closed ? 'rgba(96,165,250,0.08)' : 'none'} stroke={col} strokeWidth={p.weight || 2} strokeDasharray={dashFor(p.dash)} strokeLinejoin="round" style={p.dash ? clk.fadeStyle() : clk.drawStyle(1.3)} />);
        if (p.label && p.pts.length) {
          const cx = p.pts.reduce((s, q) => s + q[0], 0) / p.pts.length;
          const cy = p.pts.reduce((s, q) => s + q[1], 0) / p.pts.length;
          els.push(<text key={key()} x={X(cx)} y={Y(cy)} fill={col} fontSize="11" textAnchor="middle" style={clk.fadeStyle()}>{cleanLabel(p.label)}</text>);
        }
        break;
      }
      case 'angle': {
        const a0 = Math.atan2(p.ay - p.vy, p.ax - p.vx);
        const a1 = Math.atan2(p.by - p.vy, p.bx - p.vx);
        const rPx = 26;
        const N = 24;
        let d = '';
        for (let i = 0; i <= N; i++) {
          const a = a0 + (a1 - a0) * (i / N);
          d += (i === 0 ? 'M' : 'L') + (X(p.vx) + rPx * Math.cos(a)).toFixed(1) + ',' + (Y(p.vy) - rPx * Math.sin(a)).toFixed(1);
        }
        els.push(<path key={key()} d={d} pathLength="1" fill="none" stroke={col} strokeWidth="1.6" style={clk.drawStyle()} />);
        if (p.label) {
          const am = (a0 + a1) / 2;
          els.push(<text key={key()} x={X(p.vx) + (rPx + 12) * Math.cos(am)} y={Y(p.vy) - (rPx + 12) * Math.sin(am)} fill={col} fontSize="11" textAnchor="middle" style={clk.fadeStyle()}>{cleanLabel(p.label)}</text>);
        }
        break;
      }
      case 'point': {
        els.push(<circle key={key()} cx={X(p.x)} cy={Y(p.y)} r="3.6" fill={col} style={clk.fadeStyle()} />);
        if (p.label) {
          const below = p.at === 'below';
          els.push(<text key={key()} x={X(p.x) + 6} y={Y(p.y) + (below ? 16 : -8)} fill={col} fontSize="11" style={clk.fadeStyle()}>{cleanLabel(p.label)}</text>);
        }
        break;
      }
      case 'label': {
        els.push(<text key={key()} x={X(p.x)} y={Y(p.y)} fill={col} fontSize="12" textAnchor="middle" style={clk.fadeStyle()}>{cleanLabel(p.text)}</text>);
        break;
      }
      default: break;
    }
  }
  return els;
}

// ───────────────────────── NUMBER LINE ─────────────────────────
function renderNumberLine(board, clk) {
  const prims = board.primitives.filter(p => p.t !== 'note');
  const nl = prims.find(p => p.t === 'numline');
  let from, to, step;
  if (nl) { from = nl.from; to = nl.to; step = nl.step || 1; }
  else {
    const vals = [];
    for (const p of prims) {
      if (p.t === 'plotpoint' || p.t === 'tick') vals.push(p.at);
      if (p.t === 'interval') { vals.push(p.a, p.b); }
    }
    if (!vals.length) return null;
    from = Math.floor(Math.min(...vals)) - 1;
    to = Math.ceil(Math.max(...vals)) + 1;
    step = 1;
  }
  if (!(to > from)) { from -= 1; to += 1; }

  const y = LINE_H / 2;
  const T = (t) => PAD + (Math.max(from, Math.min(to, t)) - from) / (to - from) * (VW - 2 * PAD);

  const els = [];
  let k = 0;
  const key = () => `n${k++}`;

  // main axis draws itself first
  els.push(<line key={key()} x1={PAD - 6} y1={y} x2={VW - PAD + 6} y2={y} pathLength="1" stroke={SUBTLE} strokeWidth="1.6" markerStart="url(#bf-arrow)" markerEnd="url(#bf-arrow)" style={clk.drawStyle(1.4)} />);

  // ticks fade in as a group
  if ((to - from) / step <= 60) {
    for (let g = Math.ceil(from / step) * step; g <= to + 1e-9; g += step) {
      els.push(<line key={key()} x1={T(g)} y1={y - 5} x2={T(g)} y2={y + 5} stroke={SUBTLE} strokeWidth="1.1" style={clk.bgFade()} />);
      els.push(<text key={key()} x={T(g)} y={y + 20} fill={SUBTLE} fontSize="10" textAnchor="middle" style={clk.bgFade()}>{fmtNum(g)}</text>);
    }
  }
  clk.bump(0.15);

  // intervals (under the line), then points (on the line)
  for (const p of prims) {
    if (p.t !== 'interval') continue;
    const col = p.color || DEFAULT;
    const lo = Math.min(p.a, p.b), hi = Math.max(p.a, p.b);
    els.push(<line key={key()} x1={T(lo)} y1={y} x2={T(hi)} y2={y} pathLength="1" stroke={col} strokeWidth="4" strokeLinecap="butt" opacity="0.9" style={clk.drawStyle(1.2)} />);
    const leftOpen = p.open;
    const rightOpen = p.open || p.halfopen;
    els.push(endpoint(T(lo), y, col, leftOpen, key(), clk));
    els.push(endpoint(T(hi), y, col, rightOpen, key(), clk));
  }
  for (const p of prims) {
    if (p.t === 'tick') {
      els.push(<line key={key()} x1={T(p.at)} y1={y - 7} x2={T(p.at)} y2={y + 7} stroke={INK} strokeWidth="1.6" style={clk.fadeStyle()} />);
      if (p.label) els.push(<text key={key()} x={T(p.at)} y={y - 12} fill={INK} fontSize="11" textAnchor="middle" style={clk.fadeStyle()}>{cleanLabel(p.label)}</text>);
    }
    if (p.t === 'plotpoint') {
      const col = p.color || DEFAULT;
      els.push(endpoint(T(p.at), y, col, p.open, key(), clk));
      if (p.label) els.push(<text key={key()} x={T(p.at)} y={y - 14} fill={col} fontSize="11" textAnchor="middle" style={clk.fadeStyle()}>{cleanLabel(p.label)}</text>);
    }
  }
  return els;
}

function endpoint(cx, cy, color, open, key, clk) {
  const style = clk ? clk.fadeStyle() : undefined;
  return open
    ? <circle key={key} cx={cx} cy={cy} r="5" fill="#0c1322" stroke={color} strokeWidth="2" style={style} />
    : <circle key={key} cx={cx} cy={cy} r="5" fill={color} style={style} />;
}
