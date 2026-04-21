import { apiFetch } from './client';

export async function listNotes() {
  return apiFetch('/api/notes');
}

export async function createNote(title, type = 'regular') {
  return apiFetch('/api/notes', { method: 'POST', body: JSON.stringify({ title, type }) });
}

export async function getNote(id) {
  return apiFetch(`/api/notes/${id}`);
}

export async function updateNote(id, updates) {
  return apiFetch(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
}

export async function deleteNote(id) {
  return apiFetch(`/api/notes/${id}`, { method: 'DELETE' });
}

export async function generateCues(id) {
  return apiFetch(`/api/notes/${id}/generate-cues`, { method: 'POST' });
}

export async function generateSummary(id) {
  return apiFetch(`/api/notes/${id}/generate-summary`, { method: 'POST' });
}
