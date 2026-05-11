import { InlineProgress } from '../shared/ProgressBar';

const variants = {
  primary: 'bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white border border-blue-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_4px_16px_rgba(59,130,246,0.35)]',
  secondary: 'bg-blue-500/[0.08] border border-blue-400/[0.20] text-blue-100 hover:bg-blue-500/[0.14] hover:border-blue-400/[0.35] hover:text-white',
  ghost: 'text-slate-300 hover:bg-blue-500/[0.10] hover:text-blue-100',
  danger: 'bg-rose-500 hover:bg-rose-600 text-white',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

// Loading button — instead of a Loader2 spinner, the in-button state
// shows a tiny progress pill (live percentage). Indeterminate by default;
// set value={n} for a known percentage.
export default function Button({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:ring-offset-2 focus:ring-offset-[#141414] disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <InlineProgress active />}
      {children}
    </button>
  );
}
