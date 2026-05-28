import { getToken } from './client';

// Streams a sandbox advisor turn. Stateless server-side — client owns history.
// body = { messages, sceneContext }
// handlers = { onChunk, onDone, onError }
export function sendSandboxAdvisorMessage(body, { onChunk, onDone, onError }) {
  const token = getToken();
  const controller = new AbortController();

  fetch('/api/sandbox/advisor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        onError?.(err.error || `Error ${response.status}`);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
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
            if (data.done) { if (!finished) { finished = true; onDone?.(); } return; }
            else if (data.error) { if (!finished) { finished = true; onError?.(data.error); } return; }
            else if (data.content) onChunk?.(data.content);
          } catch {}
        }
      }
      if (!finished) onDone?.();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError?.(err.message);
    });

  return () => controller.abort();
}
