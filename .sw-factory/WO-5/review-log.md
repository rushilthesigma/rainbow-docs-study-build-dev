<!--lint disable strong-marker-->

# Review Log: WO-5

**Work Order:** WO-5 — Build ShareApiClient & StudyGroupApiClient
**Initialized At (UTC):** 2026-06-10T06:34:26Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Delegated review (subagent) of src/api/share.js and src/api/studyGroups.js against server routes, repo API conventions, and WO-5/blueprint specs.

### Requirements Alignment

**Blocking:** none — all 21 spec'd functions present; full wrapper/route signature matrix verified (methods, paths, body keys, response unwraps all match).

**Advisory:**
- WO signature drift: openSessionStream takes an options object ({onEvent,onError,onClose,lastEventId}) instead of positional lastEventId — necessary for callbacks; accepted.

### Blueprint Alignment

**Blocking:** none — Last-Event-ID reconnect after 2s per Group Study contract; SSE lifecycle sound (no reconnect after end/close/onError; no leaked timers/controllers).

**Advisory:**
- Documented drift accepted: EventSource-like fetch-stream handle instead of native EventSource (auth header constraint; repo pattern per lessons.js).
- Comment overstated Last-Event-ID semantics (server replays state on every connect). Fixed post-approval.

### Architecture And Conventions

**Blocking:** none — matches src/api module conventions; DELETE-with-body verified safe end-to-end (express.json parses by content-type).

**Advisory:**
- Pre-existing src/context/SharingContext.jsx hand-rolls /api/share calls; follow-up refactor candidate (noted for WO-4).
- Export-name overlap with social.js (createGroup/listGroups/getGroup) — no barrel file, no collision. Accepted.

### Tests And Build

**Commands run:** node integration test (real modules, shimmed browser globals, live scratch server): 19/19 — share flow, group flow, SSE state/advance/end with scores, ended-session onError without reconnect loop, disband. `npx vite build` passes. Re-run after polish edits: 19/19 + build pass.

**Blocking:** none

**Advisory:** none

### User-Facing Verification

**Skipped:** yes — pure API-client modules with no UI; consuming components land in WO-4/6/7/8/9/10/11 where browser verification applies.

### Security, Privacy, And Data Safety

**Blocking:** none

**Advisory:**
- 401 on stream didn't mirror apiFetch logout semantics. Fixed post-approval.
- Throwing onEvent consumer callback could trigger reconnect churn. Fixed post-approval (callback try/catch).
- Same-user multi-tab streams ping-pong (server replaces stream without end signal) — server-side follow-up if multi-tab matters. Accepted.

### Round 1 Verdict

- Total blocking: 0
- Total advisory: 8 (3 fixed post-approval and re-verified, 5 accepted/informational)
- Files reviewed: src/api/share.js, src/api/studyGroups.js (+ server route cross-check)
- **Verdict:** APPROVED
