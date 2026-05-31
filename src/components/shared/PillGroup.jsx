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
                  ? 'bg-blue-500 hover:bg-blue-400 text-white'
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
