import { apiFetch, getToken } from './client';

export async function listLessons() {
  return apiFetch('/api/lessons');
}

export async function createLesson(topic, difficulty) {
  return apiFetch('/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ topic, difficulty }),
  });
}

export async function getLesson(id) {
  return apiFetch(`/api/lessons/${id}`);
}

export async function deleteLesson(id) {
  return apiFetch(`/api/lessons/${id}`, { method: 'DELETE' });
}

export async function getLessonHistory(id) {
  return apiFetch(`/api/lessons/${id}/history`);
}

export async function resetLesson(id) {
  return apiFetch(`/api/lessons/${id}/reset`, { method: 'POST' });
}

// SSE chat — same shape as curriculum lesson chat
export function sendLessonMessage(id, message, { onChunk, onDone, onError }) {
  const token = getToken();
  const controller = new AbortController();

  fetch(`/api/lessons/${id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        onError?.(err.error || `Request failed: ${response.status}`);
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
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.done) onDone?.();
              else if (data.error) onError?.(data.error);
              else if (data.content) onChunk?.(data.content);
            } catch {}
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError?.(err.message);
    });

  return () => controller.abort();
}
