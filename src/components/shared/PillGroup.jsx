export default function PillGroup({ label, options, value, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isActive = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2A2A40]'
              }`}
            >
              {opt.label}
              {opt.description && (
                <span className={`ml-1 text-xs ${isActive ? 'text-blue-200' : 'text-gray-400'}`}>
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
