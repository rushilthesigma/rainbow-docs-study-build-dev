// LoadingSpinner — kept as a name-stable export, but the implementation
// no longer spins. Every call site now gets a skeleton screen (when the
// surrounding layout is known) or a determinate progress bar with a live
// percentage (when it's a thin row inside a card / button area).
//
// Modes (prop `as`):
//   - 'auto' (default) — fullScreen → SkeletonPage, otherwise → SkeletonCardList
//   - 'bar'            — renders a ProgressBar with simulated %
//   - 'skeleton'       — forces SkeletonCardList regardless of fullScreen
//
// Existing call sites pass `<LoadingSpinner fullScreen />` or
// `<LoadingSpinner size={24} />` — those keep working with the new visuals.
import { SkeletonPage, SkeletonCardList } from './Skeleton';
import ProgressBar from './ProgressBar';

export default function LoadingSpinner({ fullScreen = false, size, className = '', as = 'auto', label = 'Loading' }) {
  if (as === 'bar') {
    return (
      <div className={`px-4 py-3 ${className}`}>
        <ProgressBar active label={label} />
      </div>
    );
  }
  if (as === 'skeleton' || !fullScreen) {
    return (
      <div className={`w-full ${className}`}>
        <SkeletonCardList count={3} lines={2} />
      </div>
    );
  }
  // fullScreen + auto → page-shaped skeleton
  return (
    <div className="min-h-screen w-full bg-[#F4F5F7] dark:bg-[#0D0D14]">
      <SkeletonPage />
    </div>
  );
}
