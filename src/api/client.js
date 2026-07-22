const TOKEN_KEY = 'covalent-token';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

export function apiUrl(path) {
  if (!path || typeof path !== 'string') return path;
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('//')) return path;
  if (!path.startsWith('/api') || !API_BASE_URL) return path;
  return `${API_BASE_URL}${path}`;
}

// A few streaming/upload call sites use fetch directly because they need the
// raw Response body. Route those relative /api calls through the same native
// backend origin without rewriting external images, fonts, or ordinary links.
export function installApiFetchBridge() {
  if (!API_BASE_URL || globalThis.__rushilApiFetchInstalled) return;
  const baseFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    if (typeof input === 'string') return baseFetch(apiUrl(input), init);
    if (input instanceof URL) return baseFetch(new URL(apiUrl(input.toString())), init);
    if (input instanceof Request) {
      const current = new URL(input.url);
      if (current.origin === window.location.origin && current.pathname.startsWith('/api')) {
        return baseFetch(new Request(apiUrl(`${current.pathname}${current.search}`), input), init);
      }
    }
    return baseFetch(input, init);
  };
  globalThis.__rushilApiFetchInstalled = true;
}

export function publicWebUrl() {
  const configured = (import.meta.env.VITE_PUBLIC_WEB_URL || API_BASE_URL).trim();
  return configured ? configured.replace(/\/$/, '') : '';
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(apiUrl(path), { ...options, headers });

  if (res.status === 401) {
    setToken(null);
    window.location.href = '/';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // 402 = plan limit. Preserve the server-provided `message` / `error` code.
    if (res.status === 402) {
      const err = new Error(data.message || 'Plan limit reached');
      err.code = data.error || 'plan_limit';
      err.planLimit = true;
      throw err;
    }
    const err = new Error(data.error || `Request failed: ${res.status}`);
    err.status = res.status;
    // Conflict responses (409) carry the current server document so the
    // caller can merge and retry instead of guessing.
    err.data = data;
    throw err;
  }

  return res.json();
}
