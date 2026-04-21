import { apiFetch } from './client';

export async function listGoals() {
  return apiFetch('/api/goals');
}

export async function createGoal(title, description) {
  return apiFetch('/api/goals', {
    method: 'POST',
    body: JSON.stringify({ title, description }),
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
