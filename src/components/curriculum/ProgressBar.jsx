export default function ProgressBar({ value = 0, max = 100, size = 'md', showLabel = true, className = '' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const heights = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`flex-1 bg-gray-100 dark:bg-[#1e1e2e] rounded-full overflow-hidden ${heights[size]}`}>
        <div
          className="h-full bg-blue-600 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums w-9 text-right">
          {pct}%
        </span>
      )}
    </div>
  );
}
