export default function Input({ label, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}
      <input
        className={`w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors text-sm ${className}`}
        {...props}
      />
    </div>
  );
}

export function Textarea({ label, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}
      <textarea
        className={`w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors text-sm resize-none ${className}`}
        {...props}
      />
    </div>
  );
}
