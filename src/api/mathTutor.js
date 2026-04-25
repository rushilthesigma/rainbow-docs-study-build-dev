import { getToken } from './client';

// Streams a math-tutor turn. Stateless server-side — client owns the history.
// body = { topic, customInstructions, messages, phase, images? }
// phase: 'lesson' | 'practice' | 'grade'
// handlers = { onChunk, onDone, onError, onStatus }
export function sendMathTutorMessage(body, { onChunk, onDone, onError, onStatus }) {
  const token = getToken();
  const controller = new AbortController();

  fetch('/api/math-tutor/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        onError?.({ ...err, status: response.status, _code: err.error });
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
            if (data.done) { if (!finished) { finished = true; onDone?.(data); } return; }
            else if (data.error) { if (!finished) { finished = true; onError?.(data.error); } return; }
            else if (data.content) onChunk?.(data.content);
            else if (data.status) onStatus?.(data.status);
          } catch {}
        }
      }
      // Stream closed without `done`/`error` — connection dropped. Surface
      // a soft error so the streaming bubble closes.
      if (!finished) onError?.('Connection ended unexpectedly. Try again.');
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError?.(err.message);
    });

  return () => controller.abort();
}
