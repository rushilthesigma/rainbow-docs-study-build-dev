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

// SSE chat — same shape as curriculum lesson chat. `sourced=true` → web-search (2x cost).
// `images` is an array of { dataUrl, mimeType } forwarded as inline_data to Gemini.
export function sendLessonMessage(id, message, images, { onChunk, onDone, onError, onSource, onStatus }, sourced = false) {
  const token = getToken();
  const controller = new AbortController();

  fetch(`/api/lessons/${id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, sourced, images: (images || []).map(i => ({ dataUrl: i.dataUrl, mimeType: i.mimeType })) }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        // Pass the full error object so aiErrors.js can use the human-readable
        // `message` field and the error code for quota-exhausted cases.
        onError?.({ ...err, status: response.status, _code: err.error });
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
              if (data.done) onDone?.(data);
              else if (data.error) onError?.(data.error);
              else if (data.content) onChunk?.(data.content);
              else if (data.source) onSource?.(data.source);
              else if (data.status) onStatus?.(data.status);
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
