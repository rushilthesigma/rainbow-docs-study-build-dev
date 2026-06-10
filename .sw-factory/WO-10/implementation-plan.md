<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-10

**Work Order:** WO-10 — Build SessionView
**Created At (UTC):** 2026-06-10T07:09:00Z

## Summary

Adds `src/components/group/SessionView.jsx` — the live group study session UI. It loads the session material from the group library snapshot, opens the WO-5 SSE stream, renders the synchronized current card/question with participant list and progress, exposes host-only advance/end controls, shows a reconnecting indicator during the client's 2-second auto-reconnect, renders the summary panel on `end`, and exits to the group screens on revoked access. Plugs into the `onOpenSession(groupId, session)` callback contract that WO-8's GroupListView/GroupDetailView already expose.

## Code Reuse And Package Structure

Reused:

- `openSessionStream`, `advanceSession`, `endSession`, `getGroup` from `src/api/studyGroups.js` (WO-5).
- `useAuth` for host detection (`user.id === session.hostId`).
- `Button`, `LoadingSpinner` shared components; group-view styling idioms from WO-8's GroupListView/GroupDetailView (dark glass cards, white/alpha text scale).

Created:

- `src/components/group/SessionView.jsx`.

Modified (small, documented integration extensions):

- `server.js` — expose `libraryItemId` on the start-session response and on the list route's `activeSession` object (WO-3 component; additive field exposure only). SessionView needs it to resolve the material snapshot from `group.library`; `SessionEvent` deliberately carries only index/participants/scores.
- `src/api/studyGroups.js` — `openSessionStream` gains an optional `onReconnecting` callback fired when a dropped connection schedules its 2-second retry (WO-5 component; additive). Required for the WO-10 "reconnecting indicator" scope item.

## Components And Flow

### SessionView({ groupId, session, onExit })

`session` minimally `{ sessionId, hostId, itemTitle?, mode?, libraryItemId? }` — the shapes WO-8 passes from either the start response or the list route's `activeSession`.

- **Material load:** `getGroup(groupId)` → `group.library.find(l => l.id === session.libraryItemId)` (fallback: title match) → items derived from the snapshot: deck → `cards` (front/back, flip-to-reveal); note → single content card; curriculum → one item per lesson. Missing material → graceful "material unavailable" card (session still tracks progress).
- **Stream lifecycle:** `openSessionStream(groupId, sessionId, { onEvent, onError, onReconnecting })` on mount; `close()` on unmount. Every `SessionEvent` (`state`/`advance`/`join`/`leave`/`end`) replaces `{ currentIndex, totalItems, participantIds, scores }` (AC-GS-005.3/.4 — server state is authoritative). `end` → summary panel (items reviewed + per-participant scores with member names; AC-GS-005.6). `onReconnecting` → banner until the next event arrives (AC-GS-005.5 — server replays current state via the client's Last-Event-ID reconnect). `onError` (403/404: removed from group, group disbanded, or session gone) → brief message then `onExit()` (WO scope: navigate back to GroupListView).
- **Render:** progress bar `currentIndex+1 / totalItems`; current card with flip-to-reveal for decks; participant list from `participantIds` mapped to names via the group roster (joins/leaves update live); "LIVE" indicator; host chip on the host participant.
- **Host controls:** Advance (`advanceSession`) and End session (`endSession`) rendered only for the host (`user.id === session.hostId`); non-hosts see progression state only (blueprint: advance disabled/hidden for non-hosts — hidden chosen, matching the WO "disabled and hidden" wording for non-host participants).
- AC-GS-005.2/.7 (notification with join action; explicit join) are WO-11/WO-3 surface area; SessionView participates by being joinable via `onOpenSession` from the WO-8 views' Join buttons.

## Steps

1. **Server field exposure** — `libraryItemId` in start response + list `activeSession`.
2. **Client reconnect callback** — `onReconnecting` in `openSessionStream`.
3. **SessionView component** — material resolution, stream lifecycle, render states, host controls, summary, exit paths.
4. **Verify** — `node --check server.js`; vite build; node integration test: host starts session via API, SessionView's exact client calls drive a live stream (state/advance with scores/end observed); SSR render smoke of the main states (live card for host vs non-host, reconnecting banner, summary panel).

## Testing

- `node --check server.js` + `npx vite build`.
- Node integration (scratch server, port 3456): start session → `libraryItemId` present in start response and in `listGroups().groups[].activeSession`; `openSessionStream` `onReconnecting` fires when the server connection drops mid-session (simulated by ending the session from another actor — no; simulated by aborting/restarting: validated instead via the ended-session reconnect path) — primary stream behaviors (state/advance/end) re-verified post-change.
- SSR smoke via esbuild bundle: host view shows Advance/End controls + progress; non-host hides them; summary panel renders scores with names; reconnecting banner renders.
