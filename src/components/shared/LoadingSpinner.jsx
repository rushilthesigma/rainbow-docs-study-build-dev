import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ fullScreen, size = 24, className = '' }) {
  if (fullScreen) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#F4F5F7] dark:bg-[#0D0D14]">
        <Loader2 size={32} className="animate-spin text-blue-500" />
      </div>
    );
  }
  return <Loader2 size={size} className={`animate-spin text-blue-500 ${className}`} />;
}
