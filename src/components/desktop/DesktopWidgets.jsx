import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { X, Flame, Play, Pause, RotateCcw, StickyNote, Calendar as CalendarIcon, Quote, Layers } from 'lucide-react';
import { useWidgets } from '../../context/WidgetContext';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useAuth } from '../../context/AuthContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import { createNote, updateNote, getNote, getRecommendedReview } from '../../api/notes';

/* ── desktop grid ── */
// Each cell is exactly one widget-column wide so the size picker maps 1:1 to grid cols.
const GRID_CELL_W = 190;   // matches CELL_W below
const GRID_CELL_H = 160;
const GRID_GAP_X  = 10;    // matches CELL_GAP below
const GRID_GAP_Y  = 10;
const GRID_OX     = 20;    // left margin
const GRID_OY     = 42;    // top margin (below menubar)
const GRID_MB     = 68;    // bottom margin (above dock)
const STEP_X      = GRID_CELL_W + GRID_GAP_X;
const STEP_Y      = GRID_CELL_H + GRID_GAP_Y;

function snapToGrid(x, y) {
  const snappedX = GRID_OX + Math.round((x - GRID_OX) / STEP_X) * STEP_X;
  const snappedY = GRID_OY + Math.round((y - GRID_OY) / STEP_Y) * STEP_Y;
  return { x: Math.max(GRID_OX, snappedX), y: Math.max(GRID_OY, snappedY) };
}

function GridOverlay() {
  const { snapGrid, isDragging, widgets } = useWidgets();
  if (!snapGrid) return null;

  const numCols = Math.floor((window.innerWidth  - GRID_OX + GRID_GAP_X) / STEP_X);
  const numRows = Math.floor((window.innerHeight - GRID_OY - GRID_MB + GRID_GAP_Y) / STEP_Y);

  const occupied = new Set();
  for (const w of widgets) {
    const c0 = Math.round((w.position.x - GRID_OX) / STEP_X);
    const r0 = Math.round((w.position.y - GRID_OY) / STEP_Y);
    const cspan = w.cols ?? 1;
    const rspan = w.rows ?? 1;
    for (let dc = 0; dc < cspan; dc++) {
      for (let dr = 0; dr < rspan; dr++) {
        occupied.add(`${r0 + dr},${c0 + dc}`);
      }
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
      {Array.from({ length: numRows }, (_, r) =>
        Array.from({ length: numCols }, (_, c) => {
          const isOcc = occupied.has(`${r},${c}`);
          return (
            <div
              key={`${r}-${c}`}
              style={{
                position: 'absolute',
                left: GRID_OX + c * STEP_X,
                top:  GRID_OY + r * STEP_Y,
                width:  GRID_CELL_W,
                height: GRID_CELL_H,
                borderRadius: 14,
                border: isOcc
                  ? '1.5px solid rgba(255,255,255,0.45)'
                  : '1.5px dashed rgba(255,255,255,0.32)',
                background: isOcc
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(255,255,255,0.025)',
                // Subtle dark stroke so cells stay legible over light wallpapers.
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.22)',
              }}
            />
          );
        })
      )}
    </div>
  );
}

/* ── grid math ── */
const CELL_W = 190;
const CELL_H = 160;
const CELL_GAP = 10;
const colsToWidth  = (cols) => cols * CELL_W + (cols - 1) * CELL_GAP;
const rowsToHeight = (rows) => rows * CELL_H + (rows - 1) * CELL_GAP;

// Linear scale-up that lets widget content grow with the chosen cols/rows
// preset. At 1×1, returns `base`. Each extra column adds `perCol` (default
// 8% of base) and each extra row adds `perRow` (default 12%). Tuned to
// stay subtle - at 5×3 a number grows ~56%, not 100%+. Rounded so inline
// font-sizes don't end up sub-pixel.
function scale(base, cols = 1, rows = 1, perCol = 0.08, perRow = 0.12) {
  return Math.round(base * (1 + (cols - 1) * perCol + (rows - 1) * perRow));
}

// Widget width presets - visually mapped 1:1 to a grid column span. The two
// largest sizes (XL/Huge) are wide enough to host AI custom widgets with extra
// chart/list content.
const GRID_SIZES = [
  { cols: 1, label: 'S'    },
  { cols: 2, label: 'M'    },
  { cols: 3, label: 'L'    },
  { cols: 4, label: 'XL'   },
  { cols: 5, label: 'Huge' },
];

// Widget height presets - multi-row widgets get extra vertical padding so
// content with variable density (notes, todos) feels roomy instead of cramped.
const ROW_SIZES = [
  { rows: 1, label: '1' },
  { rows: 2, label: '2' },
  { rows: 3, label: '3' },
];

/* ── accent & opacity palettes ── */
export const ACCENT_LIST = [
  { key: 'none',   dot: 'rgba(255,255,255,0.28)', border: 'rgba(255,255,255,0.10)', bg: null },
  { key: 'blue',   dot: '#60a5fa', border: 'rgba(96,165,250,0.28)',  bg: 'rgba(59,130,246,0.10)'  },
  { key: 'orange', dot: '#fb923c', border: 'rgba(251,146,60,0.28)',  bg: 'rgba(234,88,12,0.10)'   },
  { key: 'green',  dot: '#34d399', border: 'rgba(52,211,153,0.28)',  bg: 'rgba(16,185,129,0.10)'  },
  { key: 'purple', dot: '#a78bfa', border: 'rgba(167,139,250,0.28)', bg: 'rgba(139,92,246,0.10)'  },
  { key: 'rose',   dot: '#fb7185', border: 'rgba(251,113,133,0.28)', bg: 'rgba(244,63,94,0.10)'   },
  { key: 'cyan',   dot: '#22d3ee', border: 'rgba(34,211,238,0.28)',  bg: 'rgba(6,182,212,0.10)'   },
  { key: 'amber',  dot: '#fbbf24', border: 'rgba(251,191,36,0.28)',  bg: 'rgba(245,158,11,0.10)'  },
  { key: 'pink',   dot: '#f472b6', border: 'rgba(244,114,182,0.28)', bg: 'rgba(236,72,153,0.10)'  },
  { key: 'teal',   dot: '#2dd4bf', border: 'rgba(45,212,191,0.28)',  bg: 'rgba(20,184,166,0.10)'  },
  { key: 'indigo', dot: '#818cf8', border: 'rgba(129,140,248,0.28)', bg: 'rgba(99,102,241,0.10)'  },
  { key: 'slate',  dot: '#94a3b8', border: 'rgba(148,163,184,0.28)', bg: 'rgba(100,116,139,0.10)' },
  { key: 'lime',   dot: '#a3e635', border: 'rgba(163,230,53,0.28)',  bg: 'rgba(132,204,22,0.10)'  },
];

