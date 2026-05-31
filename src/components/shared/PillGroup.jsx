import { Lock } from 'lucide-react';

// Options may set `locked: true` — renders greyed + disabled with a lock icon
// and an optional `lockLabel` (the plan it needs). Locked options can't be
// selected.
export default function PillGroup({ label, options, value, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-sm font-medium text-blue-200/55">{label}</label>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isActive = value === opt.value;
          const locked = !!opt.locked;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={locked}
              onClick={() => onChange(opt.value)}
              title={locked && opt.lockLabel ? `Requires ${opt.lockLabel}` : undefined}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all inline-flex items-center ${
                locked
                  ? 'bg-white/[0.02] border border-white/[0.06] text-white/35 cursor-not-allowed'
                  : isActive
                  ? 'bg-blue-500 hover:bg-blue-400 text-white'
                  : 'bg-blue-500/[0.04] border border-blue-400/[0.10] text-blue-100/55 hover:bg-blue-500/[0.10] hover:border-blue-400/[0.22] hover:text-blue-100/85 backdrop-blur-sm'
              }`}
            >
              {locked && <Lock size={11} className="mr-1 opacity-70" />}
              {opt.label}
              {opt.description && !locked && (
                <span className={`ml-1 text-xs ${isActive ? 'text-white/85' : 'text-white/30'}`}>
                  {opt.description}
                </span>
              )}
              {locked && opt.lockLabel && (
                <span className="ml-1 text-[10px] font-semibold text-amber-300/80">{opt.lockLabel}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
