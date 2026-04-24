import { apiFetch } from './client';

// Fetch 3 AI-generated study-topic suggestions personalized to the student's
// curricula/lessons/weak spots. Server caches for 30 min; pass
// { refresh: true } to bypass and regenerate.
export async function getTopicSuggestions({ refresh = false } = {}) {
  const qs = refresh ? '?refresh=1' : '';
  return apiFetch(`/api/suggestions/topics${qs}`);
}
