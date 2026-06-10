<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-6

**Work Order:** WO-6 — Build ShareDialog
**Created At (UTC):** 2026-06-10T06:32:46Z

## Summary

Build the `ShareDialog` modal: an owner searches for a user, picks View/Edit, and shares a note,
flashcard deck, or curriculum; the dialog also lists the item's outgoing shares with revoke and
permission-toggle controls. Then wire a "Share" entry point into the notes, flashcard-deck, and
curriculum surfaces so the dialog is reachable per item. Frontend-only and additive.

## Safety / Parallel-Work Constraints

- A parallel agent owns WO-3 (SSE / `server.js`). **WO-6 touches no backend file.** The `/api/share/*`
  and `/api/social/search` routes already exist (WO-1).
- Reuses the existing `ShareApiClient` (`src/api/share.js`, created under WO-5) — does **not** re-create it.
- Edits to the three app files are minimal and additive (one icon import, one import, one state hook,
  one trigger control, one conditional `<ShareDialog>` render each). Build is run after each file.

## Code Reuse And Package Structure

Reuse:
- `src/api/share.js` (ShareApiClient): `createShare(itemId, itemType, recipientId, level)`,
  `revokeShare(id)`, `updatePermission(id, level)`, `listOutgoing(itemId)`. Confirmed signatures.
- `src/api/social.js` `searchUsers(q)` -> `{ users: [{ userId, handle, displayName, plan }] }`.
  Server already excludes the requester from results (server.js `/api/social/search`), so self never
  appears in search — self-share is additionally rejected by the API (surfaced as an inline error).
- `src/components/shared/Modal.jsx` — accessible modal (focus trap, Esc, overlay). ShareDialog renders
  its own `<Modal open onClose>` so callers just conditionally mount `<ShareDialog>`.
- Server contract: `itemType` in {'note','flashcardDeck','curriculum'} (server.js `SHARE_ITEM_TYPES`).

Created:
- `src/components/shared/ShareDialog.jsx` — the dialog component.

Modified (minimal, additive):
- `src/components/desktop/apps/NotesApp.jsx` — Share button on each note row (next to Delete, line ~847).
- `src/components/desktop/apps/FlashcardsApp.jsx` — Share button in the deck **detail header** (next to
  Delete, line ~115). Chosen over the list card because each list card is itself a `<button>`; nesting a
  button is invalid HTML, and the detail header is a valid per-deck action surface.
- `src/components/desktop/apps/CurriculaApp.jsx` — Share button on each curriculum card (line ~901; the
  card is a `<div>`, so a child button with `stopPropagation` is safe).

## Components And Flow

**ShareDialog** (Blueprint: File & Note Sharing -> `ShareDialog`)
- Props: `{ item: { id, type, title }, onClose }`.
- On mount: `listOutgoing(item.id)` -> `outgoing` (enriched: `recipientName`, `recipientHandle`,
  `permissionLevel`, `status`, `id`).
- Search: debounced `searchUsers(query)`; client-side filter removes any user whose `userId` is already
  in `outgoing` recipients (AC-FNS-001.2). Empty filtered results with a non-empty query -> "No account
  found" (AC-FNS-001.5).
- Permission selector: View (default) / Edit (AC-FNS-001.1).
- Submit -> `createShare(item.id, item.type, selected.userId, level)`; on success show inline confirmation
  + refresh outgoing (recipient now listed, AC-FNS-001.3); on failure show `err.message` inline and create
  nothing (AC-FNS-001.6; self-share message AC-FNS-001.4 comes from the API).
- Outgoing list (AC-FNS-004.1): each recipient name + level, a View/Edit toggle
  (`updatePermission`, AC-FNS-004.2) and a revoke control (`revokeShare`, AC-FNS-004.3); both refresh.

**Wiring**: each app gets `shareTarget` state; the Share control sets it (`{ id, type, title }`); the app
conditionally renders `{shareTarget && <ShareDialog item={shareTarget} onClose={() => setShareTarget(null)} />}`.

## Steps

1. **ShareDialog** — create `src/components/shared/ShareDialog.jsx` (search + permission + submit +
   outgoing list). Build. (independent)
2. **NotesApp wiring** — import + `Share2` icon + `shareTarget` state + Share button on the note row +
   render dialog. Build.
3. **FlashcardsApp wiring** — import + `Share2` + `shareTarget` + Share button in deck detail header +
   render dialog. Build.
4. **CurriculaApp wiring** — import + `Share2` + `shareTarget` + Share button on the card + render dialog.
   Build.

## Testing

No unit-test convention exists for these components. Verification:
- `npm run build` (vite) after each wiring step — no import/syntax regressions.
- Manual (where a live, signed-in session is available): open Share from a note/deck/curriculum; search a
  user, pick View/Edit, submit -> confirmation + recipient appears in outgoing; toggle permission; revoke;
  search a user who already has access is excluded; empty search shows "No account found"; a failed
  submit shows an inline error. Full multi-account E2E is environment-dependent and noted as such.
