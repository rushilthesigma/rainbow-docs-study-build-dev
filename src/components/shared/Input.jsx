import { useId } from 'react';

// Shared input primitive - links label↔input via htmlFor/id, supports
// an `error` prop wired through aria-describedby, and forwards every
// native attribute (`required`, `pattern`, `min`, `max`, `type`, etc.)
// so callers don't need to drop down to raw <input>.

const baseField =
  'w-full px-3 py-2 rounded-xl border bg-white/[0.04] text-white/85 placeholder-white/25 focus:outline-none focus:ring-2 transition-colors text-sm';
const fieldOk = 'border-white/[0.08] focus:ring-blue-400/40 focus:border-blue-400/55 focus:bg-blue-500/[0.05]';
const fieldErr = 'border-rose-400/40 focus:ring-rose-400/40 focus:border-rose-400/60';

export default function Input({ label, error, id, className = '', ...props }) {
  const autoId = useId();
  const inputId = id || autoId;
  const errId = `${inputId}-err`;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-blue-700 dark:text-blue-200/55">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errId : undefined}
        className={`${baseField} ${error ? fieldErr : fieldOk} ${className}`}
        {...props}
      />
      {error && (
        <span id={errId} role="alert" className="text-xs text-rose-300/90">
          {error}
        </span>
      )}
    </div>
  );
}

export function Textarea({ label, error, id, className = '', ...props }) {
  const autoId = useId();
  const inputId = id || autoId;
  const errId = `${inputId}-err`;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-blue-700 dark:text-blue-200/55">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errId : undefined}
        className={`${baseField} resize-none ${error ? fieldErr : fieldOk} ${className}`}
        {...props}
      />
      {error && (
        <span id={errId} role="alert" className="text-xs text-rose-300/90">
          {error}
        </span>
      )}
    </div>
  );
}
