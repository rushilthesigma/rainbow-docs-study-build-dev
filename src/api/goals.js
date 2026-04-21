import { apiFetch } from './client';

export async function listGoals() {
  return apiFetch('/api/goals');
}

export async function createGoal(title, description, opts = {}) {
  return apiFetch('/api/goals', {
    method: 'POST',
    body: JSON.stringify({
      title,
      description,
      linkedCurriculumIds: Array.isArray(opts.linkedCurriculumIds) ? opts.linkedCurriculumIds : [],
      linkedLessonIds: Array.isArray(opts.linkedLessonIds) ? opts.linkedLessonIds : [],
    }),
  });
}

export async function updateGoal(id, updates) {
  return apiFetch(`/api/goals/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ updates }),
  });
}

export async function deleteGoal(id) {
  return apiFetch(`/api/goals/${id}`, { method: 'DELETE' });
}

export async function toggleMilestone(goalId, milestoneId) {
  return apiFetch(`/api/goals/${goalId}/milestones/${milestoneId}/complete`, { method: 'POST' });
}
