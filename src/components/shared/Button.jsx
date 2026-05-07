import { InlineProgress } from '../shared/ProgressBar';

const variants = {
  primary: 'bg-white/[0.10] hover:bg-white/[0.15] text-white/80 border border-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] backdrop-blur-sm',
  secondary: 'bg-white/[0.04] border border-white/[0.08] text-white/55 hover:bg-white/[0.08] hover:text-white/70',
  ghost: 'text-white/45 hover:bg-white/[0.06] hover:text-white/65',
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <InlineProgress active />}
      {children}
    </button>
  );
}
