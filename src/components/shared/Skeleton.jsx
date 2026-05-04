// Skeleton primitives — gray placeholder boxes that pulse to suggest
// the content is loading. Use these instead of a centered spinner
// whenever the eventual layout is known (which is most of the time).
//
// All blocks share a single `pulse` animation (Tailwind's `animate-pulse`)
// so the page reads as one synchronized "breathing" surface, not a
// patchwork of differently-timed loaders.

const baseLight = 'bg-gray-200 dark:bg-[#1e1e2e]';

export function SkeletonLine({ w = '100%', h = 12, className = '' }) {
  return (
    <div
      className={`${baseLight} rounded animate-pulse ${className}`}
      style={{ width: w, height: h }}
    />
  );
}

// Multi-line prose placeholder. Default 4 lines, last one shorter so
// it reads as a paragraph rather than a stack of identical bars.
export function SkeletonProse({ lines = 4, className = '' }) {
  const widths = ['96%', '88%', '92%', '76%', '84%', '70%', '90%'];
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} w={widths[i % widths.length]} h={10} />
      ))}
    </div>
  );
}

// Card-shaped block: optional title bar + a few prose lines + a footer.
// Drop-in for any list-item or card-list loading state.
export function SkeletonCard({ lines = 2, className = '' }) {
  return (
    <div className={`rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 space-y-3 ${className}`}>
      <SkeletonLine w="40%" h={14} />
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLine key={i} w={i === lines - 1 ? '60%' : '90%'} h={9} />
        ))}
      </div>
    </div>
  );
}

// Stack of N cards, used for list-loading states.
export function SkeletonCardList({ count = 3, lines = 2, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  );
}

// Avatar — circle with line beside it. Useful for user / message rows.
export function SkeletonAvatar({ size = 36, className = '' }) {
  return (
    <div
      className={`${baseLight} rounded-full animate-pulse ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

// Full-page placeholder that mimics the standard "header + sidebar +
// content card" layout. Used as a drop-in for `LoadingSpinner fullScreen`.
export function SkeletonPage({ className = '' }) {
  return (
    <div className={`min-h-screen w-full p-6 ${className}`}>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <SkeletonAvatar size={40} />
          <div className="flex-1 space-y-2">
            <SkeletonLine w="35%" h={14} />
            <SkeletonLine w="22%" h={10} />
          </div>
        </div>
        <SkeletonCard lines={3} />
        <SkeletonCardList count={3} lines={2} />
      </div>
    </div>
  );
}

// Default export — tiny one-liner for inline "still loading" places.
export default function Skeleton({ w = '100%', h = 12, className = '' }) {
  return <SkeletonLine w={w} h={h} className={className} />;
}
