import { useState } from 'react';
import {
  X, Plus, Clock, Flame, Timer, Calendar as CalendarIcon,
  StickyNote, Quote, Calculator, ListChecks, Sparkles,
  Settings2, RotateCcw,
} from 'lucide-react';
import { useWidgets } from '../../../context/WidgetContext';

// ── Widget catalog ──────────────────────────────────────────────────
// The set of built-in widget types the user can add. AI-generated
// widgets bypass this list — they live under `custom_*` types and
// surface in the "AI Created" group.
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

// Group widgets by the app they relate to. The gallery shows one
// section per app, each with 1-2 widgets — so users browse "what
// widgets go with Notes?" instead of scrolling a flat catalog.
const WIDGET_GROUPS = [
  { appId: 'curricula', label: 'Curricula',  types: ['calendar', 'streak']      },
  { appId: 'notes',     label: 'Notes',      types: ['note', 'todo']            },
  { appId: 'lessons',   label: 'Lessons',    types: ['pomodoro']                },
  { appId: 'mathtutor', label: 'Math Tutor', types: ['calculator']              },
  { appId: 'study',     label: 'Study Mode', types: ['quote']                   },
  { appId: 'system',    label: 'System',     types: ['clock']                   },
];

// ── Mini previews rendered inside each catalog tile ─────────────────
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

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
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

// ── Widgets app ─────────────────────────────────────────────────────
// Used to be a floating popup glued to the dock's + button. Now lives
// in a proper fixed-size window opened via openApp('widgets'). The
// content is unchanged — tabs, catalog grid, AI generator — minus the
// outer chrome (the Window component provides title bar + close).
export default function WidgetsApp() {
  const { widgets, addWidget, removeWidget, updateWidget, snapGrid, toggleSnapGrid } = useWidgets();
  const [editingType, setEditingType] = useState(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [appFilter, setAppFilter] = useState('all');
  const activeWidgetMap = Object.fromEntries(widgets.filter(w => !w.type?.startsWith('custom_')).map(w => [w.type, w]));
  const customWidgets = widgets.filter(w => w.type?.startsWith('custom_'));

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
          jsonMode: true,
          disableThinking: true,
        }),
      });
      const data = await res.json();
      const text = (data?.content?.[0]?.text || data?.text || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('bad response');
      const config = JSON.parse(jsonMatch[0]);
      if (!config.label || !Array.isArray(config.blocks)) throw new Error('invalid schema');
      addWidget(`custom_${Date.now()}`, { config });
      setAiPrompt('');
      setAppFilter('mine');
    } catch {
      setAiError('Could not generate widget — try rephrasing.');
    } finally {
      setAiGenerating(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#131316] text-white">
      {/* Top row — title + snap-to-grid toggle */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
        <span className="text-[11px] font-semibold text-white/70 tracking-wide">Widget Gallery</span>
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
      </div>

      {/* Tab chips */}
      <div className="px-3 pb-2.5 flex items-center gap-1 flex-wrap flex-shrink-0">
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

      {/* Widget list — scrollable middle */}
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
                          style={{ height: 56, background: 'rgba(255,255,255,0.03)' }}
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

        {/* Custom AI widgets under the catalog when not on "mine" */}
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

      {/* AI Create — pinned to the bottom */}
      <div className="border-t border-white/[0.07] px-3 pt-2.5 pb-3 flex-shrink-0">
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25 mb-1.5">AI Create</p>
        <div className="flex gap-1.5">
          <input
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') generateWidget(); }}
            placeholder="Describe a widget…"
            className="flex-1 bg-white/[0.05] border border-white/[0.09] rounded-lg px-2.5 py-1 text-[11.5px] text-white/75 placeholder:text-white/22 outline-none focus:border-white/[0.20] transition-colors"
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
  );
}
