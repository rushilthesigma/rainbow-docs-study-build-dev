// Turns a parsed `board` (from boardDSL) into an ordered list of canvas DRAW OPS
// the TutorCanvas overlay animates — so the tutor literally draws the figure on
// the whiteboard, like a teacher. Coordinates are NORMALIZED to [0,1] within a
// box of the returned `aspect` (width/height); the canvas fits that box into the
// live drawing area and maps normalized→pixels at draw time. Dot radii and text
// sizes are returned in pixels (kept legible regardless of fit). Defensive:
// returns null for an empty board; a bad primitive is skipped, never thrown.
//
// Label text containing $…$ math becomes a `tex` op instead of a canvas `text`
// op — the canvas can't typeset KaTeX, so the TutorCanvas renders those as a
// positioned DOM layer over the overlay, revealed in draw order like any op.

const VW = 480;
const PLANE_H = 300;
const LINE_H = 132;
const PAD = 34;

const C = {
  ink: '#d7dee8',
  faint: 'rgba(148,163,184,0.22)',
  subtle: 'rgba(203,213,225,0.65)',
  def: '#60a5fa',
};

function cleanLabel(s) { return String(s || '').replace(/\$/g, ''); }
function fmtNum(v) { if (!Number.isFinite(v)) return ''; return String(Math.round(v * 100) / 100); }

// Arrowhead barbs (two short segments + tip) in the source px space.
function headPts(tx, ty, fx, fy, size = 7) {
  const ang = Math.atan2(ty - fy, tx - fx);
  const a1 = ang + Math.PI * 0.82;
  const a2 = ang - Math.PI * 0.82;
  return [
    { x: tx + size * Math.cos(a1), y: ty + size * Math.sin(a1) },
    { x: tx, y: ty },
    { x: tx + size * Math.cos(a2), y: ty + size * Math.sin(a2) },
  ];
}

export function synthBoard(board) {
  if (!board || !board.primitives || !board.primitives.length) return null;
  try {
    return board.oneDim ? synthNumberLine(board) : synthPlane(board);
  } catch {
    return null;
  }
}

