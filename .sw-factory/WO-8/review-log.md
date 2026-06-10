<!--lint disable strong-marker-->

# Review Log: WO-8

**Work Order:** WO-8 — Build GroupListView & GroupDetailView
**Initialized At (UTC):** 2026-06-10T06:56:02Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Delegated review (general-purpose subagent). Verified every StudyGroupApiClient call (name, arg order,
shape) against src/api/studyGroups.js, and every consumed field against the server handlers in server.js:
list enrichment (incl. `activeSession`), detail enrichment (members/invitations, NO live activeSession —
correctly taken from the list summary prop), and the 422 sole-admin/successor guard (server.js 9489,
9544-9551, `removeUserFromGroup` 9283). All correct.

### Requirements Alignment

**Blocking:** none.

**Advisory:** REQ-GS-001 .1-.4 met (create form, navigate-on-create, name validation, server-error no-nav).
REQ-GS-002 .1/.3/.6 met; .2/.7 had a false-positive "no account found" when matches were all excluded —
**fixed** (see below). REQ-GS-003 .1/.3/.4/.5 met; .2 (admin-remove confirmation) **fixed** by adding a
confirm modal. REQ-GS-006 .5 met (unread dot via optional `unreadByGroup`, degrades to no dots).

### Blueprint Alignment

**Blocking:** none.

**Advisory:** Both views match the Group Study blueprint responsibilities (list w/ member count + active-
session badge + unread indicator + create; detail roster w/ roles, admin invite/remove/promote/disband,
last-admin successor guard, nav hooks to GroupLibraryView/SessionView). Library/Session screens correctly
left as `onOpenLibrary`/`onOpenSession` callbacks (separate WOs).

### Architecture And Conventions

**Blocking:** none.

**Advisory:** Reuses Modal/Button/Toast/useAuth; Tailwind dark theme; lucide icons; apiFetch clients.
React correctness verified: debounce cleanup + stale-response token guard on invite search, complete deps
arrays, list keys present, no button-in-button, `stopPropagation` on the card "Live" button. Two acknowledged
non-issues left as-is: invite-search effect re-keys on `group` (extra token-guarded fetch after a mutation —
harmless); post-create navigation uses a minimal fabricated summary (detail re-fetches anyway).

### Tests And Build

**Commands run:** `npm run build` (vite) — ✓ (after implementation and again after fixes). esbuild syntax
check on both files — ✓. No component test runner/convention in repo.

**Blocking:** none.

**Advisory:** none.

### User-Facing Verification

**Skipped:** partial — full exercise needs multiple accounts (admin + members + invitees) and is environment-
dependent; no live Group nav entry is mounted yet (mounting is a later concern). Every flow was traced
against the live server contract and both views build cleanly.

**Evidence:** vite build success; API/contract cross-check (see Round 1 header).

**Blocking:** none.

**Advisory:** none.

### Security, Privacy, And Data Safety

**Skipped:** no.

**Blocking:** none.

**Advisory:** All authorization is server-enforced (admin-only invite/remove/promote/disband; membership
checks; 422 last-admin guard). The frontend guard is a UX pre-check only; recipientId/successorId come from
server-provided data. No concern.

### Resolved After Round 1 (applied to GroupDetailView.jsx)

- **[Advisory #1, fixed]** "No account found" now keys off a `inviteNoAccount` flag set only when the server
  returns zero users — no longer a false positive when all matches are excluded as members/invitees.
- **[Advisory #5, fixed]** Admin-removing-another-member now opens a confirmation Modal before calling
  `removeMember`, fully satisfying AC-GS-003.2's "confirmation surfaced."
- **[Advisory #2, #3, #4]** Acknowledged as non-issues / minor; left as-is (see Architecture notes).

### Round 1 Verdict

- Total blocking: 0
- Total advisory: 5 (2 applied as fixes, 3 acknowledged as non-issues)
- Files reviewed: src/components/group/GroupListView.jsx, src/components/group/GroupDetailView.jsx
- **Verdict:** APPROVED

---

<!-- Subsequent rounds: copy the structure above and increment the round number. -->
