<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-7

**Work Order:** WO-7 — Build SharedWithMeView
**Created At (UTC):** 2026-06-10T06:47:46Z

## Summary

Adds the Shared With Me library section: a reusable `SharedWithMeView` component that reads from `SharingContext` (WO-4), lists pending invitations (accept/decline) and accepted shares with item type / owner / permission, and opens items through a new `SharedItemViewer` modal that implements view-mode (read-only), edit-mode (writes routed to the owner's item via `?shareId=`), the conflict banner, and revoked-access handling. Mounted in both live library surfaces: the desktop `NotesApp` list view and the classic `NotesPage`.

**Placement note:** the app has no single "library" page — notes/decks/curricula live in separate apps/pages. The blueprint's "Shared With Me section within the user's library" is mounted in the notes library surfaces (the primary library UI in both shells), and the component itself renders shares of all three item types. Opening any shared item happens inside `SharedItemViewer` rather than threading shareId + read-only modes through the three large owner-editors (NotesApp editor, FlashcardDeckPage, CurriculumPage); this keeps mutation-control removal airtight (AC-FNS-003.4) and avoids destabilizing owner flows. Documented as accepted interpretation, to be confirmed at review.

## Code Reuse And Package Structure

Reused:

- `SharingContext` (WO-4): `incomingShares`, `pendingCount`, `acceptShare`, `declineShare`, `setLibraryOpen` (10s fast-poll while the section is mounted), `refresh`.
- `ShareApiClient` (WO-5, `src/api/share.js`): extended with two small helpers — `getSharedItem(itemType, itemId, shareId)` and `updateSharedItem(itemType, itemId, shareId, updates)` — that build the `?shareId=` URLs for the three item types (server contract from WO-1).
- `Modal`, `Button`, `LoadingSpinner` from `src/components/shared/`; `MarkdownNoteEditor` for the edit-mode note body; lucide icons; Tailwind idioms from sibling components.
- `useAuth` for the current user id (conflict attribution).

Created:

- `src/components/library/SharedWithMeView.jsx`
- `src/components/library/SharedItemViewer.jsx`

Modified:

- `src/api/share.js` — the two shared-item access helpers.
- `src/components/desktop/apps/NotesApp.jsx` — mount `<SharedWithMeView />` at the end of the list view.
- `src/pages/NotesPage.jsx` — mount `<SharedWithMeView />` below the notes list (classic/mobile surface).

## Components And Flow

### SharedWithMeView

- `useSharing()` → split `incomingShares` into `pending` and `accepted`.
- Pending invitations render with item title/type, sender, permission, Accept / Decline buttons (AC-FNS-002.2; actions re-fetch via context so the entry moves to the accepted list).
- Accepted entries render item-type icon + label, `itemTitle`, `ownerName`, permission chip (View/Edit) (AC-FNS-003.3); entries whose `itemExists` is false render disabled with "no longer available".
- Empty state when no accepted shares and no pending invitations (AC-FNS-003.2).
- `useEffect` → `setLibraryOpen(true)` on mount, `false` on unmount (blueprint 10s cadence).
- Click → opens `SharedItemViewer` with the share record.

### SharedItemViewer (modal)

- Loads via `getSharedItem(share.itemType, share.itemId, share.id)`.
- **Conflict banner (AC-FNS-003.6):** localStorage key `covalent-share-seen:<shareId>` stores the `updatedAt` last seen. If the freshly loaded `updatedAt` is newer than the stored value AND `lastEditedBy` is set to someone other than the current user, show "This item was changed by <owner/other> since you last opened it" with a Reload action. The seen-stamp updates after every successful load and save (last-write-wins is server behavior; the banner informs).
- **View mode** (`permissionLevel === 'view'`): pure read-only rendering — notes: title + markdown body (and Cornell cues/summary when present); decks: card fronts/backs list; curricula: unit/lesson outline. No mutation controls exist in this mode (AC-FNS-003.4).
- **Edit mode** (`'edit'`): notes get title input + `MarkdownNoteEditor` body (+ Cornell textareas when type is cornell) and a Save button calling `updateSharedItem` (server stamps `lastEditedBy`, writes to the owner's record — AC-FNS-003.5); decks get title rename; curricula remain read-only with an explanatory note (course content editing stays with the owner; deliberate safety boundary — server-side full-tree writes would overwrite owner tutoring transcripts).
- **Revoked mid-session (AC-FNS-004.4):** any 403 from load or save flips the viewer into a blocked state: banner "Your access to this item was removed", editor disabled, Save hidden; the share list refreshes so the entry disappears.
- Permission downgrades surface the same way on the next save (server re-validates per request — AC-FNS-004.2 behavior verified in WO-1).

### Mounts

- `NotesApp` list view (desktop shell) — after the notes grid, before the topic dialog modal.
- `NotesPage` (classic shell, mobile-reachable) — below the list.

## Steps

1. **share.js helpers** — `getSharedItem` / `updateSharedItem`.
2. **SharedItemViewer** — load/render/edit/conflict/revoked states.
3. **SharedWithMeView** — lists, empty state, cadence hook, viewer wiring.
4. **Mounts** — NotesApp + NotesPage.
5. **Verify** — `npx vite build`; node integration check of the two new share.js helpers against the scratch server; renderToString smoke of SharedWithMeView states (empty / pending / accepted) with a stubbed context.

## Testing

- `npx vite build` — compile health for all touched files.
- Node run against scratch server (port 3456): `getSharedItem` returns owner note via shareId; `updateSharedItem` saves and stamps `lastEditedBy`; 403 surfaces as thrown error after revoke (drives the blocked state).
- `react-dom/server` renderToString smoke: SharedWithMeView renders empty state with stubbed empty context; renders invitation row + accepted row with stubbed populated context; SharedItemViewer renders read-only note (no Save button) for view permission and Save for edit.
- Build-time check that owner flows (NotesApp/NotesPage) compile unchanged.