// ───────────────────────── 2-D PLANE ─────────────────────────
function synthPlane(board) {
  const prims = board.primitives.filter(p => p.t !== 'note');
  const notes = board.primitives.filter(p => p.t === 'note').map(p => p.text).filter(Boolean);
  const xs = [], ys = [];
  const add = (x, y) => { if (Number.isFinite(x)) xs.push(x); if (Number.isFinite(y)) ys.push(y); };

  for (const p of prims) {
    switch (p.t) {
      case 'point': add(p.x, p.y); break;
      case 'line': case 'arrow': add(p.x1, p.y1); add(p.x2, p.y2); break;
      case 'circle': case 'arc': add(p.cx - p.r, p.cy - p.r); add(p.cx + p.r, p.cy + p.r); break;
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
      for (let i = 0; i <= 80; i++) { const y = p.fn(lo + (hi - lo) * (i / 80)); if (Number.isFinite(y)) ys.push(y); }
    }
    if (!xs.length) { xmin = -10; xmax = 10; } else { xmin = Math.min(...xs); xmax = Math.max(...xs); }
    if (!ys.length) { ymin = -10; ymax = 10; } else { ymin = Math.min(...ys); ymax = Math.max(...ys); }
    const px = (xmax - xmin) * 0.08 || 1;
    const py = (ymax - ymin) * 0.08 || 1;
    xmin -= px; xmax += px; ymin -= py; ymax += py;
  }
  if (!(xmax > xmin)) { xmin -= 1; xmax += 1; }
  if (!(ymax > ymin)) { ymin -= 1; ymax += 1; }

  const plotW = VW - 2 * PAD, plotH = PLANE_H - 2 * PAD;
  let sx = plotW / (xmax - xmin), sy = plotH / (ymax - ymin);
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

  const ops = [];
  const NP = (x, y) => ({ x: x / VW, y: y / PLANE_H });
  const stroke = (pxPts, color, w) => { if (pxPts.length >= 2) ops.push({ k: 'stroke', pts: pxPts.map(p => NP(p.x, p.y)), color, w }); };
  const dot = (x, y, color, open = false) => ops.push({ k: 'dot', x: x / VW, y: y / PLANE_H, color, r: 4.5, open });
  const text = (x, y, t, color, anchor = 'start', size = 11) => {
    const raw = String(t || '');
    if (raw.includes('$')) { ops.push({ k: 'tex', x: x / VW, y: y / PLANE_H, text: raw, color, anchor, size }); return; }
    const s = cleanLabel(raw);
    if (s) ops.push({ k: 'text', x: x / VW, y: y / PLANE_H, text: s, color, anchor, size });
  };
  const seg = (x1, y1, x2, y2, n = 6) => { const a = []; for (let i = 0; i <= n; i++) { const t = i / n; a.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t }); } return a; };

  if (board.caption) text(PAD - 6, 14, board.caption, C.subtle, 'start', 11);

  // grid
  for (const p of prims) {
    if (p.t !== 'grid') continue;
    const step = p.step || 1;
    if ((xmax - xmin) / step <= 40) for (let g = Math.ceil(xmin / step) * step; g <= xmax; g += step) stroke(seg(X(g), Y(ymin), X(g), Y(ymax), 2), C.faint, 1);
    if ((ymax - ymin) / step <= 40) for (let g = Math.ceil(ymin / step) * step; g <= ymax; g += step) stroke(seg(X(xmin), Y(g), X(xmax), Y(g), 2), C.faint, 1);
  }
  // axes
  for (const p of prims) {
    if (p.t !== 'axes') continue;
    const y0 = inY(0) ? 0 : ymin, x0 = inX(0) ? 0 : xmin;
    stroke(seg(X(xmin), Y(y0), X(xmax), Y(y0), 10), C.subtle, 1.6);
    stroke(headPts(X(xmax), Y(y0), X(xmax) - 10, Y(y0)), C.subtle, 1.6);
    stroke(seg(X(x0), Y(ymin), X(x0), Y(ymax), 10), C.subtle, 1.6);
    stroke(headPts(X(x0), Y(ymax), X(x0), Y(ymax) + 10), C.subtle, 1.6);
    if (xmax - xmin <= 22) for (let g = Math.ceil(xmin); g <= xmax; g++) { if (g === 0) continue; stroke(seg(X(g), Y(y0) - 3, X(g), Y(y0) + 3, 1), C.subtle, 1); text(X(g), Y(y0) + 14, fmtNum(g), C.subtle, 'middle', 9); }
    if (ymax - ymin <= 22) for (let g = Math.ceil(ymin); g <= ymax; g++) { if (g === 0) continue; text(X(x0) - 7, Y(g) + 3, fmtNum(g), C.subtle, 'end', 9); }
  }
  // foreground
  for (const p of prims) {
    const col = p.color || (p.t === 'plot' ? C.def : C.ink);
    switch (p.t) {
      case 'plot': {
        const a = p.from != null ? p.from : xmin, bb = p.to != null ? p.to : xmax;
        const lo = Math.min(a, bb), hi = Math.max(a, bb);
        let cur = [];
        let prevY = null;
        for (let i = 0; i <= 200; i++) {
          const x = lo + (hi - lo) * (i / 200);
          const y = p.fn(x);
          if (!Number.isFinite(y) || y < ymin - (ymax - ymin) * 2 || y > ymax + (ymax - ymin) * 2) { if (cur.length >= 2) stroke(cur, col, p.weight || 2); cur = []; prevY = null; continue; }
          const py = Y(Math.max(ymin - 1, Math.min(ymax + 1, y)));
          if (prevY != null && Math.abs(py - prevY) > plotH * 1.4) { if (cur.length >= 2) stroke(cur, col, p.weight || 2); cur = []; }
          cur.push({ x: X(x), y: py });
          prevY = py;
        }
        if (cur.length >= 2) stroke(cur, col, p.weight || 2);
        if (p.label) text(X(hi) - 2, Y(p.fn(hi)) - 6, p.label, col, 'end', 11);
        break;
      }
      case 'line': stroke(seg(X(p.x1), Y(p.y1), X(p.x2), Y(p.y2), 8), col, p.weight || 2); if (p.label) text((X(p.x1) + X(p.x2)) / 2, (Y(p.y1) + Y(p.y2)) / 2 - 5, p.label, col, 'middle'); break;
      case 'arrow':
        stroke(seg(X(p.x1), Y(p.y1), X(p.x2), Y(p.y2), 8), col, p.weight || 2);
        stroke(headPts(X(p.x2), Y(p.y2), X(p.x1), Y(p.y1)), col, p.weight || 2);
        if (p.label) text(X(p.x2) + 6, Y(p.y2) - 4, p.label, col);
        break;
      case 'circle': {
        const pts = [];
        for (let i = 0; i <= 56; i++) { const a = (i / 56) * Math.PI * 2; pts.push({ x: X(p.cx + p.r * Math.cos(a)), y: Y(p.cy + p.r * Math.sin(a)) }); }
        stroke(pts, col, p.weight || 2);
        if (p.label) text(X(p.cx), Y(p.cy) - Math.abs(p.r * sy) - 5, p.label, col, 'middle');
        break;
      }
      case 'arc': {
        const a0 = (p.a0 * Math.PI) / 180, a1 = (p.a1 * Math.PI) / 180, pts = [];
        for (let i = 0; i <= 48; i++) { const a = a0 + (a1 - a0) * (i / 48); pts.push({ x: X(p.cx + p.r * Math.cos(a)), y: Y(p.cy + p.r * Math.sin(a)) }); }
        stroke(pts, col, p.weight || 2);
        if (p.label) { const am = (a0 + a1) / 2; text(X(p.cx + p.r * 1.18 * Math.cos(am)), Y(p.cy + p.r * 1.18 * Math.sin(am)), p.label, col, 'middle'); }
        break;
      }
      case 'poly': {
        const pts = p.pts.map(([x, y]) => ({ x: X(x), y: Y(y) }));
        if (p.closed && pts.length) pts.push(pts[0]);
        stroke(pts, col, p.weight || 2);
        if (p.label && p.pts.length) { const cx = p.pts.reduce((s, q) => s + q[0], 0) / p.pts.length, cy = p.pts.reduce((s, q) => s + q[1], 0) / p.pts.length; text(X(cx), Y(cy), p.label, col, 'middle'); }
        break;
      }
      case 'angle': {
        const a0 = Math.atan2(p.ay - p.vy, p.ax - p.vx), a1 = Math.atan2(p.by - p.vy, p.bx - p.vx), pts = [];
        for (let i = 0; i <= 24; i++) { const a = a0 + (a1 - a0) * (i / 24); pts.push({ x: X(p.vx) + 26 * Math.cos(a), y: Y(p.vy) - 26 * Math.sin(a) }); }
        stroke(pts, col, 1.6);
        if (p.label) { const am = (a0 + a1) / 2; text(X(p.vx) + 38 * Math.cos(am), Y(p.vy) - 38 * Math.sin(am), p.label, col, 'middle'); }
        break;
      }
      case 'point': dot(X(p.x), Y(p.y), col); if (p.label) text(X(p.x) + 7, Y(p.y) + (p.at === 'below' ? 16 : -8), p.label, col); break;
      case 'label': text(X(p.x), Y(p.y), p.text, col, 'middle', 12); break;
      default: break;
    }
  }

  notes.forEach((n, i) => text(PAD - 6, PLANE_H - 10 - (notes.length - 1 - i) * 14, n, C.subtle, 'start', 10));
  return { aspect: VW / PLANE_H, ops, caption: cleanLabel(board.caption) };
}

