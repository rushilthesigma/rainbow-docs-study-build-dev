<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-11

**Work Order:** WO-11 — Build GroupNotificationContext
**Created At (UTC):** 2026-06-10T07:06:13Z

## Summary

Delivers `GroupNotificationContext`, the frontend notification layer for Group Study. A provider
polls `GET /api/study-groups` (30s default, 5s while a group detail screen is open), keeps a
persisted per-group `lastSeenAt` baseline, and derives unread activity counts from poll deltas:
new library contributions, a new live session, and membership changes. It exposes
`unreadCountByGroup`, `totalUnreadCount`, `activeSessions`, `pendingInvitations`, `groupEvents`
(removal/disband notices), and `markGroupSeen(groupId)`. `NotificationBadge` (WO-4) gains its
documented `GroupNotificationContext` wiring for the group count; `GroupListView` (WO-8) gets the
in-scope inline removal/disband notices plus context-fed `unreadByGroup` data; `GroupDetailView`
gets the non-rendering `markGroupSeen` + fast-poll wiring required by the lastSeenAt contract.

Implementation approach: mirror `SharingContext.jsx` (the sibling notification context built in a
prior WO) for polling/auth/visibility mechanics, and put all unread-derivation logic in a pure,
React-free module so it can be exercised directly with `node` (no test runner exists in this repo).

## Code Reuse And Package Structure

Reused directly:

- `src/api/studyGroups.js` — `listGroups()` wraps `GET /api/study-groups` (StudyGroupApiClient). The poll uses it; no new fetch code.
- `src/api/social.js` — `getMyProfile()` wraps `GET /api/social/profile`, whose `profile.notifications` carries the server-written `group_removed` / `group_disbanded` records (WO-2). Used one-shot to classify a group that vanished between polls; NOT polled.
- `src/context/AuthContext.jsx` — `useAuth().user` (`user.id` keys the localStorage baseline store; auth gates polling).
- `src/context/SharingContext.jsx` — followed as the proven pattern: reqId stale-response guard, visibilitychange catch-up, cadence re-arm, error-preserves-last-good-data.

Created:

- `src/context/groupNotificationDerive.js` — pure derivation module (no React imports): baseline shape, unread math, disappearance detection, baseline persistence helpers.
- `src/context/GroupNotificationContext.jsx` — context + provider + `useGroupNotifications()` hook.
- `scripts/verify-group-notifications.mjs` — standalone node assertion script for the pure module.

Modified:

- `src/main.jsx` — mount `GroupNotificationProvider` inside `AuthProvider` next to `SharingProvider`.
- `src/components/shared/NotificationBadge.jsx` — null-safe `useContext(GroupNotificationContext)` feeding the documented `groupCount` resolution slot (rendering untouched).
- `src/components/group/GroupListView.jsx` — (a) default `unreadByGroup` from the context when the prop is absent; (b) render dismissible inline removal/disband notices from `groupEvents` (explicitly in WO-11 scope: "Notifications for group events (removal, disband) should surface inline in GroupListView").
- `src/components/group/GroupDetailView.jsx` — non-rendering effect: on mount `markGroupSeen(groupId)` + register detail-open (5s cadence), on unmount unregister. Null-safe when no provider.

Not touched (out of scope): server.js (notification writes are WO-2/WO-3, already landed),
NotificationBadge rendering (WO-4), GroupListView active-session join banner rendering (WO-8 —
the existing Live button stays; this WO only exposes `activeSessions` data).

## Components And Flow

### `groupNotificationDerive.js` (pure)

```js
// Baseline persisted per user in localStorage `covalent.groupSeen.<userId>`:
// { [groupId]: { lastSeenAt, libraryCount, memberCount, lastSessionId } }
loadBaselines(userId) -> baselines          // {} on parse error; best-effort try/catch
saveBaselines(userId, baselines)            // best-effort try/catch (matches WidgetContext)
snapshotGroup(group, nowIso) -> baseline    // baseline from a poll summary row
deriveUnread(group, baseline) -> number     // contributions + newSession + membershipChange
reconcile(groups, baselines, nowIso, seenOpenGroupId) ->
  { unreadCountByGroup, nextBaselines, disappearedIds }
classifyDisappearance(notifications, groupId) -> { type, groupName, fromName, at } | null
```

Derivation rules (`deriveUnread`):

- contributions: `max(0, group.libraryCount - baseline.libraryCount)` — the list endpoint exposes counts, not item timestamps, so contribution unread is a count delta against the seen baseline (one unit per unseen item).
- new session: `+1` when `group.activeSession` exists and `activeSession.sessionId !== baseline.lastSessionId` (only while live — once ended the joinable moment is gone; history lives in the detail view).
- membership change: `+1` when `group.memberCount !== baseline.memberCount`.
- A group never seen before (no baseline) is baselined on first sight with zero unread — joining a group starts fresh.
- Self-healing: when `libraryCount` drops below the baseline (items removed), the baseline's count is lowered in `nextBaselines` so future additions count correctly.

