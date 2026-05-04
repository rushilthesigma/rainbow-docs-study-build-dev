import { apiFetch, getToken } from './client';

export async function listLessons() {
  return apiFetch('/api/lessons');
}

// ===== STANDALONE LESSON BLOCKS (Claudius 4R/4Q + final SRS) =====
// Mirrors the curriculum-side block API but for the standalone Lessons
// app — no parent curriculum/unit. Server endpoints live on
// /api/lessons/:id/blocks/*.
export async function generateLessonBlocks(lessonId) {
  return apiFetch(`/api/lessons/${lessonId}/blocks/generate`, { method: 'POST' });
}
export async function generateLessonFinalQuiz(lessonId) {
  return apiFetch(`/api/lessons/${lessonId}/blocks/final-quiz/generate`, { method: 'POST' });
}
export async function gradeLessonBlock(lessonId, blockId, responses) {
  return apiFetch(`/api/lessons/${lessonId}/blocks/${blockId}/grade`, {
    method: 'POST',
    body: JSON.stringify({ responses }),
  });
}
export async function completeLessonBlock(lessonId, blockId) {
  return apiFetch(`/api/lessons/${lessonId}/blocks/${blockId}/complete`, { method: 'POST' });
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
      let finished = false;
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
              if (data.done) { if (!finished) { finished = true; onDone?.(data); } return; }
              else if (data.error) { if (!finished) { finished = true; onError?.(data.error); } return; }
              else if (data.content) onChunk?.(data.content);
              else if (data.source) onSource?.(data.source);
              else if (data.status) onStatus?.(data.status);
            } catch {}
          }
        }
      }
      // Stream closed without a `done` or `error` event — connection dropped
      // mid-response (proxy timeout, network blip). Surface as a soft error
      // so the bubble closes instead of spinning forever.
      if (!finished) onError?.('Connection ended unexpectedly. Try sending the message again.');
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError?.(err.message);
    });

  return () => controller.abort();
}
