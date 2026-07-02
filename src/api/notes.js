import { apiFetch } from './client';

export async function listNotes() {
  return apiFetch('/api/notes');
}

export async function createNote(title, type = 'regular', topicId = null) {
  return apiFetch('/api/notes', { method: 'POST', body: JSON.stringify({ title, type, topicId }) });
}

// Built-in preset notes (country geography). List the catalog, or add one
// preset as a new regular note in the user's notes.
export async function listNotePresets() {
  return apiFetch('/api/notes/presets');
}

export async function addNotePreset(slug) {
  return apiFetch(`/api/notes/presets/${slug}`, { method: 'POST' });
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
// the "default" - it auto-mirrors every note. Other maps are user-curated.
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

// ── Note-map spaced repetition (SM-2 flashcards) ──────────────────────
// The review queue + recommendations (due cards, new nodes to quiz,
// struggling cards) for a map.
export async function getMapSrs(mapId) {
  return apiFetch(`/api/note-maps/${mapId}/srs`);
}

// AI-generate flashcards for a single node (folds in variants of missed quiz
// questions that match the node's topic).
export async function generateNodeFlashcards(mapId, nodeId, { count, difficulty } = {}) {
  return apiFetch(`/api/note-maps/${mapId}/nodes/${nodeId}/flashcards`, {
    method: 'POST',
    body: JSON.stringify({ count, difficulty }),
  });
}

// Add hand-written cards to a node.
export async function addNodeFlashcards(mapId, nodeId, cards) {
  return apiFetch(`/api/note-maps/${mapId}/nodes/${nodeId}/flashcards`, {
    method: 'POST',
    body: JSON.stringify({ cards }),
  });
}

// Grade a card during review. quality 0-5 (Again=1, Hard=3, Good=4, Easy=5).
export async function reviewMapCard(mapId, cardId, quality) {
  return apiFetch(`/api/note-maps/${mapId}/review`, {
    method: 'POST',
    body: JSON.stringify({ cardId, quality }),
  });
}

export async function deleteMapCard(mapId, cardId) {
  return apiFetch(`/api/note-maps/${mapId}/cards/${cardId}`, { method: 'DELETE' });
}

// ── Per-note flashcards (SM-2) ────────────────────────────────────────
export async function getNoteFlashcards(noteId) {
  return apiFetch(`/api/notes/${noteId}/flashcards`);
}

export async function generateNoteFlashcards(noteId, { count, difficulty } = {}) {
  return apiFetch(`/api/notes/${noteId}/flashcards`, {
    method: 'POST',
    body: JSON.stringify({ count, difficulty }),
  });
}

export async function reviewNoteCard(noteId, cardId, quality) {
  return apiFetch(`/api/notes/${noteId}/flashcards/review`, {
    method: 'POST',
    body: JSON.stringify({ cardId, quality }),
  });
}

export async function deleteNoteCard(noteId, cardId) {
  return apiFetch(`/api/notes/${noteId}/flashcards/${cardId}`, { method: 'DELETE' });
}

// ── Topics (folders for notes; one topic per note) ────────────────────
export async function listTopics() {
  return apiFetch('/api/topics');
}

export async function createTopic(name, color) {
  return apiFetch('/api/topics', { method: 'POST', body: JSON.stringify({ name, color }) });
}

export async function updateTopic(id, updates) {
  return apiFetch(`/api/topics/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
}

export async function deleteTopic(id) {
  return apiFetch(`/api/topics/${id}`, { method: 'DELETE' });
}

// Assign (or clear, with null) a note's single topic.
export async function setNoteTopic(noteId, topicId) {
  return apiFetch(`/api/notes/${noteId}`, { method: 'PUT', body: JSON.stringify({ topicId }) });
}

// The single best note to review next (for the dashboard widget).
export async function getRecommendedReview() {
  return apiFetch('/api/review/recommended');
}
