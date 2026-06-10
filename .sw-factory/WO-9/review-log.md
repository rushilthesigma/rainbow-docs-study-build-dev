<!--lint disable strong-marker-->

# Review Log: WO-9

**Work Order:** WO-9 — Build GroupLibraryView
**Initialized At (UTC):** 2026-06-10T06:57:42Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Delegated full review (subagent) of the change set: `src/components/group/GroupLibraryView.jsx` (single new file).

### Requirements Alignment

**Blocking:** none.

**Advisory:** none. AC-GS-004.1–.6 and AC-GS-005.1 all verified satisfied with code references (contributor name/type/date row + viewer header; empty state; snapshot contribution with honest copy semantics; read-only study mode with zero mutation affordances for plain members; remove confirm states personal copy unaffected; "Former member" fallback; per-item session start with mode prompt and onOpenSession handoff).

### Blueprint Alignment

**Blocking:** none.

**Advisory:** A1 — onBack prop doc said "return to GroupDetailView" but the host (GroupStudyApp, WO-8) wires it to the group list. Fixed: comment now says "return to the host's previous screen". Documented edit-mode drift (immutable snapshots per ADR-002/key contract vs the blueprint's "may open in edit mode" line) implemented exactly as recorded in implementation-plan.md and flagged on the work order.

### Architecture And Conventions

**Blocking:** none.

**Advisory:** A2 — temporary verification harness files (wo9-harness.html, src/wo9-harness.jsx, vite.wo9.config.mjs) outside the change set. Deleted after the browser pass; confirmed absent from the tree.

### Tests And Build

**Commands run:** `npm run build` (vite ✓, file now in the app graph via GroupStudyApp import), `npx esbuild --bundle src/components/group/GroupLibraryView.jsx` (✓), scripted API exploratory suite `/tmp/wo9-smoke.mjs` against isolated scratch server (port 3457, scratch DATA_DIR): 19 passed, 0 failed.

**Blocking:** none.

**Advisory:** no unit-test runner exists in the repo (WO-6 precedent); component tests skipped with reason in checklist.

### User-Facing Verification

**Skipped:** no.

**Evidence:** 13 screenshots in `.sw-factory/WO-9/evidence/` from a puppeteer-core + system Chrome pass driving the component in a temporary harness against an isolated backend (3458) and vite (5197): 28 browser checks passed, 0 failed — list metadata (AC-GS-004.1), empty state (004.2), picker with In-library 409 guards and live flip after add (004.3), View-only vs Manage chips, zero editable fields, member sees Remove only on own item, admin on all (004.4), remove confirm + personal copy intact (004.5), Former member rendering (004.6), session mode prompt with pre-selected material, onOpenSession payload, and in-modal 409 for a second active session (AC-GS-005.1). Re-run in full after advisory fixes: 28/28.

**Blocking:** none.

**Advisory:** A3 — Escape closes both stacked modals (viewer + remove confirm) because each shared Modal registers its own document-level keydown; fixing it requires changing the shared Modal (out of WO-9 scope). Acknowledged, left as-is. A8 — clickable rows are mouse-only (no role/tabIndex), identical to GroupListView's rows; pattern-wide a11y nit, left consistent with siblings.

### Security, Privacy, And Data Safety

**Skipped:** no.

**Blocking:** none.

**Advisory:** none. No dangerouslySetInnerHTML; all snapshot content renders as escaped JSX text. Client-side gating is cosmetic only — server independently enforces membership, contributor/admin removal, ownership on contribute, and 409s; every rejection surfaces gracefully in the UI.

### Resolved After Round 1 (applied to GroupLibraryView.jsx, re-verified 28/28)

- **[A1, fixed]** onBack comment reworded to "return to the host's previous screen".
- **[A4, fixed]** ContributePicker can no longer be closed mid-contribution (Modal onClose guarded by busyId; Done disabled while busy).
- **[A5, fixed]** Picker tracks ids added this session (`addedIds`) so a just-contributed row flips to "In library" immediately, closing the double-click 409 window before the parent re-fetch lands.
- **[A6, fixed]** Remove-error path now re-fetches the group so a stale row (e.g. already removed elsewhere) self-heals.
- **[A2, done]** Harness files deleted. **[A3, A7, A8]** acknowledged, left as-is (shared-Modal change out of scope; load-race and row-a11y identical to sibling patterns).

### Round 1 Verdict

- Total blocking: 0
- Total advisory: 8 (4 applied as fixes, 1 cleanup completed, 3 acknowledged)
- Files reviewed: src/components/group/GroupLibraryView.jsx
- **Verdict:** APPROVED

---

<!-- Subsequent rounds: copy the structure above and increment the round number. -->