export const OPACITY_STEPS = [
  { value: 60,  label: 'Ghost' },
  { value: 80,  label: 'Dim'   },
  { value: 95,  label: 'Solid' },
  { value: 100, label: 'Full'  },
];

// Corner-radius presets. `px` drives the surface borderRadius; the menu uses
// the same value on the preset button so the chip itself previews the shape.
export const RADIUS_STEPS = [
  { value: 'sharp',  label: 'Sharp', px: 6  },
  { value: 'normal', label: 'Round', px: 16 },
  { value: 'soft',   label: 'Soft',  px: 26 },
];

/* ── context-menu ── */
// Width preview: a row of cols-many bars whose total span is constant so all
// 5 size chips line up tidily.
function GridIcon({ cols, active }) {
  const TOTAL = 26;
  const GAP = 1.5;
  const cellW = (TOTAL - (cols - 1) * GAP) / cols;
  return (
    <div style={{ display: 'flex', gap: GAP }}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} style={{
          width: cellW, height: 14, borderRadius: 2,
          background: active ? 'rgba(96,165,250,0.65)' : 'rgba(255,255,255,0.16)',
          transition: 'background 0.15s',
        }} />
      ))}
    </div>
  );
}

// Height preview: rows-many stacked bars to mirror the width chip style.
function RowIcon({ rows, active }) {
  const TOTAL = 16;
  const GAP = 1.5;
  const cellH = (TOTAL - (rows - 1) * GAP) / rows;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          width: 14, height: cellH, borderRadius: 2,
          background: active ? 'rgba(96,165,250,0.65)' : 'rgba(255,255,255,0.16)',
          transition: 'background 0.15s',
        }} />
      ))}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '0 2px 10px' }} />;
}

function MenuLabel({ children }) {
  return (
    <p style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.20em',
      color: 'rgba(255,255,255,0.27)', textTransform: 'uppercase',
      marginBottom: 8, paddingLeft: 2,
    }}>{children}</p>
  );
}

