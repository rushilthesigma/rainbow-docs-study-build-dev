<!--lint disable strong-marker-->

# Review Log: WO-11

**Work Order:** WO-11 — Build GroupNotificationContext
**Initialized At (UTC):** 2026-06-10T07:06:13Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1 (delegated review subagent)

### Requirements Alignment

**Blocking:**

- B1 — GroupNotificationContext.jsx disappearance path + groupNotificationDerive.js classify:
  voluntary leave / self-disband raised a spurious "no longer available" notice (server writes no
  notification for self), and stale never-deleted `group_removed` records could misclassify a later
  voluntary departure as "You were removed by X" (removed → re-joined → left scenario).

**Advisory:** AC-GS-006.1 partially satisfied by design (count-delta indicator; list endpoint has no
contributor/item fields — documented). Profile-less users (fallback notification bucket not returned
by GET /api/social/profile) degrade to the generic notice. In-memory groupEvents lost on reload
within the detected-but-unread window.

### Blueprint Alignment

**Blocking:** none

**Advisory:** `activeSessions` dropped `libraryItemId` (server provides it; WO-8 banner may need it).

### Architecture And Conventions

**Blocking:** none

**Advisory:** lost-update race on baselinesRef across the await in refresh; signed-out branch did not
bump reqId (pattern-inherited from SharingContext); invite accept/decline left badge stale up to 30s;
groupEvents.length reload effect re-fires on dismiss (harmless); membership unread counts joins too
(inherent to counts-only endpoint, documented).

### Tests And Build

**Commands run:** `node scripts/verify-group-notifications.mjs` (21/21 pass), `npm run build` (pass,
baseline chunk-size warning only).

**Blocking:** none

**Advisory:** no test case encoded the voluntary-leave scenario (where B1 hid); "markGroupSeen reset"
plan case only covered by proxy.

### User-Facing Verification

**Skipped:** no

**Evidence:** Browser E2E not reachable for the badge (nothing mounts NotificationBadge in nav yet).
Delegate verified GroupListView is reachable via desktop app id `groups` (GroupStudyApp). Live-server
probe constrained (running instance on :3002 predates study-group routes; no data mutation allowed) —
completed via static end-to-end trace: poll payload fields (server.js:9319), notification record
shapes (9506-9511, 9558-9562), badge math, 30s→5s cadence hand-off, detail mount/unmount registration.

**Blocking:** none (B1 found in this trace, recorded under Requirements Alignment)

### Security, Privacy, And Data Safety

**Skipped:** no

**Blocking:** none

**Advisory:** none — localStorage holds only group ids/counts/timestamps; no tokens; no new endpoints;
both consumed endpoints auth-gated.

### Round 1 Verdict

- Total blocking: 1
- Total advisory: 9
- Files reviewed: 7 (groupNotificationDerive.js, GroupNotificationContext.jsx, verify script,
  main.jsx, NotificationBadge.jsx, GroupListView.jsx, GroupDetailView.jsx)
- **Verdict:** CHANGES_REQUESTED

---

## Round 2 (self-verification; user directed handoff without a second delegate pass)

Fixes applied for B1 (both directions) plus the cheap advisories:

- `forgetGroup(groupId)` added to the context (drops baseline + unread + active-session entry, bumps
  reqId to discard in-flight polls); GroupDetailView calls it on successful leave/disband — voluntary
  departures can no longer surface a notice.
- `classifyDisappearance(notifications, groupId, sinceIso)` now fences records to
  `createdAt > lastSeenAt` of the vanished group's baseline — stale removal records can no longer
  misclassify (new test: removed-rejoined-left scenario).
- Post-await baseline merge in refresh (newer lastSeenAt wins) closes the lost-update race.
- Signed-out branch bumps reqId; `libraryItemId` included in activeSessions; invite accept/decline
  triggers context refresh.

**Verification:** `node scripts/verify-group-notifications.mjs` — 22/22 pass (new sinceIso case);
`npm run build` — pass. Remaining advisories (in-memory events lost on reload, profile-less-user
degradation, AC-GS-006.1 partial-by-design) accepted and documented.

### Round 2 Verdict

- **Verdict:** APPROVED (self-verified; second delegate round waived by user direction)
