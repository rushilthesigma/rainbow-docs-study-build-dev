import { apiFetch } from './client';

export async function getLessonAssessment(curriculumId, lessonId, refresh = false) {
  const qs = refresh ? '?refresh=1' : '';
  return apiFetch(`/api/curriculum/${curriculumId}/lesson/${lessonId}/assessment${qs}`);
}

export async function generateAssessment(topic, type, questionCount, difficulty) {
  return apiFetch('/api/assessment/generate', {
    method: 'POST',
    body: JSON.stringify({ topic, type, questionCount, difficulty }),
  });
}

export async function gradeAssessment(assessment, answers) {
  const resp = await apiFetch('/api/assessment/grade', {
    method: 'POST',
    body: JSON.stringify({ assessment, answers }),
  });
  return resp.result || resp;
}

export async function getAssessmentHistory() {
  return apiFetch('/api/assessment/history');
}
