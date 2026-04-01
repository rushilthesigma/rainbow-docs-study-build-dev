import { apiFetch, getToken } from './client';

export async function generateCurriculum(settings) {
  return apiFetch('/api/curriculum/generate', {
    method: 'POST',
    body: JSON.stringify({ settings }),
  });
}

export async function listCurricula() {
  return apiFetch('/api/curriculum');
}

export async function getCurriculum(id) {
  return apiFetch(`/api/curriculum/${id}`);
}

export async function updateCurriculum(id, updates) {
  return apiFetch(`/api/curriculum/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ updates }),
  });
}

export async function deleteCurriculum(id) {
  return apiFetch(`/api/curriculum/${id}`, { method: 'DELETE' });
}

export async function toggleLessonComplete(curriculumId, lessonId) {
  return apiFetch(`/api/curriculum/${curriculumId}/lesson/${lessonId}/complete`, {
    method: 'POST',
  });
}

export async function getStreak() {
  return apiFetch('/api/study/streak');
}

export async function getLessonHistory(curriculumId, lessonId) {
  return apiFetch(`/api/curriculum/${curriculumId}/lesson/${lessonId}/history`);
}

export async function resetLesson(curriculumId, lessonId) {
  return apiFetch(`/api/curriculum/${curriculumId}/lesson/${lessonId}/reset`, { method: 'POST' });
}

// Generic SSE streaming helper
function streamSSE(url, body, { onChunk, onDone, onError, onMeta }) {
  const token = getToken();
  const controller = new AbortController();

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
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
              else if (data.sessionId) onMeta?.(data);
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

// Lesson chat (conversational)
export function sendLessonMessage(curriculumId, lessonId, message, handlers) {
  return streamSSE(`/api/curriculum/${curriculumId}/lesson/${lessonId}/chat`, { message }, handlers);
}

// Study mode chat
export function sendStudyMessage(message, sessionId, context, handlers) {
  return streamSSE('/api/study/chat', { message, sessionId, context }, handlers);
}

// Study session history
export async function listStudySessions() {
  return apiFetch('/api/study/sessions');
}

export async function getStudySession(sid) {
  return apiFetch(`/api/study/sessions/${sid}`);
}

export async function deleteStudySession(sid) {
  return apiFetch(`/api/study/sessions/${sid}`, { method: 'DELETE' });
}

// Legacy static lesson generation (kept as fallback)
export function generateLesson(curriculumId, unitId, lessonId, onChunk, onDone, onError) {
  return streamSSE(`/api/curriculum/${curriculumId}/lesson/generate`, { unitId, lessonId }, { onChunk, onDone, onError });
}
