<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-3

**Work Order:** WO-3 — Build SessionManager (SSE Session Layer)
**Created At (UTC):** 2026-06-10T06:21:01Z

## Summary

Adds the in-memory `SessionManager` to server.js: an active-session registry keyed by `sessionId` with per-participant SSE response connections, plus the four session lifecycle routes (start, stream, advance, end) under `/api/study-groups/:id/sessions*`. Synchronization uses the SSE pattern already proven by the AI-streaming routes (per Group Study ADR-001). Active session state lives only in memory — a restart terminates sessions (blueprint key contract).

## Code Reuse And Package Structure

Reused (all in `server.js`):

- SSE response pattern from AI streaming routes (~line 3874): `text/event-stream` headers incl. `X-Accel-Buffering: no`, `res.flushHeaders()`, `data: {json}\n\n` writes with `res.flush?.()`, `: keepalive` comments.
- WO-2 STUDY GROUPS helpers: `findStudyGroup`, `isGroupMember`, `isGroupAdmin`, `getStudyGroups`, `loadSocial`/`saveSocial`.
- WO-1 notification helpers: `getNotificationList`, `shareDisplayName`, `removeNotifications`.
- `authMiddleware`, `crypto.randomUUID()`, `{ error }` conventions.

Files modified:

- `server.js` — new `===== GROUP STUDY SESSIONS =====` section after STUDY GROUPS; the WO-2 list route's `activeSession` field switches from the (never-written) persisted field to the in-memory registry (aligns with blueprint: state in memory only); WO-2 disband route terminates active sessions for the group; WO-2 member-removal route disconnects the removed user from any active session (blueprint key contracts).

## Components And Flow

### SessionManager (in-memory)

- `const activeSessions = new Map()` — sessionId → `{ sessionId, groupId, hostId, libraryItemId, itemId, itemType, itemTitle, mode, totalItems, currentIndex, participantIds: string[], scores: {}, startedAt, eventId, streams: Map<userId, res>, keepalives: Map<userId, interval> }`.
- `findActiveSessionForGroup(groupId)` — at most one active session per group (start returns 409 otherwise).
- `sessionEventPayload(session, type)` — `SessionEvent` contract: `{ type: 'state'|'advance'|'join'|'leave'|'end', sessionId, currentIndex, totalItems, participantIds, scores }`.
- `broadcastSessionEvent(session, type)` — increments `eventId`, writes `id: <eventId>\ndata: <json>\n\n` to every open stream.
- `detachSessionStream(session, userId, { broadcastLeave })` — clears keepalive, removes stream + participant, broadcasts `leave`.
- `terminateSessionsForGroup(groupId, reason)` — broadcasts `end`, closes all streams, drops sessions (used by disband/restart-free cleanup paths).

### Routes (all `authMiddleware`)

- `POST /api/study-groups/:id/sessions` `{ libraryItemId, mode }` — member-only; material must be a `GroupLibraryItem` in the group's library (AC-GS-005.1); 409 if the group already has an active session. `totalItems` derived from the snapshot (deck → `cards.length`, curriculum → lesson count, note → 1). Caller becomes host and first participant. All other members get a `session_started` notification with session name (item title + mode), host name, groupId/sessionId for the join action (AC-GS-005.2, AC-GS-006.2). Members who join the group later are not auto-entered — joining is explicit via the stream route (AC-GS-005.7).
- `GET /api/study-groups/:id/sessions/:sessionId/stream` — membership validated before the stream is established (blueprint key contract); 404 unknown/ended session. Registers the connection, sends the current `state` event immediately (covers both fresh join and `Last-Event-ID` reconnect — SessionManager replays current state, not history; AC-GS-005.3/.5), broadcasts `join` to the other participants, writes `: keepalive` every 8 s, and on socket close broadcasts `leave` (scores for that user are retained for the summary).
- `POST /api/study-groups/:id/sessions/:sessionId/advance` — host-only (403); bumps `currentIndex` (capped at `totalItems - 1`); optional `{ scores }` object from the host merges into per-participant scores (the host drives quiz scoring; participants have no write channel in SSE — ADR-001); broadcasts `advance` (AC-GS-005.4).
- `DELETE /api/study-groups/:id/sessions/:sessionId` — host-only; broadcasts `end` (participants render the summary from this final event — AC-GS-005.6), persists `SessionSummary` `{ sessionId, hostId, itemId, itemType, totalItems, scores, startedAt, endedAt }` to `group.sessions` via the social store, closes all connections, deletes the registry entry.

### Cross-wiring (blueprint key contracts)

- Group disband → `terminateSessionsForGroup(groupId)` before deletion.
- Member removal → detach that user's stream from any active group session immediately.
- `GET /api/study-groups` list → `activeSession` now read from the in-memory registry.

## Steps

1. **SessionManager core** — registry, payload/broadcast/detach/terminate helpers.
2. **Start route** — validation, registry entry, notifications.
3. **Stream route** — SSE handshake, state replay, join/leave broadcasts, keepalive.
4. **Advance/End routes** — host guards, score merge, summary persistence.
5. **Cross-wiring** — disband/member-removal/list-route integration.
6. **Verify** — `node --check`; scripted SSE smoke test (curl -N streams to files, then assert event sequences).

## Testing

- `node --check server.js`.
- Scripted smoke on the isolated scratch server: two members; start session (notification to member with session name/host name; 409 second session; outsider start 404; non-library material 404); host stream + member stream via `curl -N` background processes; assert member receives `state` with current index, host receives `join`; advance (member sees `advance` with incremented index, host-only guard 403); reconnect simulation (kill member curl, reopen with `Last-Event-ID`, expect fresh `state` at current position); end (both streams receive `end`; `group.sessions` in social.json contains the SessionSummary; registry cleared so a new session can start); disband-terminates-session check.
