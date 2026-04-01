import { apiFetch, getToken } from './client';

export async function uploadTextbook(file) {
  const formData = new FormData();
  formData.append('file', file);
  const token = getToken();
  const res = await fetch('/api/textbooks/upload', {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export const listTextbooks = () => apiFetch('/api/textbooks');
export const getTextbook = (id) => apiFetch(`/api/textbooks/${id}`);
export const generateTextbookCurriculum = (id) => apiFetch(`/api/textbooks/${id}/generate-curriculum`, { method: 'POST' });
export const chatWithTextbook = (id, message) => apiFetch(`/api/textbooks/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) });
export const deleteTextbook = (id) => apiFetch(`/api/textbooks/${id}`, { method: 'DELETE' });
