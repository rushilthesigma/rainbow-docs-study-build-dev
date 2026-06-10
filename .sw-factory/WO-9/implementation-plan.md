<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-9

**Work Order:** WO-9 — Build GroupLibraryView
**Created At (UTC):** 2026-06-10T06:57:42Z

## Summary

Delivers `GroupLibraryView`, the screen inside a study group where members browse contributed materials, contribute items from their personal library, remove contributions, open contributions in read-only study mode, and start a group session pre-selected on an item. The component is self-contained: given a `groupId` it fetches the group via `StudyGroupApiClient.getGroup`, renders the library, and hands navigation back to its host through the same callback contract its siblings (`GroupListView`, `GroupDetailView`) already use (`onBack`, `onChanged`, `onOpenSession`). One new file is added under `src/components/group/`; no existing files are modified (WO-7 and WO-8 are executing in parallel — zero-overlap is deliberate).

### Scope decision: "edit mode" on group copies

The Group Study blueprint's GroupLibraryView responsibility line says "contributor and Group Admin may open in edit mode", but the same blueprint's key contract states `GroupLibraryItem` snapshots are **immutable after contribution** (ADR-002), and WO-2 implemented exactly that: the server exposes only POST (contribute) and DELETE (remove) on `/api/study-groups/:id/library` — there is no update endpoint, and adding one is out of WO-9 scope (server-side work is WO-2's). AC-GS-004.4's testable behavior is the *restriction*: members can view and study but cannot modify the group copy unless contributor/admin.

Resolution implemented here: every member opens items in read-only study mode with **no mutation affordances**; the contributor and Group Admins additionally get the one group-copy mutation the system supports — **remove from library** (row action and inside the viewer), plus a visible permission distinction ("Manage" capability vs view-only). No dead edit controls are rendered, because edits could not be persisted. This is recorded as documented drift from the single blueprint responsibility line, resolved in favor of the blueprint's own key contract + ADR-002; a comment is posted on WO-9 so the team can decide whether a future snapshot-edit endpoint (or ADR-002's "re-contribute" action) is wanted.

## Code Reuse And Package Structure

Reused directly:

- `src/api/studyGroups.js` — `getGroup`, `contributeItem`, `removeContribution`, `startSession` (WO-5; complete, untouched).
- `src/api/notes.js` `listNotes()`, `src/api/flashcards.js` `listDecks()`, `src/api/curriculum.js` `listCurricula()` — personal-library picker data.
- `src/components/shared/Modal.jsx` (`open/onClose/title/size`), `src/components/shared/Button.jsx` (`variant: primary|secondary|ghost|danger`, `size`, `loading`), `src/components/shared/Toast.jsx` (`useToast` → `toast.success/error`).
- `src/context/AuthContext.jsx` `useAuth()` — current user id for contributor/admin checks.
- `lucide-react` icons, Tailwind utility styling (dark-first `text-white/X`, `bg-white/[0.0X]` idiom used across `src/components/group/`).

Followed as proven patterns (not imported):

- `src/components/library/SharedItemViewer.jsx` — read-only rendering of the three item types (note cues/notes/summary, deck card list, curriculum unit/lesson outline) and the `TYPE_META` icon/label map. Group snapshots render from `entry.snapshot` (already loaded with the group), so no fetch-per-item or conflict/revocation machinery is needed.
- `src/components/group/GroupDetailView.jsx` / `GroupListView.jsx` — loading/error/empty states, section headers, row layout, confirm-before-destructive-action modal, toast usage, props contract documented in a header comment.

Created:

- `src/components/group/GroupLibraryView.jsx` — the view plus three internal (non-exported) pieces: `LibraryItemViewer` (read-only study modal), `ContributePicker` (personal-library picker modal), `StartSessionModal` (mode prompt). Kept in one file unless it grows unwieldy; siblings are single-file views.

Modified: none.

## Components And Flow

Public interface (mirrors sibling conventions):

```jsx
GroupLibraryView({
  groupId,        // string, required
  onBack,         // () => void — back to GroupDetailView/host
  onChanged,      // () => void — notify host that library count changed
  onOpenSession,  // (groupId, session) => void — hand off to SessionView (WO-10)
})
```

State and flow:

