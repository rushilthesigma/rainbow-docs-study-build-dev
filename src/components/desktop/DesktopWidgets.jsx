import { useState, useEffect, useRef } from 'react';
import { X, Flame, Play, Pause, RotateCcw, StickyNote, Calendar as CalendarIcon, Quote } from 'lucide-react';
import { useWidgets } from '../../context/WidgetContext';
import { useAuth } from '../../context/AuthContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import { createNote, updateNote, getNote } from '../../api/notes';

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
  // Show the grid whenever snap is on (so the toggle in the menu bar has a
  // visible effect), or while a widget is in flight even if snap is off.
  if (!snapGrid && !isDragging) return null;

  const numCols = Math.floor((window.innerWidth  - GRID_OX + GRID_GAP_X) / STEP_X);
  const numRows = Math.floor((window.innerHeight - GRID_OY - GRID_MB + GRID_GAP_Y) / STEP_Y);

  const occupied = new Set();
  for (const w of widgets) {
    const c0 = Math.round((w.position.x - GRID_OX) / STEP_X);
    const r0 = Math.round((w.position.y - GRID_OY) / STEP_Y);
    const span = w.cols ?? 1;
    for (let dc = 0; dc < span; dc++) occupied.add(`${r0},${c0 + dc}`);
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
const CELL_GAP = 10;
const colsToWidth = (cols) => cols * CELL_W + (cols - 1) * CELL_GAP;

const GRID_SIZES = [
  { cols: 1, label: 'Small' },
  { cols: 2, label: 'Medium' },
  { cols: 3, label: 'Wide' },
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
];

export const OPACITY_STEPS = [
  { value: 60,  label: 'Ghost' },
  { value: 80,  label: 'Dim'   },
  { value: 95,  label: 'Solid' },
  { value: 100, label: 'Full'  },
];

/* ── context-menu ── */
function GridIcon({ cols, active }) {
  const cellW = cols === 1 ? 22 : cols === 2 ? 14 : 10;
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} style={{
          width: cellW, height: 18, borderRadius: 3,
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

function WidgetMenu({ x, y, currentCols, currentAccent = 'none', currentOpacity = 100, onResize, onAccentChange, onOpacityChange, onRemove, onClose }) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [onClose]);

  const menuX = Math.min(x, window.innerWidth - 234);
  const menuY = Math.min(y, window.innerHeight - 370);

  return (
    <div
      data-nodrag
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed', left: menuX, top: menuY, zIndex: 9999, width: 222,
        background: '#131316', border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 14, padding: '10px 10px 8px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
      }}
    >
      {/* ── Size ── */}
      <MenuLabel>Widget Size</MenuLabel>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {GRID_SIZES.map(({ cols, label }) => {
          const active = cols === currentCols;
          return (
            <button
              key={cols} onClick={() => onResize(cols)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '8px 4px 7px', borderRadius: 9,
                border: `1.5px solid ${active ? 'rgba(96,165,250,0.60)' : 'rgba(255,255,255,0.08)'}`,
                background: active ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.03)',
                cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <GridIcon cols={cols} active={active} />
              <span style={{ fontSize: 9.5, color: active ? 'rgba(147,210,255,0.90)' : 'rgba(255,255,255,0.36)', fontWeight: active ? 600 : 400 }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>

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

      {/* ── Opacity ── */}
      <MenuLabel>Opacity</MenuLabel>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {OPACITY_STEPS.map(({ value, label }) => {
          const active = value === currentOpacity;
          return (
            <button
              key={value} onClick={() => onOpacityChange(value)}
              style={{
                flex: 1, padding: '5px 2px', borderRadius: 7, fontSize: 9,
                border: `1.5px solid ${active ? 'rgba(96,165,250,0.55)' : 'rgba(255,255,255,0.07)'}`,
                background: active ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.02)',
                color: active ? 'rgba(147,210,255,0.85)' : 'rgba(255,255,255,0.30)',
                cursor: 'pointer', fontWeight: active ? 600 : 400,
                transition: 'border-color 0.12s, background 0.12s',
              }}
            >{label}</button>
          );
        })}
      </div>

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

function useDrag(id, position) {
  const { moveWidget, setIsDragging, snapGrid } = useWidgets();
  const drag = useRef({ active: false });
  // Stable refs so the mouseup/mousemove closures always see the latest values
  // (moveWidget itself is stable, but snapGrid flips at runtime).
  const moveRef = useRef(moveWidget);
  moveRef.current = moveWidget;
  const snapRef = useRef(snapGrid);
  snapRef.current = snapGrid;

  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('[data-nodrag]')) return;
    e.preventDefault();
    const ox = e.clientX - position.x;
    const oy = e.clientY - position.y;
    drag.current.active = true;
    setIsDragging(true); // show grid overlay while in flight

    function clamp(x, y) {
      return {
        x: Math.max(0, Math.min(window.innerWidth - 60, x)),
        // Bottom bound matches GRID_MB so a snapped widget never lands under the dock.
        y: Math.max(TOP_BOUND, Math.min(window.innerHeight - GRID_MB - 40, y)),
      };
    }

    function move(ev) {
      if (!drag.current.active) return;
      const raw = clamp(ev.clientX - ox, ev.clientY - oy);
      // When snap is on, lock to the nearest cell *during* the drag so the
      // widget visibly hops between cells instead of free-floating. This is
      // what makes the grid feel real.
      const next = snapRef.current ? snapToGrid(raw.x, raw.y) : raw;
      moveRef.current(id, next);
    }

    function up(ev) {
      drag.current.active = false;
      setIsDragging(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      // Always snap on release so a widget can never be left between cells,
      // even if the user toggled snap off mid-drag.
      const raw = clamp(ev.clientX - ox, ev.clientY - oy);
      moveRef.current(id, snapToGrid(raw.x, raw.y));
    }

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
  return { onMouseDown };
}

/* ── shell ── */
function Shell({ id, position, label, children, cols = 1, customWidth, accent = 'none', opacity = 100 }) {
  const { removeWidget, resizeWidget, updateWidget } = useWidgets();
  const { onMouseDown } = useDrag(id, position);
  const { theme } = useUIPreference();
  const dark = theme !== 'light';
  const [menu, setMenu] = useState(null);
  const width = customWidth ?? colsToWidth(cols);

  const accentData = ACCENT_LIST.find(a => a.key === accent) || ACCENT_LIST[0];

  // In light mode, widget bodies need a near-white background and a darker
  // border so they read against a light wallpaper. Children still use
  // `text-white/...` classes — those are scoped via the data-theme attr
  // below so dark utility classes get mirrored for light mode.
  const surfaceBg = dark
    ? `rgba(17,17,24,${opacity / 100})`
    : `rgba(255,255,255,${Math.min(1, (opacity + 5) / 100)})`;
  const surfaceBorder = dark
    ? accentData.border
    : (accent === 'none' ? 'rgba(0,0,0,0.10)' : accentData.border);

  return (
    <div
      data-widget
      data-widget-theme={dark ? 'dark' : 'light'}
      style={{
        position: 'fixed', left: position.x, top: position.y,
        zIndex: 7, userSelect: 'none', width,
        transition: 'width 0.22s cubic-bezier(0.34,1.56,0.64,1)',
      }}
      onMouseDown={onMouseDown}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }); }}
      className="cursor-grab active:cursor-grabbing"
    >
      <div
        className="rounded-2xl shadow-2xl"
        style={{
          backgroundColor: surfaceBg,
          backgroundImage: accentData.bg
            ? `linear-gradient(135deg, ${accentData.bg} 0%, transparent 65%)`
            : 'none',
          border: `1px solid ${surfaceBorder}`,
          backdropFilter: opacity < 100 ? 'blur(24px) saturate(160%)' : undefined,
          WebkitBackdropFilter: opacity < 100 ? 'blur(24px) saturate(160%)' : undefined,
          transition: 'background-color 0.2s, border-color 0.2s, background-image 0.2s',
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
      {menu && (
        <WidgetMenu
          x={menu.x} y={menu.y} currentCols={cols}
          currentAccent={accent} currentOpacity={opacity}
          onResize={(c) => { resizeWidget(id, c); setMenu(null); }}
          onAccentChange={(a) => { updateWidget(id, { accent: a }); setMenu(null); }}
          onOpacityChange={(o) => { updateWidget(id, { opacity: o }); setMenu(null); }}
          onRemove={() => { removeWidget(id); setMenu(null); }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

/* ── clock ── */
function ClockWidget({ id, position, cols, accent, opacity, settings = {} }) {
  const { format = '12h', showSeconds = true, showDate = true } = settings;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeOpts = { hour: '2-digit', minute: '2-digit', hour12: format === '12h' };
  const time = now.toLocaleTimeString([], timeOpts);
  const secs = now.toLocaleTimeString([], { second: '2-digit' }).slice(-2);
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <Shell id={id} position={position} label="Clock" cols={cols} accent={accent} opacity={opacity}>
      <div className="px-3.5 pb-3.5">
        <div className="flex items-end gap-1">
          <span className="text-[38px] font-black text-white/92 tabular-nums leading-none tracking-tight">{time}</span>
          {showSeconds && (
            <span className="text-[18px] font-bold text-white/30 tabular-nums leading-none mb-1">{secs}</span>
          )}
        </div>
        {showDate && <p className="text-[11px] text-white/35 mt-1">{date}</p>}
      </div>
    </Shell>
  );
}

/* ── study streak ── */
function StudyStreakWidget({ id, position, cols, accent, opacity, settings = {} }) {
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

  return (
    <Shell id={id} position={position} label="Study Streak" cols={cols} accent={accent} opacity={opacity}>
      <div className="px-3.5 pb-3.5">
        <div className="flex items-end gap-2">
          <Flame size={18} className="text-orange-400/80 mb-1 flex-shrink-0" />
          <span className="text-[38px] font-black text-white/90 tabular-nums leading-none">{current}</span>
          <span className="text-[13px] text-white/38 pb-1.5">days</span>
        </div>
        {weeklyDots && (
          <div className="flex items-center gap-1 mt-2 mb-1">
            {weeklyDots.map((active, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${active ? 'bg-orange-400/60' : 'bg-white/[0.08]'}`}
              />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          {showBest && <span className="text-[10px] text-white/28">Best: {longest}d</span>}
          {showStatus && (
            <span className={`ml-auto text-[9.5px] px-2 py-0.5 rounded-full ${activeToday ? 'bg-emerald-500/15 text-emerald-400/70' : 'bg-white/[0.05] text-white/22'}`}>
              {activeToday ? '✓ Active today' : 'Study to continue'}
            </span>
          )}
        </div>
      </div>
    </Shell>
  );
}

/* ── AI-generated custom widget ── */
function CustomWidget({ id, position, cols, config = {}, accent, opacity }) {
  const { label = 'Widget', width = 220, blocks = [] } = config;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!blocks.some(b => b.type === 'countdown')) return;
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, [blocks]);

  return (
    <Shell id={id} position={position} label={label} cols={cols} customWidth={width} accent={accent} opacity={opacity}>
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
function PomodoroWidget({ id, position, cols, accent, opacity, settings = {} }) {
  const { updateWidget } = useWidgets();
  const focusMin = settings.focusMin ?? 25;
  const breakMin = settings.breakMin ?? 5;
  const phase   = settings.phase   ?? 'focus';   // 'focus' | 'break'
  const running = settings.running ?? false;
  // `endsAt` is an absolute ms timestamp so the timer stays accurate even when
  // the widget unmounts or the tab is backgrounded. When paused, `remaining`
  // (ms) holds the leftover time.
  const endsAt    = settings.endsAt    ?? null;
  const remaining = settings.remaining ?? focusMin * 60_000;

  const [, force] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => force(n => n + 1), 250);
    return () => clearInterval(t);
  }, [running]);

  const msLeft = running && endsAt ? Math.max(0, endsAt - Date.now()) : remaining;
  const totalMs = (phase === 'focus' ? focusMin : breakMin) * 60_000;
  const pct = Math.max(0, Math.min(1, 1 - msLeft / totalMs));
  const mm = Math.floor(msLeft / 60_000);
  const ss = Math.floor((msLeft % 60_000) / 1000);

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

  const accentColor = phase === 'focus' ? '#f97316' : '#34d399';

  return (
    <Shell id={id} position={position} label={phase === 'focus' ? 'Focus' : 'Break'} cols={cols} accent={accent} opacity={opacity}>
      <div className="px-3.5 pb-3.5">
        <div className="flex items-end gap-1.5">
          <span className="text-[34px] font-black text-white/92 tabular-nums leading-none">
            {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
          </span>
        </div>
        <div className="h-[3px] rounded-full bg-white/[0.08] mt-2 overflow-hidden">
          <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${pct * 100}%`, background: accentColor }} />
        </div>
        <div data-nodrag className="flex items-center gap-1.5 mt-2.5">
          {running ? (
            <button onClick={pause} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-white/[0.10] text-white/75 hover:bg-white/[0.16] transition-colors">
              <Pause size={9} /> Pause
            </button>
          ) : (
            <button onClick={start} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-white/[0.10] text-white/75 hover:bg-white/[0.16] transition-colors">
              <Play size={9} /> Start
            </button>
          )}
          <button onClick={reset} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-white/[0.04] text-white/45 hover:bg-white/[0.10] hover:text-white/70 transition-colors">
            <RotateCcw size={9} /> Reset
          </button>
        </div>
      </div>
    </Shell>
  );
}

/* ── calendar (current month, today highlighted) ── */
function CalendarWidget({ id, position, cols, accent, opacity }) {
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

  return (
    <Shell id={id} position={position} label="Calendar" cols={cols} accent={accent} opacity={opacity}>
      <div className="px-3.5 pb-3">
        <p className="text-[11px] font-semibold text-white/80 mb-1.5">{monthName}</p>
        <div className="grid grid-cols-7 gap-y-0.5 text-center">
          {dayLetters.map((d, i) => (
            <span key={`h-${i}`} className="text-[8px] font-bold uppercase text-white/25 tracking-wider">{d}</span>
          ))}
          {cells.map((d, i) => {
            const isToday = d === today.getDate();
            return (
              <span
                key={i}
                className={`text-[9.5px] tabular-nums leading-[14px] ${
                  d == null ? 'text-transparent' :
                  isToday   ? 'text-white font-bold' :
                              'text-white/55'
                }`}
                style={isToday ? {
                  background: 'rgba(96,165,250,0.85)', borderRadius: 4, display: 'inline-block', minWidth: 14,
                } : undefined}
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
function QuickNoteWidget({ id, position, cols, accent, opacity, settings = {} }) {
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

  return (
    <Shell id={id} position={position} label="Note" cols={cols} accent={accent} opacity={opacity}>
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
          className="w-full bg-transparent text-[12px] text-white/80 placeholder-white/25 resize-none outline-none leading-snug"
          style={{ minHeight: cols >= 2 ? 92 : 76, fontFamily: 'inherit', cursor: 'text', userSelect: 'text' }}
        />
      </div>
    </Shell>
  );
}

/* ── calculator (4-function, keyboard friendly) ── */
function CalculatorWidget({ id, position, cols, accent, opacity }) {
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

  const Btn = ({ label, onClick, accentBtn }) => (
    <button
      onClick={onClick}
      className={`rounded-md text-[11px] font-semibold transition-colors ${
        accentBtn ? 'bg-white/[0.14] text-white/85 hover:bg-white/[0.20]' : 'bg-white/[0.05] text-white/75 hover:bg-white/[0.10]'
      }`}
      style={{ height: 22 }}
    >{label}</button>
  );

  return (
    <Shell id={id} position={position} label="Calculator" cols={cols} accent={accent} opacity={opacity}>
      <div className="px-3 pb-3" data-nodrag>
        <div className="text-right text-[20px] font-black text-white/90 tabular-nums px-1 py-1 truncate">{display}</div>
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
function TodoWidget({ id, position, cols, accent, opacity, settings = {} }) {
  const { updateWidget } = useWidgets();
  const items = Array.isArray(settings.items) ? settings.items : [];
  const [draft, setDraft] = useState('');

  function commit(next) { updateWidget(id, { settings: { ...settings, items: next } }); }
  function add() {
    const text = draft.trim();
    if (!text) return;
    commit([...items, { text, done: false, id: Date.now() }].slice(0, 8));
    setDraft('');
  }
  function toggle(i)  { commit(items.map((it, j) => j === i ? { ...it, done: !it.done } : it)); }
  function remove(i)  { commit(items.filter((_, j) => j !== i)); }

  return (
    <Shell id={id} position={position} label="Tasks" cols={cols} accent={accent} opacity={opacity}>
      <div className="px-3 pb-3" data-nodrag>
        <ul className="space-y-1 mb-1.5">
          {items.length === 0 && <li className="text-[10.5px] text-white/30 italic px-0.5">Nothing yet — add a task.</li>}
          {items.map((it, i) => (
            <li key={it.id ?? i} className="flex items-center gap-1.5 group">
              <button
                onClick={() => toggle(i)}
                className={`w-3 h-3 rounded-[3px] border flex-shrink-0 transition-colors ${
                  it.done ? 'bg-emerald-400/70 border-emerald-400/70' : 'border-white/30 hover:border-white/55'
                }`}
                aria-label={it.done ? 'Mark not done' : 'Mark done'}
              />
              <span className={`text-[11px] flex-1 truncate ${it.done ? 'text-white/30 line-through' : 'text-white/80'}`}>{it.text}</span>
              <button onClick={() => remove(i)} className="text-white/15 hover:text-white/55 opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={9} />
              </button>
            </li>
          ))}
        </ul>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder="Add a task…"
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-2 py-1 text-[11px] text-white/75 placeholder-white/22 outline-none focus:border-white/[0.18]"
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
function QuoteWidget({ id, position, cols, accent, opacity }) {
  // Stable across the day — index from the day-of-year so it rotates daily.
  const day = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const q = QUOTES[day % QUOTES.length];
  return (
    <Shell id={id} position={position} label="Quote" cols={cols} accent={accent} opacity={opacity}>
      <div className="px-3.5 pb-3.5">
        <p className="text-[13px] text-white/85 leading-snug italic">&ldquo;{q.text}&rdquo;</p>
        <p className="text-[10px] text-white/35 mt-1.5">— {q.by}</p>
      </div>
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
};

export default function DesktopWidgets() {
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
            accent={w.accent}
            opacity={w.opacity ?? 100}
            settings={w.settings || {}}
          />
        );
        if (w.type?.startsWith('custom_')) return (
          <CustomWidget
            key={w.id}
            id={w.id}
            position={w.position}
            cols={w.cols ?? 1}
            config={w.config}
            accent={w.accent}
            opacity={w.opacity ?? 100}
          />
        );
        return null;
      })}
    </>
  );
}
