<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-2

**Work Order:** WO-2 — Build StudyGroupStore & StudyGroupController
**Created At (UTC):** 2026-06-10T06:11:40Z

## Summary

Adds the server-side data layer and REST API for study groups: `StudyGroup` documents persisted in `social.json` and all `/api/study-groups/*` routes in `server.js` behind `authMiddleware`, covering group lifecycle, invitations, membership/roles with the last-admin guard, and snapshot-based library contributions.

**Documented drift:** the blueprint says StudyGroups live "in social.json under the groups key", but `social.groups` is already occupied by the existing group-chat feature (`{ id, name, creatorId, members, messages }`); mixing shapes would crash existing chat routes (`g.members.includes(...)` on StudyGroups that use `memberIds`). StudyGroups are therefore stored under a dedicated `social.studyGroups` key — same file, same pattern, zero risk to existing routes. To be confirmed at review as accepted drift.

## Code Reuse And Package Structure

Reused (all in `server.js`):

- `loadSocial`/`saveSocial` and the WO-1 helpers `getNotificationList`, `removeNotifications`, `shareDisplayName`, `findOwnedItem` (SHARING section) — invitations/removal/disband notifications reuse the same profile-record notification mechanism.
- `authMiddleware`, `findEmailById`, `loadUsers`, `crypto.randomUUID()`, ISO timestamps, `{ error }` response convention.
- Existing `app.post('/api/social/groups')` chat-group routes left untouched.

Files modified:

- `server.js` — new `===== STUDY GROUPS =====` section directly after the SHARING section.

## Components And Flow

### StudyGroupStore (helpers)

- `getStudyGroups(social)` — returns `social.studyGroups` (init `{}` if missing).
- `findStudyGroup(social, id)`, `isGroupAdmin(group, userId)`, `isGroupMember(group, userId)`.
- `groupSummary(group)` — `{ id, name, description, memberCount, createdAt }` for list/notification payloads.
- `snapshotItemForGroup(item, itemType)` — deep-copies the item via `JSON.parse(JSON.stringify(...))`, strips personal metadata (`topicId`, `linkedCurriculumId`, `linkedLessonId`, `lastEditedBy`, `lastEditedAt`, per-lesson `chatHistory` for curricula, SM-2 scheduling state on cards), returning the `snapshot` payload.

`StudyGroup` shape (blueprint contract): `{ id, name, description, adminIds: string[], memberIds: string[], library: GroupLibraryItem[], sessions: SessionSummary[], invitations: GroupInvitation[], createdAt }`.
`GroupLibraryItem`: `{ id, itemType, itemId, title, contributorId, contributedAt, snapshot }`.
`GroupInvitation`: `{ id, userId, invitedBy, status: 'pending'|'declined', createdAt, respondedAt? }` (accepted invitations are removed; declined retained so the admin sees declined status — AC-GS-002.6).

### StudyGroupController routes (all `authMiddleware`)

- `POST /api/study-groups` `{ name, description }` — name required, trimmed, ≤100 chars (400 otherwise; AC-GS-001.3); creator becomes sole admin + member (AC-GS-001.2). Single `saveSocial` write (AC-GS-001.4: no partial record).
- `GET /api/study-groups` — groups where the caller is a member, with member counts and role; includes the caller's pending invitations (for WO-11 polling).
- `GET /api/study-groups/:id` — member-only (404 for outsiders); members enriched with profile names + role labels, library, invitations (with invitee names, for the admin view).
- `POST /api/study-groups/:id/invite` `{ userId }` — admin-only (403); 404 unknown account (AC-GS-002.7); 409 already member or already pending; appends `group_invitation` notification with group name, admin name, member count (AC-GS-002.4).
- `POST /api/study-groups/:id/join` — requires pending invitation (404 otherwise); adds to `memberIds`, removes the invitation + its notification (AC-GS-002.5).
- `POST /api/study-groups/:id/decline` — marks invitation `declined`, removes notification (AC-GS-002.6).
- `POST /api/study-groups/:id/library` `{ itemType, itemId }` — member-only; reads the caller's own item, writes immutable snapshot `GroupLibraryItem` (AC-GS-004.3); original untouched.
- `DELETE /api/study-groups/:id/library/:itemId` — contributor or admin only (403 otherwise); personal copy unaffected (AC-GS-004.5).
- `DELETE /api/study-groups/:id/members/:userId` — admin removing another member, or any member removing themselves (leave). Last-admin guard: if the departing user is the sole admin and other members remain, 422 unless `successorId` (a current member) is supplied, who is promoted first (AC-GS-003.4 / key contract). Sole member leaving deletes the group. Removed-by-admin members get a `group_removed` notification (AC-GS-003.2). Contributions remain (AC-GS-004.6).
- `POST /api/study-groups/:id/members/:userId/promote` — admin-only; target must be a member; adds to `adminIds` (AC-GS-003.3).
- `DELETE /api/study-groups/:id` — disband; admin-only. Per blueprint/WO last-admin rule: if the caller is the sole admin and other members remain, 422 unless `successorId` is named (promoted before disband proceeds). Deletes the group document (library entries go with it — group association removed, personal libraries untouched, AC-GS-003.5/.6); all other members get a `group_disbanded` notification; pending invitation notifications for the group are removed.

### Flow notes

Notifications reuse `getNotificationList` from WO-1 so the same NotificationBadge/contexts can consume them. All mutations are single-`saveSocial` writes where possible; user-store reads (`loadUsers`) are read-only in this WO.

## Steps

1. **Store helpers** — add `===== STUDY GROUPS =====` section with store/membership/snapshot helpers.
2. **Lifecycle routes** — create, list, detail.
3. **Invitation routes** — invite, join, decline (+ notifications).
4. **Membership routes** — remove/leave with last-admin guard, promote.
5. **Library routes** — contribute (snapshot), remove contribution.
6. **Disband route** — with guard, notifications, cleanup.
7. **Verify** — `node --check`, scripted HTTP smoke suite.

## Testing

- `node --check server.js`.
- Scripted end-to-end smoke suite on the isolated scratch server (port 3456 via /tmp/port-override.mjs, scratch DATA_DIR): create (validation: empty name 400, 101-char name 400), creator-is-admin, invite (admin-only 403, unknown user 404, duplicate 409), invitee notification content, join/decline flows, promote, remove member (notification), leave with last-admin guard (422 without successor, success with), contribute snapshot (original edit does not change group copy — AC-GS-004.3), remove contribution (contributor + admin paths, personal copy intact), disband (422 sole-admin-with-members + successor path, members notified, group gone, personal items intact).
- Inspect scratch `social.json` for `studyGroups` shape conformance.
