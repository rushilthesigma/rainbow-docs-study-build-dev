import { apiFetch } from './client';

// ShareApiClient — wraps the /api/share/* REST surface (File & Note Sharing).
// All functions return the parsed JSON body; HTTP errors throw via apiFetch
// so calling components can display failure states.

export async function createShare(itemId, itemType, recipientId, permissionLevel = 'view') {
  return apiFetch('/api/share', {
    method: 'POST',
    body: JSON.stringify({ itemId, itemType, recipientId, permissionLevel }),
  });
}

export async function acceptShare(shareId) {
  return apiFetch(`/api/share/${shareId}/accept`, { method: 'POST' });
}

export async function declineShare(shareId) {
  return apiFetch(`/api/share/${shareId}/decline`, { method: 'POST' });
}

export async function revokeShare(shareId) {
  return apiFetch(`/api/share/${shareId}`, { method: 'DELETE' });
}

export async function updatePermission(shareId, permissionLevel) {
  return apiFetch(`/api/share/${shareId}`, {
    method: 'PATCH',
    body: JSON.stringify({ permissionLevel }),
  });
}

// Pending + accepted invitations for the current user, enriched with
// ownerName / ownerHandle / itemTitle / itemExists / itemUpdatedAt.
export async function listIncoming() {
  const data = await apiFetch('/api/share/incoming');
  return data.shares;
}

// Recipients + permission levels for an item the current user owns.
export async function listOutgoing(itemId) {
  const data = await apiFetch(`/api/share/outgoing/${itemId}`);
  return data.shares;
}

// ===== Shared-item access (recipient side) =====
// The server validates the shareId + permission on every request and resolves
// reads/writes to the OWNER's item (File & Note Sharing ADR-001). A revoked or
// downgraded share surfaces as a thrown 403 error.

const ITEM_ROUTES = {
  note: id => `/api/notes/${id}`,
  flashcardDeck: id => `/api/flashcards/${id}`,
  curriculum: id => `/api/curriculum/${id}`,
};
const ITEM_KEYS = { note: 'note', flashcardDeck: 'deck', curriculum: 'curriculum' };

// Returns the item object (unwrapped from its type-specific response key).
export async function getSharedItem(itemType, itemId, shareId) {
  const route = ITEM_ROUTES[itemType];
  if (!route) throw new Error(`Unknown shared item type: ${itemType}`);
  const data = await apiFetch(`${route(itemId)}?shareId=${encodeURIComponent(shareId)}`);
  return data[ITEM_KEYS[itemType]];
}

// Saves to the owner's item through the shared-edit path; requires Edit
// permission. Note: curriculum updates must be wrapped as { updates } by the
// server contract — handled here so callers pass plain fields for all types.
export async function updateSharedItem(itemType, itemId, shareId, updates) {
  const route = ITEM_ROUTES[itemType];
  if (!route) throw new Error(`Unknown shared item type: ${itemType}`);
  const body = itemType === 'curriculum' ? { updates } : updates;
  const data = await apiFetch(`${route(itemId)}?shareId=${encodeURIComponent(shareId)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return data[ITEM_KEYS[itemType]];
}
