import { apiFetch } from './client';

export const setupParentMode = (pin, students) => apiFetch('/api/parent/setup', { method: 'POST', body: JSON.stringify({ pin, students }) });
export const verifyPin = (pin) => apiFetch('/api/parent/verify-pin', { method: 'POST', body: JSON.stringify({ pin }) });
export const getParentStatus = () => apiFetch('/api/parent/status');
export const addStudent = (pin, name) => apiFetch('/api/parent/students', { method: 'POST', body: JSON.stringify({ pin, name }) });
export const getStudent = (sid) => apiFetch(`/api/parent/students/${sid}`);
export const assignCurriculum = (sid, curriculumId) => apiFetch(`/api/parent/students/${sid}/assign`, { method: 'POST', body: JSON.stringify({ curriculumId }) });
export const unassignCurriculum = (sid, curriculumId) => apiFetch(`/api/parent/students/${sid}/unassign`, { method: 'POST', body: JSON.stringify({ curriculumId }) });
export const addStudyTopic = (sid, topic) => apiFetch(`/api/parent/students/${sid}/topics`, { method: 'POST', body: JSON.stringify({ topic }) });
