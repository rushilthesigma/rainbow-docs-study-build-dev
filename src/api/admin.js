import { apiFetch } from './client';

export const checkAdmin     = () => apiFetch('/api/admin/check');
export const listUsers      = () => apiFetch('/api/admin/users');
export const getUser        = (uid) => apiFetch(`/api/admin/users/${uid}`);
export const toggleBan      = (uid) => apiFetch(`/api/admin/users/${uid}/ban`, { method: 'POST' });
export const deleteUser     = (uid) => apiFetch(`/api/admin/users/${uid}`, { method: 'DELETE' });

// Conversation transcripts
export const getStudySession     = (uid, sid) => apiFetch(`/api/admin/users/${uid}/chats/study/${sid}`);
export const getStandaloneLesson = (uid, lid) => apiFetch(`/api/admin/users/${uid}/chats/lesson/${lid}`);
export const getCurriculumLesson = (uid, cid, lid) => apiFetch(`/api/admin/users/${uid}/chats/curriculum/${cid}/${lid}`);
