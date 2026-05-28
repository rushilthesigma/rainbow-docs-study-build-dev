import { apiFetch, setToken } from './client';

export async function signup(name, email, password) {
  const data = await apiFetch('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
  if (data.token) setToken(data.token);
  return data;
}

export async function emailLogin(email, password) {
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data.token) setToken(data.token);
  return data;
}

export async function googleLogin(credential) {
  const data = await apiFetch('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
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
  // Clear profile pick so the picker shows again on next login.
  try { sessionStorage.removeItem('cov-profile-picked'); } catch {}
  // NOTE: deliberately NOT clearing 'cov-prefs' — we keep the user's
  // preference mirror across logout so demo accounts (which get
  // spun up fresh on every landing-page visit) don't lose their
  // model tier / difficulty / etc. picks. Use deleteAccount() if
  // you want a full wipe.
}

export async function deleteAccount() {
  await apiFetch('/api/auth/account', { method: 'DELETE' });
  setToken(null);
  // Account deletion clears prefs mirror too — any future demo
  // session starts genuinely fresh.
  try { localStorage.removeItem('cov-prefs'); } catch {}
  try { sessionStorage.removeItem('cov-profile-picked'); } catch {}
}

export async function syncData(data) {
  return apiFetch('/api/auth/sync', {
    method: 'POST',
    body: JSON.stringify({ data }),
  });
}
