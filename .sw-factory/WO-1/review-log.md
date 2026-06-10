<!--lint disable strong-marker-->

# Review Log: WO-1

**Work Order:** WO-1 — Build ShareStore & ShareController
**Initialized At (UTC):** 2026-06-10T05:37:21Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Delegated review (subagent) of the new `===== SHARING =====` section in server.js plus share-aware modifications to notes/flashcards/curriculum GET/PUT/DELETE routes.

### Requirements Alignment

**Blocking:**

- F1 — server.js `POST /api/social/profile`: profile rewrite rebuilt the profile object without `notifications`, destroying all share notifications on any profile update (breaks AC-FNS-002.1/004.5 delivery). Dimension: Requirements/Data safety.

**Advisory:**

- F2 — Fallback notification bucket (`social.notifications[userId]`) stranded once a profile is created; stale invitation entries uncleanable (partial AC-FNS-002.4 gap in edge path).
- F7 — Edit permission on decks is title-only; card-level routes have no shareId path. Compliant with WO scope; flagged for frontend WOs.
- F8 — `GET /api/share/outgoing/:itemId` includes declined records. Intentional: AC-FNS-002.3 requires declined status visible to owner.

### Blueprint Alignment

**Blocking:** none

**Advisory:** none — ShareRecord contract shape, store/controller separation, authMiddleware coverage, shares.json flat-file pattern all conform.

### Architecture And Conventions

**Blocking:** none

**Advisory:** none — matches house conventions (error JSON shape, crypto.randomUUID, ISO timestamps, loadX/saveX naming, per-route try/catch).

### Tests And Build

**Commands run:** `node --check server.js` (pass). External smoke suites: 27/27 note-path, 5/5 flashcard-path, 5/5 curriculum-path (scratch server, isolated DATA_DIR).

**Blocking:** none

**Advisory:**

- F6 — Two-file writes (shares.json then social.json) have no rollback on second-write failure. Accepted as consistent with the flat-file architecture (per blueprint ADR-001 consequences).

### User-Facing Verification

**Skipped:** no (API-only WO; verified via end-to-end HTTP smoke tests)

**Evidence:** 37 scripted curl checks across signup→share→accept→shared-edit→permission-change→revoke→cascade-delete flows, all three item types.

**Blocking:** none

**Advisory:** none

### Security, Privacy, And Data Safety

**Skipped:** no

**Blocking:** none

**Advisory:**

- F3 — `PUT /api/curriculum/:id` shared write spread arbitrary `updates` into the owner's record (recipient could overwrite `id`, `studentId`, `createdAt`).
- F4 — Shared curriculum GET returned the owner's per-lesson `chatHistory` (private AI tutoring transcripts) to recipients.
- F5 — `shareDisplayName` could fall back to the user's email address, leaking it to the other party.

### Round 1 Verdict

- Total blocking: 1 (F1)
- Total advisory: 7 (F2-F8)
- Files reviewed: server.js (SHARING section; notes/flashcards/curriculum routes; social profile route)
- **Verdict:** CHANGES_REQUESTED

---

## Round 2

Fixes applied for F1, F2, F3, F4, F5. F6/F7/F8 accepted as advisory. Fresh delegate verified each fix and re-checked round-1 clean dimensions.

### Requirements Alignment

**Blocking:** none — F1 fixed: profile route preserves notifications and migrates the fallback bucket (also closes F2).

**Advisory:**

- Profile-recovery path in `GET /api/social/profile` rebuilds a profile without merging the fallback bucket (orphans bucket notifications in a rare profile-loss window). Future pass.

### Blueprint Alignment

**Blocking:** none

**Advisory:** none

### Architecture And Conventions

**Blocking:** none

**Advisory:** none

### Tests And Build

**Commands run:** `node --check server.js` (pass). Re-run after fixes: 27/27 note, 5/5 flashcard, 5/5 curriculum smoke checks; F1 regression (profile rewrite preserves notification count 3→3); F4 regression (chatHistory stripped for recipient, kept for owner). All pass.

**Blocking:** none

**Advisory:** none

### User-Facing Verification

**Skipped:** no (API-only; HTTP smoke evidence above)

**Evidence:** see Tests And Build.

**Blocking:** none

**Advisory:** none

### Security, Privacy, And Data Safety

**Skipped:** no

**Blocking:** none — F3 (field stripping on shared writes), F4 (chatHistory sanitization), F5 (no email fallback) all verified fixed.

**Advisory:**

- Latent: a shared editor PUTting a full sanitized curriculum back (`updates.units` with empty chatHistory) would overwrite the owner's transcripts. No client does this today; guard when recipient editing UI lands (note for WO-7).

### Round 2 Verdict

- Total blocking: 0
- Total advisory: 2
- Files reviewed: server.js
- **Verdict:** APPROVED
