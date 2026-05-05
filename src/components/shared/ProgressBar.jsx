import { useEffect, useState, useRef } from 'react';

// Determinate-looking progress bar with a live percentage. Replaces
// generic spinners. Two modes:
//
//   1. Controlled — pass `value={n}` (0-100). The bar follows the value
//      exactly. Use this when you actually know the progress (e.g. a
//      multi-step server flow that emits status events).
//
//   2. Simulated — leave `value` undefined and pass `active` (boolean).
//      The bar advances on its own toward `target` (default 92%) using
//      a decay curve so it slows down before topping out. When `active`
//      flips to false, it snaps to 100% then fades.
//
// Always shows a percentage. Optional `label` and `hint` print above /
// below the bar.
export default function ProgressBar({
  value,
  active = true,
  target = 92,
  duration = 12000,    // ms to drift from 0 → target
  label = 'Loading',
  hint,
  size = 'md',         // 'sm' | 'md'
  className = '',
}) {
  // --- Simulated mode ---
  const [simulated, setSimulated] = useState(0);
  const startedAt = useRef(null);
  useEffect(() => {
    if (value !== undefined) return;
    if (!active) {
      // Snap to 100, then reset shortly after (so re-activations start clean)
      setSimulated(100);
      const t = setTimeout(() => { setSimulated(0); startedAt.current = null; }, 350);
      return () => clearTimeout(t);
    }
    if (startedAt.current === null) startedAt.current = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      // ease-out toward `target`: 1 - exp(-t/duration*3)
      const ratio = 1 - Math.exp(-(elapsed / duration) * 3);
      setSimulated(Math.min(target, Math.round(ratio * target)));
    }, 120);
    return () => clearInterval(id);
  }, [active, value, target, duration]);

  const pct = value !== undefined ? Math.max(0, Math.min(100, value)) : simulated;
  const heightCls = size === 'sm' ? 'h-1' : 'h-1.5';
  const textCls = size === 'sm' ? 'text-[10px]' : 'text-[11px]';

  return (
    <div className={`w-full ${className}`}>
      {(label || pct >= 0) && (
        <div className={`flex items-center justify-between mb-1.5 ${textCls} text-gray-500 dark:text-gray-400`}>
          <span className="font-medium">{label}</span>
          <span className="font-mono tabular-nums text-gray-700 dark:text-gray-200">{pct}%</span>
        </div>
      )}
      <div className={`w-full ${heightCls} rounded-full overflow-hidden bg-gray-200 dark:bg-[#0a0a14]`}>
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-200 ease-out"
          style={{ width: `${pct}%`, boxShadow: '0 0 10px rgba(59,130,246,0.45)' }}
        />
      </div>
      {hint && <p className={`mt-1.5 ${textCls} text-gray-400`}>{hint}</p>}
    </div>
  );
}

// Inline pill — same idea but compact, for use INSIDE buttons.
//
// Tuned for fast actions (save settings, etc.): the easing reaches
// `target` over `duration` ms (default 2.5s), and when `active` flips
// to false the bar SNAPS to 100% before fading. The old version
// approached 92% over 8s and dropped straight to 0 — for a 1-second
// save that meant the user saw the bar peak around ~33% and vanish,
// reading as "the save bar ends at 33%".
export function InlineProgress({ value, active = true, target = 92, duration = 2500, label }) {
  const [simulated, setSimulated] = useState(0);
  const startedAt = useRef(null);
  const wasActive = useRef(false);
  useEffect(() => {
    if (value !== undefined) return;
    if (!active) {
      // If we were animating, snap to 100% briefly so the user gets
      // a "completed" beat instead of the bar collapsing to 0%.
      if (wasActive.current) {
        setSimulated(100);
        const t = setTimeout(() => { setSimulated(0); startedAt.current = null; }, 250);
        wasActive.current = false;
        return () => clearTimeout(t);
      }
      setSimulated(0); startedAt.current = null;
      return;
    }
    wasActive.current = true;
    if (startedAt.current === null) startedAt.current = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      const ratio = 1 - Math.exp(-(elapsed / duration) * 3);
      setSimulated(Math.min(target, Math.round(ratio * target)));
    }, 80);
    return () => clearInterval(id);
  }, [active, value, target, duration]);
  const pct = value !== undefined ? Math.max(0, Math.min(100, value)) : simulated;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative w-12 h-1 rounded-full bg-white/30 overflow-hidden">
        <span className="absolute inset-y-0 left-0 bg-white transition-all duration-200" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-[10px] font-mono tabular-nums">{pct}%</span>
      {label && <span className="text-[11px]">{label}</span>}
    </span>
  );
}
