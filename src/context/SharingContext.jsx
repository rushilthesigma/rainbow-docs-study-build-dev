import {
  createContext, useContext, useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import { apiFetch } from '../api/client';
import { useAuth } from './AuthContext';

// SharingContext - shared frontend notification layer for File & Note Sharing.
//
// Polls GET /api/share/incoming (built server-side in WO-1) to surface pending
// share invitations and the accepted-shares list to the app shell, and exposes
// the recipient/owner share actions. NotificationBadge reads `pendingCount`
// from here to render the unread bubble on the Social nav entry.
//
// Per the work order, this talks to the API directly via `apiFetch`; the
// dedicated ShareApiClient is a separate work order. When it lands, the four
// action calls below can delegate to it without changing this context's shape.
//
// Polling cadence: 30s by default, shortened to 10s while the user's shared
// library is open. A view (e.g. SharedWithMeView) opts into the faster cadence
// by calling `setLibraryOpen(true)` on mount and `setLibraryOpen(false)` on
// unmount - that keeps this context decoupled from any specific view.

const POLL_INTERVAL_DEFAULT = 30000;
const POLL_INTERVAL_LIBRARY_OPEN = 10000;

export const SharingContext = createContext(null);

export function SharingProvider({ children }) {
  const { user } = useAuth();
  const [incomingShares, setIncomingShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  // Guards against a slow in-flight fetch landing after a newer one (or after
  // sign-out) and clobbering fresher state.
  const reqIdRef = useRef(0);

  const refresh = useCallback(async () => {
    // Nothing to fetch when signed out; clear any stale list.
    if (!user) {
      setIncomingShares([]);
      setError(null);
      return;
    }
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const data = await apiFetch('/api/share/incoming');
      if (reqId !== reqIdRef.current) return; // superseded
      setIncomingShares(Array.isArray(data?.shares) ? data.shares : []);
      setError(null);
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      // Transient poll failures must not blow away the list the badge is built
      // from - record the error but keep the last good data.
      setError(e);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [user]);

  // A mutating action, then invalidate + re-fetch so counts stay in sync.
  const mutate = useCallback(async (path, options) => {
    const res = await apiFetch(path, options);
    await refresh();
    return res;
  }, [refresh]);

  const acceptShare = useCallback(
    (id) => mutate(`/api/share/${id}/accept`, { method: 'POST' }), [mutate]);
  const declineShare = useCallback(
    (id) => mutate(`/api/share/${id}/decline`, { method: 'POST' }), [mutate]);
  const revokeShare = useCallback(
    (id) => mutate(`/api/share/${id}`, { method: 'DELETE' }), [mutate]);
  const updatePermission = useCallback(
    (id, permissionLevel) =>
      mutate(`/api/share/${id}`, { method: 'PATCH', body: JSON.stringify({ permissionLevel }) }),
    [mutate]);

  // Re-fetch whenever the signed-in user changes (login/logout/profile switch).
  useEffect(() => { refresh(); }, [refresh]);

  // Polling loop. Re-arms whenever the cadence (libraryOpen) or auth changes.
  // Skips ticks while the tab is hidden to avoid pointless background churn,
  // and fires an immediate catch-up refresh when the tab becomes visible again.
  useEffect(() => {
    if (!user) return undefined;
    const interval = libraryOpen ? POLL_INTERVAL_LIBRARY_OPEN : POLL_INTERVAL_DEFAULT;
    const id = setInterval(() => {
      if (!document.hidden) refresh();
    }, interval);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, libraryOpen, refresh]);

  const pendingCount = useMemo(
    () => incomingShares.filter((s) => s.status === 'pending').length,
    [incomingShares],
  );

  const value = useMemo(() => ({
    incomingShares,
    pendingCount,
    loading,
    error,
    refresh,
    acceptShare,
    declineShare,
    revokeShare,
    updatePermission,
    setLibraryOpen,
  }), [
    incomingShares, pendingCount, loading, error, refresh,
    acceptShare, declineShare, revokeShare, updatePermission,
  ]);

  return <SharingContext.Provider value={value}>{children}</SharingContext.Provider>;
}

export function useSharing() {
  const ctx = useContext(SharingContext);
  if (!ctx) throw new Error('useSharing must be used within SharingProvider');
  return ctx;
}
