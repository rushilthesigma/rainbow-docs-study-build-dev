// Client helpers for the unauthenticated public-demo endpoints used by
// the landing-page mini OS. These do NOT go through apiFetch (no auth
// header, no token-expired redirect). All responses are generated live
// by Gemini Flash on the server, IP-rate-limited to 5/hour.

export async function demoGenerateCurriculum(topic, difficulty = 'intermediate') {
  const res = await fetch('/api/demo/curriculum/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, difficulty }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
  return data.curriculum;
}

// Stream a short AI tutor opening for a demo lesson. Returns a cancel
// function. `handlers` mirrors the real streamAIResponse contract:
//   onChunk(text), onDone(), onError(msg)
export function demoStreamLesson({ topic, context }, handlers) {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch('/api/demo/lesson/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, context }),
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
            if (data.error) { handlers.onError?.(data.error); return; }
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
