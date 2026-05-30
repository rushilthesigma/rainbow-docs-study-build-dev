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

// ── Legacy single-graph helpers (alias for the default note map). Kept
// so any older callsite continues to work without changes.
export async function getNoteGraph() {
  return apiFetch('/api/note-graph');
}

export async function saveNoteGraph(nodes, edges) {
  return apiFetch('/api/note-graph', { method: 'PUT', body: JSON.stringify({ nodes, edges }) });
}

export async function suggestGraphNodes({ focus, focusNodeId, count } = {}) {
  return apiFetch('/api/note-graph/suggest', {
    method: 'POST',
    body: JSON.stringify({ focus, focusNodeId, count }),
  });
}

// ── Multi-map API. Each map has its own nodes/edges. The first map is
// the "default" — it auto-mirrors every note. Other maps are user-curated.
export async function listNoteMaps() {
  return apiFetch('/api/note-maps');
}

export async function createNoteMap(name, color) {
  return apiFetch('/api/note-maps', { method: 'POST', body: JSON.stringify({ name, color }) });
}

export async function getNoteMap(mapId) {
  return apiFetch(`/api/note-maps/${mapId}`);
}

export async function updateNoteMap(mapId, updates) {
  return apiFetch(`/api/note-maps/${mapId}`, { method: 'PUT', body: JSON.stringify(updates) });
}

export async function deleteNoteMap(mapId) {
  return apiFetch(`/api/note-maps/${mapId}`, { method: 'DELETE' });
}

export async function suggestNoteMapNodes(mapId, { focus, focusNodeId, count } = {}) {
  return apiFetch(`/api/note-maps/${mapId}/suggest`, {
    method: 'POST',
    body: JSON.stringify({ focus, focusNodeId, count }),
  });
}
