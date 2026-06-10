import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe, logout as apiLogout } from '../api/auth';
import { getToken, setToken } from '../api/client';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Only boot in a loading state when a token exists. With no token there
  // is nothing to fetch, and starting at loading=true paints a full-screen
  // skeleton for a frame before the landing page replaces it (visible
  // flash on every signed-out load).
  const [loading, setLoading] = useState(() => !!getToken());

  const fetchUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    // Transient failures (backend restarting, proxy 500s, network blips)
    // must NOT log the user out. apiFetch already clears the token and
    // hard-redirects on a real 401, so any error caught here is transient:
    // keep the token, keep whatever user state we have, and keep retrying.
    for (let attempt = 0; ; attempt++) {
      try {
        const data = await getMe();
        setUser(data);
        setLoading(false);
        return;
      } catch {
        if (!getToken()) {
          // apiFetch wiped the token: a genuine 401, give up.
          setUser(null);
          setLoading(false);
          return;
        }
        // After ~20s of loading skeleton, show the landing page rather than
        // spinning forever — but keep retrying in the background so the
        // session snaps back on its own once the backend is reachable again.
        if (attempt === 7) setLoading(false);
        await new Promise((r) => setTimeout(r, Math.min(1000 + attempt * 500, 5000)));
      }
    }
  }, []);

  // One-time bootstrap on mount
  useEffect(() => { fetchUser(); }, [fetchUser]);

  const login = useCallback((userData, token) => {
    setToken(token);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
