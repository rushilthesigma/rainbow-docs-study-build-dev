import { apiFetch } from './client';

export const listSlideshows = () => apiFetch('/api/slideshows');
export const getSlideshow = (id) => apiFetch(`/api/slideshows/${id}`);
export const deleteSlideshow = (id) => apiFetch(`/api/slideshows/${id}`, { method: 'DELETE' });
export const generateSlideshow = (body) => apiFetch('/api/slideshows/generate', { method: 'POST', body: JSON.stringify(body) });
export const createSlideshow = (body) => apiFetch('/api/slideshows', { method: 'POST', body: JSON.stringify(body) });
export const generateSlideImage = (body) => apiFetch('/api/images/generate', { method: 'POST', body: JSON.stringify(body) });
export const updateSlideshow = (id, body) => apiFetch(`/api/slideshows/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const redesignSlideshow = (id) => apiFetch(`/api/slideshows/${id}/redesign`, { method: 'POST' });
