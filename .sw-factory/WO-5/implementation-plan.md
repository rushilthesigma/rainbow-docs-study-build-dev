<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-5

**Work Order:** WO-5 — Build ShareApiClient & StudyGroupApiClient
**Created At (UTC):** 2026-06-10T06:34:26Z

## Summary

Adds two frontend API client modules: `src/api/share.js` (wraps all `/api/share/*` endpoints) and `src/api/studyGroups.js` (wraps all `/api/study-groups/*` REST endpoints plus SSE session-stream lifecycle management with auto-reconnect and `Last-Event-ID`). Both follow the existing `src/api/*.js` module conventions built on `apiFetch`.

**Documented drift:** the WO says `openSessionStream` "returns an `EventSource`". Native `EventSource` cannot send the `Authorization: Bearer` header that `authMiddleware` requires, and this codebase's established SSE pattern (e.g. `src/api/lessons.js` chat streaming) is authenticated `fetch` + `response.body.getReader()`. `openSessionStream` therefore returns an EventSource-like handle `{ close() }` with `onEvent`/`onError`/`onClose` callbacks, implemented on the proven fetch-stream pattern, auto-reconnecting after 2 s with the `Last-Event-ID` header (blueprint contract: SessionManager replays current state). Semantics match the blueprint; only the concrete browser primitive differs.

## Code Reuse And Package Structure

Reused:

- `src/api/client.js` — `apiFetch` (auth header, 401 redirect, error normalization) for all REST calls; `getToken` for the SSE fetch.
- `src/api/lessons.js` chat-stream pattern — fetch + getReader + line-buffered `data:` parsing, AbortController cancellation — followed as the pattern for the session stream (with `id:` line parsing added for Last-Event-ID tracking).
- Module conventions from `src/api/social.js`/`notes.js`: plain exported async functions, JSON bodies via `JSON.stringify`.

Files created:

- `src/api/share.js`
- `src/api/studyGroups.js`

## Components And Flow

### ShareApiClient (`src/api/share.js`)

All return parsed JSON from the WO-1 routes; errors surface via `apiFetch`'s thrown `Error` (callers display failure states — blueprint responsibility):

- `createShare(itemId, itemType, recipientId, permissionLevel)` → POST `/api/share` → `{ share }`
- `acceptShare(shareId)` / `declineShare(shareId)` → POST `/api/share/:id/accept|decline`
- `revokeShare(shareId)` → DELETE `/api/share/:id`
- `updatePermission(shareId, permissionLevel)` → PATCH `/api/share/:id`
- `listIncoming()` → GET `/api/share/incoming` → `{ shares }` (enriched ShareRecords)
- `listOutgoing(itemId)` → GET `/api/share/outgoing/:itemId` → `{ shares }`

### StudyGroupApiClient (`src/api/studyGroups.js`)

REST wrappers (WO-2/WO-3 routes): `createGroup(name, description)`, `listGroups()`, `getGroup(id)`, `inviteMember(groupId, userId)`, `joinGroup(groupId)`, `declineGroup(groupId)`, `contributeItem(groupId, itemId, itemType)`, `removeContribution(groupId, libraryItemId)`, `removeMember(groupId, userId, successorId?)`, `promoteMember(groupId, userId)`, `disbandGroup(groupId, successorId?)`, `startSession(groupId, libraryItemId, mode)`, `advanceSession(groupId, sessionId, scores?)`, `endSession(groupId, sessionId)`.

`successorId`/`scores` optional params mirror the server's last-admin-guard and host-scoring contracts.

### `openSessionStream(groupId, sessionId, { onEvent, onError, onClose, lastEventId })`

- Authenticated `fetch` to `/api/study-groups/:groupId/sessions/:sessionId/stream` with `Accept: text/event-stream` and optional `Last-Event-ID` header.
- Parses SSE frames line-by-line: tracks `id:` lines into `lastEventId`, JSON-parses `data:` lines into `SessionEvent` objects passed to `onEvent`; ignores `:` keepalive comments.
- On network drop (not explicit `close()` and not an `end` event): waits 2 s, reconnects with the last received event id (Group Study blueprint relationship paragraph).
- On HTTP error (403/404 — session ended or revoked membership): calls `onError(status, message)` and stops (no reconnect loop against a dead session).
- Returns `{ close() }`; `close()` aborts the fetch and suppresses reconnect/callbacks.

## Steps

1. **`src/api/share.js`** — seven REST wrappers.
2. **`src/api/studyGroups.js`** — REST wrappers + `openSessionStream`.
3. **Verify** — `npx vite build` (modules compile in the app bundle); node-based integration run of both clients against the scratch server (localStorage/window shims) exercising the share flow, group flow, and a live SSE stream incl. reconnect.

## Testing

- `npx vite build` — bundle health.
- Node integration script (`/tmp/wo5-clients.test.mjs`): shims `localStorage`/`window`, imports both modules, runs against the isolated scratch server (port 3456): share create→incoming→accept→revoke via ShareApiClient; group create→invite→join→contribute→session start via StudyGroupApiClient; `openSessionStream` receives `state` then `advance` events; kill/reconnect path delivers fresh `state`; `close()` stops the stream.
