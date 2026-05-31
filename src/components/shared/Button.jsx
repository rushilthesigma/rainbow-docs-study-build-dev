// Flat, modern style: solid colors, single hover step, no gradients, no
// glow shadows, no inset highlights. Borders only where there's no
// background (secondary) to maintain affordance.
const variants = {
  primary: 'bg-blue-500 hover:bg-blue-400 text-white',
  secondary: 'bg-blue-500/[0.08] border border-blue-400/[0.20] text-blue-100 hover:bg-blue-500/[0.14] hover:border-blue-400/[0.35] hover:text-white',
  ghost: 'text-slate-300 hover:bg-blue-500/[0.10] hover:text-blue-100',
  danger: 'bg-rose-500 hover:bg-rose-400 text-white',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

// Loading button: `loading={true}` just sets `disabled` and dims the
// button. Call sites that want a visual cue swap their own children
// (e.g. {loading ? 'Rewriting…' : 'Rewrite'}) - the previous fake
// in-button progress pill was misleading and noisy, so it's gone.
export default function Button({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:ring-offset-2 focus:ring-offset-[#141414] disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {children}
    </button>
  );
}
