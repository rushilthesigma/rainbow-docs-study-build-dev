<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-8

**Work Order:** WO-8 — Build GroupListView & GroupDetailView
**Created At (UTC):** 2026-06-10

## Summary

Build the two primary Group Study navigation screens. `GroupListView` lists the user's groups (name,
member count, active-session badge, unread indicator) with create-group and pending-invitation handling,
and opens `GroupDetailView`. `GroupDetailView` shows the roster with roles, session status, admin controls
(invite / remove / promote / disband), member leave, and the last-admin successor guard, with navigation
hooks to the (separate-WO) GroupLibraryView and SessionView. Frontend-only and additive.

## Safety / Parallel-Work Constraints

- Parallel agents are on WO-3 (SSE backend) and WO-7 (SharedWithMeView). **WO-8 touches no backend file
  and no file another WO owns.** All `/api/study-groups/*` routes exist (WO-2); `StudyGroupApiClient`
  (`src/api/studyGroups.js`) exists (WO-5).
- New files only, in a new `src/components/group/` folder — no edits to shared app files. Nothing here is
  mounted into the dock/nav yet (no live Group nav entry exists; mounting is a later concern, like WO-4's
  NotificationBadge). The components expose callbacks so a future container can wire them in.

## Code Reuse And Package Structure

Reuse:
- `src/api/studyGroups.js` (StudyGroupApiClient): `listGroups()`, `getGroup(id)`, `createGroup(name,desc)`,
  `inviteMember(id,userId)`, `joinGroup(id)`, `declineGroup(id)`, `removeMember(id,userId,successorId?)`,
  `promoteMember(id,userId)`, `disbandGroup(id,successorId?)`. Confirmed signatures.
- `src/api/social.js` `searchUsers(q)` -> `{ users: [{ userId, handle, displayName }] }` (server excludes self).
- `src/components/shared/Modal.jsx`, `Button.jsx` (variants primary/secondary/ghost/danger; `loading`),
  `useToast()` (`toast.success/error`). `useAuth().user?.id` = current user id (matches `members[].userId`).
- Server response shapes (verified in server.js):
  - `GET /api/study-groups` -> `{ groups: [{ id, name, description, memberCount, role, libraryCount,
    activeSession: { sessionId, hostId, itemTitle, mode } | null, createdAt }], invitations: [{ id, groupId,
    groupName, invitedBy, invitedByName, memberCount, createdAt }] }`.
  - `GET /api/study-groups/:id` -> `{ group: { ...group, members: [{ userId, name, handle, role }],
    invitations: [{ ...inv, userName, status }], library, sessions, adminIds, memberIds } }` (no live
    activeSession field — detail takes it from the list summary it was opened with).
  - Sole-admin disband/leave with other members present returns **422** unless a valid `successorId` (a
    remaining member) is supplied — the UI prompts for one first (AC-GS-003.4/.5).

Created:
- `src/components/group/GroupListView.jsx` — list + invitations + create form; owns list<->detail nav.
- `src/components/group/GroupDetailView.jsx` — roster, admin controls, leave, successor guard, nav hooks.

## Components And Flow

**GroupListView** (`{ onOpenLibrary, onOpenSession, unreadByGroup = {} }`)
- Loads `listGroups()`; renders pending invitations (Accept=`joinGroup`, Decline=`declineGroup`) and the
  user's groups. Each group card: name, member count, library count, active-session badge (`activeSession`)
  that calls `onOpenSession`, and an unread dot from `unreadByGroup[id]` (GroupNotificationContext is WO-11,
  out of scope — driven by an optional prop, off when absent; satisfies AC-GS-006.5's surface).
- Create group: toggleable form, name required & <=100 chars (inline validation, AC-GS-001.3); on success
  navigate to the new group's detail (AC-GS-001.2); server error shown inline, no navigation (AC-GS-001.4).
- Selecting a group sets internal `view='detail'` and renders `GroupDetailView`, passing the summary
  (incl. `activeSession` + `role`) so detail knows live session state and the viewer's role.

**GroupDetailView** (`{ groupId, summary, onBack, onChanged, onOpenLibrary, onOpenSession }`)
- `currentUserId = useAuth().user?.id`. Loads `getGroup(groupId)`; `isAdmin = adminIds.includes(currentUserId)`.
- Roster (AC-GS-003.1): each member name + role label (Admin/Member), "you" tag; admin sees per-row Remove
  (`removeMember`) and Promote (`promoteMember`) on others; removing shows a toast confirmation (AC-GS-003.2).
- Invitations list for admins shows pending/declined `userName` + status (AC-GS-002.6).
- Invite (admin, AC-GS-002.1/.2/.3/.7): debounced `searchUsers`, excluding current members and pending
  invitees; select -> `inviteMember`; "no account found" inline; success/error inline.
- Session status: active/none from `summary.activeSession`; Join -> `onOpenSession`. Library button ->
  `onOpenLibrary(groupId)`.
- Leave (any member) and Disband (admin): if `isSoleAdmin && memberIds.length > 1`, open a successor-
  assignment Modal (pick a remaining member) before calling `removeMember`/`disbandGroup` with `successorId`
  (AC-GS-003.4/.5); otherwise call directly. On success -> `onChanged()` + `onBack()`.

## Steps

1. **GroupDetailView** — create `src/components/group/GroupDetailView.jsx` (roster, invite search, admin
   actions, successor-guard Modal, nav hooks). Build. (independent)
2. **GroupListView** — create `src/components/group/GroupListView.jsx` (list, invitations, create form,
   internal nav to GroupDetailView). Build.

## Testing

No unit-test convention for components in this repo. Verification:
- `npm run build` (vite) — no import/syntax regressions.
- Manual (where a live multi-account session is available): create group (name validation, server-error
  path); open detail; invite (exclusion + no-account); promote; remove (toast); leave; sole-admin
  disband/leave successor prompt; active-session badge + Join/Library nav callbacks fire. Multi-account
  E2E is environment-dependent and noted as such; flows are traced against the live server contract.
