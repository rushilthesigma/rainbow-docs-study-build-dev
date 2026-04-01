import { apiFetch } from './client';

export async function listDecks() {
  return apiFetch('/api/flashcards');
}

export async function createDeck(title, topic, count, difficulty) {
  return apiFetch('/api/flashcards', {
    method: 'POST',
    body: JSON.stringify({ title, topic, count, difficulty }),
  });
}

export async function getDeck(deckId) {
  return apiFetch(`/api/flashcards/${deckId}`);
}

export async function updateDeck(deckId, title) {
  return apiFetch(`/api/flashcards/${deckId}`, {
    method: 'PUT',
    body: JSON.stringify({ title }),
  });
}

export async function deleteDeck(deckId) {
  return apiFetch(`/api/flashcards/${deckId}`, { method: 'DELETE' });
}

export async function addCards(deckId, { cards, topic, count, difficulty }) {
  return apiFetch(`/api/flashcards/${deckId}/cards`, {
    method: 'POST',
    body: JSON.stringify({ cards, topic, count, difficulty }),
  });
}

export async function updateCard(deckId, cardId, front, back) {
  return apiFetch(`/api/flashcards/${deckId}/cards/${cardId}`, {
    method: 'PUT',
    body: JSON.stringify({ front, back }),
  });
}

export async function deleteCard(deckId, cardId) {
  return apiFetch(`/api/flashcards/${deckId}/cards/${cardId}`, { method: 'DELETE' });
}

export async function submitReview(deckId, cardId, correct) {
  return apiFetch(`/api/flashcards/${deckId}/review`, {
    method: 'POST',
    body: JSON.stringify({ cardId, correct }),
  });
}
