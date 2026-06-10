<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-4

**Work Order:** WO-4 — Build SharingContext & NotificationBadge
**Created At (UTC):** 2026-06-10T06:32:46Z

## Summary

Add the shared frontend notification layer for Sharing & Collaboration: a `SharingContext`
React provider that polls `GET /api/share/incoming` (built in WO-1) and exposes pending-share
state plus accept/decline/revoke/updatePermission actions, and a reusable `NotificationBadge`
component that renders a combined unread count (share invitations + group activity). Approach is
strictly additive and frontend-only to stay safe alongside the parallel WO-3 (SSE backend) work.

## Safety / Parallel-Work Constraints

- Another agent is executing WO-3 (SessionManager / SSE) which edits `server.js`. **WO-4 does not
  touch `server.js` or any backend file** — the `/api/share/*` endpoints already exist (WO-1).
- No edits to the dock (`appRegistry.js`), `MenuBar.jsx`, or any contended shared component.
- `NotificationBadge` is built as a self-contained reusable drop-in (counts via props or context),
  so no orphaned "Social nav entry" needs to be invented or mounted in this WO.
- Only one small additive edit to a shared file: mounting `SharingProvider` in `src/main.jsx`.

## Code Reuse And Package Structure

Reuse / follow-pattern:
- `src/context/AuthContext.jsx` — canonical context shape to mirror: `createContext(null)`,
  `XProvider({children})`, `useX()` hook with an "must be used within provider" guard. The polling
  + transient-error-tolerant fetch loop is also the model for resilient polling.
- `src/api/client.js` `apiFetch(path, options)` — the single fetch helper (token, 401 redirect,
  402 plan-limit, JSON). `SharingContext` calls `apiFetch` **directly** per WO scope note
  ("context calls the API directly or delegates to the client once available") — `ShareApiClient`
  is WO-5, intentionally not created here.
- `GET /api/share/incoming` response: `{ shares: [{ id, itemId, itemType, ownerId, recipientId,
  permissionLevel, status: 'pending'|'accepted', ownerName, ownerHandle, itemTitle, itemExists,
  itemUpdatedAt, createdAt, updatedAt }] }` (server.js:9135). Mutations: `POST /api/share/:id/accept`,
  `POST /api/share/:id/decline`, `PATCH /api/share/:id {permissionLevel}`, `DELETE /api/share/:id`.

Created:
- `src/context/SharingContext.jsx` — provider + `useSharing()` hook.
- `src/components/shared/NotificationBadge.jsx` — reusable badge.

Modified:
- `src/main.jsx` — wrap the tree in `<SharingProvider>` (inside `AuthProvider`, since polling needs auth).

## Components And Flow

**SharingContext** (Blueprint: Frontend / Shared Shell → `SharingContext`)
- State: `incomingShares` (raw list), `loading`, `error`.
- Derived: `pendingCount = incomingShares.filter(s => s.status === 'pending').length`.
- Exposed value: `{ incomingShares, pendingCount, loading, error, refresh, acceptShare(id),
  declineShare(id), revokeShare(id), updatePermission(id, level), setLibraryOpen(bool) }`.
- Polling: `setInterval` calling `refresh()`; interval is 30s normally, 10s while `libraryOpen`.
  Only polls when an auth token is present (reuses `getToken()`); pauses when the tab is hidden
  (`document.visibilitychange`) to avoid needless churn. Each mutating action awaits the API then
  calls `refresh()` to invalidate/re-fetch (AC: list stays in sync).
- `setLibraryOpen` lets the library view (WO-7 `SharedWithMeView`) opt into the faster cadence
  without `SharingContext` importing that view — keeps WO-4 self-contained.

**NotificationBadge** (Blueprint: Frontend / Shared Shell → `NotificationBadge`)
- Props: `{ shareCount?, groupCount?, count?, className?, max = 99, ...rest }`.
- Count resolution: explicit `count` wins; else `shareCount` (falls back to `useSharing` pendingCount
  when provider present, else 0) + `groupCount` (prop only for now — `GroupNotificationContext` is
  WO-11; a null-safe optional context read can be added when it lands).
- Renders nothing when total ≤ 0 (hide-when-zero per spec). Otherwise a small count bubble; values
  above `max` render as `${max}+`. Pure presentational, safe to drop onto any nav entry/icon later.

Flow: `SharingProvider` polls → `pendingCount` updates → any mounted `NotificationBadge` reading the
context re-renders. `GroupNotificationContext` (separate WO) will feed `groupCount` the same way.

## Steps

1. **SharingContext** — create `src/context/SharingContext.jsx` with provider, resilient polling,
   actions, `setLibraryOpen`, and `useSharing()` guard hook. (independent file)
2. **NotificationBadge** — create `src/components/shared/NotificationBadge.jsx` reusable badge.
   (independent file)
3. **Mount provider** — wrap `<App/>` subtree in `<SharingProvider>` inside `AuthProvider` in
   `src/main.jsx`. (depends on step 1)

## Testing

No test runner/coverage convention is established for contexts/components in this repo (no existing
`*.test.jsx` near `src/context`), so automated unit tests are not added — consistent with the
codebase. Verification is manual + build:
- `npm run build` (or `vite build`) succeeds — no import/syntax regressions.
- Lint/typecheck if configured (`tsconfig.json` present; JSX files).
- Manual: with a signed-in user that has a pending incoming share, confirm `pendingCount` reflects
  it; accept/decline/revoke/updatePermission mutate and the list re-fetches; `NotificationBadge`
  shows the count and disappears at zero. (Full UI wiring of the Social entry is a later WO.)
