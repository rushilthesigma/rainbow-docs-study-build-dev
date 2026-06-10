<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-1

**Work Order:** WO-1 — Build ShareStore & ShareController
**Created At (UTC):** 2026-06-10T05:37:21Z

## Summary

Adds the server-side data layer and REST API for file & note sharing. A new `shares.json` flat-file store persists `ShareRecord` documents via `loadShares`/`saveShares` helpers in `server.js` (matching the `loadSocial`/`saveSocial` pattern). A new `ShareController` route block exposes all `/api/share/*` endpoints behind the existing `authMiddleware`. Item save routes (notes, flashcard decks, curricula) gain a shared-edit write path that validates a `shareId` + Edit permission and stamps `lastEditedBy`/`lastEditedAt` on the owner's item; item delete routes cascade-delete share records and notify affected recipients.

## Code Reuse And Package Structure

Reused patterns (all in `server.js` — the entire server is a single file by convention, so no new modules are created):

- `loadSocial`/`saveSocial` (server.js:8666-8667) — pattern for `loadShares`/`saveShares` with `SHARES_FILE = join(DATA_DIR, 'shares.json')`.
- `authMiddleware` (server.js:609) — sets `req.userId`; applied to all new routes.
- `findEmailById` (server.js:630), `loadUsers`/`saveUsers` (server.js:151-166), `migrateUserData` (server.js:883).
- ID generation via `crypto.randomUUID()`; timestamps via `new Date().toISOString()`.
- Error convention: `res.status(4xx|500).json({ error })`; 409 for duplicates (cf. handle conflict server.js:8678).
- Social profile records in `social.json` (`social.profiles[userId]`) — share notifications append to a new `notifications` array on the recipient's profile record.

Files modified:

- `server.js` — new `===== SHARING =====` section after the SOCIAL section; edits to `GET/PUT/DELETE /api/notes/:nid`, `GET/PUT/DELETE /api/flashcards/:deckId`, `GET?/PUT/DELETE /api/curriculum/:id`.
- `shares.json` — created lazily at runtime by `saveShares` (`loadShares` falls back to `[]`). Not committed as a fixture.

## Components And Flow

### ShareStore (server.js helpers)

- `const SHARES_FILE = join(DATA_DIR, 'shares.json')`
- `loadShares(): ShareRecord[]` — parse file, fallback `[]`.
- `saveShares(shares)` — `writeFileSync`, 2-space JSON.
- `findActiveShare(shares, itemId, recipientId)` — active = status `pending` or `accepted` (enforces one-active-record-per-pair contract).
- `findOwnedItem(userData, itemType, itemId)` — looks up notes / flashcardDecks / curricula.
- `pushShareNotification(social, recipientId, entry)` — appends to `social.profiles[recipientId].notifications`.
- `cascadeDeleteSharesForItem(itemId, actorUserId)` — removes all `ShareRecord`s for the item, removes pending invitation notifications, pushes an `item_deleted` notification to recipients with pending/accepted status. Called from item delete routes.

`ShareRecord` shape (blueprint contract): `{ id, itemId, itemType: 'note'|'flashcardDeck'|'curriculum', ownerId, recipientId, permissionLevel: 'view'|'edit', status: 'pending'|'accepted'|'declined'|'revoked', createdAt, updatedAt }`.

### Notifications on the recipient's profile record

`social.profiles[recipientId].notifications` entry shape:
`{ id, type: 'share_invitation'|'share_deleted', shareId, itemId, itemType, itemTitle, fromUserId, fromName, permissionLevel, createdAt, read: false }`.
Created on share creation with item name, item type, sender name, permission level (AC-FNS-002.1). Removed on accept/decline and on revoke-while-pending (AC-FNS-002.4).

### ShareController routes (all behind `authMiddleware`)

- `POST /api/share` `{ recipientId, itemId, itemType, permissionLevel }` — 400 missing/invalid fields; 400 self-share (AC-FNS-001.4); 404 recipient account not found (AC-FNS-001.5); 404 item not in owner's library; 409 duplicate active share. Creates `status:'pending'` record + recipient notification atomically (single save each of shares/social). Returns `{ share }`.
- `GET /api/share/incoming` — pending + accepted shares for `req.userId`, enriched with owner displayName/handle and item title (AC-FNS-002.1, SharingContext poll target).
- `GET /api/share/outgoing/:itemId` — owner-only; recipients with names, permission levels, status (AC-FNS-004.1).
- `POST /api/share/:id/accept`, `POST /api/share/:id/decline` — recipient-only, pending-only (404 otherwise); stamps `updatedAt`; removes invitation notification (AC-FNS-002.2/002.3).
- `PATCH /api/share/:id` `{ permissionLevel }` — owner-only; takes effect on recipient's next request (AC-FNS-004.2).
- `DELETE /api/share/:id` — owner-only revoke; sets status `revoked`; removes pending invitation notification when applicable (AC-FNS-002.4, AC-FNS-004.3).

### Shared-edit write path (ADR-001, AC-FNS-003.5, AC-FNS-004.4)

Helper `resolveShareAccess(req, itemType, itemId, { write })`:
- When `req.query.shareId` is present: load the share; require it exists, `recipientId === req.userId`, `itemId` matches, `status === 'accepted'`; for writes also require `permissionLevel === 'edit'`. Failure → 403 `{ error: 'Share access revoked or insufficient permission' }` (covers revoked-mid-edit).
- On success returns the **owner's** users-entry so the route reads/writes the owner's item; write routes stamp `lastEditedBy = req.userId` and `lastEditedAt`.
- Wired into: `GET/PUT /api/notes/:nid`, `GET/PUT /api/flashcards/:deckId`, `GET/PUT /api/curriculum/:id`. Owner-path behavior is unchanged when no `shareId` is supplied. Owner edits on shared items also stamp `lastEditedBy`/`lastEditedAt` so conflict detection (WO-7) has consistent data.

### Cascade delete (AC-FNS-004.5)

`DELETE /api/notes/:nid`, `DELETE /api/flashcards/:deckId`, `DELETE /api/curriculum/:id` call `cascadeDeleteSharesForItem(req.params.id, req.userId)` after removing the item.

## Steps

1. **ShareStore helpers** — add `===== SHARING =====` section to server.js (after SOCIAL section) with file constant, load/save, lookup, notification, and cascade helpers.
2. **ShareController routes** — add the seven `/api/share*` routes in the same section.
3. **Shared-edit access** — add `resolveShareAccess` and wire into notes/flashcards/curriculum GET/PUT routes; stamp `lastEditedBy`/`lastEditedAt` on writes.
4. **Cascade hooks** — call `cascadeDeleteSharesForItem` from the three item DELETE routes.
5. **Verify** — `node --check server.js`, then scripted API smoke test (below).

## Testing

No test suite exists (package.json has no test script), so validation is scripted + manual:

- `node --check server.js` for syntax.
- End-to-end API smoke test: start `node server.js` with a scratch `COVALENT_DATA_DIR`, register two users via the auth API, create a note as user A, then exercise: self-share → 400; share to unknown user → 404; valid share → 201/record returned; duplicate share → 409; incoming list as B shows invitation + notification on profile; accept; `PUT /api/notes/:id?shareId=...` as B succeeds and stamps `lastEditedBy`; `PATCH` permission to `view`, B's write → 403; `DELETE` share (revoke), B's read with shareId → 403; re-share + delete the note as A → share records removed from shares.json and B receives `share_deleted` notification.
- Inspect scratch `shares.json` / `social.json` after the run.
