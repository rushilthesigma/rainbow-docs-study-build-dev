import { apiFetch } from './client';

// Profile
export const getMyProfile = () => apiFetch('/api/social/profile');
export const setProfile = (handle, displayName) => apiFetch('/api/social/profile', { method: 'POST', body: JSON.stringify({ handle, displayName }) });

// Search
export const searchUsers = (q) => apiFetch(`/api/social/search?q=${encodeURIComponent(q)}`);

// Friends
export const getFriends = () => apiFetch('/api/social/friends');
export const addFriend = (userId) => apiFetch('/api/social/friends/add', { method: 'POST', body: JSON.stringify({ userId }) });
export const removeFriend = (userId) => apiFetch('/api/social/friends/remove', { method: 'POST', body: JSON.stringify({ userId }) });

// DMs
export const listDMs = () => apiFetch('/api/social/dm');
export const getDM = (userId) => apiFetch(`/api/social/dm/${userId}`);
export const sendDM = (to, content) => apiFetch('/api/social/dm/send', { method: 'POST', body: JSON.stringify({ to, content }) });

// Groups
export const listGroups = () => apiFetch('/api/social/groups');
export const createGroup = (name, memberIds) => apiFetch('/api/social/groups', { method: 'POST', body: JSON.stringify({ name, memberIds }) });
export const getGroup = (id) => apiFetch(`/api/social/groups/${id}`);
export const sendGroupMessage = (id, content) => apiFetch(`/api/social/groups/${id}/send`, { method: 'POST', body: JSON.stringify({ content }) });
