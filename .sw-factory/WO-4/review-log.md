<!--lint disable strong-marker-->

# Review Log: WO-4

**Work Order:** WO-4 — Build SharingContext & NotificationBadge
**Initialized At (UTC):** 2026-06-10T06:32:46Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Delegated review (general-purpose subagent). Verified the context's calls against the
`/api/share/*` contract in server.js (L9096–9241): method, path, request body, and response
shape all match — `GET /api/share/incoming` → `{ shares }`; accept/decline `POST`; revoke
`DELETE`; updatePermission `PATCH {permissionLevel}`. `shareIsActive` (server) returns only
`pending`/`accepted`, so `incomingShares` = accepted+pending and `pendingCount` is the pending
subset, exactly as specified.

### Requirements Alignment

**Blocking:** none.

**Advisory:** AC-FNS-002.1 met — server enriches each share with ownerName/itemTitle/itemType/
permissionLevel and the context surfaces them untouched via `incomingShares`. AC-FNS-002.5 met —
`refresh()` runs on mount / as soon as `user` is set, so an offline recipient sees invitations on
next app open.

### Blueprint Alignment

**Blocking:** none.

**Advisory:** Polling cadence correct (30s default / 10s when `libraryOpen`), exposed via
`setLibraryOpen` instead of coupling to a view. All five actions + `pendingCount` + `incomingShares`
exposed; invalidate+refetch after each mutation. Badge combines share + group counts and hides at
zero; `GroupNotificationContext` correctly left unwired (out of scope) and badge is null-safe.

### Architecture And Conventions

**Blocking:** none.

**Advisory:** Mirrors the AuthContext pattern (`createContext(null)`, provider, guarded `useSharing`).
Hook correctness is strong: `reqIdRef` guards against out-of-order/post-logout fetches; interval +
`visibilitychange` listener cleaned up symmetrically; deps arrays complete; `value` memoized;
StrictMode double-mount safe (second effect run just re-fires an idempotent GET). `SharingProvider`
nested inside `AuthProvider` in main.jsx so `useAuth()` resolves.

### Tests And Build

**Commands run:** `npm run build` (vite) — ✓ built; `npx esbuild` syntax check on the 3 files — ✓.
Only warning is the pre-existing >500 kB chunk-size advisory, unrelated to this change. No test
runner/convention exists in the repo for contexts/components.

**Blocking:** none.

**Advisory:** none.

### User-Facing Verification

**Skipped:** partial — no live "Social nav entry" exists yet to mount the badge on (that surface is a
later WO), so end-to-end badge rendering isn't exercisable in the running app. Build + static review
cover the change; the context's data path is verified against the real server contract.

**Evidence:** vite build success; server-contract cross-check table (see Round 1 header).

**Blocking:** none.

**Advisory:** none.

### Security, Privacy, And Data Safety

**Skipped:** no.

**Blocking:** none.

**Advisory:** No new data exposure. `apiFetch` attaches the bearer token and handles 401 globally; the
`!user` short-circuit + `reqId` guard prevent a post-logout response from repopulating shares.

### Round 1 Verdict

- Total blocking: 0
- Total advisory: 3 (all optional hardening: numeric coercion of `shareCount`; documented
  "explicit `count` overrides" contract; `mutate` intentionally re-fetches only on success)
- Files reviewed: src/context/SharingContext.jsx, src/components/shared/NotificationBadge.jsx, src/main.jsx
- **Verdict:** APPROVED

---

<!-- Subsequent rounds: copy the structure above and increment the round number. -->
