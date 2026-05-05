// Generic mobile page chrome. Centered title + spacious content area.
// Use this for tabs that don't yet have a fully-bespoke mobile UI —
// the wrapper gives them a consistent mobile feel (centered header,
// padded edges, pleasant spacing) without rewriting their guts.
export default function MobilePage({ title, subtitle, eyebrow, children }) {
  return (
    <div className="px-4 pt-5 pb-8">
      {(eyebrow || title || subtitle) && (
        <div className="text-center mb-5">
          {eyebrow && (
            <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-blue-500 dark:text-blue-300 mb-1">
              {eyebrow}
            </p>
          )}
          {title && (
            <h1 className="text-[26px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
          )}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}