`reconcile` also reports `disappearedIds`: ids present in baselines but absent from the poll
(group disbanded, or user removed). The provider classifies each via the typed notifications and
drops the dead baseline.

### `GroupNotificationContext.jsx`

```js
export const GroupNotificationContext = createContext(null);
export function GroupNotificationProvider({ children })
export function useGroupNotifications()   // throws outside provider, same as useSharing

// Context value:
{
  unreadCountByGroup,   // Record<groupId, number>  (AC-GS-006.5 data)
  totalUnreadCount,     // sum(unreadCountByGroup) + pendingInvitations.length (badge feed, AC-GS-002.4)
  activeSessions,       // [{ groupId, groupName, sessionId, hostId, itemTitle, mode }] (AC-GS-006.2 data)
  pendingInvitations,   // invitations from the poll (groupName, invitedByName, memberCount)
  groupEvents,          // [{ id, type:'group_removed'|'group_disbanded'|'group_unavailable', groupId, groupName, fromName?, at }]
  dismissGroupEvent,    // (eventId) => void
  markGroupSeen,        // (groupId) => void — re-baselines that group at "now"
  setGroupDetailOpen,   // (groupId|null) => void — 5s cadence while non-null; keeps that group continuously seen
  refresh, loading, error,
}
```

Flow per poll tick (mirrors SharingContext mechanics):

1. `listGroups()` → `{ groups, invitations }` (skip when signed out; reqId guard discards stale responses).
2. `reconcile(groups, baselines, now, detailOpenGroupId)` → unread map + next baselines; a group whose detail screen is open is re-snapshotted every tick (continuously seen — the user is looking at it).
3. For each `disappearedId`, one-shot `getMyProfile()` (single call per tick, only when something disappeared) → `classifyDisappearance` over `profile.notifications` → push a `group_removed` (AC-GS-006.3) or `group_disbanded` (AC-GS-006.4) event; `group_unavailable` fallback when no record matches. Events de-dupe by groupId+type and live in memory until dismissed.
4. Persist next baselines to localStorage; publish state.

Cadence: `setInterval` re-armed on `[user, detailOpenGroupId, refresh]` — 30000ms default,
5000ms while `detailOpenGroupId` is set. Hidden-tab ticks are skipped; `visibilitychange`
fires a catch-up refresh (same as SharingContext).

### Consumer wiring

- `NotificationBadge`: `const groupCtx = useContext(GroupNotificationContext);` then
  `const resolvedGroup = groupCount ?? groupCtx?.totalUnreadCount ?? 0;` — exactly the
  count-resolution slot WO-4 documented for this WO. Null-safe without a provider.
- `GroupListView`: `const groupCtx = useContext(GroupNotificationContext);` with prop-wins
  default `unreadByGroup ?? groupCtx?.unreadCountByGroup ?? {}`; renders `groupCtx?.groupEvents`
  as dismissible inline notice rows above the invitations section, with type-specific copy.
- `GroupDetailView`: mount effect calls `groupCtx?.markGroupSeen(groupId)` and
  `groupCtx?.setGroupDetailOpen(groupId)`; cleanup calls `setGroupDetailOpen(null)`.
- `main.jsx`: `<GroupNotificationProvider>` nested inside `<SharingProvider>`.

## Steps

1. **Pure derivation module** — `src/context/groupNotificationDerive.js`, fully self-contained (compilable alone).
2. **Provider** — `src/context/GroupNotificationContext.jsx` on top of (1) + `listGroups`/`getMyProfile`.
3. **Consumer wiring** — `main.jsx`, `NotificationBadge.jsx`, `GroupListView.jsx`, `GroupDetailView.jsx` (independent small diffs, any order after 2).
4. **Verification** — assertion script + build (below).

## Testing

No unit-test runner exists in this repo (prior WOs: vite build + traced flows). This WO adds a
runnable check because the derivation logic is pure ESM:

- **Derivation logic (automated):** `node scripts/verify-group-notifications.mjs` — standalone
  assertion script importing `src/context/groupNotificationDerive.js`. Cases:
  first-sight baselining (0 unread), contribution delta (+N), library shrink re-baseline,
  new-session +1 / same-session 0 / ended-session 0, membership change +1, markGroupSeen reset,
  disappearance detection, classification (removed vs disbanded vs fallback), corrupt
  localStorage payload tolerance.
- **Build:** `npm run build` (vite) — must pass with all touched/created frontend files.
- **Manual/exploratory (review phase):** start `node server.js`, exercise the API with seeded
  users via curl to confirm the poll payload shapes the derivation consumes
  (`groups[].libraryCount/memberCount/activeSession`, `invitations[]`, `profile.notifications[]`
  types) match what the module expects; trace the 30s→5s cadence and badge math through the
  wired components. Full in-browser E2E is constrained the same way WO-8 noted: no nav entry
  mounts GroupListView yet.
