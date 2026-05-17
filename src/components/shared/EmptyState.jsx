import { Inbox } from 'lucide-react';

// Shared empty state — drop in wherever a list, deck, or panel has
// no items yet so the screen doesn't render a blank void. Pass an
// `action` (a Button or link) for a call-to-action.
export default function EmptyState({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  body,
  action,
  className = '',
}) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center text-center px-6 py-10 gap-3 ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/[0.05] border border-white/[0.07]">
        <Icon size={20} className="text-white/55" />
      </div>
      <div>
        <div className="text-sm font-semibold text-white/85">{title}</div>
        {body && <div className="text-xs text-white/55 mt-1 max-w-xs">{body}</div>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
