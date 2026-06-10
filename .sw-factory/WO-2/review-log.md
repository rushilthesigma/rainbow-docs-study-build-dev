<!--lint disable strong-marker-->

# Review Log: WO-2

**Work Order:** WO-2 — Build StudyGroupStore & StudyGroupController
**Initialized At (UTC):** 2026-06-10T06:11:40Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Delegated review (subagent) of the `===== STUDY GROUPS =====` section in server.js.

### Requirements Alignment

**Blocking:** none — all in-scope ACs (GS-001.2-.4, 002.3-.7, 003.2-.6, 004.3/.5/.6) verified with corresponding code paths.

**Advisory:**

- `GET /:id` exposes the invitations list (incl. declined + names) to all members, not only admins. Small over-share, no AC violated. Accepted.
- No duplicate-contribution check on `POST /:id/library`. Fixed post-approval: 409 on same item + contributor (consistent with share route).

### Blueprint Alignment

**Blocking:** none — StudyGroup/GroupLibraryItem contracts conform; last-admin guard enforced at the API boundary (422); snapshot deep-copy per Group Study ADR-002 (empirically verified independent of original).

**Advisory:**

- Storage-key drift accepted: `social.studyGroups` instead of the blueprint's "groups key", which is occupied by the incompatible chat-groups feature. Documented in code and implementation plan.
- Disband route's successor promotion was dead code (group deleted in same request). Fixed post-approval: gate kept (WO-spec'd 422), pointless push removed, comment added.
- List route's `g.activeSession` read is a forward-provision for WO-3; blueprint keeps active session state in memory. To align during WO-3.

### Architecture And Conventions

**Blocking:** none

**Advisory:**

- `loadUsers()` called inside per-invitation loop in `GET /api/study-groups`. Fixed post-approval: hoisted with lazy single load.

### Tests And Build

**Commands run:** `node --check server.js` (pass). Smoke suite: 37/37 HTTP checks on isolated scratch server (validation, invite/join/decline, roles, snapshot immutability, contribution authz, member removal + notifications, last-admin guard leave/disband paths, disband cleanup, personal-library survival). Re-run after post-approval cleanups: 37/37.

**Blocking:** none

**Advisory:** none

### User-Facing Verification

**Skipped:** no (API-only WO; end-to-end HTTP verification above; frontend lands in WO-8..11)

**Evidence:** 37 scripted curl checks, three-user scenarios.

**Blocking:** none

**Advisory:**

- Join/decline 404 messages distinguish "group not found" from "no invitation", confirming group-UUID existence to authenticated users. Negligible (UUIDs unguessable). Accepted.

### Security, Privacy, And Data Safety

**Skipped:** no

**Blocking:** none — uniform 404s for non-members on all group-scoped routes; promote is admin-only/member-target; remove/leave guard not weaponizable (non-self removal of sole admin unreachable); single `saveSocial` per mutation (no partial writes); no email leakage.

**Advisory:** none

### Round 1 Verdict

- Total blocking: 0
- Total advisory: 6 (3 fixed post-approval and re-verified, 3 accepted)
- Files reviewed: server.js (STUDY GROUPS section + interactions with SHARING helpers and chat-group routes)
- **Verdict:** APPROVED
