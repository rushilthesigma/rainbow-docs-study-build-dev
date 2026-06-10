// Pure unread-derivation logic for GroupNotificationContext (Group Study).
//
// GET /api/study-groups returns per-group summaries with counts only
// ({ libraryCount, memberCount, activeSession }), not per-item timestamps, so
// "activity since lastSeenAt" is computed as deltas against a persisted
// per-group baseline snapshot taken whenever the user last saw the group
// (markGroupSeen / opening the group detail screen).
//
// No React imports here: the provider owns state and polling; this module owns
// the math, so it can be exercised directly with node (the repo has no test
// runner — see scripts/verify-group-notifications.mjs).

const STORAGE_PREFIX = 'covalent.groupSeen.';

// Baselines: { [groupId]: { lastSeenAt, libraryCount, memberCount, lastSessionId } }

export function loadBaselines(userId) {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveBaselines(userId, baselines) {
  if (!userId) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(baselines));
  } catch {}
}

// Snapshot a poll summary row as the "seen" state of that group.
export function snapshotGroup(group, nowIso) {
  return {
    lastSeenAt: nowIso,
    libraryCount: group.libraryCount || 0,
    memberCount: group.memberCount || 0,
    // Seeing a group while a session is live consumes that session's alert;
    // keeping the id (not just a boolean) lets a *different* later session
    // alert again while this one never re-fires.
    lastSessionId: group.activeSession?.sessionId ?? null,
  };
}

// Unread units for one group against its seen baseline:
//   - one per library contribution beyond the baseline count (AC-GS-006.1)
//   - one for a live session the user hasn't seen yet (AC-GS-006.2)
//   - one when membership changed since the baseline (REQ-GS-006 membership changes)
export function deriveUnread(group, baseline) {
  if (!baseline) return 0;
  let unread = Math.max(0, (group.libraryCount || 0) - baseline.libraryCount);
  const session = group.activeSession;
  if (session && session.sessionId !== baseline.lastSessionId) unread += 1;
  if ((group.memberCount || 0) !== baseline.memberCount) unread += 1;
  return unread;
}

// Fold one poll result into unread counts and the next baseline set.
//
// - Unknown groups (newly joined / first run) are baselined at zero unread:
//   joining a group starts fresh rather than marking its history unread.
// - `seenOpenGroupId` is the group whose detail screen is open right now; it
//   is re-snapshotted every tick (the user is looking at it, nothing there is
//   unread) — this is what keeps lastSeenAt current during a detail visit.
// - A baseline whose libraryCount exceeds the group's current count (items
//   were removed) is lowered so future contributions count correctly.
// - `disappearedIds`: groups we had a baseline for that the poll no longer
//   returns — the user was removed or the group was disbanded; the caller
//   classifies via the server's typed notifications. Their baselines are
//   dropped from `nextBaselines`.
export function reconcile(groups, baselines, nowIso, seenOpenGroupId = null) {
  const unreadCountByGroup = {};
  const nextBaselines = {};
  const present = new Set();

  for (const group of groups) {
    present.add(group.id);
    const baseline = baselines[group.id];
    if (!baseline || group.id === seenOpenGroupId) {
      unreadCountByGroup[group.id] = 0;
      nextBaselines[group.id] = snapshotGroup(group, nowIso);
      continue;
    }
    unreadCountByGroup[group.id] = deriveUnread(group, baseline);
    nextBaselines[group.id] = {
      ...baseline,
      libraryCount: Math.min(baseline.libraryCount, group.libraryCount || 0),
    };
  }

  const disappearedIds = Object.keys(baselines).filter((id) => !present.has(id));
  return { unreadCountByGroup, nextBaselines, disappearedIds };
}

// Match a vanished group to the server-written notification that explains it
// (server.js pushes { type: 'group_removed' | 'group_disbanded', groupId,
// groupName, fromUserId, fromName, createdAt, read } onto the user's profile
// notifications). Latest matching record wins; null when none matches and the
// caller falls back to a generic "no longer available" event.
export function classifyDisappearance(notifications, groupId) {
  const matches = (Array.isArray(notifications) ? notifications : []).filter(
    (n) => n && n.groupId === groupId
      && (n.type === 'group_removed' || n.type === 'group_disbanded'),
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const latest = matches[matches.length - 1];
  return {
    type: latest.type,
    groupName: latest.groupName || null,
    fromName: latest.fromName || null,
    at: latest.createdAt || null,
  };
}
