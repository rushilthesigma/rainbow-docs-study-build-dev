export default function PillGroup({ label, options, value, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-sm font-medium text-white/45">{label}</label>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isActive = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors backdrop-blur-sm ${
                isActive
                  ? 'bg-white/[0.12] text-white/90 border border-white/[0.20] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
                  : 'bg-white/[0.04] border border-white/[0.06] text-white/40 hover:bg-white/[0.08] hover:text-white/60'
              }`}
            >
              {opt.label}
              {opt.description && (
                <span className={`ml-1 text-xs ${isActive ? 'text-white/60' : 'text-white/30'}`}>
                  {opt.description}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
