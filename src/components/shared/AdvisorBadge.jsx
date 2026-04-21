import { Shield } from 'lucide-react';

// Red "Advisor" pill. Render next to a user's name/handle anywhere an
// Owner/Pro badge also appears. Small and inline — not a block element.
export default function AdvisorBadge({ size = 'sm' }) {
  const sz = size === 'xs'
    ? 'text-[9px] px-1 py-[1px] gap-0.5'
    : 'text-[10px] px-1.5 py-0.5 gap-1';
  return (
    <span
      className={`inline-flex items-center ${sz} font-bold rounded-full bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-sm`}
      title="Advisor"
    >
      <Shield size={size === 'xs' ? 8 : 10} />
      ADVISOR
    </span>
  );
}
