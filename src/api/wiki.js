import { apiFetch } from './client';

export const getWikiPage    = (slug, { retry = false, poll = false } = {}) =>
  apiFetch(`/api/wiki/${encodeURIComponent(slug)}${retry ? '?retry=1' : poll ? '?poll=1' : ''}`);
export const searchWiki     = (q)    => apiFetch(`/api/wiki/search?q=${encodeURIComponent(q)}`);
export const listWikiPages  = ()     => apiFetch('/api/wiki/pages');
export const listWikiTitles = ()     => apiFetch('/api/wiki/titles');
export const reportWikiPage = (slug, reason) =>
  apiFetch(`/api/wiki/${encodeURIComponent(slug)}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

// Admin
export const updateWikiPage = (slug, patch) =>
  apiFetch(`/api/admin/wiki/pages/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
export const aiEditWikiPage = (slug, instruction) =>
  apiFetch(`/api/admin/wiki/pages/${encodeURIComponent(slug)}/ai-edit`, {
    method: 'POST',
    body: JSON.stringify({ instruction }),
  });
export const listWikiReports   = () => apiFetch('/api/admin/wiki/reports');
export const resolveWikiReport = (id, resolution, manualContent) =>
  apiFetch(`/api/admin/wiki/reports/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ resolution, manualContent }),
  });
export const deleteWikiPage    = (slug) =>
  apiFetch(`/api/admin/wiki/pages/${encodeURIComponent(slug)}`, { method: 'DELETE' });
