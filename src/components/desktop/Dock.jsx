import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Clock, Flame, X, Settings2, RotateCcw, Timer, Calendar as CalendarIcon, StickyNote, Quote, Calculator, ListChecks, Sparkles } from 'lucide-react';
import { useWidgets } from '../../context/WidgetContext';
import APP_REGISTRY from './appRegistry';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import { checkAdmin } from '../../api/admin';
import { Z } from '../../styles/tokens';


// macOS-style floating dock.
//
//   • Centered glass pill at the bottom, ~8px above the screen edge
//   • Squircle (rounded-[13px]) app icons with a soft drop-shadow
//   • Magnification: icons grow as the cursor approaches them, peaking
//     ~1.45× at center. Mouseleave releases the scale instantly.
//   • Running indicator: a small white pip (3px) below open apps, with
//     reserved space so the row doesn't shift when something opens.
//   • Tooltip with the app label floats above the hovered icon.
//
// The search button + clock that the Win11 taskbar carried have moved
// out — Spotlight has its own keyboard shortcut (⌘K) plus a magnifier
// in the menu bar, and the clock lives in the menu bar too. The dock
// only carries Launchpad → pinned apps → Settings → Widgets.

// Icon base sizes by dockSize preference. Magnification scales these
// up to MAGNIFY_MAX, so the actual pill height accommodates the peak.
const DOCK_SIZES = { small: 40, medium: 50, large: 60 };
const MAGNIFY_RADIUS = 120;
const MAGNIFY_MAX = 1.45;

