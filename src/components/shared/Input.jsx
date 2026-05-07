export default function Input({ label, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-white/45">{label}</label>}
      <input
        className={`w-full px-3 py-2 rounded-xl border border-white/[0.07] bg-white/[0.04] text-white/85 placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/[0.14] transition-colors text-sm ${className}`}
        {...props}
      />
    </div>
  );
}

export function Textarea({ label, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-white/45">{label}</label>}
      <textarea
        className={`w-full px-3 py-2 rounded-xl border border-white/[0.07] bg-white/[0.04] text-white/85 placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/[0.14] transition-colors text-sm resize-none ${className}`}
        {...props}
      />
    </div>
  );
}
