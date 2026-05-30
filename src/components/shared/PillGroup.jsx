export default function PillGroup({ label, options, value, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-sm font-medium text-blue-200/55">{label}</label>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isActive = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white border border-blue-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_4px_16px_rgba(59,130,246,0.35)]'
                  : 'bg-blue-500/[0.04] border border-blue-400/[0.10] text-blue-100/55 hover:bg-blue-500/[0.10] hover:border-blue-400/[0.22] hover:text-blue-100/85 backdrop-blur-sm'
              }`}
            >
              {opt.label}
              {opt.description && (
                <span className={`ml-1 text-xs ${isActive ? 'text-white/85' : 'text-white/30'}`}>
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