// ───────────────────────── NUMBER LINE ─────────────────────────
function synthNumberLine(board) {
  const prims = board.primitives.filter(p => p.t !== 'note');
  const nl = prims.find(p => p.t === 'numline');
  let from, to, step;
  if (nl) { from = nl.from; to = nl.to; step = nl.step || 1; }
  else {
    const vals = [];
    for (const p of prims) { if (p.t === 'plotpoint' || p.t === 'tick') vals.push(p.at); if (p.t === 'interval') vals.push(p.a, p.b); }
    if (!vals.length) return null;
    from = Math.floor(Math.min(...vals)) - 1; to = Math.ceil(Math.max(...vals)) + 1; step = 1;
  }
  if (!(to > from)) { from -= 1; to += 1; }

  const y = LINE_H / 2;
  const T = (t) => PAD + (Math.max(from, Math.min(to, t)) - from) / (to - from) * (VW - 2 * PAD);
  const ops = [];
  const NP = (x, yy) => ({ x: x / VW, y: yy / LINE_H });
  const stroke = (pxPts, color, w) => { if (pxPts.length >= 2) ops.push({ k: 'stroke', pts: pxPts.map(p => NP(p.x, p.y)), color, w }); };
  const dot = (x, color, open = false) => ops.push({ k: 'dot', x: x / VW, y: y / LINE_H, color, r: 5, open });
  const text = (x, yy, t, color, anchor = 'middle', size = 11) => {
    const raw = String(t || '');
    if (raw.includes('$')) { ops.push({ k: 'tex', x: x / VW, y: yy / LINE_H, text: raw, color, anchor, size }); return; }
    const s = raw.replace(/\$/g, '');
    if (s) ops.push({ k: 'text', x: x / VW, y: yy / LINE_H, text: s, color, anchor, size });
  };
  const seg = (x1, y1, x2, y2, n = 6) => { const a = []; for (let i = 0; i <= n; i++) { const t = i / n; a.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t }); } return a; };

  if (board.caption) text(PAD - 6, 16, board.caption, C.subtle, 'start', 11);

  // main axis + both arrowheads
  stroke(seg(PAD - 6, y, VW - PAD + 6, y, 12), C.subtle, 1.6);
  stroke(headPts(VW - PAD + 6, y, VW - PAD - 4, y), C.subtle, 1.6);
  stroke(headPts(PAD - 6, y, PAD + 4, y), C.subtle, 1.6);

  if ((to - from) / step <= 60) for (let g = Math.ceil(from / step) * step; g <= to + 1e-9; g += step) { stroke(seg(T(g), y - 5, T(g), y + 5, 1), C.subtle, 1.1); text(T(g), y + 20, fmtNum(g), C.subtle, 'middle', 10); }

  for (const p of prims) {
    if (p.t !== 'interval') continue;
    const col = p.color || C.def;
    const lo = Math.min(p.a, p.b), hi = Math.max(p.a, p.b);
    stroke(seg(T(lo), y, T(hi), y, 10), col, 4);
    dot(T(lo), col, p.open);
    dot(T(hi), col, p.open || p.halfopen);
  }
  for (const p of prims) {
    if (p.t === 'tick') { stroke(seg(T(p.at), y - 7, T(p.at), y + 7, 1), C.ink, 1.6); if (p.label) text(T(p.at), y - 12, p.label, C.ink, 'middle'); }
    if (p.t === 'plotpoint') { const col = p.color || C.def; dot(T(p.at), col, p.open); if (p.label) text(T(p.at), y - 14, p.label, col, 'middle'); }
  }
  return { aspect: VW / LINE_H, ops, caption: String(board.caption || '').replace(/\$/g, '') };
}
