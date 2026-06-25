import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

// "Which AI writes my tossups" picker for Quiz Bowl. Both QB surfaces
// (desktop app + mobile) are dark, so one dark-glass style serves both. Built
// as an inline accordion rather than a portaled popover so it can't clip
// inside the scrollable setup form. `models` is the pre-gated list from
// useQbModel; the server re-enforces access on /api/chat.
export default function QbModelPicker({ value, onPick, models, label = 'AI model' }) {
  const [open, setOpen] = useState(false);
  const current = models.find((m) => m.key === value) || models[0];
  if (!current) return null;

  return (
    <div>
      <span className="block mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] text-left transition-colors"
      >
        <p className="flex-1 min-w-0 text-[12px] font-semibold text-white/85 truncate flex items-center gap-1.5">
          {current.label}
          <span className="text-[10px] font-medium text-white/35">{current.provider}</span>
        </p>
        <ChevronDown size={14} className={`text-white/40 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-1 space-y-0.5 max-h-[260px] overflow-y-auto">
          {models.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => { onPick(m.key); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors ${
                value === m.key ? 'bg-blue-500/15' : 'hover:bg-white/[0.06]'
              }`}
            >
              <p className="flex-1 min-w-0 text-[12px] font-semibold text-white/85 truncate flex items-center gap-1.5">
                {m.label}
                <span className="text-[10px] font-medium text-white/35">{m.provider}</span>
              </p>
              {value === m.key && <Check size={13} className="text-blue-300 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
