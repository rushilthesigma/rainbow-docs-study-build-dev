import { apiFetch, getToken } from './client';

export const listSlideshows = () => apiFetch('/api/slideshows');
export const getSlideshow = (id) => apiFetch(`/api/slideshows/${id}`);
export const deleteSlideshow = (id) => apiFetch(`/api/slideshows/${id}`, { method: 'DELETE' });
export const createSlideshow = (body) => apiFetch('/api/slideshows', { method: 'POST', body: JSON.stringify(body) });
export const generateSlideImage = (body) => apiFetch('/api/images/generate', { method: 'POST', body: JSON.stringify(body) });
export const updateSlideshow = (id, body) => apiFetch(`/api/slideshows/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const redesignSlideshow = (id) => apiFetch(`/api/slideshows/${id}/redesign`, { method: 'POST' });

// SSE-based generation - streams progress events and a final done event.
// callbacks: { onProgress({ phase, pct }), onDone(slideshow), onError(msg) }
export async function generateSlideshow(body, { onProgress, onDone, onError } = {}) {
  const token = getToken();
  const res = await fetch('/api/slideshows/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = data.error || `Request failed: ${res.status}`;
    onError?.(msg);
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let gotDone = false;

  const processLine = (line) => {
    if (!line.startsWith('data: ')) return;
    let event;
    try {
      event = JSON.parse(line.slice(6));
    } catch {
      // Malformed or truncated payload - skip this line rather than aborting
      // the whole stream. The next chunk may carry a complete event.
      return;
    }
    if (event.type === 'progress') onProgress?.(event);
    else if (event.type === 'done') { gotDone = true; onDone?.(event.slideshow); }
    else if (event.type === 'error') { onError?.(event.error); throw new Error(event.error); }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) processLine(line);
  }
  // Flush a final unterminated line (server may close without trailing \n\n).
  if (buffer) processLine(buffer);

  if (!gotDone) {
    const msg = 'Generation ended before completing - please try again.';
    onError?.(msg);
    throw new Error(msg);
  }
}
