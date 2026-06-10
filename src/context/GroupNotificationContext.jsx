import {
  createContext, useContext, useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import { listGroups } from '../api/studyGroups';
import { getMyProfile } from '../api/social';
import { useAuth } from './AuthContext';
import {
  loadBaselines, saveBaselines, snapshotGroup, reconcile, classifyDisappearance,
} from './groupNotificationDerive';

// GroupNotificationContext - frontend notification layer for Group Study.
//
// Polls GET /api/study-groups and derives unread activity per group against a
// persisted per-group lastSeenAt baseline (see groupNotificationDerive.js):
// new library contributions, a new live session, and membership changes.
// NotificationBadge reads `totalUnreadCount` from here for the Social nav
// bubble; GroupListView reads `unreadCountByGroup` (AC-GS-006.5),
// `activeSessions` (joinable-banner data), and `groupEvents` (inline
// removal/disband notices, AC-GS-006.3/006.4).
//
// Polling cadence: 30s by default, shortened to 5s while a group detail
// screen is open. GroupDetailView opts in by calling
// `setGroupDetailOpen(groupId)` on mount and `setGroupDetailOpen(null)` on
// unmount - the open group is also re-baselined every tick, which is what
// keeps its lastSeenAt current while the user is looking at it.
//
// Removal/disband detection: a group that vanishes between polls is
// classified with a one-shot GET /api/social/profile read of the typed
// notifications the server already writes (group_removed/group_disbanded,
// WO-2). The profile endpoint is only hit when something disappeared - the
// steady-state poll remains /api/study-groups alone, per the blueprint.

const POLL_INTERVAL_DEFAULT = 30000;
const POLL_INTERVAL_DETAIL_OPEN = 5000;

export const GroupNotificationContext = createContext(null);

export function GroupNotificationProvider({ children }) {
  const { user } = useAuth();
  const [unreadCountByGroup, setUnreadCountByGroup] = useState({});
  const [activeSessions, setActiveSessions] = useState([]);
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [groupEvents, setGroupEvents] = useState([]);
  const [detailOpenGroupId, setDetailOpenGroupId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Guards against a slow in-flight fetch landing after a newer one (or after
  // sign-out) and clobbering fresher state.
  const reqIdRef = useRef(0);
  // Baselines live in a ref (and localStorage) rather than state: they change
  // on every tick and only matter to the next reconcile, not to rendering.
  const baselinesRef = useRef(null);
  // Latest poll rows, so markGroupSeen can snapshot a group without waiting
  // for another network round-trip.
  const lastGroupsRef = useRef([]);
  const userId = user?.id ?? null;

  // (Re)load persisted baselines when the signed-in user changes.
  useEffect(() => {
    baselinesRef.current = userId ? loadBaselines(userId) : null;
  }, [userId]);

  // detailOpenGroupId is read inside refresh via a ref so marking a group
  // seen doesn't force the polling loop to re-arm mid-interval.
  const detailOpenRef = useRef(null);
  useEffect(() => { detailOpenRef.current = detailOpenGroupId; }, [detailOpenGroupId]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setUnreadCountByGroup({});
      setActiveSessions([]);
      setPendingInvitations([]);
      setGroupEvents([]);
      setError(null);
      return;
    }
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const data = await listGroups();
      if (reqId !== reqIdRef.current) return; // superseded
      const groups = Array.isArray(data?.groups) ? data.groups : [];
      const invitations = Array.isArray(data?.invitations) ? data.invitations : [];

      const baselines = baselinesRef.current ?? loadBaselines(userId);
      const nowIso = new Date().toISOString();
      const { unreadCountByGroup: unread, nextBaselines, disappearedIds } =
        reconcile(groups, baselines, nowIso, detailOpenRef.current);

      // A vanished group means the user was removed or the group was
      // disbanded (AC-GS-006.3 / AC-GS-006.4). Classify from the typed
      // notifications the server wrote; fall back to a generic notice.
      if (disappearedIds.length > 0) {
        let notifications = [];
        try {
          const prof = await getMyProfile();
          notifications = prof?.profile?.notifications || [];
        } catch {}
        if (reqId !== reqIdRef.current) return;
        const newEvents = disappearedIds.map((groupId) => {
          const info = classifyDisappearance(notifications, groupId);
          return {
            id: `${groupId}:${info?.type || 'group_unavailable'}`,
            type: info?.type || 'group_unavailable',
            groupId,
            groupName: info?.groupName || null,
            fromName: info?.fromName || null,
            at: info?.at || nowIso,
          };
        });
        setGroupEvents((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          const fresh = newEvents.filter((e) => !seen.has(e.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      }

      baselinesRef.current = nextBaselines;
      saveBaselines(userId, nextBaselines);
      lastGroupsRef.current = groups;

      setUnreadCountByGroup(unread);
      setActiveSessions(groups
        .filter((g) => g.activeSession)
        .map((g) => ({
          groupId: g.id,
          groupName: g.name,
          sessionId: g.activeSession.sessionId,
          hostId: g.activeSession.hostId,
          itemTitle: g.activeSession.itemTitle,
          mode: g.activeSession.mode,
        })));
      setPendingInvitations(invitations);
      setError(null);
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      // Transient poll failures must not blow away the counts the badge is
      // built from - record the error but keep the last good data.
      setError(e);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [userId]);

  // Re-baseline one group at "now" (the user just saw it). Used by
  // GroupDetailView on open; the polling loop keeps the open group seen on
  // subsequent ticks while its detail screen stays open.
  const markGroupSeen = useCallback((groupId) => {
    if (!userId || !groupId) return;
    const baselines = baselinesRef.current ?? loadBaselines(userId);
    const nowIso = new Date().toISOString();
    const row = lastGroupsRef.current.find((g) => g.id === groupId);
    const next = row
      ? snapshotGroup(row, nowIso)
      : { ...(baselines[groupId] || { libraryCount: 0, memberCount: 0, lastSessionId: null }), lastSeenAt: nowIso };
    baselinesRef.current = { ...baselines, [groupId]: next };
    saveBaselines(userId, baselinesRef.current);
    setUnreadCountByGroup((prev) => (prev[groupId] ? { ...prev, [groupId]: 0 } : prev));
  }, [userId]);

  const setGroupDetailOpen = useCallback((groupId) => {
    setDetailOpenGroupId(groupId || null);
    if (groupId) markGroupSeen(groupId);
  }, [markGroupSeen]);

  const dismissGroupEvent = useCallback((eventId) => {
    setGroupEvents((prev) => prev.filter((e) => e.id !== eventId));
  }, []);

  // Re-fetch whenever the signed-in user changes (login/logout/profile switch).
  useEffect(() => { refresh(); }, [refresh]);

  // Polling loop. Re-arms whenever the cadence (detail screen open) or auth
  // changes. Skips ticks while the tab is hidden to avoid pointless background
  // churn, and fires an immediate catch-up refresh when the tab becomes
  // visible again.
  useEffect(() => {
    if (!userId) return undefined;
    const interval = detailOpenGroupId ? POLL_INTERVAL_DETAIL_OPEN : POLL_INTERVAL_DEFAULT;
    const id = setInterval(() => {
      if (!document.hidden) refresh();
    }, interval);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, detailOpenGroupId, refresh]);

  // Pending group invitations count as unread group activity on the badge
  // (AC-GS-002.4): an invite must alert the user even though its group is not
  // in unreadCountByGroup (the user is not a member yet).
  const totalUnreadCount = useMemo(
    () => Object.values(unreadCountByGroup).reduce((sum, n) => sum + n, 0)
      + pendingInvitations.length,
    [unreadCountByGroup, pendingInvitations],
  );

  const value = useMemo(() => ({
    unreadCountByGroup,
    totalUnreadCount,
    activeSessions,
    pendingInvitations,
    groupEvents,
    dismissGroupEvent,
    markGroupSeen,
    setGroupDetailOpen,
    refresh,
    loading,
    error,
  }), [
    unreadCountByGroup, totalUnreadCount, activeSessions, pendingInvitations,
    groupEvents, dismissGroupEvent, markGroupSeen, setGroupDetailOpen,
    refresh, loading, error,
  ]);

  return (
    <GroupNotificationContext.Provider value={value}>
      {children}
    </GroupNotificationContext.Provider>
  );
}

export function useGroupNotifications() {
  const ctx = useContext(GroupNotificationContext);
  if (!ctx) throw new Error('useGroupNotifications must be used within GroupNotificationProvider');
  return ctx;
}
