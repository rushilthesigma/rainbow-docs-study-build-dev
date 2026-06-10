<!--lint disable strong-marker-->

# Review Log: WO-7

**Work Order:** WO-7 — Build SharedWithMeView
**Initialized At (UTC):** 2026-06-10T06:47:46Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Delegated review of SharedWithMeView, SharedItemViewer, share.js helpers, and the two library mounts.

### Requirements Alignment

**Blocking:**
- F1: conflict banner never fired for owner edits (owner writes don't stamp lastEditedBy; recipient's own earlier save masked later owner edits) — AC-FNS-003.6 recipient-side "informed" defeated. FIXED: condition now uses the lastEditedAt === updatedAt invariant of shared writes to attribute the last editor (owner vs collaborator vs self).

**Advisory:**
- F5: banner lacked editor attribution. FIXED (byOwner → ownerName, else "another collaborator").

### Blueprint Alignment

**Blocking:** none — view/edit modes, shareId routing, conflict banner, SharingContext composition all match File & Note Sharing blueprint; curriculum read-only-by-design documented (protects owner transcripts; consistent with WO-1 review note).

**Advisory:** none

### Architecture And Conventions

**Blocking:**
- F3: icon-only decline button had no accessible name. FIXED: aria-label="Decline".

**Advisory:**
- F7: hand-rolled empty state vs shared EmptyState; boolean setLibraryOpen double-mount nuance. Accepted (WO-4 API design).

### Tests And Build

**Commands run:** esbuild syntax checks; vite build; node integration test of getSharedItem/updateSharedItem against scratch server (4/4 incl. revoked 403); renderToString smoke (3/3 states). All re-run green after fixes.

**Blocking:** none

**Advisory:** none

### User-Facing Verification

**Skipped:** partial — no browser automation tool available in this session; UI verified via SSR render assertions (empty/invitation/accepted states), full build, and live-server integration of the exact data paths the UI calls.

**Evidence:** see Tests And Build.

**Blocking:** none

**Advisory:**
- F4: Reload discarded unsaved draft silently; draft not re-synced after save. FIXED: dirty tracking + confirm dialog + post-save draft resync.
- F6: accept/decline failures swallowed. FIXED: toast.error + refresh.

### Security, Privacy, And Data Safety

**Blocking:** none

**Advisory:**
- F2: revoked detection via message regex could false-positive on 500s; downgrade shown as revocation. FIXED: apiFetch attaches err.status; viewer keys on 403; 'permission required' → distinct "Now view-only" downgraded state.

### Round 1 Verdict

- Total blocking: 2 (both fixed)
- Total advisory: 5 (4 fixed, 1 accepted)
- Files reviewed: SharedWithMeView.jsx, SharedItemViewer.jsx, share.js, client.js, NotesPage.jsx, NotesApp.jsx
- **Verdict:** CHANGES_REQUESTED

---

## Round 2

Fresh delegate verified every fix against server stamping semantics (7/7 standalone logic scenarios for the conflict condition), confirmed err.status introduces no caller regressions (grep of all consumers), validated the mount-only load effect reasoning (deps-loop would clobber drafts), confirmed downgrade-vs-revoke message routing matches exact server strings, and re-ran vite build independently.

Advisories (accepted, non-blocking): first-stamp gap on never-edited items; draft text not preserved visually on mid-edit revoke; key={openShare.id} on the viewer (applied post-approval, build re-verified).

### Round 2 Verdict

- Total blocking: 0
- Total advisory: 3 (1 applied post-approval, 2 accepted)
- Files reviewed: same set
- **Verdict:** APPROVED
