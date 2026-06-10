import { useContext } from 'react';
import { SharingContext } from '../../context/SharingContext';
import { GroupNotificationContext } from '../../context/GroupNotificationContext';

// NotificationBadge - combined unread count for the Social nav entry.
//
// Sums pending share invitations (from SharingContext) and group activity
// (from GroupNotificationContext). Counts can come from either context OR
// explicit props, so the badge is a self-contained drop-in that works
// wherever it is mounted - including before those providers exist.
//
// Count resolution (first that applies wins for each source):
//   • `count`      - explicit total, overrides everything below
//   • `shareCount` - explicit share count, else SharingContext.pendingCount (0 if no provider)
//   • `groupCount` - explicit group count, else GroupNotificationContext.totalUnreadCount (0 if no provider)
//
// Renders nothing when the total is zero, so callers can mount it
// unconditionally on an icon/nav entry without managing visibility.
export default function NotificationBadge({
  count,
  shareCount,
  groupCount,
  max = 99,
  className = '',
  title,
  ...rest
}) {
  // null-safe: useContext returns null when there is no provider above, so
  // the badge never throws when used purely with props.
  const sharing = useContext(SharingContext);
  const groupNotifications = useContext(GroupNotificationContext);
  const resolvedShare = shareCount ?? sharing?.pendingCount ?? 0;
  const resolvedGroup = groupCount ?? groupNotifications?.totalUnreadCount ?? 0;
  const total = count ?? (resolvedShare + resolvedGroup);

  if (!total || total <= 0) return null;

  const display = total > max ? `${max}+` : String(total);

  return (
    <span
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-r from-rose-500 to-red-600 text-white text-[10px] font-bold leading-none shadow-sm ${className}`}
      title={title ?? `${total} unread`}
      aria-label={`${total} unread notifications`}
      {...rest}
    >
      {display}
    </span>
  );
}
