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
          <span className="font-mono tabular-nums text-white/70">{pct}%</span>
        </div>
      )}
      <div className={`w-full ${heightCls} rounded-full overflow-hidden bg-white/[0.08]`}>
        <div
          className="h-full bg-white/50 transition-all duration-200 ease-out rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint && <p className={`mt-1.5 ${textCls} text-white/35`}>{hint}</p>}
    </div>
  );
}

export function InlineProgress({ value, active = true, target = 92, duration = 2500, label }) {
  const [simulated, setSimulated] = useState(0);
  const startedAt = useRef(null);
  const wasActive = useRef(false);
  useEffect(() => {
    if (value !== undefined) return;
    if (!active) {
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
