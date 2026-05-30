import { createContext, useContext, useState, useCallback } from 'react';

const WidgetContext = createContext(null);
const KEY = 'cov-widgets-v4'; // v4: removed insight default

// Mirror of the grid constants in DesktopWidgets.jsx — kept in sync manually.
// STEP_X = GRID_CELL_W(190) + GRID_GAP_X(10), STEP_Y = GRID_CELL_H(160) + GRID_GAP_Y(10)
const G_OX = 20, G_OY = 42, G_STEP_X = 200, G_STEP_Y = 170;
function snapPos(x, y) {
  return {
    x: Math.max(G_OX, G_OX + Math.round((x - G_OX) / G_STEP_X) * G_STEP_X),
    y: Math.max(G_OY, G_OY + Math.round((y - G_OY) / G_STEP_Y) * G_STEP_Y),
  };
}

function cellKey(p, cols = 1, rows = 1) {
  const c = Math.round((p.x - G_OX) / G_STEP_X);
  const r = Math.round((p.y - G_OY) / G_STEP_Y);
  return { c, r, cspan: cols, rspan: rows };
}

// Pick the first grid cell not occupied by an existing widget. Scans left→right,
// top→bottom so new widgets land in a predictable, grid-aligned slot.
function firstFreeCell(existing) {
  const occupied = new Set();
  for (const w of existing) {
    const { c, r, cspan, rspan } = cellKey(w.position, w.cols ?? 1, w.rows ?? 1);
    for (let dc = 0; dc < cspan; dc++) {
      for (let dr = 0; dr < rspan; dr++) {
        occupied.add(`${r + dr},${c + dc}`);
      }
    }
  }
  for (let r = 0; r < 32; r++) {
    for (let c = 0; c < 32; c++) {
      if (!occupied.has(`${r},${c}`)) {
        return { x: G_OX + c * G_STEP_X, y: G_OY + r * G_STEP_Y };
      }
    }
  }
  return { x: G_OX, y: G_OY };
}

// Defaults use grid-aligned positions (col 0 row 0, col 0 row 1)
const DEFAULTS = [
  { id: 'w-clock-default',  type: 'clock',  position: { x: 20, y: 42  }, cols: 1 },
  { id: 'w-streak-default', type: 'streak', position: { x: 20, y: 212 }, cols: 1 },
];

function load() {
  try {
    const stored = localStorage.getItem(KEY);
    const parsed = stored ? JSON.parse(stored) : DEFAULTS;
    return parsed.map(w => ({ cols: 1, rows: 1, radius: 'normal', ...w }));
  }
  catch { return DEFAULTS; }
}
function save(w) {
  try { localStorage.setItem(KEY, JSON.stringify(w)); } catch {}
}

export function WidgetProvider({ children }) {
  const [widgets, setWidgets]     = useState(load);
  const [snapGrid, setSnapGrid]   = useState(false); // off by default — overlay is opt-in via Dock or ⌘⇧H
  const [isDragging, setIsDragging] = useState(false);

  const toggleSnapGrid = useCallback(() => {
    setSnapGrid(p => {
      if (!p) {
        // snap is turning ON — immediately align every widget to its nearest cell
        setWidgets(prev => {
          const next = prev.map(w => ({ ...w, position: snapPos(w.position.x, w.position.y) }));
          save(next);
          return next;
        });
      }
      return !p;
    });
  }, []);

  const addWidget = useCallback((type, extra = {}) => {
    setWidgets(prev => {
      if (!type.startsWith('custom_') && prev.find(w => w.type === type)) return prev;
      const position = extra.position ?? firstFreeCell(prev);
      const next = [...prev, { id: `w-${type}-${Date.now()}`, type, cols: 1, ...extra, position }];
      save(next);
      return next;
    });
  }, []);

  const removeWidget = useCallback((id) => {
    setWidgets(prev => { const next = prev.filter(w => w.id !== id); save(next); return next; });
  }, []);

  const moveWidget = useCallback((id, position) => {
    setWidgets(prev => { const next = prev.map(w => w.id === id ? { ...w, position } : w); save(next); return next; });
  }, []);

  // Accepts either a number (legacy: cols only) or an object like
  // { cols?, rows? } so callers can resize on either axis independently.
  const resizeWidget = useCallback((id, sizeOrCols) => {
    const patch = typeof sizeOrCols === 'number' ? { cols: sizeOrCols } : sizeOrCols;
    setWidgets(prev => { const next = prev.map(w => w.id === id ? { ...w, ...patch } : w); save(next); return next; });
  }, []);

  const updateWidget = useCallback((id, patch) => {
    setWidgets(prev => { const next = prev.map(w => w.id === id ? { ...w, ...patch } : w); save(next); return next; });
  }, []);

  return (
    <WidgetContext.Provider value={{ widgets, addWidget, removeWidget, moveWidget, resizeWidget, updateWidget, snapGrid, toggleSnapGrid, isDragging, setIsDragging }}>
      {children}
    </WidgetContext.Provider>
  );
}

export function useWidgets() { return useContext(WidgetContext); }
