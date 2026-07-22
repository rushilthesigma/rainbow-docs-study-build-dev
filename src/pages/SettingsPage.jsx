import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { syncData } from '../api/auth';
import {
  DIFFICULTY_OPTIONS, LEARNING_STYLE_OPTIONS, LESSON_LENGTH_OPTIONS,
  TONE_OPTIONS, RIGOR_OPTIONS, TEMPO_OPTIONS, PERSONALITY_OPTIONS, FLUFF_OPTIONS,
} from '../utils/constants';
import PillGroup from '../components/shared/PillGroup';
import Toggle from '../components/shared/Toggle';
import { Textarea } from '../components/shared/Input';
import Button from '../components/shared/Button';
import { GraduationCap, ChevronDown, Check, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import {
  DEFAULT_ACCENT_HUE, DEFAULT_ACCENT_SATURATION, DEFAULT_ACCENT_VALUE,
  TOOL_ACCENT_DEFAULTS, accentColorForHue, useUIPreference,
} from '../context/UIPreferenceContext';
import { WALLPAPER_LIST } from '../components/desktop/DesktopBackground';
import { openBillingPortal, createCheckoutSession, getTiers, getMyUsage, resetWeeklyCredits } from '../api/billing';
import { planFromUser } from '../components/billing/modelAccess';
import FALLBACK_TIERS, { FALLBACK_MODEL_COSTS, FALLBACK_FEATURE_COSTS, FALLBACK_MULTI_MODEL_DISCOUNT, mergeTiers, fmtCap, fmtCredits } from '../components/billing/tiersCatalog';
import { useToast } from '../components/shared/Toast';

// ─── Shared primitives ────────────────────────────────────────────────────────

function CompactDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div className="relative w-full max-w-xs" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[13px] text-white/80 hover:bg-white/[0.07] transition-colors"
      >
        <span>{selected?.label || value}</span>
        <ChevronDown size={12} className={`text-white/30 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-30 right-0 mt-1 w-full rounded-xl border border-white/[0.08] bg-[#0c0c18]/95 backdrop-blur-xl shadow-2xl py-1">
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-[12.5px] flex items-center justify-between transition-colors ${
                value === o.value
                  ? 'text-white/95 font-medium bg-white/[0.07]'
                  : 'text-white/55 hover:bg-white/[0.05] hover:text-white/80'
              }`}
            >
              {o.label}
              {value === o.value && <Check size={11} className="text-white/40 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineSlider({ value, onChange }) {
  const clamped = Math.max(0, Math.min(100, value ?? 0));
  const [local, setLocal] = useState(clamped);
  const dragging = useRef(false);

  useEffect(() => {
    if (!dragging.current) setLocal(clamped);
  }, [clamped]);

  return (
    <div className="flex items-center gap-3 w-full max-w-xs">
      <input
        type="range" min={0} max={100} step={5} value={local}
        onPointerDown={() => { dragging.current = true; }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        onChange={e => { const v = Number(e.target.value); setLocal(v); onChange(v); }}
        style={{ background: `linear-gradient(to right, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.45) ${local}%, rgba(255,255,255,0.08) ${local}%, rgba(255,255,255,0.08) 100%)` }}
        className="flex-1 h-1 rounded-full appearance-none cursor-pointer outline-none
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
          [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.4)]
          [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0"
      />
      <span className="text-[11px] text-white/35 tabular-nums w-7 text-right">{100 - local}%</span>
    </div>
  );
}

// Accent presets spaced across the OKLCH hue wheel — quick picks alongside
// the free spectrum. Hue degrees map directly to the slider value.
const ACCENT_PRESETS = [
  { hue: 259.8, label: 'Blue' },
  { hue: 220,   label: 'Sky' },
  { hue: 190,   label: 'Cyan' },
  { hue: 160,   label: 'Teal' },
  { hue: 145,   label: 'Green' },
  { hue: 95,    label: 'Lime' },
  { hue: 70,    label: 'Amber' },
  { hue: 40,    label: 'Orange' },
  { hue: 25,    label: 'Red' },
  { hue: 0,     label: 'Rose' },
  { hue: 330,   label: 'Pink' },
  { hue: 300,   label: 'Violet' },
];

// Spectrum accent picker. Recolors the whole UI live as you drag (via
// onPreview, which writes CSS vars without a server round-trip) and only
// persists the chosen hue on release / preset click (onCommit).
function AccentSpectrum({ value, defaultHue = DEFAULT_ACCENT_HUE, onCommit, onPreview }) {
  const fallbackHue = defaultHue ?? DEFAULT_ACCENT_HUE;
  const [local, setLocal] = useState(value ?? fallbackHue);
  const localRef = useRef(local);
  const dragging = useRef(false);

  useEffect(() => {
    if (dragging.current) return;
    const next = value ?? fallbackHue;
    localRef.current = next;
    setLocal(next);
  }, [value, fallbackHue]);

  // Rainbow built from the SAME oklch space the accent uses, so the bar is a
  // faithful preview of every shade you can land on.
  const stops = [];
  for (let h = 0; h <= 360; h += 15) stops.push(`oklch(0.62 0.19 ${h})`);
  const grad = `linear-gradient(to right, ${stops.join(', ')})`;
  const swatch = `oklch(0.623 0.214 ${local})`;

  const preview = (v) => { setLocal(v); onPreview?.(v); };
  const commit  = ()  => { dragging.current = false; onCommit?.(local); };
  const resetToDefault = () => {
    setLocal(fallbackHue);
    onPreview?.(fallbackHue);
    onCommit?.(fallbackHue);
  };
  const defaultActive = Math.round(local) === Math.round(fallbackHue);

  return (
    <div className="w-full max-w-xs space-y-3">
      <div className="flex items-center gap-3">
        <span
          className="h-7 w-7 rounded-full border border-white/15 shrink-0"
          style={{ background: swatch, boxShadow: `0 0 14px oklch(0.623 0.214 ${local} / 0.55)` }}
        />
        <input
          type="range" min={0} max={360} step={1} value={Math.round(local)}
          aria-label="Accent color hue"
          onPointerDown={() => { dragging.current = true; }}
          onPointerUp={commit}
          onPointerCancel={commit}
          onKeyUp={() => onCommit?.(local)}
          onChange={e => preview(Number(e.target.value))}
          style={{ background: grad }}
          className="flex-1 h-2.5 rounded-full appearance-none cursor-pointer outline-none
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black/25
            [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.55)]
            [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0"
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={resetToDefault}
          className={`inline-flex h-6 items-center gap-1 rounded-lg border px-2 text-[10px] font-semibold transition-colors ${
            defaultActive
              ? 'border-white/25 bg-white/[0.08] text-white/80'
              : 'border-white/[0.08] bg-white/[0.03] text-white/45 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white/70'
          }`}
        >
          <RotateCcw size={10} />
          Default
        </button>
        {ACCENT_PRESETS.map(p => {
          const active = Math.round(local) === Math.round(p.hue);
          return (
            <button
              key={p.label}
              type="button"
              title={p.label}
              onClick={() => { setLocal(p.hue); onPreview?.(p.hue); onCommit?.(p.hue); }}
              className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${
                active ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-[#0c0c18]' : 'ring-1 ring-white/10'
              }`}
              style={{ background: `oklch(0.623 0.214 ${p.hue})` }}
            />
          );
        })}
      </div>
    </div>
  );
}

// Full HSV accent picker: a 2D saturation/value field on top of the hue bar
// from AccentSpectrum. X = saturation (chroma multiplier), Y = value
// (lightness multiplier) - both scale the whole OKLCH ramp uniformly, so
// dragging the field darkens/desaturates the entire interface live, the same
// way the hue bar recolors it. Committed together on release so a single
// drag only writes one preference update.
function AccentHSVField({
  hue, saturation, value,
  defaultHue = DEFAULT_ACCENT_HUE,
  defaultSaturation = DEFAULT_ACCENT_SATURATION,
  defaultValue = DEFAULT_ACCENT_VALUE,
  large = false,
  onCommit, onPreview,
}) {
  const [localHue, setLocalHue] = useState(hue ?? defaultHue);
  const [localSat, setLocalSat] = useState(saturation ?? defaultSaturation);
  const [localVal, setLocalVal] = useState(value ?? defaultValue);
  const localHueRef = useRef(localHue);
  const localSatRef = useRef(localSat);
  const localValRef = useRef(localVal);
  const fieldRef = useRef(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (dragging.current) return;
    const nextHue = hue ?? defaultHue;
    const nextSat = saturation ?? defaultSaturation;
    const nextVal = value ?? defaultValue;
    localHueRef.current = nextHue;
    localSatRef.current = nextSat;
    localValRef.current = nextVal;
    setLocalHue(nextHue);
    setLocalSat(nextSat);
    setLocalVal(nextVal);
  }, [hue, saturation, value, defaultHue, defaultSaturation, defaultValue]);

  const preview = (h, s, v) => {
    localHueRef.current = h;
    localSatRef.current = s;
    localValRef.current = v;
    setLocalHue(h);
    setLocalSat(s);
    setLocalVal(v);
    onPreview?.(h, s, v);
  };
  const commit = () => onCommit?.(localHueRef.current, localSatRef.current, localValRef.current);

  const updateFromPoint = (clientX, clientY, commitNow) => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const s = Math.round(x * 100);
    const v = Math.round((1 - y) * 100);
    preview(localHueRef.current, s, v);
    if (commitNow) commit();
  };

  const onFieldPointerDown = (e) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPoint(e.clientX, e.clientY, false);
  };
  const onFieldPointerMove = (e) => { if (dragging.current) updateFromPoint(e.clientX, e.clientY, false); };
  const onFieldPointerUp = (e) => {
    if (!dragging.current) return;
    dragging.current = false;
    updateFromPoint(e.clientX, e.clientY, true);
  };

  const previewHue = (h) => preview(h, localSatRef.current, localValRef.current);
  const commitHue  = () => commit();

  const resetToDefault = () => {
    preview(defaultHue, defaultSaturation, defaultValue);
    commit();
  };
  const defaultActive = Math.round(localHue) === Math.round(defaultHue)
    && Math.round(localSat) === Math.round(defaultSaturation)
    && Math.round(localVal) === Math.round(defaultValue);

  const stops = [];
  for (let h = 0; h <= 360; h += 15) stops.push(`oklch(0.62 0.19 ${h})`);
  const hueGrad = `linear-gradient(to right, ${stops.join(', ')})`;
  const swatch = accentColorForHue(localHue, '500', null, localSat, localVal);
  const fieldHeight = large ? 'h-64 sm:h-72' : 'h-32';
  const fieldRadius = large ? 'rounded-[14px]' : 'rounded-lg';
  const handleSize = large ? 'h-7 w-7 border-[3px]' : 'h-3.5 w-3.5 border-2';

  return (
    <div className={`${large ? 'w-full space-y-4' : 'w-full max-w-xs space-y-3'}`}>
      <div className={`${fieldRadius} bg-[#050507] p-px shadow-[0_18px_50px_rgba(0,0,0,0.38)]`}>
        <div
          ref={fieldRef}
          onPointerDown={onFieldPointerDown}
          onPointerMove={onFieldPointerMove}
          onPointerUp={onFieldPointerUp}
          onPointerCancel={onFieldPointerUp}
          className={`relative ${fieldHeight} w-full ${fieldRadius} cursor-crosshair touch-none select-none overflow-hidden`}
          style={{
            background: `linear-gradient(to top, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.78) 18%, rgba(0,0,0,0.16) 62%, transparent 100%),
              linear-gradient(to right, rgba(255,255,255,0.96), rgba(255,255,255,0)),
              hsl(${localHue}, 100%, 50%)`,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), inset 1px 0 0 rgba(255,255,255,0.08), inset -1px 0 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.78)',
          }}
        >
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
          <span
            className={`absolute z-10 ${handleSize} -translate-x-1/2 -translate-y-1/2 rounded-full border-white shadow-[0_2px_10px_rgba(0,0,0,0.55),0_0_0_1px_rgba(0,0,0,0.18)] pointer-events-none`}
            style={{ left: `${localSat}%`, top: `${100 - localVal}%`, background: swatch }}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className="h-7 w-7 rounded-full border border-white/15 shrink-0"
          style={{ background: swatch, boxShadow: `0 0 14px ${accentColorForHue(localHue, '500', 0.55, localSat, localVal)}` }}
        />
        <input
          type="range" min={0} max={360} step={1} value={Math.round(localHue)}
          aria-label="Accent color hue"
          onPointerDown={() => { dragging.current = true; }}
          onPointerUp={commitHue}
          onPointerCancel={commitHue}
          onKeyUp={commitHue}
          onChange={e => previewHue(Number(e.target.value))}
          style={{ background: hueGrad }}
          className="flex-1 h-2.5 rounded-full appearance-none cursor-pointer outline-none
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black/25
            [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.55)]
            [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0"
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={resetToDefault}
          className={`inline-flex h-6 items-center gap-1 rounded-lg border px-2 text-[10px] font-semibold transition-colors ${
            defaultActive
              ? 'border-white/25 bg-white/[0.08] text-white/80'
              : 'border-white/[0.08] bg-white/[0.03] text-white/45 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white/70'
          }`}
        >
          <RotateCcw size={10} />
          Default
        </button>
        {ACCENT_PRESETS.map(p => {
          const active = Math.round(localHue) === Math.round(p.hue)
            && Math.round(localSat) === 100 && Math.round(localVal) === 100;
          return (
            <button
              key={p.label}
              type="button"
              title={p.label}
              onClick={() => { preview(p.hue, 100, 100); commit(); }}
              className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${
                active ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-[#0c0c18]' : 'ring-1 ring-white/10'
              }`}
              style={{ background: `oklch(0.623 0.214 ${p.hue})` }}
            />
          );
        })}
      </div>
    </div>
  );
}

function AccentHueBar({ value, defaultHue = DEFAULT_ACCENT_HUE, onCommit, onPreview }) {
  const fallbackHue = defaultHue ?? DEFAULT_ACCENT_HUE;
  const [local, setLocal] = useState(value ?? fallbackHue);
  const dragging = useRef(false);

  useEffect(() => { if (!dragging.current) setLocal(value ?? fallbackHue); }, [value, fallbackHue]);

  const stops = [];
  for (let h = 0; h <= 360; h += 15) stops.push(`oklch(0.62 0.19 ${h})`);
  const grad = `linear-gradient(to right, ${stops.join(', ')})`;

  const preview = (v) => {
    localRef.current = v;
    setLocal(v);
    onPreview?.(v);
  };
  const commit = () => {
    dragging.current = false;
    onCommit?.(localRef.current);
  };

  return (
    <input
      type="range" min={0} max={360} step={1} value={Math.round(local)}
      aria-label="Accent color hue"
      onPointerDown={() => { dragging.current = true; }}
      onPointerUp={commit}
      onPointerCancel={commit}
      onKeyUp={commit}
      onChange={e => preview(Number(e.target.value))}
      style={{ background: grad }}
      className="h-5 min-w-0 flex-1 rounded-full appearance-none cursor-pointer outline-none
        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7
        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
        [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-zinc-400/80
        [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.65)]
        [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:rounded-full
        [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-zinc-400/80"
    />
  );
}

function AccentHSVModal({
  open, onClose,
  hue, saturation, value,
  defaultHue, defaultSaturation, defaultValue,
  onCommit, onPreview,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4 py-8 backdrop-blur-sm"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Advanced accent color"
        className="w-full max-w-[680px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121214]/95 shadow-[0_30px_90px_rgba(0,0,0,0.62),0_0_0_1px_rgba(255,255,255,0.03)]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/38">Accent color</p>
            <p className="mt-2 text-[13px] text-white/36">Drag the field to recolor the entire interface.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close accent color picker"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white/75"
          >
            <X size={15} />
          </button>
        </div>
        <div className="px-5 pb-5 pt-4">
          <AccentHSVField
            large
            hue={hue} saturation={saturation} value={value}
            defaultHue={defaultHue} defaultSaturation={defaultSaturation} defaultValue={defaultValue}
            onPreview={onPreview}
            onCommit={onCommit}
          />
        </div>
      </div>
    </div>
  );
}

function AccentColorControl({
  hue, saturation, value,
  defaultHue = DEFAULT_ACCENT_HUE,
  defaultSaturation = DEFAULT_ACCENT_SATURATION,
  defaultValue = DEFAULT_ACCENT_VALUE,
  onCommit, onPreview,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const resolvedSat = saturation ?? defaultSaturation;
  const resolvedVal = value ?? defaultValue;

  const previewHue = (nextHue) => onPreview?.(nextHue, resolvedSat, resolvedVal);
  const commitHue = (nextHue) => onCommit?.(nextHue, resolvedSat, resolvedVal);

  return (
    <>
      <div className="flex w-full max-w-[560px] items-center gap-3">
        <AccentHueBar value={hue} defaultHue={defaultHue} onPreview={previewHue} onCommit={commitHue} />
        <button
          type="button"
          onClick={() => setAdvancedOpen(true)}
          title="Open HSV controls"
          aria-label="Open HSV accent color controls"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.05] px-3 text-[11px] font-semibold text-white/58 transition-colors hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-white/82"
        >
          <SlidersHorizontal size={14} />
          HSV
        </button>
      </div>
      <AccentHSVModal
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        hue={hue} saturation={saturation} value={value}
        defaultHue={defaultHue} defaultSaturation={defaultSaturation} defaultValue={defaultValue}
        onPreview={onPreview}
        onCommit={onCommit}
      />
    </>
  );
}

// Block: label above, content below — used everywhere for consistency
function Block({ label, hint, children }) {
  return (
    <div className="py-3 border-b border-white/[0.05] last:border-0 space-y-2">
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/30">{label}</p>
        {hint && <p className="text-[11px] text-white/30 mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-3 transition-colors hover:border-white/[0.14] hover:bg-white/[0.055]">
      <Toggle
        label={label}
        description={description}
        checked={checked}
        onChange={onChange}
      />
    </div>
  );
}

function AutosaveStatus({ saving, saved, error }) {
  return (
    <div className="pt-4 flex items-center gap-2 text-[11px] text-white/35">
      {saving ? (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-blue-300/70 animate-pulse" />
          Saving changes...
        </>
      ) : error ? (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-rose-300/80" />
          Could not auto-save. Your changes are still here.
        </>
      ) : saved ? (
        <>
          <Check size={12} className="text-emerald-300/80" />
          Saved
        </>
      ) : (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
          Changes save automatically
        </>
      )}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'ai',         label: 'AI Tutor' },
  { id: 'curriculum', label: 'Curriculum' },
  { id: 'account',    label: 'Account' },
  { id: 'plans',      label: 'Plans' },
];

// ─── Plans tab ────────────────────────────────────────────────────────────────
// Weekly credit balance, banked resets, plan comparison, and per-model costs — rendered
// as flat Settings sections (no boxed card).
const MODEL_LABELS = {
  'flash-lite': 'Gemini 3.5 Flash-Lite', 'deepseek-flash': 'DeepSeek V4', 'grok': 'Grok 4.3', 'flash': 'Gemini 3.6 Flash',
  'gpt-5.4-mini': 'GPT-5.4 mini', 'deepseek-pro': 'DeepSeek Pro', 'haiku': 'Haiku 4.5',
  'gemini-pro': 'Gemini Pro', 'sonnet': 'Sonnet 4.6', 'gpt-5.4': 'GPT-5.4',
  'gpt-5.6-sol': 'GPT-5.6 Sol', 'gpt-5.6-terra': 'GPT-5.6 Terra', 'gpt-5.6-luna': 'GPT-5.6 Luna',
};

// Flat per-feature credit costs surfaced in the Plans tab, in display order.
const FEATURE_LABELS = {
  curriculum: 'Curriculum generation',
  quizBowlTossup: 'Quiz Bowl tossups (AI)',
  noteSummary: 'Note summary & cue cards',
  noteFlashcards: 'Note flashcards',
};
const FEATURE_ORDER = ['curriculum', 'quizBowlTossup', 'noteSummary', 'noteFlashcards'];

function PlansTab({ user }) {
  const toast = useToast();
  const cachedPlan = user?.data?.plan || 'free';
  const [tiers, setTiers] = useState(FALLBACK_TIERS);
  const [usage, setUsage] = useState(null);
  const [buyBusy, setBuyBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    getTiers().then(d => setTiers(mergeTiers(FALLBACK_TIERS, d.tiers))).catch(() => {});
    getMyUsage().then(setUsage).catch(() => {});
  }, []);

  const plan = usage?.plan || (['paid', 'plus', 'pro', 'lifetime'].includes(cachedPlan) ? 'paid' : 'free');
  const credits = usage?.credits || null;
  const modelCosts = usage?.modelCosts || FALLBACK_MODEL_COSTS;

  async function buy() {
    if (buyBusy) return;
    setBuyBusy(true);
    try {
      const { url } = await createCheckoutSession('paid');
      if (url) window.open(url, '_blank', 'noopener');
    } catch (e) {
      toast.error(e?.message || 'Checkout failed.');
    }
    setBuyBusy(false);
  }

  async function useCreditReset() {
    if (resetBusy || !window.confirm('Use one banked reset to refill this week’s credits?')) return;
    setResetBusy(true);
    try {
      const next = await resetWeeklyCredits();
      setUsage(current => ({ ...current, ...next }));
      toast.success(`Credits refilled. ${next.creditResets?.available ?? 0} resets remain.`);
    } catch (e) {
      toast.error(e?.data?.message || e?.message || 'Could not reset credits.');
    }
    setResetBusy(false);
  }

  // Weekly credit gauge.
  const unlimited = !credits || credits.unlimited || credits.allowance == null;
  const allowance = credits?.allowance ?? (tiers?.[plan]?.dailyCredits ?? tiers?.[plan]?.limits?.dailyCredits ?? 500);
  const multiModelDiscount = usage?.multiModelDiscount ?? FALLBACK_MULTI_MODEL_DISCOUNT;
  const used = credits?.used ?? 0;
  const remaining = unlimited ? null : (credits?.remaining ?? Math.max(0, allowance - used));
  const pct = unlimited ? 10 : Math.min(100, Math.round((used / Math.max(1, allowance)) * 100));
  const tone = unlimited ? 'bg-white/20' : pct >= 100 ? 'bg-rose-400' : pct >= 85 ? 'bg-amber-400' : 'bg-blue-400';
  const resetsAvailable = usage?.creditResets?.available ?? 0;
  const canReset = resetsAvailable > 0 && used > 0 && !unlimited;

  const costEntries = Object.entries(modelCosts || {}).sort((a, b) => a[1] - b[1]);
  // Server featureCosts merged over the fallback so note costs show even on an
  // older server build that doesn't return them yet.
  const featureCosts = { ...FALLBACK_FEATURE_COSTS, ...(usage?.featureCosts || {}) };
  const featureEntries = FEATURE_ORDER
    .filter((k) => typeof featureCosts[k] === 'number')
    .map((k) => [k, featureCosts[k]]);

  return (
    <div>
      <Block label="Credits this week" hint="Usage ages out over a rolling 7-day window. A banked reset refills it immediately.">
        <div className="text-[15px] font-semibold text-white tabular-nums leading-none">
          {unlimited
            ? 'Unlimited'
            : <>{fmtCredits(remaining)}<span className="text-white/25 text-[11px]"> / {fmtCredits(allowance)} left</span></>}
        </div>
        <div className="mt-2 h-1 rounded-full bg-white/[0.07]">
          <div className={`h-full rounded-full ${tone}`} style={{ width: `${unlimited ? 100 : Math.max(2, 100 - pct)}%` }} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
          <div>
            <div className="text-[11px] font-medium text-white/70">Banked resets</div>
            <div className="text-[10.5px] text-white/35">
              {resetsAvailable} available · earn one each time a friend joins with your code
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={useCreditReset} loading={resetBusy} disabled={!canReset}>
            <RotateCcw size={12} /> {resetBusy ? 'Resetting…' : 'Use reset'}
          </Button>
        </div>
      </Block>

      <Block label="Plans">
        <ul className="divide-y divide-white/[0.05]">
          {['free', 'paid'].map(id => {
            const t = tiers[id];
            if (!t) return null;
            const isCurrent = plan === id;
            const daily = t.dailyCredits ?? t.limits?.dailyCredits;
            const price = id === 'free' ? 'Free' : `$${t.amountUsd}/${t.interval || 'month'}`;
            return (
              <li key={id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-white leading-tight">
                    {t.label}
                    <span className="text-[11px] font-normal text-white/40 ml-2 tabular-nums">{price}</span>
                  </div>
                  <div className="text-[11px] text-white/45 tabular-nums mt-0.5">
                    {fmtCredits(daily)} credits/week · {fmtCap(t.limits?.noteMaps)} note maps
                  </div>
                </div>
                {isCurrent ? (
                  <span className="shrink-0 text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5">
                    <Check size={9} /> Current
                  </span>
                ) : id === 'paid' ? (
                  <Button size="sm" onClick={buy} loading={buyBusy} disabled={!t.buyable}>Upgrade</Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Block>

      <Block label="Cost per message" hint="What each model spends per message">
        <ul className="text-[12px] leading-relaxed">
          {costEntries.map(([key, cost]) => (
            <li key={key} className="text-white/60">
              {MODEL_LABELS[key] || key}
              <span className="text-white/35"> — </span>
              <span className="tabular-nums text-white/80">{cost} cr</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block label="Cost per generation" hint="Flat credit cost for one-shot AI generations">
        <ul className="text-[12px] leading-relaxed">
          {featureEntries.map(([key, cost]) => (
            <li key={key} className="text-white/60">
              {FEATURE_LABELS[key] || key}
              <span className="text-white/35"> — </span>
              <span className="tabular-nums text-white/80">{cost} cr</span>
            </li>
          ))}
          <li className="text-white/60">
            Reroute &amp; Best of
            <span className="text-white/35"> — </span>
            <span className="tabular-nums text-white/80">{Math.round(multiModelDiscount * 100)}% off</span>
            <span className="text-white/35"> the combined model cost</span>
          </li>
        </ul>
      </Block>
    </div>
  );
}

// ─── Appearance tab ───────────────────────────────────────────────────────────

function AppearanceTab() {
  const {
    accentHue, setAccentHue, previewAccent,
    accentSaturation, setAccentSaturation,
    accentValue, setAccentValue,
    canvasAccentHue, setCanvasAccentHue, previewCanvasAccent,
    voiceAccentHue, setVoiceAccentHue, previewVoiceAccent,
    humanizeAccentHue, setHumanizeAccentHue, previewHumanizeAccent,
    webSearchAccentHue, setWebSearchAccentHue, previewWebSearchAccent,
    wallpaper, setWallpaper,
    dockSize, setDockSize,
    iconStyle, setIconStyle,
    windowOpacity, setWindowOpacity,
    titlebarOpacity, setTitlebarOpacity,
  } = useUIPreference();

  const wallpaperOpts = WALLPAPER_LIST.map(w => ({ value: w.id, label: w.label }));
  const dockOpts   = [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }];
  const iconOpts   = [{ value: 'gradient', label: 'Colorful' }, { value: 'mono', label: 'Monochrome' }, { value: 'glass', label: 'Glass' }, { value: 'accent', label: 'Accent Tint' }];

  return (
    <div>
      <Block label="Accent color" hint="Use the bar for hue; open HSV for saturation and brightness.">
        <AccentColorControl
          hue={accentHue} saturation={accentSaturation} value={accentValue}
          defaultHue={DEFAULT_ACCENT_HUE} defaultSaturation={DEFAULT_ACCENT_SATURATION} defaultValue={DEFAULT_ACCENT_VALUE}
          onPreview={(h, s, v) => previewAccent(h, s, v)}
          onCommit={(h, s, v) => { setAccentHue(h); setAccentSaturation(s); setAccentValue(v); }}
        />
      </Block>
      <Block label="Canvas accent color" hint="Controls the Study math canvas button, chip, and pane icon.">
        <AccentSpectrum value={canvasAccentHue} defaultHue={TOOL_ACCENT_DEFAULTS.canvasAccentHue} onCommit={setCanvasAccentHue} onPreview={previewCanvasAccent} />
      </Block>
      <Block label="Voice accent color" hint="Controls dictation, voice mode, and the voice orb.">
        <AccentSpectrum value={voiceAccentHue} defaultHue={TOOL_ACCENT_DEFAULTS.voiceAccentHue} onCommit={setVoiceAccentHue} onPreview={previewVoiceAccent} />
      </Block>
      <Block label="Humanize accent color">
        <AccentSpectrum value={humanizeAccentHue} defaultHue={TOOL_ACCENT_DEFAULTS.humanizeAccentHue} onCommit={setHumanizeAccentHue} onPreview={previewHumanizeAccent} />
      </Block>
      <Block label="Web search accent color">
        <AccentSpectrum value={webSearchAccentHue} defaultHue={TOOL_ACCENT_DEFAULTS.webSearchAccentHue} onCommit={setWebSearchAccentHue} onPreview={previewWebSearchAccent} />
      </Block>
      <Block label="Wallpaper">
        <CompactDropdown value={wallpaper} options={wallpaperOpts} onChange={setWallpaper} />
      </Block>
      <Block label="Dock size">
        <CompactDropdown value={dockSize} options={dockOpts} onChange={setDockSize} />
      </Block>
      <Block label="Icon style">
        <CompactDropdown value={iconStyle} options={iconOpts} onChange={setIconStyle} />
      </Block>
      <Block label="Title bar transparency">
        <InlineSlider value={titlebarOpacity ?? 80} onChange={setTitlebarOpacity} />
      </Block>
      <Block label="Window transparency">
        <InlineSlider value={windowOpacity ?? 55} onChange={setWindowOpacity} />
      </Block>
    </div>
  );
}

// ─── AI Tutor tab ─────────────────────────────────────────────────────────────

function AITab({ prefs, update, flushAutosave, saving, saved, saveError }) {
  return (
    <div>
      <Block label="Personality">
        <PillGroup options={PERSONALITY_OPTIONS} value={prefs.aiPersonality} onChange={v => update('aiPersonality', v)} />
      </Block>
      <Block label="Fluff level">
        <PillGroup options={FLUFF_OPTIONS} value={prefs.fluffLevel} onChange={v => update('fluffLevel', v)} />
      </Block>
      <Block label="Response style" hint="On: short, high-signal phrases (default). Off: normal, conversational AI prose.">
        <Toggle accent="blue" checked={prefs.succinctMode ?? true} onChange={v => update('succinctMode', v)} />
      </Block>
      <Block label="DeepSeek routing" hint="When on, DeepSeek uses Gemini for China/Taiwan topics and relevant geopolitical follow-ups.">
        <Toggle accent="blue" checked={prefs.deepseekReroute ?? true} onChange={v => update('deepseekReroute', v)} />
      </Block>
      <Block label="Rigor">
        <PillGroup options={RIGOR_OPTIONS} value={prefs.rigor} onChange={v => update('rigor', v)} />
      </Block>
      <Block label="Lesson tempo">
        <PillGroup options={TEMPO_OPTIONS} value={prefs.lessonTempo} onChange={v => update('lessonTempo', v)} />
      </Block>
      <Block label="Custom instructions">
        <Textarea
          placeholder="e.g. Always respond in bullet points. Never explain what you're about to do — just do it."
          value={prefs.customInstructions || ''}
          onChange={e => update('customInstructions', e.target.value)}
          onBlur={flushAutosave}
          rows={3}
        />
      </Block>
      <AutosaveStatus saving={saving} saved={saved} error={saveError} />
    </div>
  );
}

// ─── Curriculum tab ───────────────────────────────────────────────────────────

function CurriculumTab({ prefs, update, saving, saved, saveError }) {
  return (
    <div>
      <Block label="Default difficulty">
        <PillGroup options={DIFFICULTY_OPTIONS} value={prefs.defaultDifficulty} onChange={v => update('defaultDifficulty', v)} />
      </Block>
      <Block label="Default learning style">
        <PillGroup options={LEARNING_STYLE_OPTIONS} value={prefs.defaultStyle} onChange={v => update('defaultStyle', v)} />
      </Block>
      <Block label="Default tone">
        <PillGroup options={TONE_OPTIONS} value={prefs.defaultTone} onChange={v => update('defaultTone', v)} />
      </Block>
      <Block label="Default lesson length">
        <PillGroup options={LESSON_LENGTH_OPTIONS} value={prefs.defaultLength} onChange={v => update('defaultLength', v)} />
      </Block>
      <Block label="Lesson content" hint="Choose what new curricula include automatically.">
        <div className="grid max-w-md gap-2">
          <ToggleRow
            label="Examples"
            description="Add worked examples to generated lessons."
            checked={prefs.includeExamples ?? true}
            onChange={v => update('includeExamples', v)}
          />
          <ToggleRow
            label="Exercises"
            description="Add practice prompts and checks for understanding."
            checked={prefs.includeExercises ?? true}
            onChange={v => update('includeExercises', v)}
          />
        </div>
      </Block>
      <AutosaveStatus saving={saving} saved={saved} error={saveError} />
    </div>
  );
}

// ─── Account tab ──────────────────────────────────────────────────────────────

const PLAN_LABELS = {
  free: 'Free',
  paid: 'Paid',
};

function AccountTab({ user, onRestart }) {
  const toast = useToast();
  const [portalBusy, setPortalBusy] = useState(false);
  const [buyBusy, setBuyBusy] = useState(false);
  const plan = planFromUser(user);
  const isLifetime = !!user?.data?.lifetimePurchasedAt;
  const isPaid = plan === 'paid';
  const proUntil = user?.data?.proUntil;

  async function handleManage() {
    if (portalBusy) return;
    setPortalBusy(true);
    try {
      const { url } = await openBillingPortal();
      if (url) window.location.href = url;
    } catch (e) {
      toast.error(e?.message || 'Could not open billing portal.');
    }
    setPortalBusy(false);
  }

  async function handleUpgrade() {
    if (buyBusy) return;
    setBuyBusy(true);
    try {
      const { url } = await createCheckoutSession('paid');
      if (url) window.open(url, '_blank', 'noopener');
    } catch (e) {
      toast.error(e?.message || 'Checkout failed.');
    }
    setBuyBusy(false);
  }

  return (
    <div>
      <Block label="Profile">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.10] flex items-center justify-center text-[13px] font-bold text-white/60 shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-[13px] font-medium text-white/85">{user?.name || '—'}</p>
            <p className="text-[11px] text-white/35">{user?.email}</p>
          </div>
        </div>
      </Block>

      <Block label="Plan" hint={isLifetime ? 'Paid once, never expires' : proUntil ? `Renews ${new Date(proUntil).toLocaleDateString()}` : undefined}>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-white/70 font-medium">{PLAN_LABELS[plan] || 'Free'}</span>
          {isPaid && !isLifetime && (
            <Button size="sm" variant="ghost" onClick={handleManage} loading={portalBusy}>Manage</Button>
          )}
          {!isPaid && (
            <Button size="sm" onClick={handleUpgrade} loading={buyBusy}>Upgrade</Button>
          )}
        </div>
      </Block>

      <Block label="Tutorial" hint="Replay the welcome flow from the beginning">
        <button
          onClick={onRestart}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.09] hover:bg-white/[0.10] text-white/55 hover:text-white/80 text-[12px] font-medium transition-colors"
        >
          <GraduationCap size={13} /> Restart onboarding
        </button>
      </Block>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const PREFS_LS_KEY = 'cov-prefs';
function loadPrefsMirror() {
  try { return JSON.parse(localStorage.getItem(PREFS_LS_KEY) || '{}') || {}; } catch { return {}; }
}
function savePrefsMirror(prefs) {
  try { localStorage.setItem(PREFS_LS_KEY, JSON.stringify(prefs || {})); } catch {}
}
function isDemoEmail(email) {
  const e = String(email || '').toLowerCase();
  return e.startsWith('demo-landing-') || e.endsWith('@covalent.test');
}

export default function SettingsPage({ initialTab } = {}) {
  const { user, fetchUser } = useAuth();
  const toast = useToast();
  const isDemo = isDemoEmail(user?.email);
  const [tab, setTab] = useState(() => (
    TABS.some((t) => t.id === initialTab) ? initialTab : 'appearance'
  ));

  useEffect(() => {
    if (isDemo) { try { localStorage.removeItem(PREFS_LS_KEY); } catch {} }
  }, [isDemo]);

  const [prefs, setPrefs] = useState(() => ({
    ...(isDemo ? {} : loadPrefsMirror()),
    ...(user?.data?.preferences || {}),
  }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const dirtyKeys = useRef(new Set());
  const prefsRef = useRef(prefs);
  const pendingPrefsRef = useRef(null);
  const savingRef = useRef(false);
  const saveTimerRef = useRef(null);
  const savedTimerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => () => {
    mountedRef.current = false;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    if (pendingPrefsRef.current) {
      syncData({ preferences: pendingPrefsRef.current }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!user?.data?.preferences) return;
    const fromServer = user.data.preferences;
    const mirror = isDemo ? {} : loadPrefsMirror();
    setPrefs(prev => {
      const next = { ...mirror, ...fromServer };
      for (const k of dirtyKeys.current) {
        if (prev[k] !== undefined) next[k] = prev[k];
      }
      return next;
    });
    if (!isDemo) {
      const missing = {};
      for (const k of Object.keys(mirror)) {
        if (fromServer[k] === undefined && mirror[k] !== undefined) missing[k] = mirror[k];
      }
      if (Object.keys(missing).length) {
        syncData({ preferences: { ...fromServer, ...missing } }).catch(() => {});
      }
    }
  }, [user, isDemo]);

  useEffect(() => {
    if (isDemo) return;
    savePrefsMirror(prefs);
  }, [prefs, isDemo]);

  function markSaved() {
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
  }

  async function flushAutosave() {
    if (savingRef.current) {
      saveTimerRef.current = setTimeout(flushAutosave, 250);
      return;
    }
    const snapshot = pendingPrefsRef.current;
    if (!snapshot) {
      if (mountedRef.current) setSaving(false);
      return;
    }
    pendingPrefsRef.current = null;
    savingRef.current = true;
    if (mountedRef.current) {
      setSaving(true);
      setSaved(false);
      setSaveError(false);
    }
    let failed = false;
    try {
      await syncData({ preferences: snapshot });
      if (!pendingPrefsRef.current) {
        for (const key of Array.from(dirtyKeys.current)) {
          if (prefsRef.current[key] === snapshot[key]) dirtyKeys.current.delete(key);
        }
      }
      await fetchUser();
      if (mountedRef.current) markSaved();
    } catch (err) {
      console.error('Failed to auto-save settings:', err);
      pendingPrefsRef.current = pendingPrefsRef.current || snapshot;
      if (mountedRef.current) setSaveError(true);
      failed = true;
    }
    savingRef.current = false;
    if (failed) {
      if (mountedRef.current) setSaving(false);
    } else if (pendingPrefsRef.current) {
      saveTimerRef.current = setTimeout(flushAutosave, 300);
    } else {
      if (mountedRef.current) setSaving(false);
    }
  }

  function scheduleAutosave(nextPrefs, value) {
    pendingPrefsRef.current = nextPrefs;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setSaving(true);
    setSaved(false);
    setSaveError(false);
    saveTimerRef.current = setTimeout(flushAutosave, typeof value === 'string' ? 500 : 100);
  }

  function flushAutosaveNow() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushAutosave, 0);
  }

  function update(key, value) {
    dirtyKeys.current.add(key);
    const next = { ...prefsRef.current, [key]: value };
    prefsRef.current = next;
    setPrefs(next);
    scheduleAutosave(next, value);
  }

  async function handleRestart() {
    if (!confirm('Replay the welcome tutorial now?')) return;
    try {
      await syncData({ preferences: { ...(user?.data?.preferences || {}), onboarded: false, tourStep: null } });
      await fetchUser();
    } catch (err) {
      toast.error('Could not restart onboarding right now.');
      return;
    }
    try { localStorage.removeItem('covalent-onboarded'); localStorage.removeItem('cov-launch-app'); } catch {}
    window.location.reload();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex gap-0.5 px-4 pt-4 pb-2 border-b border-white/[0.06] shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors ${
              tab === t.id
                ? 'bg-white/[0.09] text-white/90'
                : 'text-white/40 hover:text-white/65 hover:bg-white/[0.05]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'ai'         && <AITab prefs={prefs} update={update} flushAutosave={flushAutosaveNow} saving={saving} saved={saved} saveError={saveError} />}
        {tab === 'curriculum' && <CurriculumTab prefs={prefs} update={update} saving={saving} saved={saved} saveError={saveError} />}
        {tab === 'account'    && <AccountTab user={user} onRestart={handleRestart} />}
        {tab === 'plans'      && <PlansTab user={user} />}
      </div>
    </div>
  );
}
