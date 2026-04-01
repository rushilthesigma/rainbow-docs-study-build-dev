import { apiFetch } from './client';

export async function generateAssessment(topic, type, questionCount, difficulty) {
  return apiFetch('/api/assessment/generate', {
    method: 'POST',
    body: JSON.stringify({ topic, type, questionCount, difficulty }),
  });
}

export async function gradeAssessment(assessment, answers) {
  return apiFetch('/api/assessment/grade', {
    method: 'POST',
    body: JSON.stringify({ assessment, answers }),
  });
}

export async function getAssessmentHistory() {
  return apiFetch('/api/assessment/history');
}