function DockIcon({ app, mouseX, isOpen, isActive, onClick, size, iconStyle }) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const iconRef = useRef(null);
  const Icon = app.icon;

  // Distance-based scale: peaks at 1× MAGNIFY_MAX when the cursor is at
  // the icon's center, eases to 1 at MAGNIFY_RADIUS, clamps to 1 beyond.
  let scale = 1;
  if (mouseX !== null && iconRef.current) {
    const r = iconRef.current.getBoundingClientRect();
    const center = r.left + r.width / 2;
    const distance = Math.abs(mouseX - center);
    if (distance < MAGNIFY_RADIUS) {
      const t = 1 - distance / MAGNIFY_RADIUS;
      scale = 1 + (MAGNIFY_MAX - 1) * t;
    }
  }
  const iconSize = Math.max(18, Math.round(size * 0.62));

  return (
    <div className="relative flex flex-col items-center" ref={iconRef}>
      {tooltipVisible && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-[#1f1f1f]/95 text-white text-[11px] font-medium whitespace-nowrap pointer-events-none z-10 shadow-[0_4px_12px_rgba(0,0,0,0.4)] border border-white/[0.08]">
          {app.label}
        </div>
      )}
      <button
        onClick={onClick}
        onMouseEnter={() => setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        data-tour={app.id === 'curricula' ? 'curricula-icon' : undefined}
        className="dock-icon flex items-center justify-center rounded-[13px] shadow-[0_4px_10px_rgba(0,0,0,0.25)] transition-transform duration-100 ease-out focus:outline-none focus-visible:ring-1 focus-visible:ring-white/25"
        style={{
          width: size,
          height: size,
          transform: `scale(${scale})`,
          transformOrigin: 'bottom center',
        }}
      >
        <div
          className={`w-full h-full rounded-[13px] flex items-center justify-center ${
            iconStyle === 'mono' ? 'bg-[#2a2a2e]' :
            iconStyle === 'glass' ? 'border border-white/20' :
            iconStyle === 'accent' ? '' :
            `bg-gradient-to-br ${app.gradient}`
          }`}
          style={
            iconStyle === 'glass'  ? { background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' } :
            iconStyle === 'accent' ? { backgroundColor: `${app.color}22`, border: `1px solid ${app.color}44` } :
            undefined
          }
        >
          <Icon
            size={iconSize}
            className={iconStyle === 'accent' ? 'drop-shadow-sm' : 'text-white drop-shadow-sm'}
            style={iconStyle === 'accent' ? { color: app.color } : undefined}
          />
        </div>
      </button>
      {/* macOS running-app indicator. 3px white pip below the icon, with
          reserved row height so the layout doesn't shift on open/close.
          Active app gets a brighter, slightly larger pip. */}
      <div className="h-1.5 mt-1 flex items-center justify-center">
        {isOpen && (
          <span
            className={`rounded-full transition-all ${
              isActive
                ? 'w-[4px] h-[4px] bg-white shadow-[0_0_4px_rgba(255,255,255,0.7)]'
                : 'w-[3px] h-[3px] bg-white/70'
            }`}
          />
        )}
      </div>
    </div>
  );
}

const WIDGET_CATALOG = [
  { type: 'clock',      label: 'Clock',        icon: Clock,        desc: 'Date & time' },
  { type: 'streak',     label: 'Study Streak', icon: Flame,        desc: 'Daily streak count' },
  { type: 'pomodoro',   label: 'Pomodoro',     icon: Timer,        desc: '25/5 focus timer' },
  { type: 'calendar',   label: 'Calendar',     icon: CalendarIcon, desc: 'This month at a glance' },
  { type: 'note',       label: 'Quick Note',   icon: StickyNote,   desc: 'Saves into the Notes app' },
  { type: 'todo',       label: 'Tasks',        icon: ListChecks,   desc: 'Quick checklist' },
  { type: 'quote',      label: 'Daily Quote',  icon: Quote,        desc: 'A fresh quote every day' },
  { type: 'calculator', label: 'Calculator',   icon: Calculator,   desc: 'Four-function calc' },
];

// Group widgets by the app they relate to. The gallery shows one section per
// app, each with 1-2 widgets — so users browse "what widgets go with Notes?"
// instead of scrolling a flat catalog.
const WIDGET_GROUPS = [
  { appId: 'curricula', label: 'Curricula',  types: ['calendar', 'streak']      },
  { appId: 'notes',     label: 'Notes',      types: ['note', 'todo']            },
  { appId: 'lessons',   label: 'Lessons',    types: ['pomodoro']                },
  { appId: 'mathtutor', label: 'Math Tutor', types: ['calculator']              },
  { appId: 'study',     label: 'Study Mode', types: ['quote']                   },
  { appId: 'system',    label: 'System',     types: ['clock']                   },
];

/* ── widget mini-previews rendered inside the picker ── */
function WidgetPreview({ type }) {
  const [now] = useState(() => new Date());
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  if (type === 'clock') return (
    <div className="w-full h-full flex flex-col justify-center px-3">
      <div className="flex items-end gap-1">
        <span className="text-[22px] font-black text-white/85 tabular-nums leading-none">{time}</span>
      </div>
      <p className="text-[9px] text-white/35 mt-0.5">{date}</p>
    </div>
  );

  if (type === 'streak') return (
    <div className="w-full h-full flex flex-col justify-center px-3">
      <div className="flex items-end gap-1.5">
        <Flame size={14} className="text-orange-400/70 mb-0.5" />
        <span className="text-[22px] font-black text-white/85 tabular-nums leading-none">7</span>
        <span className="text-[9px] text-white/35 pb-1">days</span>
      </div>
      <p className="text-[8px] text-white/25 mt-0.5">Best: 14d</p>
    </div>
  );

  if (type === 'pomodoro') return (
    <div className="w-full h-full flex flex-col justify-center px-3">
      <span className="text-[20px] font-black text-white/85 tabular-nums leading-none">25:00</span>
      <div className="h-[3px] rounded-full bg-white/10 mt-1.5 overflow-hidden">
        <div className="h-full w-1/3 rounded-full" style={{ background: '#f97316' }} />
      </div>
      <p className="text-[8px] text-white/30 mt-1">Focus · Break</p>
    </div>
  );

  if (type === 'calendar') {
    const today = new Date();
    return (
      <div className="w-full h-full flex flex-col justify-center px-3">
        <p className="text-[8px] uppercase tracking-wider text-white/30">
          {today.toLocaleDateString([], { month: 'short' })}
        </p>
        <span className="text-[22px] font-black text-white/85 tabular-nums leading-none">{today.getDate()}</span>
        <p className="text-[8px] text-white/35 mt-0.5">{today.toLocaleDateString([], { weekday: 'long' })}</p>
      </div>
    );
  }

  if (type === 'note') return (
    <div className="w-full h-full flex flex-col justify-center px-3 gap-0.5">
      <div className="h-1 w-3/4 rounded-full bg-white/30" />
      <div className="h-1 w-2/3 rounded-full bg-white/20" />
      <div className="h-1 w-1/2 rounded-full bg-white/15" />
      <p className="text-[8px] text-white/35 mt-1">Jot something…</p>
    </div>
  );

  if (type === 'quote') return (
    <div className="w-full h-full flex flex-col justify-center px-3">
      <p className="text-[10px] text-white/75 italic leading-tight">&ldquo;Slow is smooth, smooth is fast.&rdquo;</p>
      <p className="text-[8px] text-white/30 mt-1">— Navy SEAL adage</p>
    </div>
  );

  if (type === 'calculator') return (
    <div className="w-full h-full flex flex-col justify-center px-3">
      <p className="text-right text-[18px] font-black text-white/85 tabular-nums leading-none">128</p>
      <div className="grid grid-cols-4 gap-0.5 mt-1">
        {['÷','×','−','+'].map(s => (
          <div key={s} className="h-1.5 rounded-sm bg-white/15" />
        ))}
      </div>
    </div>
  );

  if (type === 'todo') return (
    <div className="w-full h-full flex flex-col justify-center px-3 gap-1">
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-[2px] bg-emerald-400/70" />
        <div className="h-1 flex-1 rounded-full bg-white/15" />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-[2px] border border-white/30" />
        <div className="h-1 flex-1 rounded-full bg-white/20" />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-[2px] border border-white/30" />
        <div className="h-1 w-2/3 rounded-full bg-white/15" />
      </div>
    </div>
  );

  return null;
}

/* ── tiny toggle switch ── */
function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      data-nodrag
      onClick={onChange}
      className={`relative flex-shrink-0 rounded-full transition-colors ${checked ? 'bg-blue-500/55' : 'bg-white/[0.12]'}`}
      style={{ width: 28, height: 16 }}
    >
      <span
        className="absolute top-[2px] w-3 h-3 rounded-full bg-white shadow-sm transition-all"
        style={{ left: checked ? 14 : 2 }}
      />
    </button>
  );
}

