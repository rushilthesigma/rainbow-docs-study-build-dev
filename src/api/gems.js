import { apiFetch, getToken } from './client';

export const listGems    = () => apiFetch('/api/gems');
export const createGem   = (payload) => apiFetch('/api/gems', { method: 'POST', body: JSON.stringify(payload) });
export const updateGem   = (id, payload) => apiFetch(`/api/gems/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
export const deleteGem   = (id) => apiFetch(`/api/gems/${id}`, { method: 'DELETE' });
export const getGemHistory = (id) => apiFetch(`/api/gems/${id}/history`);
export const resetGemChat = (id) => apiFetch(`/api/gems/${id}/reset`, { method: 'POST' });

// Stream a reply from a gem. Mirrors the sendLessonMessage contract.
export function sendGemMessage(id, message, handlers, sourced = false) {
  const token = getToken();
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(`/api/gems/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message, sourced }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        handlers.onError?.(data.error || `Stream failed (${res.status})`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) handlers.onChunk?.(data.content);
            if (data.source) handlers.onSource?.(data.source);
            if (data.status) handlers.onStatus?.(data.status);
            if (data.error) { handlers.onError?.(data.error); return; }
            if (data.done) handlers.onDone?.(data.sources);
          } catch {}
        }
      }
      handlers.onDone?.();
    } catch (e) {
      if (e.name !== 'AbortError') handlers.onError?.(e.message);
    }
  })();
  return () => controller.abort();
}