1. Mount → `getGroup(groupId)` → `{ group }` with `library: GroupLibraryItem[]` and `members: [{ userId, name, handle, role }]`. Loading spinner / error text per sibling pattern.
2. Derivations: `isAdmin = group.adminIds.includes(user.id)`; `memberNameById` map from `members`; contributor display name falls back to **"Former member"** when `contributorId` is not in `members` (AC-GS-004.6 keeps contributions after departure).
3. List rendering (AC-GS-004.1): each row shows type icon + title + contributor name + `new Date(contributedAt).toLocaleDateString()` + per-type detail (card/lesson count from snapshot). Row actions: open (click), "Start session", and "Remove" when `item.contributorId === user.id || isAdmin`.
4. Empty state (AC-GS-004.2): icon + "No materials yet" copy + contribute call-to-action.
5. Contribute (AC-GS-004.3): header button opens `ContributePicker` → parallel `listNotes/listDecks/listCurricula` → grouped list with type filter; items the current user already contributed (same `itemId` + `contributorId === user.id` in `group.library`) are disabled with an "In library" tag (server would 409). Select → `contributeItem(groupId, itemId, itemType)` → toast, close, re-fetch group, `onChanged?.()`. Server performs the deep-copy snapshot; no client-side reference is kept.
6. Remove (AC-GS-004.5): confirm modal ("personal copy is not affected" copy; danger variant) → `removeContribution(groupId, item.id)` → toast, re-fetch, `onChanged?.()`. 403 from the server surfaces as toast error (authorization is server-enforced; UI additionally hides the action from plain members per AC-GS-004.4).
7. Open (AC-GS-004.4): row click opens `LibraryItemViewer` rendering `entry.snapshot` read-only: note → cues/mainNotes/summary sections; flashcardDeck → front/back card list; curriculum → subject + unit/lesson outline. Header strip: type label, contributor, contributed date, and "View only" vs "Manage" chip; Manage grants the Remove action inside the viewer. No editable fields anywhere (see scope decision).
8. Start session (AC-GS-005.1): per-row button opens `StartSessionModal` with the item pre-selected (title shown; the prompt's "select a material" is satisfied by the explicit per-item entry point) and a mode choice: "Flashcard review" (`flashcards`, default, decks only) and "Quiz" (`quiz`, all types; default for notes/curricula). Confirm → `startSession(groupId, item.id, mode)` → on success `onOpenSession?.(groupId, session)` (same payload contract GroupDetailView already passes for live-session join; SessionView is WO-10). 409 ("group already has an active session") surfaces in the modal with guidance to join from the group screen.

Data crossing boundaries: `GroupLibraryItem = { id, itemType: 'note'|'flashcardDeck'|'curriculum', itemId, title, contributorId, contributedAt, snapshot }` (server.js:9250); `startSession` response `session = { sessionId, groupId, hostId, itemTitle, itemType, mode, totalItems, currentIndex, startedAt }` (server.js:9686).

## Steps

1. **Skeleton + list + empty state** — create `src/components/group/GroupLibraryView.jsx`: header comment documenting the props contract, imports, main component with load/loading/error/empty states and the library list (AC-GS-004.1/.2). Compilable on its own.
2. **Contribute flow** — `ContributePicker` modal with duplicate-disable and error handling (AC-GS-004.3).
3. **Remove flow** — confirm modal, gated to contributor/admin (AC-GS-004.4/.5), "Former member" contributor fallback (AC-GS-004.6 surface).
4. **Read-only viewer** — `LibraryItemViewer` snapshot rendering for the three item types (AC-GS-004.4).
5. **Start session** — `StartSessionModal` + `startSession` call and `onOpenSession` handoff (AC-GS-005.1).
6. **WO comment** — post the edit-mode scope decision to the WO-9 comment thread.

Steps 2–5 touch only the new file and are order-independent after step 1.

## Testing

No unit-test runner exists in this repo (WO-6 precedent: component tests `[SKIP]`, verified via build + scripted/manual passes).

- Build gate: `npm run build` (vite) — syntax/import errors fail the build.
- Scripted API-level exploratory pass against an isolated scratch server (WO-2 precedent: scratch `DATA_DIR` + port override, e.g. port 3457): seed two users, create a group, invite+join, contribute a note and a deck from user A, verify the `getGroup` library shape the component consumes (contributor names, snapshot fields the viewer renders), duplicate-contribute 409 (picker-disable rationale), remove as admin vs non-contributor member (403), `startSession` 200 + second-session 409. This validates every server interaction the component performs without a browser.
- Manual exploratory pass in the running app (`npm run dev:full`) only if mounting the view requires no edits to files owned by parallel WOs; otherwise rely on the scripted pass. Evidence in `review-log.md`.
- Review-phase subagent review per `execution/review-phase.md`.
