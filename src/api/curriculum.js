import { apiFetch, getToken } from './client';

// `sources` is an optional array of { title, kind, content, url? }.
// Each entry is already-extracted plain text (PDFs/text files via
// extractFiles, URLs via extractSourceUrl). The server caps total
// injection size, so callers don't need to pre-trim aggressively.
export async function generateCurriculum(settings, sources = []) {
  return apiFetch('/api/curriculum/generate', {
    method: 'POST',
    body: JSON.stringify({ settings, sources }),
  });
}

// Pull plain text out of a public web URL (server-side fetch — bypasses
// CORS). Returns { url, title, kind:'url', content, chars }.
export async function extractSourceUrl(url) {
  return apiFetch('/api/sources/extract-url', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

// Pull plain text out of one or more uploaded files (PDF / text).
// Returns { files: [{ name, kind, text, error? }] }. Multipart, so
// it skips apiFetch's JSON-only path.
export async function extractFiles(files) {
  const token = getToken();
  const form = new FormData();
  for (const f of files) form.append('files', f, f.name);
  const res = await fetch('/api/files/extract', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Extract failed: ${res.status}`);
  }
  return res.json();
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

// ===== STRUCTURED LESSON BLOCKS (4 readings + 4 quizzes, no chat) =====
export async function generateLessonBlocks(curriculumId, lessonId) {
  return apiFetch(`/api/curriculum/${curriculumId}/lesson/${lessonId}/blocks/generate`, {
    method: 'POST',
  });
}

export async function generateFinalQuiz(curriculumId, lessonId) {
  return apiFetch(`/api/curriculum/${curriculumId}/lesson/${lessonId}/blocks/final-quiz/generate`, {
    method: 'POST',
  });
}

export async function gradeQuizBlock(curriculumId, lessonId, blockId, responses) {
  return apiFetch(`/api/curriculum/${curriculumId}/lesson/${lessonId}/blocks/${blockId}/grade`, {
    method: 'POST',
    body: JSON.stringify({ responses }),
  });
}

export async function completeLessonBlock(curriculumId, lessonId, blockId) {
  return apiFetch(`/api/curriculum/${curriculumId}/lesson/${lessonId}/blocks/${blockId}/complete`, {
    method: 'POST',
  });
}

// ===== MIDTERMS / FINALS (course-level SRS exams) =====
export async function getCurriculumExams(curriculumId) {
  return apiFetch(`/api/curriculum/${curriculumId}/exams`);
}

export async function generateCurriculumExam(curriculumId, kind /* 'midterm' | 'final' */) {
  return apiFetch(`/api/curriculum/${curriculumId}/exams/${kind}/generate`, {
    method: 'POST',
  });
}

export async function gradeCurriculumExam(curriculumId, examId, responses) {
  return apiFetch(`/api/curriculum/${curriculumId}/exams/${examId}/grade`, {
    method: 'POST',
    body: JSON.stringify({ responses }),
  });
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
        // Pass the full payload so the renderer can distinguish quota errors
        // (HTTP 402 + `error: 'message_limit_reached'`) from generic failures.
        onError?.({ ...err, status: response.status, _code: err.error }, err);
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
              else if (data.sessionId) onMeta?.(data);
            } catch {}
          }
        }
      }
      // Stream closed without a `done` or `error` event — connection dropped
      // (proxy timeout, network blip, etc.). Surface as a soft error so the
      // streaming bubble closes instead of spinning forever.
      if (!finished) onError?.('Connection ended unexpectedly. Try sending the message again.');
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError?.(err.message);
    });

  return () => controller.abort();
}

// Lesson chat (conversational). `sourced` = true → web-search backed answer (counts 2x).
// `images` is an optional array of { dataUrl, mimeType } for multimodal turns.
export function sendLessonMessage(curriculumId, lessonId, message, handlersOrImages, handlersOrSourced, maybeSourced) {
  // Backward-compat: old call signature was (id, lessonId, message, handlers, sourced).
  let images = [], handlers, sourced = false;
  if (Array.isArray(handlersOrImages)) {
    images = handlersOrImages;
    handlers = handlersOrSourced;
    sourced = !!maybeSourced;
  } else {
    handlers = handlersOrImages;
    sourced = !!handlersOrSourced;
  }
  return streamSSE(
    `/api/curriculum/${curriculumId}/lesson/${lessonId}/chat`,
    { message, sourced, images: (images || []).map(i => ({ dataUrl: i.dataUrl, mimeType: i.mimeType })) },
    handlers,
  );
}

// Study mode chat
export function sendStudyMessage(message, sessionId, context, handlersOrImages, handlersOrSourced, maybeSourced) {
  let images = [], handlers, sourced = false;
  if (Array.isArray(handlersOrImages)) {
    images = handlersOrImages;
    handlers = handlersOrSourced;
    sourced = !!maybeSourced;
  } else {
    handlers = handlersOrImages;
    sourced = !!handlersOrSourced;
  }
  return streamSSE(
    '/api/study/chat',
    { message, sessionId, context, sourced, images: (images || []).map(i => ({ dataUrl: i.dataUrl, mimeType: i.mimeType })) },
    handlers,
  );
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
