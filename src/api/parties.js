import { apiFetch } from './client';

// ---- Party CRUD ----
export const createParty    = (name)       => apiFetch('/api/parties', { method: 'POST', body: JSON.stringify({ name }) });
export const getMyParty     = ()           => apiFetch('/api/parties/mine');
export const invitePlayer   = (partyId, userId) => apiFetch(`/api/parties/${partyId}/invite`, { method: 'POST', body: JSON.stringify({ userId }) });
export const acceptInvite   = (inviteId)   => apiFetch(`/api/parties/invites/${inviteId}/accept`, { method: 'POST' });
export const declineInvite  = (inviteId)   => apiFetch(`/api/parties/invites/${inviteId}/decline`, { method: 'POST' });
export const leaveParty     = (partyId)    => apiFetch(`/api/parties/${partyId}/leave`, { method: 'POST' });
export const kickMember     = (partyId, userId) => apiFetch(`/api/parties/${partyId}/kick`, { method: 'POST', body: JSON.stringify({ userId }) });

// ---- Game ----
export const startGame   = (partyId, settings) => apiFetch(`/api/parties/${partyId}/game`, { method: 'POST', body: JSON.stringify(settings) });
export const getGameState = (partyId) => apiFetch(`/api/parties/${partyId}/state`);
export const buzz        = (partyId) => apiFetch(`/api/parties/${partyId}/game/buzz`, { method: 'POST' });
export const submitAnswer = (partyId, answer) => apiFetch(`/api/parties/${partyId}/game/answer`, { method: 'POST', body: JSON.stringify({ answer }) });
export const advanceQuestion = (partyId) => apiFetch(`/api/parties/${partyId}/game/advance`, { method: 'POST' });
export const endGame     = (partyId) => apiFetch(`/api/parties/${partyId}/game/end`, { method: 'POST' });
