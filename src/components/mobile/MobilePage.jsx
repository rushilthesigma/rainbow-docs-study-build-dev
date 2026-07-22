// Generic mobile page chrome. Centered title + spacious content area.
// Use this for tabs that don't yet have a fully-bespoke mobile UI -
// the wrapper gives them a consistent mobile feel (centered header,
// padded edges, pleasant spacing) without rewriting their guts.
export default function MobilePage({ title, children }) {
  return (
    <div className="px-4 pt-5 pb-8">
      {title && (
        <div className="text-center mb-5">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white">
            {title}
          </h1>
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}
