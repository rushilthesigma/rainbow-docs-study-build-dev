// accent: 'neutral' (default) keeps the subtle white "on" track; 'blue' turns
// the on-state the app accent blue. Off-state styling is shared by both.
export default function Toggle({ label, description, checked, onChange, accent = 'neutral' }) {
  const onTrack = accent === 'blue'
    ? 'bg-blue-500 border border-blue-400'
    : 'bg-white/25 border border-white/30';
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer w-full">
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-white/75">{label}</span>
        {description && <span className="text-[11px] text-white/30 leading-relaxed">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
          checked ? onTrack : 'bg-white/[0.06] border border-white/[0.14]'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full transition-transform ${
            checked ? 'translate-x-6 bg-white' : 'translate-x-1 bg-white/40'
          }`}
        />
      </button>
    </label>
  );
}