function WidgetMenu({
  x, y,
  currentCols, currentRows,
  currentAccent = 'none', currentOpacity = 100, currentRadius = 'normal',
  currentFreeMode = true,
  onResize, onAccentChange, onOpacityChange, onRadiusChange,
  onToggleFreeMode, onStartResize, onRemove, onClose,
}) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const MENU_W = 244;
  const MENU_H_EST = 490;
  const menuX = Math.min(x, window.innerWidth  - MENU_W - 8);
  const menuY = Math.min(y, window.innerHeight - MENU_H_EST - 8);

  return (
    <div
      data-nodrag
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed', left: menuX, top: menuY, zIndex: 9999, width: MENU_W,
        maxHeight: 'calc(100vh - 24px)', overflowY: 'auto',
        background: '#131316', border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 14, padding: '10px 10px 8px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
      }}
    >
      {/* ── Width ── */}
      {!currentFreeMode && <>
        <MenuLabel>Width</MenuLabel>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {GRID_SIZES.map(({ cols, label }) => {
            const active = cols === currentCols;
            return (
              <button
                key={cols} onClick={() => onResize({ cols })}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  padding: '6px 2px 5px', borderRadius: 8,
                  border: `1.5px solid ${active ? 'rgba(96,165,250,0.60)' : 'rgba(255,255,255,0.08)'}`,
                  background: active ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.03)',
                  cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <GridIcon cols={cols} active={active} />
                <span style={{ fontSize: 8.5, color: active ? 'rgba(147,210,255,0.90)' : 'rgba(255,255,255,0.36)', fontWeight: active ? 600 : 400 }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Height ── */}
        <MenuLabel>Height</MenuLabel>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {ROW_SIZES.map(({ rows, label }) => {
            const active = rows === currentRows;
            return (
              <button
                key={rows} onClick={() => onResize({ rows })}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  padding: '6px 2px 5px', borderRadius: 8,
                  border: `1.5px solid ${active ? 'rgba(96,165,250,0.60)' : 'rgba(255,255,255,0.08)'}`,
                  background: active ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.03)',
                  cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <RowIcon rows={rows} active={active} />
                <span style={{ fontSize: 8.5, color: active ? 'rgba(147,210,255,0.90)' : 'rgba(255,255,255,0.36)', fontWeight: active ? 600 : 400 }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </>}

      <Divider />

      {/* ── Accent color ── */}
      <MenuLabel>Accent Color</MenuLabel>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
        {ACCENT_LIST.map(({ key, dot }) => {
          const active = key === currentAccent;
          return (
            <button
              key={key}
              onClick={() => onAccentChange(key)}
              title={key === 'none' ? 'Default' : key.charAt(0).toUpperCase() + key.slice(1)}
              style={{
                width: 18, height: 18, borderRadius: '50%', background: dot,
                border: active ? '2px solid rgba(255,255,255,0.75)' : '2px solid transparent',
                cursor: 'pointer', padding: 0, flexShrink: 0,
                boxShadow: active ? `0 0 0 1px rgba(255,255,255,0.18), 0 0 8px ${dot}55` : 'none',
                transition: 'border-color 0.12s, box-shadow 0.12s',
              }}
            />
          );
        })}
      </div>

      <Divider />

      {/* ── Opacity (continuous) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <MenuLabel>Opacity</MenuLabel>
        <span style={{ fontSize: 10, color: 'rgba(147,210,255,0.75)', fontWeight: 600, tabularNums: true }}>{currentOpacity}%</span>
      </div>
      <input
        type="range"
        min={30}
        max={100}
        step={1}
        value={currentOpacity}
        onChange={e => onOpacityChange(Number(e.target.value))}
        style={{
          width: '100%', margin: '2px 0 10px',
          accentColor: '#60a5fa', cursor: 'pointer',
        }}
      />

      <Divider />

      {/* ── Corner radius ── */}
      <MenuLabel>Corner Radius</MenuLabel>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {RADIUS_STEPS.map(({ value, label, px }) => {
          const active = value === currentRadius;
          return (
            <button
              key={value} onClick={() => onRadiusChange(value)}
              style={{
                flex: 1, padding: '6px 2px', fontSize: 9.5,
                border: `1.5px solid ${active ? 'rgba(96,165,250,0.55)' : 'rgba(255,255,255,0.07)'}`,
                background: active ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.02)',
                color: active ? 'rgba(147,210,255,0.85)' : 'rgba(255,255,255,0.36)',
                cursor: 'pointer', fontWeight: active ? 600 : 400,
                borderRadius: Math.min(px, 14),
                transition: 'border-color 0.12s, background 0.12s, border-radius 0.12s',
              }}
            >{label}</button>
          );
        })}
      </div>

      {/* ── Remove grid checkbox ── */}
      <Divider />
      <button
        onClick={onToggleFreeMode}
        style={{
          width: '100%', padding: '5px 6px', fontSize: 12.5,
          color: 'rgba(255,255,255,0.70)', background: 'transparent',
          border: 'none', cursor: 'pointer', borderRadius: 7,
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: currentFreeMode ? 6 : 4,
        }}
      >
        <div style={{
          width: 14, height: 14, borderRadius: 4, flexShrink: 0,
          border: `1.5px solid ${currentFreeMode ? '#60a5fa' : 'rgba(255,255,255,0.28)'}`,
          background: currentFreeMode ? 'rgba(96,165,250,0.28)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.12s, background 0.12s',
        }}>
          {currentFreeMode && <span style={{ color: '#93c5fd', fontSize: 9, lineHeight: 1, fontWeight: 700 }}>✓</span>}
        </div>
        <span>Remove grid</span>
      </button>

      {currentFreeMode && (
        <button
          onClick={onStartResize}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(96,165,250,0.10)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          style={{
            width: '100%', padding: '5px 6px', fontSize: 12.5,
            color: 'rgba(147,210,255,0.80)', background: 'transparent',
            border: 'none', cursor: 'pointer', borderRadius: 7,
            textAlign: 'left', transition: 'background 0.12s',
            marginBottom: 4,
          }}
        >Resize</button>
      )}

      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '0 2px 8px' }} />
      <button
        onClick={onRemove}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        style={{
          width: '100%', textAlign: 'left', padding: '5px 6px', fontSize: 12.5,
          color: 'rgba(248,113,113,0.82)', background: 'transparent', border: 'none',
          cursor: 'pointer', borderRadius: 7, transition: 'background 0.12s',
        }}
      >
        Remove Widget
      </button>
    </div>
  );
}

/* ── drag hook ── */
const TOP_BOUND = 30;
const BOT_BOUND = 56;

function useDrag(id, position, freeMode = false) {
  const { moveWidget, setIsDragging, snapGrid } = useWidgets();
  const drag = useRef({ active: false });
  const moveRef = useRef(moveWidget);
  moveRef.current = moveWidget;
  const snapRef = useRef(snapGrid);
  snapRef.current = snapGrid;
  const freeModeRef = useRef(freeMode);
  freeModeRef.current = freeMode;

  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('[data-nodrag]')) return;
    e.preventDefault();
    const ox = e.clientX - position.x;
    const oy = e.clientY - position.y;
    drag.current.active = true;
    if (!freeModeRef.current) setIsDragging(true);

    function clamp(x, y) {
      return {
        x: Math.max(0, Math.min(window.innerWidth - 60, x)),
        y: Math.max(TOP_BOUND, Math.min(window.innerHeight - GRID_MB - 40, y)),
      };
    }

    function move(ev) {
      if (!drag.current.active) return;
      const raw = clamp(ev.clientX - ox, ev.clientY - oy);
      const next = (snapRef.current && !freeModeRef.current) ? snapToGrid(raw.x, raw.y) : raw;
      moveRef.current(id, next);
    }

    function up(ev) {
      drag.current.active = false;
      setIsDragging(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const raw = clamp(ev.clientX - ox, ev.clientY - oy);
      moveRef.current(id, freeModeRef.current ? raw : snapToGrid(raw.x, raw.y));
    }

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
  return { onMouseDown };
}

/* ── free-resize hook (used when freeMode is on) ── */
function useFreeResize(id, freeW, freeH, position, elRef) {
  const { updateWidget } = useWidgets();

  function onResizeMouseDown(e, dir) {
    e.preventDefault();
    e.stopPropagation();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    // Seed from the live rendered size so the first resize of a default,
    // content-driven no-grid widget grows from where it sits instead of
    // jumping to the fallback dimensions.
    const el = elRef?.current;
    const startW = el ? el.offsetWidth : freeW;
    const startH = el ? el.offsetHeight : freeH;
    const startPX = position.x;
    const startPY = position.y;
    const MIN_W = 120;
    const MIN_H = 80;

    function move(ev) {
      const dx = ev.clientX - startMouseX;
      const dy = ev.clientY - startMouseY;
      let w = startW, h = startH, px = startPX, py = startPY;
      if (dir.includes('e')) w = Math.max(MIN_W, startW + dx);
      if (dir.includes('s')) h = Math.max(MIN_H, startH + dy);
      if (dir.includes('w')) { w = Math.max(MIN_W, startW - dx); if (w > MIN_W) px = startPX + dx; }
      if (dir.includes('n')) { h = Math.max(MIN_H, startH - dy); if (h > MIN_H) py = startPY + dy; }
      updateWidget(id, { freeW: Math.round(w), freeH: Math.round(h), position: { x: Math.round(px), y: Math.round(py) } });
    }

    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    }

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  return { onResizeMouseDown };
}

/* ── shell ── */
/* ── shell ── */
const RESIZE_HANDLES = [
  // corners – crisp squares with glow
  { dir: 'nw', cursor: 'nw-resize', style: { top: -5, left: -5, width: 10, height: 10, borderRadius: 3 } },
  { dir: 'ne', cursor: 'ne-resize', style: { top: -5, right: -5, width: 10, height: 10, borderRadius: 3 } },
  { dir: 'sw', cursor: 'sw-resize', style: { bottom: -5, left: -5, width: 10, height: 10, borderRadius: 3 } },
  { dir: 'se', cursor: 'se-resize', style: { bottom: -5, right: -5, width: 10, height: 10, borderRadius: 3 } },
  // edges – slim pill bars
  { dir: 'n',  cursor: 'n-resize',  style: { top: -4, left: 'calc(50% - 18px)', width: 36, height: 6, borderRadius: 99 } },
  { dir: 's',  cursor: 's-resize',  style: { bottom: -4, left: 'calc(50% - 18px)', width: 36, height: 6, borderRadius: 99 } },
  { dir: 'e',  cursor: 'e-resize',  style: { right: -4, top: 'calc(50% - 18px)', width: 6, height: 36, borderRadius: 99 } },
  { dir: 'w',  cursor: 'w-resize',  style: { left: -4, top: 'calc(50% - 18px)', width: 6, height: 36, borderRadius: 99 } },
];

function Shell({
  id, position, label, children,
  cols = 1, rows = 1, customWidth, customHeight,
  accent = 'none', opacity = 100, radius = 'normal',
}) {
  const { removeWidget, resizeWidget, updateWidget, widgets } = useWidgets();
  const widget = widgets.find(w => w.id === id);
  // No-grid (free) is the default. A widget only becomes "free-sized" - fixed
  // dimensions with clipped overflow - once the user actually drags a resize
  // handle (which sets freeW/freeH). Until then it keeps grid-style,
  // content-driven height so the default no-grid mode never clips its contents.
  const freeMode  = widget?.freeMode ?? true;
  const freeSized = freeMode && widget?.freeW != null && widget?.freeH != null;
  const freeW = widget?.freeW ?? customWidth  ?? colsToWidth(cols);
  const freeH = widget?.freeH ?? customHeight ?? rowsToHeight(rows);

  const shellRef = useRef(null);
  const innerRef = useRef(null);
  const { onMouseDown } = useDrag(id, position, freeMode);
  const { onResizeMouseDown } = useFreeResize(id, freeW, freeH, position, innerRef);
  const { theme } = useUIPreference();
  const dark = theme !== 'light';
  const [menu, setMenu] = useState(null);
  const [isSelected, setIsSelected] = useState(false);

  // Clicking outside the widget deselects it (hides handles)
  useEffect(() => {
    if (!freeMode) { setIsSelected(false); return; }
    function onOutside(e) {
      if (shellRef.current && !shellRef.current.contains(e.target)) {
        setIsSelected(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [freeMode]);

  const width     = freeMode ? freeW : (customWidth ?? colsToWidth(cols));
  const minHeight = freeSized ? freeH : (customHeight ?? (rows > 1 ? rowsToHeight(rows) : undefined));

  const accentData = ACCENT_LIST.find(a => a.key === accent) || ACCENT_LIST[0];
  const radiusData = RADIUS_STEPS.find(r => r.value === radius) || RADIUS_STEPS[1];

  const surfaceBg = dark
    ? `rgba(17,17,24,${opacity / 100})`
    : `rgba(255,255,255,${Math.min(1, (opacity + 5) / 100)})`;
  const surfaceBorder = dark
    ? accentData.border
    : (accent === 'none' ? 'rgba(0,0,0,0.10)' : accentData.border);

  function handleToggleFreeMode() {
    const entering = !freeMode;
    updateWidget(id, {
      freeMode: entering,
      freeW: entering ? (customWidth ?? colsToWidth(cols)) : undefined,
      freeH: entering ? (innerRef.current?.offsetHeight ?? rowsToHeight(rows)) : undefined,
    });
    setMenu(null);
  }

  return (
    <div
      ref={shellRef}
      data-widget
      data-widget-theme={dark ? 'dark' : 'light'}
      style={{
        position: 'fixed', left: position.x, top: position.y,
        zIndex: 7, userSelect: 'none', width,
        height: freeSized ? freeH : undefined,
        transition: freeSized ? 'none' : 'width 0.22s cubic-bezier(0.34,1.56,0.64,1)',
      }}
      onMouseDown={e => { if (freeMode) setIsSelected(true); onMouseDown(e); }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }); }}
      className="cursor-grab active:cursor-grabbing"
    >
      <div
        ref={innerRef}
        className="shadow-2xl"
        style={{
          position: 'relative',
          backgroundColor: surfaceBg,
          backgroundImage: accentData.bg
            ? `linear-gradient(135deg, ${accentData.bg} 0%, transparent 65%)`
            : 'none',
          border: `1px solid ${(freeMode && isSelected) ? 'rgba(96,165,250,0.40)' : surfaceBorder}`,
          borderRadius: radiusData.px,
          minHeight,
          height: freeSized ? freeH : undefined,
          overflow: freeSized ? 'hidden' : undefined,
          backdropFilter: opacity < 100 ? 'blur(24px) saturate(160%)' : undefined,
          WebkitBackdropFilter: opacity < 100 ? 'blur(24px) saturate(160%)' : undefined,
          // Unconditionally GPU-pin the widget surface. At opacity=100 there
          // is no backdropFilter, but without promotion the widget still
          // paints into the main compositor layer. When MacOSContent re-renders
          // on every focusWindow() call, unmemoized DesktopWidgets re-renders
          // all shells — main-layer repaints force every backdrop-filter
          // element (window blur layer, MenuBar, Dock) to re-sample, dropping
          // the compositor layer for one frame → visible wallpaper flash.
          // Pinning every shell to its own layer keeps repaints self-contained.
          willChange: 'transform',
          transform: 'translateZ(0)',
          transition: freeSized
            ? 'background-color 0.2s, border-color 0.2s'
            : 'background-color 0.2s, border-color 0.2s, background-image 0.2s, border-radius 0.22s, min-height 0.22s cubic-bezier(0.34,1.56,0.64,1)',
          color: dark ? undefined : '#111',
        }}
      >
        <div className="flex items-center justify-between px-3.5 pt-3 pb-1.5">
          <span
            className="text-[9px] font-bold uppercase tracking-[0.20em]"
            style={{ color: accent === 'none' ? 'rgba(255,255,255,0.30)' : accentData.dot + 'bb' }}
          >
            {label}
          </span>
          <button data-nodrag onClick={() => removeWidget(id)} className="text-white/20 hover:text-white/60 transition-colors -mr-0.5">
            <X size={11} />
          </button>
        </div>
        {children}
      </div>
      {/* Resize handles – frosted glass style, visible only when selected */}
      {freeMode && isSelected && RESIZE_HANDLES.map(({ dir, cursor, style }) => (
        <div
          key={dir}
          data-nodrag
          onMouseDown={e => onResizeMouseDown(e, dir)}
          style={{
            position: 'absolute', cursor, zIndex: 10,
            background: 'rgba(255,255,255,0.13)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.38)',
            boxShadow: '0 0 0 1px rgba(96,165,250,0.35), 0 2px 8px rgba(0,0,0,0.5)',
            ...style,
          }}
        />
      ))}
      {menu && createPortal(
        <WidgetMenu
          x={menu.x} y={menu.y}
          currentCols={cols} currentRows={rows}
          currentAccent={accent} currentOpacity={opacity} currentRadius={radius}
          currentFreeMode={freeMode}
          onResize={(size) => { resizeWidget(id, size); }}
          onAccentChange={(a) => { updateWidget(id, { accent: a }); }}
          onOpacityChange={(o) => { updateWidget(id, { opacity: o }); }}
          onRadiusChange={(r) => { updateWidget(id, { radius: r }); }}
          onToggleFreeMode={handleToggleFreeMode}
          onStartResize={() => { setIsSelected(true); setMenu(null); }}
          onRemove={() => { removeWidget(id); setMenu(null); }}
          onClose={() => setMenu(null)}
        />,
        document.body
      )}
    </div>
  );
}

/* ── clock ── */
// The live time display is split into a leaf so the 1Hz tick only re-renders
// the clock digits - not the surrounding Shell (drag handler, styles, etc.).
// Re-rendering the whole widget every second caused intermittent paint
// glitches where the desktop flashed to bare wallpaper for a frame.
function ClockBody({ format, showSeconds, showDate, cols, rows }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const timeOpts = { hour: '2-digit', minute: '2-digit', hour12: format === '12h' };
  const time = now.toLocaleTimeString([], timeOpts);
  const secs = now.toLocaleTimeString([], { second: '2-digit' }).slice(-2);
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const timeSize = scale(38, cols, rows);
  const secsSize = scale(18, cols, rows);
  const dateSize = scale(11, cols, rows, 0.10, 0.14);
  return (
    <div className="px-3.5 pb-3.5">
      <div className="flex items-end gap-1">
        <span
          className="font-black text-white/92 tabular-nums leading-none tracking-tight"
          style={{ fontSize: timeSize }}
        >{time}</span>
        {showSeconds && (
          <span
            className="font-bold text-white/30 tabular-nums leading-none mb-1"
            style={{ fontSize: secsSize }}
          >{secs}</span>
        )}
      </div>
      {showDate && (
        <p className="text-white/35 mt-1" style={{ fontSize: dateSize }}>{date}</p>
      )}
    </div>
  );
}

function ClockWidget({ id, position, cols, rows, accent, opacity, radius, settings = {} }) {
  const { format = '12h', showSeconds = true, showDate = true } = settings;
  return (
    <Shell id={id} position={position} label="Clock" cols={cols} rows={rows} accent={accent} opacity={opacity} radius={radius}>
      <ClockBody format={format} showSeconds={showSeconds} showDate={showDate} cols={cols} rows={rows} />
    </Shell>
  );
}

/* ── study streak ── */
function StudyStreakWidget({ id, position, cols, rows, accent, opacity, radius, settings = {} }) {
  const { showBest = true, showStatus = true, showWeekly = false } = settings;
  const { user } = useAuth();
  const streaks = user?.data?.studyStreaks || {};
  const current = streaks.currentStreak || 0;
  const longest = streaks.longestStreak || 0;
  const today = new Date().toISOString().slice(0, 10);
  const activeToday = streaks.lastActiveDate === today;

  // weekly bar: last 7 days from weeklyActivity object {date: bool}
  const weeklyDots = (() => {
    if (!showWeekly) return null;
    const activity = streaks.weeklyActivity || {};
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().slice(0, 10);
      return activity[key] ?? false;
    });
  })();

  const numSize = scale(38, cols, rows);
  const unitSize = scale(13, cols, rows, 0.06, 0.10);
  const metaSize = scale(10, cols, rows, 0.06, 0.10);
  const flameSize = scale(18, cols, rows, 0.08, 0.12);
  return (
    <Shell id={id} position={position} label="Study Streak" cols={cols} rows={rows} accent={accent} opacity={opacity} radius={radius}>
      <div className="px-3.5 pb-3.5">
        <div className="flex items-end gap-2">
          <Flame size={flameSize} className="text-orange-400/80 mb-1 flex-shrink-0" />
          <span
            className="font-black text-white/90 tabular-nums leading-none"
            style={{ fontSize: numSize }}
          >{current}</span>
          <span className="text-white/38 pb-1.5" style={{ fontSize: unitSize }}>days</span>
        </div>
        {weeklyDots && (
          <div className="flex items-center gap-1 mt-2 mb-1">
            {weeklyDots.map((active, i) => (
              <div
                key={i}
                className={`flex-1 rounded-full transition-colors ${active ? 'bg-orange-400/60' : 'bg-white/[0.08]'}`}
                style={{ height: Math.max(6, scale(6, cols, rows, 0.06, 0.10)) }}
              />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          {showBest && (
            <span className="text-white/28" style={{ fontSize: metaSize }}>Best: {longest}d</span>
          )}
          {showStatus && (
            <span
              className={`ml-auto px-2 py-0.5 rounded-full ${activeToday ? 'bg-emerald-500/15 text-emerald-400/70' : 'bg-white/[0.05] text-white/22'}`}
              style={{ fontSize: scale(9.5, cols, rows, 0.06, 0.10) }}
            >
              {activeToday ? '✓ Active today' : 'Study to continue'}
            </span>
          )}
        </div>
      </div>
    </Shell>
  );
}

/* ── AI-generated custom widget ── */
function CustomWidget({ id, position, cols, rows, config = {}, accent, opacity, radius }) {
  const { label = 'Widget', width = 220, blocks = [] } = config;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!blocks.some(b => b.type === 'countdown')) return;
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, [blocks]);

  return (
    <Shell id={id} position={position} label={label} cols={cols} rows={rows} customWidth={width} accent={accent} opacity={opacity} radius={radius}>
      <div className="px-3.5 pb-3.5 space-y-2">
        {blocks.map((block, i) => {
          if (block.type === 'heading')  return <p key={i} className="text-[15px] font-bold text-white/85 leading-tight">{block.text}</p>;
          if (block.type === 'subtext')  return <p key={i} className="text-[11px] text-white/40 leading-relaxed">{block.text}</p>;
          if (block.type === 'note')     return <p key={i} className="text-[12px] text-white/70 leading-relaxed">{block.text}</p>;
          if (block.type === 'stat') return (
            <div key={i} className="flex items-end gap-1.5">
              <span className="text-[30px] font-black text-white/90 tabular-nums leading-none">{block.value}</span>
              <span className="text-[11px] text-white/38 pb-1">{block.label}</span>
            </div>
          );
          if (block.type === 'countdown') {
            const diff = Math.max(0, new Date(block.target) - now);
            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            return (
              <div key={i}>
                <div className="flex items-end gap-1.5">
                  <span className="text-[30px] font-black text-white/90 tabular-nums leading-none">{days}</span>
                  <span className="text-[11px] text-white/38 pb-1">days {hours}h</span>
                </div>
                {block.label && <p className="text-[10px] text-white/30 mt-0.5">{block.label}</p>}
              </div>
            );
          }
          if (block.type === 'progress') return (
            <div key={i}>
              <div className="flex justify-between mb-1">
                <span className="text-[11px] text-white/60">{block.label}</span>
                <span className="text-[10px] text-white/35">{block.percent}%</span>
              </div>
              <div className="h-[3px] rounded-full bg-white/[0.08]">
                <div className="h-full rounded-full bg-white/40" style={{ width: `${block.percent}%` }} />
              </div>
            </div>
          );
          if (block.type === 'list') return (
            <ul key={i} className="space-y-1">
              {(block.items || []).map((item, j) => (
                <li key={j} className="flex items-center gap-2 text-[11.5px] text-white/65">
                  <span className="w-1 h-1 rounded-full bg-white/30 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          );
          return null;
        })}
      </div>
    </Shell>
  );
}

/* ── pomodoro timer ── */
// The live timer display is split into a leaf so the 250ms tick only
// re-renders the digits - not the surrounding Shell (same fix as ClockBody).
function PomodoroBody({ id, running, endsAt, remaining, phase, focusMin, breakMin, settings, updateWidget, cols, rows }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => force(n => n + 1), 250);
    return () => clearInterval(t);
  }, [running]);

  const totalMs = (phase === 'focus' ? focusMin : breakMin) * 60_000;
  const msLeft = running && endsAt ? Math.max(0, endsAt - Date.now()) : remaining;
  const pct = Math.max(0, Math.min(1, 1 - msLeft / totalMs));
  const mm = Math.floor(msLeft / 60_000);
  const ss = Math.floor((msLeft % 60_000) / 1000);
  const accentColor = phase === 'focus' ? '#f97316' : '#34d399';

  // Auto-advance when the clock hits zero.
  useEffect(() => {
    if (!running || msLeft > 0) return;
    const nextPhase = phase === 'focus' ? 'break' : 'focus';
    const nextDur   = (nextPhase === 'focus' ? focusMin : breakMin) * 60_000;
    updateWidget(id, { settings: { ...settings, phase: nextPhase, running: false, endsAt: null, remaining: nextDur } });
  }, [msLeft, running, phase, focusMin, breakMin, id, settings, updateWidget]);

  function start() {
    updateWidget(id, { settings: { ...settings, running: true, endsAt: Date.now() + msLeft, remaining: msLeft } });
  }
  function pause() {
    updateWidget(id, { settings: { ...settings, running: false, endsAt: null, remaining: msLeft } });
  }
  function reset() {
    updateWidget(id, { settings: { ...settings, running: false, endsAt: null, remaining: totalMs } });
  }

  const timerSize = scale(34, cols, rows);
  const barH = Math.max(3, scale(3, cols, rows, 0.06, 0.12));
  const btnText = scale(10, cols, rows, 0.06, 0.10);
  const iconPx = scale(9, cols, rows, 0.06, 0.10);
  return (
    <div className="px-3.5 pb-3.5">
      <div className="flex items-end gap-1.5">
        <span
          className="font-black text-white/92 tabular-nums leading-none"
          style={{ fontSize: timerSize }}
        >
          {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
        </span>
      </div>
      <div className="rounded-full bg-white/[0.08] mt-2 overflow-hidden" style={{ height: barH }}>
        <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${pct * 100}%`, background: accentColor }} />
      </div>
      <div data-nodrag className="flex items-center gap-1.5 mt-2.5">
        {running ? (
          <button
            onClick={pause}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.10] text-white/75 hover:bg-white/[0.16] transition-colors"
            style={{ fontSize: btnText }}
          >
            <Pause size={iconPx} /> Pause
          </button>
        ) : (
          <button
            onClick={start}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.10] text-white/75 hover:bg-white/[0.16] transition-colors"
            style={{ fontSize: btnText }}
          >
            <Play size={iconPx} /> Start
          </button>
        )}
        <button
          onClick={reset}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-white/45 hover:bg-white/[0.10] hover:text-white/70 transition-colors"
          style={{ fontSize: btnText }}
        >
          <RotateCcw size={iconPx} /> Reset
        </button>
      </div>
    </div>
  );
}

function PomodoroWidget({ id, position, cols, rows, accent, opacity, radius, settings = {} }) {
  const { updateWidget } = useWidgets();
  const focusMin = settings.focusMin ?? 25;
  const breakMin = settings.breakMin ?? 5;
  const phase    = settings.phase    ?? 'focus';
  const running  = settings.running  ?? false;
  const endsAt   = settings.endsAt   ?? null;
  const remaining = settings.remaining ?? focusMin * 60_000;
  return (
    <Shell id={id} position={position} label={phase === 'focus' ? 'Focus' : 'Break'} cols={cols} rows={rows} accent={accent} opacity={opacity} radius={radius}>
      <PomodoroBody
        id={id} running={running} endsAt={endsAt} remaining={remaining}
        phase={phase} focusMin={focusMin} breakMin={breakMin}
        settings={settings} updateWidget={updateWidget}
        cols={cols} rows={rows}
      />
    </Shell>
  );
}

/* ── calendar (current month, today highlighted) ── */
function CalendarWidget({ id, position, cols, rows, accent, opacity, radius }) {
  const today = new Date();
  const year  = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = first.getDay();
  const monthName = today.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const cells = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const titleSize = scale(11, cols, rows, 0.08, 0.12);
  const headSize = scale(8, cols, rows, 0.08, 0.12);
  const cellSize = scale(9.5, cols, rows, 0.08, 0.14);
  const cellLine = scale(14, cols, rows, 0.10, 0.18);
  const cellMin = Math.max(14, scale(14, cols, rows, 0.08, 0.14));
  return (
    <Shell id={id} position={position} label="Calendar" cols={cols} rows={rows} accent={accent} opacity={opacity} radius={radius}>
      <div className="px-3.5 pb-3">
        <p className="font-semibold text-white/80 mb-1.5" style={{ fontSize: titleSize }}>{monthName}</p>
        <div className="grid grid-cols-7 gap-y-0.5 text-center">
          {dayLetters.map((d, i) => (
            <span
              key={`h-${i}`}
              className="font-bold uppercase text-white/25 tracking-wider"
              style={{ fontSize: headSize }}
            >{d}</span>
          ))}
          {cells.map((d, i) => {
            const isToday = d === today.getDate();
            return (
              <span
                key={i}
                className={`tabular-nums ${
                  d == null ? 'text-transparent' :
                  isToday   ? 'text-white font-bold' :
                              'text-white/55'
                }`}
                style={{
                  fontSize: cellSize,
                  lineHeight: `${cellLine}px`,
                  ...(isToday ? {
                    background: 'rgba(96,165,250,0.85)',
                    borderRadius: 4,
                    display: 'inline-block',
                    minWidth: cellMin,
                  } : {}),
                }}
              >
                {d ?? '·'}
              </span>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}

/* ── quick note (synced to a real entry in the Notes app) ── */
function QuickNoteWidget({ id, position, cols, rows, accent, opacity, radius, settings = {} }) {
  const { updateWidget } = useWidgets();
  const text   = settings.text   ?? '';
  const noteId = settings.noteId ?? null;
  const [local, setLocal] = useState(text);
  useEffect(() => { setLocal(text); }, [text]);

  // On first mount, create a backing note in the Notes app so the widget
  // content shows up there too. The note's id is stored in widget settings
  // so future edits flow into the same Notes entry.
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if (noteId) {
      // Pull latest from server so the widget reflects edits made in the
      // Notes app (one-way refresh on mount, no live subscription).
      getNote(noteId).then(({ note }) => {
        if (note?.mainNotes != null && note.mainNotes !== text) {
          setLocal(note.mainNotes);
          updateWidget(id, { settings: { ...settings, text: note.mainNotes } });
        }
      }).catch(() => {});
      return;
    }
    createNote('Quick Note (Widget)').then(({ note }) => {
      updateWidget(id, { settings: { ...settings, noteId: note.id } });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flush() {
    if (local === text) return;
    updateWidget(id, { settings: { ...settings, text: local } });
    if (noteId) updateNote(noteId, { mainNotes: local }).catch(() => {});
  }

  const noteFont = scale(12, cols, rows, 0.06, 0.10);
  return (
    <Shell id={id} position={position} label="Note" cols={cols} rows={rows} accent={accent} opacity={opacity} radius={radius}>
      <div className="px-3.5 pb-3" data-nodrag>
        <textarea
          data-nodrag
          value={local}
          placeholder="Jot something… (saves to Notes)"
          onChange={e => setLocal(e.target.value)}
          onBlur={flush}
          // Stop the Shell's mousedown drag handler from preventDefault'ing
          // before the textarea can take focus.
          onMouseDown={e => e.stopPropagation()}
          className="w-full bg-transparent text-white/80 placeholder-white/25 resize-none outline-none leading-snug"
          // Textarea grows along with the widget's row span so the bigger
          // canvas is actually usable for longer notes.
          style={{
            minHeight: rows >= 3 ? 410 : rows >= 2 ? 240 : (cols >= 2 ? 92 : 76),
            fontFamily: 'inherit', cursor: 'text', userSelect: 'text',
            fontSize: noteFont,
          }}
        />
      </div>
    </Shell>
  );
}

/* ── calculator (4-function, keyboard friendly) ── */
function CalculatorWidget({ id, position, cols, rows, accent, opacity, radius }) {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState(null);
  const [op, setOp] = useState(null);
  const [resetNext, setResetNext] = useState(false);

  function input(d) {
    if (resetNext) { setDisplay(d); setResetNext(false); return; }
    setDisplay(display === '0' ? d : display + d);
  }
  function dot() {
    if (resetNext) { setDisplay('0.'); setResetNext(false); return; }
    if (!display.includes('.')) setDisplay(display + '.');
  }
  function setOpOp(next) {
    const cur = parseFloat(display);
    if (prev != null && op && !resetNext) {
      const r = calc(prev, cur, op);
      setDisplay(String(r));
      setPrev(r);
    } else {
      setPrev(cur);
    }
    setOp(next);
    setResetNext(true);
  }
  function equals() {
    if (prev == null || op == null) return;
    const r = calc(prev, parseFloat(display), op);
    setDisplay(String(r));
    setPrev(null); setOp(null); setResetNext(true);
  }
  function clear() { setDisplay('0'); setPrev(null); setOp(null); setResetNext(false); }
  function calc(a, b, o) {
    if (o === '+') return a + b;
    if (o === '-') return a - b;
    if (o === '×') return a * b;
    if (o === '÷') return b === 0 ? 0 : a / b;
    return b;
  }

  const btnH = scale(22, cols, rows, 0.06, 0.16);
  const btnFont = scale(11, cols, rows, 0.06, 0.10);
  const displaySize = scale(20, cols, rows);
  const Btn = ({ label, onClick, accentBtn }) => (
    <button
      onClick={onClick}
      className={`rounded-md font-semibold transition-colors ${
        accentBtn ? 'bg-white/[0.14] text-white/85 hover:bg-white/[0.20]' : 'bg-white/[0.05] text-white/75 hover:bg-white/[0.10]'
      }`}
      style={{ height: btnH, fontSize: btnFont }}
    >{label}</button>
  );

  return (
    <Shell id={id} position={position} label="Calculator" cols={cols} rows={rows} accent={accent} opacity={opacity} radius={radius}>
      <div className="px-3 pb-3" data-nodrag>
        <div
          className="text-right font-black text-white/90 tabular-nums px-1 py-1 truncate"
          style={{ fontSize: displaySize }}
        >{display}</div>
        <div className="grid grid-cols-4 gap-1 mt-1">
          <Btn label="C" onClick={clear} accentBtn />
          <Btn label="÷" onClick={() => setOpOp('÷')} accentBtn />
          <Btn label="×" onClick={() => setOpOp('×')} accentBtn />
          <Btn label="−" onClick={() => setOpOp('-')} accentBtn />
          <Btn label="7" onClick={() => input('7')} />
          <Btn label="8" onClick={() => input('8')} />
          <Btn label="9" onClick={() => input('9')} />
          <Btn label="+" onClick={() => setOpOp('+')} accentBtn />
          <Btn label="4" onClick={() => input('4')} />
          <Btn label="5" onClick={() => input('5')} />
          <Btn label="6" onClick={() => input('6')} />
          <Btn label="=" onClick={equals} accentBtn />
          <Btn label="1" onClick={() => input('1')} />
          <Btn label="2" onClick={() => input('2')} />
          <Btn label="3" onClick={() => input('3')} />
          <Btn label="0" onClick={() => input('0')} />
        </div>
      </div>
    </Shell>
  );
}

/* ── to-do list (checklist persisted in widget settings) ── */
function TodoWidget({ id, position, cols, rows, accent, opacity, radius, settings = {} }) {
  const { updateWidget } = useWidgets();
  const items = Array.isArray(settings.items) ? settings.items : [];
  const [draft, setDraft] = useState('');

  function commit(next) { updateWidget(id, { settings: { ...settings, items: next } }); }
  function add() {
    const text = draft.trim();
    if (!text) return;
    // Cap scales with how tall the widget is so taller widgets can list more.
    const cap = rows >= 3 ? 24 : rows >= 2 ? 16 : 8;
    commit([...items, { text, done: false, id: Date.now() }].slice(0, cap));
    setDraft('');
  }
  function toggle(i)  { commit(items.map((it, j) => j === i ? { ...it, done: !it.done } : it)); }
  function remove(i)  { commit(items.filter((_, j) => j !== i)); }

  const itemFont = scale(11, cols, rows, 0.06, 0.10);
  const emptyFont = scale(10.5, cols, rows, 0.06, 0.10);
  const boxPx = Math.max(12, scale(12, cols, rows, 0.06, 0.12));
  const xPx = Math.max(9, scale(9, cols, rows, 0.06, 0.10));
  const inputFont = scale(11, cols, rows, 0.06, 0.10);
  return (
    <Shell id={id} position={position} label="Tasks" cols={cols} rows={rows} accent={accent} opacity={opacity} radius={radius}>
      <div className="px-3 pb-3" data-nodrag>
        <ul className="space-y-1 mb-1.5">
          {items.length === 0 && (
            <li className="text-white/30 italic px-0.5" style={{ fontSize: emptyFont }}>Nothing yet - add a task.</li>
          )}
          {items.map((it, i) => (
            <li key={it.id ?? i} className="flex items-center gap-1.5 group">
              <button
                onClick={() => toggle(i)}
                className={`rounded-[3px] border flex-shrink-0 transition-colors ${
                  it.done ? 'bg-emerald-400/70 border-emerald-400/70' : 'border-white/30 hover:border-white/55'
                }`}
                style={{ width: boxPx, height: boxPx }}
                aria-label={it.done ? 'Mark not done' : 'Mark done'}
              />
              <span
                className={`flex-1 truncate ${it.done ? 'text-white/30 line-through' : 'text-white/80'}`}
                style={{ fontSize: itemFont }}
              >{it.text}</span>
              <button onClick={() => remove(i)} className="text-white/15 hover:text-white/55 opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={xPx} />
              </button>
            </li>
          ))}
        </ul>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder="Add a task…"
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-2 py-1 text-white/75 placeholder-white/22 outline-none focus:border-white/[0.18]"
          style={{ fontSize: inputFont }}
        />
      </div>
    </Shell>
  );
}

/* ── quote of the day (rotates daily from a local list) ── */
const QUOTES = [
  { text: 'The expert in anything was once a beginner.',                 by: 'Helen Hayes' },
  { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', by: 'James Clear' },
  { text: 'It always seems impossible until it’s done.',                 by: 'Nelson Mandela' },
  { text: 'Compound interest is the eighth wonder of the world.',        by: 'Einstein (apocryphal)' },
  { text: 'The best way to predict the future is to invent it.',         by: 'Alan Kay' },
  { text: 'Discipline equals freedom.',                                  by: 'Jocko Willink' },
  { text: 'Slow is smooth, smooth is fast.',                             by: 'Navy SEAL adage' },
];
function QuoteWidget({ id, position, cols, rows, accent, opacity, radius }) {
  // Stable across the day - index from the day-of-year so it rotates daily.
  const day = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const q = QUOTES[day % QUOTES.length];
  const quoteFont = scale(13, cols, rows, 0.06, 0.12);
  const bylineFont = scale(10, cols, rows, 0.06, 0.10);
  return (
    <Shell id={id} position={position} label="Quote" cols={cols} rows={rows} accent={accent} opacity={opacity} radius={radius}>
      <div className="px-3.5 pb-3.5">
        <p className="text-white/85 leading-snug italic" style={{ fontSize: quoteFont }}>&ldquo;{q.text}&rdquo;</p>
        <p className="text-white/35 mt-1.5" style={{ fontSize: bylineFont }}>- {q.by}</p>
      </div>
    </Shell>
  );
}

/* ── recommended review (one note to study next) ── */
function ReviewWidget({ id, position, cols, rows, accent, opacity, radius }) {
  const { openApp } = useWindowManager();
  const [rec, setRec] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    getRecommendedReview()
      .then(setRec)
      .catch(() => setRec(null))
      .finally(() => setLoading(false));
  }, []);

  // Refresh on mount and whenever the user returns to the desktop (e.g. after
  // reviewing in the Notes app), so the due count stays current.
  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const titleSize = scale(13, cols, rows, 0.06, 0.10);
  const metaSize  = scale(10.5, cols, rows, 0.06, 0.10);
  const btnIcon   = Math.max(10, scale(11, cols, rows, 0.06, 0.10));

  const openReview = () => {
    if (!rec?.note) return;
    // Open a fresh Notes window routed straight to this note's flashcards.
    // (No focusIfOpen: refocusing an existing window would ignore this meta.)
    openApp('notes', 'Notes', { initialFlashcardsNoteId: rec.note.id, initialFlashcardsTitle: rec.note.title });
  };
  const openNotes = () => openApp('notes', 'Notes', { focusIfOpen: true });

  let body;
  if (loading) {
    body = <p className="text-white/30" style={{ fontSize: metaSize }}>Finding something to review…</p>;
  } else if (rec?.state === 'due' && rec.note) {
    body = (
      <>
        <p className="font-semibold text-white/88 leading-snug line-clamp-2" style={{ fontSize: titleSize }}>{rec.note.title}</p>
        <p className="text-white/40 mt-0.5" style={{ fontSize: metaSize }}>{rec.note.due} card{rec.note.due !== 1 ? 's' : ''} due</p>
        <button data-nodrag onClick={openReview} onMouseDown={e => e.stopPropagation()}
          className="mt-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/90 hover:bg-blue-500 text-white transition-colors"
          style={{ fontSize: metaSize }}>
          <RotateCcw size={btnIcon} /> Review
        </button>
      </>
    );
  } else if (rec?.state === 'caught_up') {
    body = <p className="text-white/45 leading-snug" style={{ fontSize: titleSize }}>You’re all caught up. Nothing due to review right now.</p>;
  } else if (rec?.state === 'no_cards') {
    body = (
      <>
        <p className="text-white/45 leading-snug" style={{ fontSize: titleSize }}>No flashcards yet.</p>
        <button data-nodrag onClick={openNotes} onMouseDown={e => e.stopPropagation()}
          className="mt-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.10] hover:bg-white/[0.16] text-white/80 transition-colors"
          style={{ fontSize: metaSize }}>
          Make some in Notes
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="text-white/45 leading-snug" style={{ fontSize: titleSize }}>No notes yet.</p>
        <button data-nodrag onClick={openNotes} onMouseDown={e => e.stopPropagation()}
          className="mt-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.10] hover:bg-white/[0.16] text-white/80 transition-colors"
          style={{ fontSize: metaSize }}>
          Open Notes
        </button>
      </>
    );
  }

  return (
    <Shell id={id} position={position} label="Review" cols={cols} rows={rows} accent={accent} opacity={opacity} radius={radius}>
      <div className="px-3.5 pb-3.5">{body}</div>
    </Shell>
  );
}

const WIDGET_MAP = {
  clock:      ClockWidget,
  streak:     StudyStreakWidget,
  pomodoro:   PomodoroWidget,
  calendar:   CalendarWidget,
  note:       QuickNoteWidget,
  quote:      QuoteWidget,
  calculator: CalculatorWidget,
  todo:       TodoWidget,
  review:     ReviewWidget,
};

// Memoized so MacOSContent re-renders (on every focusWindow / moveWindow /
// etc.) don't cascade into widget shells. DesktopWidgets only re-renders
// when WidgetContext state actually changes (drag, add, remove, resize).
// Without memo: MacOSContent's context subscription caused all shells to
// re-render on every focus change, forcing GPU layer repaints that made
// the Dock/MenuBar backdrop-filter re-sample — the root of the flash.
export default memo(function DesktopWidgets() {
  const { widgets } = useWidgets();
  return (
    <>
      <GridOverlay />
      {widgets.map(w => {
        const W = WIDGET_MAP[w.type];
        if (W) return (
          <W
            key={w.id}
            id={w.id}
            position={w.position}
            cols={w.cols ?? 1}
            rows={w.rows ?? 1}
            accent={w.accent}
            opacity={w.opacity ?? 100}
            radius={w.radius ?? 'normal'}
            settings={w.settings || {}}
          />
        );
        if (w.type?.startsWith('custom_')) return (
          <CustomWidget
            key={w.id}
            id={w.id}
            position={w.position}
            cols={w.cols ?? 1}
            rows={w.rows ?? 1}
            config={w.config}
            accent={w.accent}
            opacity={w.opacity ?? 100}
            radius={w.radius ?? 'normal'}
          />
        );
        return null;
      })}
    </>
  );
});
