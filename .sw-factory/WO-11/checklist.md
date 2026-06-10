<!--lint disable no-undefined-references strong-marker-->

# Work Order Execution Checklist: WO-11

**Work Order Number:** WO-11
**Work Order Title:** Build GroupNotificationContext
**Initialized At (UTC):** 2026-06-10T07:06:13Z

## Phase 1: Start / Context Gathering

### Required Steps

- [x] Review work order description provided by MCP tool output
  WO-11 read via MCP: GroupNotificationContext — poll /api/study-groups (30s/5s), lastSeenAt per group,
  unread derivation (contributions, sessions, membership changes), activeSessions, markGroupSeen,
  totalUnreadCount → NotificationBadge; removal/disband notices inline in GroupListView.
- [x] Identify linked requirements and blueprints
  Requirements: REQ-GS-006 (AC-006.1–006.5), REQ-GS-002 (AC-002.4/002.5) — embedded in WO description.
  Blueprint: Group Study (e4af5512-d2dd-44c4-821b-a4c9193a3066).
- [x] Review every connected requirements document
  Requirements embedded in WO description (no separate requirement doc linked); acceptance criteria extracted below.
- [x] Review every connected blueprint document
  Group Study blueprint read in full (133 lines): GroupNotificationContext component block, polling strategy,
  lastSeenAt integration contract, StudyGroup/GroupLibraryItem/SessionEvent shapes.
- [x] Follow `@…` mentions **and links** to other blueprints in linked documents and read each referenced blueprint via MCP
  Followed @Sharing & Collaboration (parent, bec7b7aa-febc-460c-830f-527acf8070a5) — read in full:
  NotificationBadge + SharingContext component blocks, StudyGroupStore/Controller, flat-file ADR.
- [x] Review every referenced blueprint discovered that way; add them to **Referenced Blueprints** in `context.md`
  Sharing & Collaboration added as referenced blueprint in context.md.
- [x] Extract acceptance criteria from requirements
  AC-GS-006.1 (contribution notice w/ contributor+item), AC-GS-006.2 (session start + join option),
  AC-GS-006.3 (removal notice), AC-GS-006.4 (disband notice), AC-GS-006.5 (unread indicator on group entry),
  AC-GS-002.4 (invitation in in-app notifications w/ group name, admin name, member count), AC-GS-002.5 (accept → member).
- [x] Identify architecture path from blueprints (components, contracts, composition)
  GroupNotificationContext (Client App) polls StudyGroupController GET /api/study-groups via StudyGroupApiClient
  (src/api/studyGroups.js listGroups); provides counts to NotificationBadge (src/components/shared/NotificationBadge.jsx,
  explicit groupCount integration point); GroupListView consumes unreadByGroup (existing prop) + active-session data;
  lastSeenAt per group updates on group detail open (GroupDetailView). Server already writes typed notifications
  (group_invitation/group_removed/group_disbanded/session_started) to social profiles, readable via GET /api/social/profile.
- [x] `context.md` is filled or updated with `execution/scripts/update-context-index.sh` for Work Order, connected requirements, connected blueprints, referenced blueprints, and known delivery links
  Ran update-context-index.sh with WO, both requirements, Group Study blueprint, Sharing & Collaboration referenced blueprint.

- [x] **Certification: Phase 1 complete. Proceeding to Phase 2.**

## Phase 2: Planning And Implementation

### Implementation Plan

(see `execution/writing-implementation-plans.md`)

- [x] Implementation plan documented in `implementation-plan.md`
  Full plan written before any code change: reuse (SharingContext pattern, studyGroups/social api clients),
  package structure, component interfaces, derivation rules, steps, testing.
- [x] Testing section documented in `implementation-plan.md`
  node assertion script for the pure derivation module + vite build + manual API-shape verification.

### Implementation

- [x] Implemented changes are scoped to the Work Order
  Created: src/context/groupNotificationDerive.js (pure logic), src/context/GroupNotificationContext.jsx
  (provider), scripts/verify-group-notifications.mjs. Modified: src/main.jsx (mount provider),
  NotificationBadge.jsx (documented groupCount slot only), GroupListView.jsx (context-fed unread data +
  in-scope inline removal/disband notices; Live-button/banner rendering untouched), GroupDetailView.jsx
  (non-rendering markGroupSeen/fast-poll effect). server.js untouched (WO-2/WO-3 scope).
- [x] Tests added or updated for changed behavior
  scripts/verify-group-notifications.mjs — 21 assertions over deriveUnread/reconcile/classifyDisappearance/
  persistence; all pass (`node scripts/verify-group-notifications.mjs`). No unit-test runner exists in repo;
  this follows and improves on the prior-WO convention (build-only).
- [SKIP] Documentation, generated files, fixtures, migrations, or config updated where relevant
  Skip reason: Frontend-only additive change; no docs/fixtures/migrations/generated files/config affected.

- [x] **Certification: Phase 2 complete. Proceeding to Phase 3.**

## Phase 3: Review And Verification

### Review

- [ ] Review subagent spawned per `execution/review-phase.md` and returned a verdict
- [ ] All acceptance criteria from the Work Order and linked requirements are satisfied
- [ ] Architecture is aligned with linked blueprints, or documented drift is accepted
- [ ] Exploratory pass on user-visible or external behavior — not only automated tests; for browser apps, use browser-based testing if available. Brief notes in `review-log.md` or evidence.
- [ ] Latest `review-log.md` verdict is `APPROVED`

- [ ] **Certification: Phase 3 complete. Proceeding to Final Completion.**

## Final Completion Check

- [ ] All phase certifications above are complete
- [ ] Checklist is fully filled out with evidence
- [ ] Review log is complete (`review-log.md`)
- [ ] Implementation plan was followed (`implementation-plan.md`)
- [ ] All intended files are present in the working tree
- [ ] Work order status updated to `in_review`
