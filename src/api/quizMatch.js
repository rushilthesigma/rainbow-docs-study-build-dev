import { apiFetch, getToken } from './client';

export const createMatch = (opts) => apiFetch('/api/quizbowl/match', {
  method: 'POST',
  body: JSON.stringify(opts || {}),
});
export const joinMatch = (code) => apiFetch(`/api/quizbowl/match/${code}/join`, { method: 'POST' });
export const startMatch = (code, settings) => apiFetch(`/api/quizbowl/match/${code}/start`, {
  method: 'POST',
  body: JSON.stringify(settings || {}),
});
export const buzzMatch = (code) => apiFetch(`/api/quizbowl/match/${code}/buzz`, { method: 'POST' });
export const answerMatch = (code, answer) => apiFetch(`/api/quizbowl/match/${code}/answer`, {
  method: 'POST',
  body: JSON.stringify({ answer }),
});
export const nextMatchQuestion = (code) => apiFetch(`/api/quizbowl/match/${code}/next`, { method: 'POST' });
export const leaveMatch = (code) => apiFetch(`/api/quizbowl/match/${code}/leave`, { method: 'POST' });

// Subscribe to an SSE stream of match events.
// handlers: { onSnapshot, onPlayerJoined, onQuestionStart, onBuzz, onAnswerResult, onMatchEnd, onPlayerLeft, onError }
export function streamMatch(code, handlers) {
  const token = getToken();
  const controller = new AbortController();

  fetch(`/api/quizbowl/match/${code}/stream`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        handlers.onError?.(err.error || `stream ${response.status}`);
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
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            const t = data.type;
            if (t === 'snapshot') handlers.onSnapshot?.(data.match);
            else if (t === 'player_joined') handlers.onPlayerJoined?.(data.match);
            else if (t === 'generating') handlers.onGenerating?.(data.match);
            else if (t === 'start_failed') handlers.onStartFailed?.(data);
            else if (t === 'question_start') handlers.onQuestionStart?.(data);
            else if (t === 'buzz') handlers.onBuzz?.(data);
            else if (t === 'wrong_answer') handlers.onWrongAnswer?.(data);
            else if (t === 'answer_result') handlers.onAnswerResult?.(data);
            else if (t === 'match_end') handlers.onMatchEnd?.(data);
            else if (t === 'player_left') handlers.onPlayerLeft?.(data);
          } catch {}
        }
      }
    })
    .catch(err => {
      if (err.name !== 'AbortError') handlers.onError?.(err.message);
    });

  return () => controller.abort();
}
