<!--lint disable no-undefined-references strong-marker-->

# Work Order Execution Checklist: WO-8

**Work Order Number:** WO-8
**Work Order Title:** Build GroupListView & GroupDetailView
**Initialized At (UTC):** 2026-06-10T06:56:02Z

## Phase 1: Start / Context Gathering

### Required Steps

- [x] Review work order description provided by MCP tool output
- [x] Identify linked requirements and blueprints
  Blueprint: Group Study (e4af5512). Requirements REQ-GS-001/002/003/006 stated inline.
- [x] Review every connected requirements document
  REQ-GS-001 (.1-.4), REQ-GS-002 (.1-.3,.6,.7), REQ-GS-003 (.1-.5), REQ-GS-006 (.5) read from WO.
- [x] Review every connected blueprint document
  Group Study (e4af5512) — GroupListView/GroupDetailView specs, last-admin guard, StudyGroupApiClient,
  StudyGroup/SessionEvent contracts, ADR-001/002.
- [x] Follow `@…` mentions **and links** to other blueprints in linked documents and read each referenced blueprint via MCP
  Parent Sharing & Collaboration (bec7b7aa) read — StudyGroupController/Store contracts, NotificationBadge.
- [x] Review every referenced blueprint discovered that way; add them to **Referenced Blueprints** in `context.md`
- [x] Extract acceptance criteria from requirements
  Create (validation, server-error), invite (search exclusions, no-account), manage (remove+notify, promote,
  sole-admin successor on leave/disband), unread indicator on list entry.
- [x] Identify architecture path from blueprints (components, contracts, composition)
  Two new views consuming StudyGroupApiClient (src/api/studyGroups.js, exists) + searchUsers. Verified the
  WO-2 server controller response shapes (list/detail enrichment, 422 sole-admin guard, leave=removeMember
  self) by reading server.js. currentUserId = useAuth().user.id.
- [x] `context.md` is filled or updated with `execution/scripts/update-context-index.sh` for Work Order, connected requirements, connected blueprints, referenced blueprints, and known delivery links

- [x] **Certification: Phase 1 complete. Proceeding to Phase 2.**

## Phase 2: Planning And Implementation

### Implementation Plan

(see `execution/writing-implementation-plans.md`)

- [x] Implementation plan documented in `implementation-plan.md`
- [x] Testing section documented in `implementation-plan.md`

### Implementation

- [x] Implemented changes are scoped to the Work Order
  New: src/components/group/GroupDetailView.jsx, src/components/group/GroupListView.jsx. No edits to any
  shared/contended file (no backend, no dock/MenuBar) — safe alongside parallel WO-3/WO-7. Reuses existing
  StudyGroupApiClient (src/api/studyGroups.js), Modal, Button, useToast, useAuth.
- [SKIP] Tests added or updated for changed behavior
  Skip reason: No unit-test runner/convention in repo for components. Verified via `npm run build` (vite ✓).
- [SKIP] Documentation, generated files, fixtures, migrations, or config updated where relevant
  Skip reason: Frontend-only additive change; no fixtures/migrations/generated files/config affected.

- [x] **Certification: Phase 2 complete. Proceeding to Phase 3.**

## Phase 3: Review And Verification

### Review

- [x] Review subagent spawned per `execution/review-phase.md` and returned a verdict
  Delegated review (general-purpose subagent), Round 1 — 0 blocking, 5 advisory (2 fixed, 3 acknowledged).
- [x] All acceptance criteria from the Work Order and linked requirements are satisfied
  REQ-GS-001/002/003/006 ACs verified against the live server contract (see review-log); .2/.7 false-positive
  and .2 admin-remove confirmation fixed.
- [x] Architecture is aligned with linked blueprints, or documented drift is accepted
  GroupListView/GroupDetailView match the Group Study blueprint; consume existing StudyGroupApiClient; no drift.
- [x] Exploratory pass on user-visible or external behavior — not only automated tests; for browser apps, use browser-based testing if available. Brief notes in `review-log.md` or evidence.
  Partial (noted in review-log): full E2E needs multiple accounts + no Group nav entry mounted yet; flows
  traced against server contract + vite build (green).
- [x] Latest `review-log.md` verdict is `APPROVED`

- [x] **Certification: Phase 3 complete. Proceeding to Final Completion.**

## Final Completion Check

- [x] All phase certifications above are complete
- [x] Checklist is fully filled out with evidence
- [x] Review log is complete (`review-log.md`)
- [x] Implementation plan was followed (`implementation-plan.md`)
- [x] All intended files are present in the working tree
  New: src/components/group/GroupListView.jsx, src/components/group/GroupDetailView.jsx.
- [x] Work order status updated to `in_review`
