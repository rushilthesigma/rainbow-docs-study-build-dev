import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export default function VoiceSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (!ref.current?.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = options.find((o) => o.value === value) || options[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-800 dark:text-white/85 border border-transparent hover:bg-gray-200 dark:hover:bg-white/[0.1] focus:outline-none focus:border-gray-300 dark:focus:border-white/20 transition-colors"
      >
        <span className="truncate text-left">{current?.label}</span>
        <ChevronDown size={12} className={`shrink-0 text-gray-400 dark:text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-md border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-[#222227] shadow-xl py-1 max-h-40 overflow-y-auto">
          {options.map((o) => {
            const sel = o.value === value;
            return (
              <button
                key={o.value ?? 'default'}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-[11px] transition-colors ${
                  sel
                    ? 'bg-gray-100 dark:bg-white/[0.08] text-gray-900 dark:text-white font-semibold'
                    : 'text-gray-700 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/[0.05]'
                }`}
              >
                <span className="flex-1 truncate">{o.label}</span>
                {sel && <Check size={12} className="shrink-0 text-gray-500 dark:text-white/60" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
