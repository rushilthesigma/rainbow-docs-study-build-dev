import { apiFetch, getToken } from './client';

// StudyGroupApiClient — wraps the /api/study-groups/* REST surface and the
// live-session SSE stream (Group Study).

export async function createGroup(name, description = '') {
  return apiFetch('/api/study-groups', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
}

export async function listGroups() {
  return apiFetch('/api/study-groups');
}

export async function getGroup(id) {
  return apiFetch(`/api/study-groups/${id}`);
}

export async function inviteMember(groupId, userId) {
  return apiFetch(`/api/study-groups/${groupId}/invite`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function joinGroup(groupId) {
  return apiFetch(`/api/study-groups/${groupId}/join`, { method: 'POST' });
}

export async function declineGroup(groupId) {
  return apiFetch(`/api/study-groups/${groupId}/decline`, { method: 'POST' });
}

export async function contributeItem(groupId, itemId, itemType) {
  return apiFetch(`/api/study-groups/${groupId}/library`, {
    method: 'POST',
    body: JSON.stringify({ itemId, itemType }),
  });
}

export async function removeContribution(groupId, libraryItemId) {
  return apiFetch(`/api/study-groups/${groupId}/library/${libraryItemId}`, { method: 'DELETE' });
}

// successorId is required by the server when the departing user is the
// group's sole admin and other members remain (422 otherwise).
export async function removeMember(groupId, userId, successorId) {
  return apiFetch(`/api/study-groups/${groupId}/members/${userId}`, {
    method: 'DELETE',
    body: JSON.stringify(successorId ? { successorId } : {}),
  });
}

export async function promoteMember(groupId, userId) {
  return apiFetch(`/api/study-groups/${groupId}/members/${userId}/promote`, { method: 'POST' });
}

export async function disbandGroup(groupId, successorId) {
  return apiFetch(`/api/study-groups/${groupId}`, {
    method: 'DELETE',
    body: JSON.stringify(successorId ? { successorId } : {}),
  });
}

// ===== Live sessions =====

export async function startSession(groupId, libraryItemId, mode = 'flashcards') {
  return apiFetch(`/api/study-groups/${groupId}/sessions`, {
    method: 'POST',
    body: JSON.stringify({ libraryItemId, mode }),
  });
}

// scores: optional { [userId]: number } map the host attaches while advancing
// (SSE is one-way, so quiz scoring flows through the host's advance calls).
export async function advanceSession(groupId, sessionId, scores) {
  return apiFetch(`/api/study-groups/${groupId}/sessions/${sessionId}/advance`, {
    method: 'POST',
    body: JSON.stringify(scores ? { scores } : {}),
  });
}

export async function endSession(groupId, sessionId) {
  return apiFetch(`/api/study-groups/${groupId}/sessions/${sessionId}`, { method: 'DELETE' });
}

// Opens the authenticated SSE stream for a live session.
//
// Native EventSource cannot send the Authorization header authMiddleware
// requires, so this uses the same fetch + getReader pattern as the AI
// streaming clients (see src/api/lessons.js) and returns an EventSource-like
// handle: { close() }. Reconnects automatically 2 seconds after a network
// drop with the Last-Event-ID header; the server replays the current session
// state on every (re)connect rather than event history.
//
// onEvent(event)  — every SessionEvent ({ type, sessionId, currentIndex,
//                   totalItems, participantIds, scores }); an 'end' event
//                   closes the stream without reconnecting.
// onError(status, message) — HTTP-level failure (403/404: ended session or
//                   revoked membership); the stream stops, no reconnect.
// onReconnecting() — a dropped connection scheduled its 2s retry; the next
//                   onEvent (replayed state) means the reconnect succeeded.
// onClose()       — stream fully closed (after 'end', close(), or onError).
export function openSessionStream(groupId, sessionId, { onEvent, onError, onClose, onReconnecting, lastEventId = null } = {}) {
  let closed = false;
  let controller = null;
  let lastId = lastEventId;
  let reconnectTimer = null;

  const finish = () => {
    if (closed) return;
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    try { controller?.abort(); } catch {}
    onClose?.();
  };

  const connect = async () => {
    if (closed) return;
    controller = new AbortController();
    const headers = { Accept: 'text/event-stream' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (lastId != null) headers['Last-Event-ID'] = String(lastId);

    let sawEnd = false;
    try {
      const response = await fetch(`/api/study-groups/${groupId}/sessions/${sessionId}/stream`, {
        headers, signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401) {
          // Mirror apiFetch's 401 handling so a stream-only consumer
          // still gets logged out on an expired session.
          const { setToken } = await import('./client');
          setToken(null);
          window.location.href = '/';
        }
        const err = await response.json().catch(() => ({}));
        onError?.(response.status, err.error || `Stream failed: ${response.status}`);
        finish();
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith('id: ')) {
            lastId = line.slice(4).trim();
          } else if (line.startsWith('data: ')) {
            let event = null;
            try { event = JSON.parse(line.slice(6)); } catch {}
            if (!event) continue;
            if (closed) return;
            // A throwing consumer callback must not masquerade as a
            // network drop and trigger the reconnect loop.
            try { onEvent?.(event); } catch (cbErr) { console.error('onEvent callback failed:', cbErr); }
            if (event.type === 'end') { sawEnd = true; finish(); return; }
          }
          // ':' keepalive comments are ignored
        }
      }
    } catch (err) {
      if (closed || err?.name === 'AbortError') return;
      // fall through to reconnect
    }
    if (closed || sawEnd) return;
    // Connection dropped mid-session — retry with the last received event id
    // so SessionManager restores the current state (AC-GS-005.5).
    try { onReconnecting?.(); } catch {}
    reconnectTimer = setTimeout(connect, 2000);
  };

  connect();
  return { close: finish };
}
