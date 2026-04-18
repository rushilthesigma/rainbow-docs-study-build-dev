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

// AI-powered edit: text instruction + optional attachments.
// Uses multipart/form-data so we can send files. Skips apiFetch because
// that only does JSON.
export async function editCurriculumWithAI(id, instruction, files = []) {
  const token = localStorage.getItem('covalent-token');
  const form = new FormData();
  form.append('instruction', instruction);
  for (const f of files) form.append('files', f, f.name);
  const res = await fetch(`/api/curriculum/${id}/edit`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Edit failed: ${res.status}`);
  }
  return res.json();
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
function streamSSE(url, body, { onChunk, onDone, onError, onMeta, onSource, onStatus }) {
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
        onError?.(err.error || `Request failed: ${response.status}`, err);
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

// Lesson chat (conversational). `sourced` = true → web-search backed answer (counts 2x).
export function sendLessonMessage(curriculumId, lessonId, message, handlers, sourced = false) {
  return streamSSE(`/api/curriculum/${curriculumId}/lesson/${lessonId}/chat`, { message, sourced }, handlers);
}

// Study mode chat
export function sendStudyMessage(message, sessionId, context, handlers, sourced = false) {
  return streamSSE('/api/study/chat', { message, sessionId, context, sourced }, handlers);
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