function SystemTrayIcons() {
  const { widgets, addWidget, removeWidget, updateWidget, snapGrid, toggleSnapGrid } = useWidgets();
  const { theme } = useUIPreference();
  const dark = theme !== 'light';
  const [open, setOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [popupPos, setPopupPos] = useState({ right: 8, bottom: 56 });
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  // 'all' shows every section; a specific appId scrolls/filters to that group.
  const [appFilter, setAppFilter] = useState('all');
  const buttonRef = useRef(null);
  const popupRef = useRef(null);
  const activeWidgetMap = Object.fromEntries(widgets.filter(w => !w.type?.startsWith('custom_')).map(w => [w.type, w]));
  const customWidgets = widgets.filter(w => w.type?.startsWith('custom_'));

  useEffect(() => {
    if (!open) return;
    function close(e) {
      if (popupRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return;
      setOpen(false);
      setEditingType(null);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function toggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPopupPos({
        right: window.innerWidth - rect.right,
        bottom: window.innerHeight - rect.top + 10,
      });
    }
    setOpen(p => !p);
    setEditingType(null);
  }

  async function generateWidget() {
    const prompt = aiPrompt.trim();
    if (!prompt || aiGenerating) return;
    setAiGenerating(true);
    setAiError('');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Create a desktop widget: ${prompt}` }],
          // Strict prompt: the previous version let Gemini leak self-correction
          // chatter before the JSON, which then exceeded max_tokens and left an
          // unclosed object that JSON.parse rejected.
          system: `You output a JSON object only. No markdown, no prose, no self-correction, no explanation. Start with { and end with }.

Schema:
{
  "label": string (max 18 chars),
  "width": number (160-280),
  "blocks": array of block objects
}

Block types (pick the ones that fit):
- { "type": "heading",   "text": string }
- { "type": "subtext",   "text": string }
- { "type": "note",      "text": string }
- { "type": "stat",      "value": string, "label": string }
- { "type": "countdown", "target": "YYYY-MM-DD", "label": string }
- { "type": "progress",  "label": string, "percent": number }
- { "type": "list",      "items": string[] (max 5) }

Today is ${new Date().toISOString().slice(0, 10)}. Output the JSON now.`,
          max_tokens: 900,
          // Gemini 3.x burns the entire token budget on hidden CoT thinking
          // by default — without these the visible output was truncated to
          // ~70 chars, well before the closing brace.
          jsonMode: true,
          disableThinking: true,
        }),
      });
      const data = await res.json();
      const text = (data?.content?.[0]?.text || data?.text || '').trim();
      // Greedy match grabs from the first `{` to the last `}`, so any
      // surrounding chatter is stripped.
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('bad response');
      const config = JSON.parse(jsonMatch[0]);
      if (!config.label || !Array.isArray(config.blocks)) throw new Error('invalid schema');
      addWidget(`custom_${Date.now()}`, { config });
      setAiPrompt('');
      // Land the user on the My Widgets tab so they immediately see what they
      // just made (and can remove it if it's wrong).
      setAppFilter('mine');
    } catch {
      setAiError('Could not generate widget — try rephrasing.');
    } finally {
      setAiGenerating(false);
    }
  }

  return (
    <>
      {open && (
        <div
          ref={popupRef}
          data-dock-theme={dark ? 'dark' : 'light'}
          style={{
            position: 'fixed',
            right: popupPos.right,
            bottom: popupPos.bottom,
            zIndex: 9999,
            background: dark ? '#131316' : 'rgba(248, 248, 252, 0.97)',
            width: 360,
            height: 520,
            display: 'flex',
            flexDirection: 'column',
            border: dark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(0,0,0,0.11)',
            boxShadow: dark
              ? '0 20px 60px rgba(0,0,0,0.6)'
              : '0 20px 48px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.08)',
          }}
          className="rounded-2xl overflow-hidden"
        >
          {/* header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <span className="text-[11px] font-semibold text-white/70 tracking-wide">Widget Gallery</span>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSnapGrid}
                aria-pressed={snapGrid}
                title={snapGrid ? 'Snap to grid: ON' : 'Snap to grid: OFF'}
                className={`flex items-center justify-center rounded-md border transition-colors ${
                  snapGrid
                    ? 'bg-white/[0.10] text-white/80 border-white/[0.18]'
                    : 'bg-white/[0.02] text-white/30 border-white/[0.06] hover:text-white/55 hover:border-white/15'
                }`}
                style={{ width: 22, height: 22 }}
              >
                <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
                  <rect x="0.5" y="0.5" width="3.5" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="0.9"/>
                  <rect x="6"   y="0.5" width="3.5" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="0.9"/>
                  <rect x="0.5" y="6"   width="3.5" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="0.9"/>
                  <rect x="6"   y="6"   width="3.5" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="0.9"/>
                </svg>
              </button>
              <button onClick={() => setOpen(false)} className="text-white/25 hover:text-white/60 transition-colors">
                <X size={13} />
              </button>
            </div>
          </div>

          {/* tab chips — "My Widgets" plus one per related app */}
          <div className="px-3 pb-2.5 flex items-center gap-1 flex-wrap">
            {[
              { appId: 'mine', label: 'My Widgets' },
              { appId: 'all',  label: 'All' },
              ...WIDGET_GROUPS,
            ].map(g => {
              const isActive = appFilter === g.appId;
              return (
                <button
                  key={g.appId}
                  onClick={() => setAppFilter(g.appId)}
                  className={`px-2 py-0.5 rounded-md text-[10px] border transition-colors ${
                    isActive
                      ? 'bg-white/[0.10] text-white/85 border-white/[0.18]'
                      : 'bg-white/[0.02] text-white/40 border-white/[0.06] hover:text-white/65 hover:border-white/15'
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>

          {/* widget list — grouped by related app, scrollable middle */}
          <div className="px-3 pb-3 space-y-2.5 flex-1 min-h-0 overflow-y-auto">
          {appFilter === 'mine' ? (
            <div>
              <p className="text-[8.5px] font-bold uppercase tracking-[0.18em] text-white/30 mb-1.5 pl-0.5">Active on your desktop</p>
              {widgets.length === 0 && (
                <p className="text-[11px] text-white/35 italic px-1 py-2">No widgets yet. Pick one from a tab above or describe one below.</p>
              )}
              <div className="space-y-1">
                {widgets.map(w => {
                  const meta = WIDGET_CATALOG.find(c => c.type === w.type);
                  const label = meta?.label ?? (w.config?.label || 'Custom Widget');
                  const isCustom = w.type?.startsWith('custom_');
                  const Icon = meta?.icon || Sparkles;
                  return (
                    <div key={w.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02]">
                      <Icon size={11} className={isCustom ? 'text-violet-300/80' : 'text-white/55'} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] font-semibold text-white/80 truncate">{label}</p>
                        {isCustom && <p className="text-[9px] text-violet-300/55 truncate">AI generated</p>}
                      </div>
                      <button
                        onClick={() => removeWidget(w.id)}
                        title="Remove"
                        className="text-white/20 hover:text-red-400/70 transition-colors flex-shrink-0"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
          WIDGET_GROUPS.filter(g => appFilter === 'all' || g.appId === appFilter).map(group => (
          <div key={group.appId}>
            <p className="text-[8.5px] font-bold uppercase tracking-[0.18em] text-white/30 mb-1.5 pl-0.5">
              {group.label}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
            {group.types.map(t => WIDGET_CATALOG.find(w => w.type === t)).filter(Boolean).map(({ type, label, desc }) => {
              const active = !!activeWidgetMap[type];
              const editing = editingType === type;
              return (
                <div
                  key={type}
                  className={`rounded-xl border transition-all overflow-hidden flex flex-col ${
                    editing ? 'border-white/[0.16] bg-white/[0.05]' : 'border-white/[0.07] bg-white/[0.02]'
                  }`}
                >
                  <div className="p-1.5">
                    <div
                      className="rounded-lg border border-white/[0.08] overflow-hidden"
                      style={{ height: 56, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)' }}
                    >
                      <WidgetPreview type={type} />
                    </div>
                    <p className="text-[11.5px] font-semibold text-white/85 leading-tight mt-1.5 px-0.5 truncate">{label}</p>
                    <p className="text-[9px] text-white/35 mt-0.5 px-0.5 truncate">{desc}</p>
                    <div className="flex items-center gap-1 mt-1.5 px-0.5">
                      {active ? (
                        <>
                          <button
                            onClick={() => setEditingType(editing ? null : type)}
                            title="Edit"
                            className={`flex items-center justify-center rounded-md text-[10px] transition-colors ${
                              editing ? 'bg-white/[0.12] text-white/80' : 'bg-white/[0.06] text-white/45 hover:bg-white/[0.10] hover:text-white/70'
                            }`}
                            style={{ width: 22, height: 20 }}
                          >
                            <Settings2 size={9} />
                          </button>
                          <button
                            onClick={() => { removeWidget(activeWidgetMap[type].id); setEditingType(null); }}
                            title="Remove"
                            className="flex items-center justify-center rounded-md bg-white/[0.04] text-white/35 hover:bg-red-500/[0.15] hover:text-red-400/80 transition-colors"
                            style={{ width: 22, height: 20 }}
                          >
                            <X size={9} />
                          </button>
                          <span className="ml-auto text-[8.5px] text-white/22 font-medium uppercase tracking-wide">On</span>
                        </>
                      ) : (
                        <button
                          onClick={() => addWidget(type)}
                          className="flex items-center justify-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-white/[0.08] text-white/60 hover:bg-white/[0.14] hover:text-white/90 transition-colors w-full"
                        >
                          <Plus size={9} />
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                  {editing && (
                    <div className="border-t border-white/[0.07] px-3 pt-3 pb-2.5 space-y-3">

                      {/* ── Clock settings ── */}
                      {type === 'clock' && (() => {
                        const w = activeWidgetMap['clock'];
                        const s = w?.settings || {};
                        const fmt        = s.format       ?? '12h';
                        const showSecs   = s.showSeconds  ?? true;
                        const showDate   = s.showDate     ?? true;
                        const upd = (patch) => updateWidget(w.id, { settings: { ...s, ...patch } });
                        return (
                          <>
                            <div>
                              <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-white/22 mb-1.5">Time Format</p>
                              <div className="flex gap-1.5">
                                {['12h', '24h'].map(f => (
                                  <button
                                    key={f}
                                    onClick={() => upd({ format: f })}
                                    className={`px-3 py-0.5 rounded-md text-[10px] border transition-colors ${fmt === f ? 'bg-blue-500/15 text-blue-300/90 border-blue-500/30' : 'bg-white/[0.03] text-white/35 border-white/[0.07] hover:text-white/60 hover:border-white/[0.14]'}`}
                                  >{f}</button>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-white/45">Show seconds</span>
                              <ToggleSwitch checked={showSecs} onChange={() => upd({ showSeconds: !showSecs })} />
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-white/45">Show date</span>
                              <ToggleSwitch checked={showDate} onChange={() => upd({ showDate: !showDate })} />
                            </div>
                          </>
                        );
                      })()}

                      {/* ── Streak settings ── */}
                      {type === 'streak' && (() => {
                        const w = activeWidgetMap['streak'];
                        const s = w?.settings || {};
                        const showBest    = s.showBest    ?? true;
                        const showStatus  = s.showStatus  ?? true;
                        const showWeekly  = s.showWeekly  ?? false;
                        const upd = (patch) => updateWidget(w.id, { settings: { ...s, ...patch } });
                        return (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-white/45">Weekly activity bar</span>
                              <ToggleSwitch checked={showWeekly} onChange={() => upd({ showWeekly: !showWeekly })} />
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-white/45">Show best streak</span>
                              <ToggleSwitch checked={showBest} onChange={() => upd({ showBest: !showBest })} />
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-white/45">Show active status</span>
                              <ToggleSwitch checked={showStatus} onChange={() => upd({ showStatus: !showStatus })} />
                            </div>
                          </>
                        );
                      })()}

                      {/* ── Reset position (all types) ── */}
                      <button
                        onClick={() => {
                          const w = activeWidgetMap[type];
                          if (w) removeWidget(w.id);
                          setTimeout(() => addWidget(type), 10);
                          setEditingType(null);
                        }}
                        className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/60 transition-colors pt-0.5"
                      >
                        <RotateCcw size={9} />
                        Reset position
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>
          ))
          )}

            {/* custom widgets from AI — show under the catalog when not on the "mine" tab */}
            {appFilter !== 'mine' && customWidgets.length > 0 && (
              <div>
                <p className="text-[8.5px] font-bold uppercase tracking-[0.18em] text-white/30 mb-1.5 pl-0.5">AI Created</p>
                <div className="space-y-1">
                  {customWidgets.map(w => (
                    <div key={w.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02]">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] font-semibold text-white/75 truncate">{w.config?.label || 'Custom Widget'}</p>
                      </div>
                      <button
                        onClick={() => removeWidget(w.id)}
                        className="text-white/20 hover:text-red-400/70 transition-colors flex-shrink-0"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* AI Create — pinned to the bottom of the hub */}
          <div className="border-t border-white/[0.07] px-3 pt-2.5 pb-3 flex-shrink-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25 mb-1.5">AI Create</p>
            <div className="flex gap-1.5">
              <input
                data-nodrag
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') generateWidget(); }}
                placeholder="Describe a widget…"
                className="flex-1 bg-white/[0.05] border border-white/[0.09] rounded-lg px-2.5 py-1 text-[11.5px] text-white/75 placeholder:text-white/22 outline-none focus:border-white/[0.20] transition-colors"
                style={{ cursor: 'text', userSelect: 'text' }}
              />
              <button
                onClick={generateWidget}
                disabled={aiGenerating || !aiPrompt.trim()}
                className="px-2.5 py-1 rounded-lg bg-white/[0.07] text-white/50 hover:bg-white/[0.13] hover:text-white/80 disabled:opacity-30 disabled:cursor-default transition-colors text-[12px] flex-shrink-0"
              >
                {aiGenerating ? '…' : '→'}
              </button>
            </div>
            {aiError && <p className="text-[10px] text-red-400/60 mt-1">{aiError}</p>}
          </div>
        </div>
      )}
      <button
        ref={buttonRef}
        onClick={toggle}
        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
        aria-label="Widgets"
      >
        <Plus size={12} strokeWidth={2.2} className="text-white/60" />
      </button>
    </>
  );
}

export default function Dock(_props) {
  const { state, openApp, restoreWindow, focusWindow } = useWindowManager();
  const { dockSize, iconStyle, theme } = useUIPreference();
  const dark = theme !== 'light';
  const size = DOCK_SIZES[dockSize] || 50;

  const [isAdmin, setIsAdmin] = useState(false);
  // Cursor x-position, tracked while the pointer is inside the dock.
  // Each DockIcon reads this on every render to compute its scale —
  // when null (mouse left the dock) every icon snaps back to base size.
  const [mouseX, setMouseX] = useState(null);
  const handleMouseMove = useCallback((e) => setMouseX(e.clientX), []);
  const handleMouseLeave = useCallback(() => setMouseX(null), []);
  useEffect(() => { checkAdmin().then(d => setIsAdmin(d.isAdmin)).catch(() => {}); }, []);

  const mainApps = APP_REGISTRY.filter(a => {
    if (['settings', 'newcurriculum'].includes(a.id)) return false;
    if (a.adminOnly && !isAdmin) return false;
    return true;
  });
  const utilApps = APP_REGISTRY.filter(a => a.id === 'settings');
  const openAppIds = new Set(Object.values(state.windows).map(w => w.appId));
  const activeAppId = state.activeWindowId ? state.windows[state.activeWindowId]?.appId : null;

  function handleIconClick(app) {
    const existing = Object.values(state.windows).find(w => w.appId === app.id);
    if (existing?.isMinimized) restoreWindow(existing.id);
    else if (existing) focusWindow(existing.id);
    else openApp(app.id, app.label, true);
  }

  return (
    <>
      {/* macOS-style floating dock. Centered glass pill, ~8px above the
          screen edge. Hugs its content (no flex-1 spacers) so the pill
          width tracks the icon count. Icons magnify on cursor proximity
          via mouseX — see DockIcon. The pill height fits the base icon
          + the indicator row; magnified icons grow upward and out of
          the pill, the way macOS does it. */}
      <div
        data-dock-theme={dark ? 'dark' : 'light'}
        className="fixed bottom-2 left-1/2 -translate-x-1/2 flex items-end px-3 pt-2 pb-1.5 gap-2 rounded-2xl transition-colors"
        style={{
          zIndex: Z.dock,
          background: dark ? 'rgba(28, 28, 34, 0.55)' : 'rgba(245, 245, 247, 0.55)',
          border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(0,0,0,0.08)',
          boxShadow: dark
            ? '0 12px 32px rgba(0,0,0,0.45), 0 0 0 0.5px rgba(255,255,255,0.04) inset'
            : '0 12px 32px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(255,255,255,0.40) inset',
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* ── Pinned apps ── */}
        {mainApps.map(app => (
          <DockIcon
            key={app.id}
            app={app}
            mouseX={mouseX}
            isOpen={openAppIds.has(app.id)}
            isActive={activeAppId === app.id}
            onClick={() => handleIconClick(app)}
            size={size}
            iconStyle={iconStyle}
          />
        ))}

        {/* ── Divider before utilities ── */}
        <div className="w-px bg-white/[0.12] self-center" style={{ height: size * 0.6 }} />

        {/* ── Settings ── */}
        {utilApps.map(app => (
          <DockIcon
            key={app.id}
            app={app}
            mouseX={mouseX}
            isOpen={openAppIds.has(app.id)}
            isActive={activeAppId === app.id}
            onClick={() => handleIconClick(app)}
            size={size}
            iconStyle={iconStyle}
          />
        ))}

        {/* ── Widgets tray (+) ── */}
        <div className="w-px bg-white/[0.12] self-center" style={{ height: size * 0.6 }} />
        <div className="flex flex-col items-center">
          <SystemTrayIcons />
          <div className="h-1.5 mt-1" />
        </div>
      </div>
    </>
  );
}
