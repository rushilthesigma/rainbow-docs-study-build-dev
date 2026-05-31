import { useEffect, useState, useRef } from 'react';

export default function ProgressBar({
  value,
  active = true,
  target = 92,
  duration = 12000,
  label = 'Loading',
  hint,
  size = 'md',
  className = '',
}) {
  const [simulated, setSimulated] = useState(0);
  const startedAt = useRef(null);
  useEffect(() => {
    if (value !== undefined) return;
    if (!active) {
      setSimulated(100);
      const t = setTimeout(() => { setSimulated(0); startedAt.current = null; }, 350);
      return () => clearTimeout(t);
    }
    if (startedAt.current === null) startedAt.current = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
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
        <div className={`flex items-center justify-between mb-1.5 ${textCls} text-white/50`}>
          <span className="font-medium">{label}</span>
          <span className="font-mono tabular-nums text-blue-400 font-semibold">{pct}%</span>
        </div>
      )}
      <div className={`w-full ${heightCls} rounded-full overflow-hidden bg-white/[0.08]`}>
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-200 ease-out rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint && <p className={`mt-1.5 ${textCls} text-white/35`}>{hint}</p>}
    </div>
  );
}

// Compact "something is happening" indicator. Originally rendered a
// fake-percentage progress pill (simulated easing toward 92%), but the
// imaginary percentage was misleading and visually noisy — every loading
// button looked like a real progress tracker even when the underlying
// task was a single LLM call. Now it's three staggered bouncing dots in
// the current text color, which read as activity without lying about
// completion. The legacy `value` / `target` / `duration` props are
// accepted but ignored to keep call sites compiling.
export function InlineProgress({ label }) {
  return (
    <span className="inline-flex items-center gap-1.5" aria-busy="true">
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        <span className="w-1 h-1 rounded-full bg-current opacity-60 animate-typing-bounce" />
        <span className="w-1 h-1 rounded-full bg-current opacity-60 animate-typing-bounce" style={{ animationDelay: '0.15s' }} />
        <span className="w-1 h-1 rounded-full bg-current opacity-60 animate-typing-bounce" style={{ animationDelay: '0.3s' }} />
      </span>
      {label && <span className="text-[11px]">{label}</span>}
    </span>
  );
}
