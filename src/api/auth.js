import { apiFetch, setToken } from './client';

export async function googleLogin(credential) {
  const data = await apiFetch('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
  if (data.token) setToken(data.token);
  return data;
}

export async function devLogin(name, email) {
  const data = await apiFetch('/api/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify({ name, email }),
  });
  if (data.token) setToken(data.token);
  return data;
}

export async function getMe() {
  return apiFetch('/api/auth/me');
}

export async function logout() {
  try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch {}
  setToken(null);
}

export async function deleteAccount() {
  await apiFetch('/api/auth/account', { method: 'DELETE' });
  setToken(null);
}

export async function syncData(data) {
  return apiFetch('/api/auth/sync', {
    method: 'POST',
    body: JSON.stringify({ data }),
  });
}
