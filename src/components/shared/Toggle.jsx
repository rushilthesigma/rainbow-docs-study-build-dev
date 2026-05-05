// Block-level toggle row. `flex justify-between` so when multiple
// toggles are stacked under `space-y-3` they each take a full row
// instead of collapsing onto the same baseline (which used to push
// the second toggle's label into the first toggle's switch).
export default function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer w-full">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
          checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-[#2A2A40]'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}
