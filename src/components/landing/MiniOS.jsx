import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookOpen, Lightbulb, MessageSquare, Calculator,
  Settings as SettingsIcon, Loader2, Search, Sun,
} from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { WindowManagerProvider } from '../../context/WindowManagerContext';
import { DemoModeProvider } from '../../context/DemoModeContext';
import { setToken } from '../../api/client';
import { devLogin } from '../../api/auth';
import AppWindow from '../desktop/AppWindow';

// =========================================================
// LIVE mini OS for the landing page.
//
// Rather than re-implementing each app, this mounts the REAL
// AppWindow component (the same dispatcher the desktop shell uses).
// We wrap it in:
//   - a DemoAuthProvider that auto-creates a throwaway demo account
//     via /api/auth/dev-login on first mount, so every apiFetch call
//     works with a valid token,
//   - a WindowManagerProvider so apps that call useWindowManager() don't
//     explode (e.g. CurriculaApp dispatches events for Math Tutor hand-off),
//   - a compact app switcher/dock at the bottom that swaps which app
//     AppWindow renders.
//
// Sign-in on the landing page uses the REAL Google auth flow; the demo
// token is overwritten when the user signs in for real.
// =========================================================

// Dock apps — Flashcards deliberately omitted per product direction.
const DOCK = [
  { id: 'curricula', label: 'Curricula',  icon: BookOpen,       color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/30' },
  { id: 'lessons',   label: 'Lessons',    icon: Lightbulb,      color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/30' },
  { id: 'study',     label: 'Study',      icon: MessageSquare,  color: 'text-sky-500 bg-sky-50 dark:bg-sky-900/30' },
  { id: 'mathtutor', label: 'Math Tutor', icon: Calculator,     color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' },
  { id: 'settings',  label: 'Settings',   icon: SettingsIcon,   color: 'text-gray-500 bg-gray-100 dark:bg-gray-800' },
];

// ============================================================
// Demo auth provider. Silently dev-logs in as a throwaway user on
// mount, puts the token in localStorage (so apiFetch picks it up),
// and exposes the resulting user through AuthContext so any real-app
// component inside can call useAuth() without blowing up.
//
// On unmount: we DO NOT clear the token. If we did, and the user
// clicked "Sign in" but the Google flow was slow, requests would 401.
// Instead AuthContext's normal login() call (fired by googleLogin)
// overrides the demo token when the real auth completes.
// ============================================================
function DemoAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        // Each tab gets its own demo user so activity doesn't collide.
        let email = sessionStorage.getItem('covalent-demo-email');
        if (!email) {
          email = `demo-landing-${Math.random().toString(36).slice(2, 10)}@covalent.test`;
          sessionStorage.setItem('covalent-demo-email', email);
        }
        const data = await devLogin('Demo User', email);
        if (cancelled) return;
        if (data?.user && data?.token) {
          // devLogin already called setToken; be explicit for safety.
          setToken(data.token);
          setUser(data.user);
        }
      } catch (e) {
        console.warn('Demo session bootstrap failed:', e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    bootstrap();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback((userData, token) => {
    setToken(token);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => { setUser(null); }, []);
  const fetchUser = useCallback(async () => {}, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================
// Top-level mini OS layout — menu bar, viewport (real AppWindow),
// dock below.
// ============================================================
export default function MiniOS() {
  const [activeApp, setActiveApp] = useState('curricula');
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const timeStr = clock.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-300 dark:border-[#2A2A40] bg-white dark:bg-[#0f0f18] select-none">
      {/* ========== Menu bar ========== */}
      <div className="flex items-center justify-between px-3 h-7 bg-gray-50/90 dark:bg-[#0b0b12]/90 border-b border-gray-200 dark:border-[#2A2A40] text-[11px] text-gray-600 dark:text-gray-300">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-400/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
          </div>
          <span className="font-semibold tracking-tight text-gray-700 dark:text-gray-200">RushilAI</span>
          <span className="opacity-40">|</span>
          <span className="font-medium">{DOCK.find(a => a.id === activeApp)?.label || 'Curricula'}</span>
        </div>
        <div className="flex items-center gap-3">
          <Search size={11} className="opacity-60" />
          <Sun size={11} className="opacity-60" />
          <span className="tabular-nums opacity-70">{timeStr}</span>
        </div>
      </div>

      {/* ========== App viewport — the REAL AppWindow runs here ========== */}
      <DemoAuthProvider>
      <DemoModeProvider>
        <WindowManagerProvider>
          <div
            className="relative bg-gradient-to-br from-slate-200 via-blue-100 to-indigo-200 dark:from-[#0a0a12] dark:via-[#10101c] dark:to-[#161622]"
            style={{ height: 560 }}
          >
            <div className="absolute inset-4 rounded-xl bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] shadow-lg overflow-hidden flex flex-col">
              <MiniWindowChrome title={DOCK.find(a => a.id === activeApp)?.label || 'App'} />
              <div className="flex-1 min-h-0 overflow-hidden">
                <DemoBootGate>
                  <AppWindow appId={activeApp} />
                </DemoBootGate>
              </div>
            </div>
          </div>
        </WindowManagerProvider>
      </DemoModeProvider>
      </DemoAuthProvider>

      {/* ========== Dock — spans full width below the app ========== */}
      <div className="border-t border-gray-200 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0b0b12] px-4 py-4">
        <div className="flex items-center justify-center gap-3 md:gap-4">
          {DOCK.map(app => {
            const Icon = app.icon;
            const isActive = app.id === activeApp;
            return (
              <button
                key={app.id}
                onClick={() => setActiveApp(app.id)}
                title={app.label}
                className={`relative flex flex-col items-center gap-1.5 group transition-transform ${
                  isActive ? '' : 'hover:-translate-y-0.5'
                }`}
              >
                <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center shadow-sm border border-gray-200 dark:border-[#2A2A40] ${app.color} ${
                  isActive ? 'ring-2 ring-blue-500/70 shadow-md' : 'group-hover:shadow-md'
                }`}>
                  <Icon size={26} />
                </div>
                <span className={`text-[11px] font-medium tracking-tight ${
                  isActive
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200'
                }`}>
                  {app.label}
                </span>
                {isActive && <span className="absolute -bottom-1 w-1 h-1 rounded-full bg-gray-800 dark:bg-white" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Waits for the demo auth bootstrap to finish before rendering the
// real app — otherwise apiFetch fires with a null token on first paint
// and half the apps briefly flash an error.
// ============================================================
function DemoBootGate({ children }) {
  const ctx = { ...(window.__tmpNoop ? {} : {}) };  // satisfy linter
  return (
    <AuthContextConsumer>
      {({ user, loading }) => {
        if (loading || !user) {
          return (
            <div className="h-full flex items-center justify-center gap-2 text-[12px] text-gray-400">
              <Loader2 size={14} className="animate-spin" /> Spinning up a demo session…
            </div>
          );
        }
        return children;
      }}
    </AuthContextConsumer>
  );
}

// Thin wrapper because useAuth throws if there's no provider — we want
// a render-prop style consumer that gracefully handles the brief window
// where the DemoAuthProvider hasn't finished mounting.
function AuthContextConsumer({ children }) {
  return <AuthContext.Consumer>{v => children(v || { user: null, loading: true })}</AuthContext.Consumer>;
}

function MiniWindowChrome({ title }) {
  return (
    <div className="h-8 flex items-center gap-2 px-3 bg-gray-50 dark:bg-[#0f0f18] border-b border-gray-200 dark:border-[#2A2A40]">
      <div className="flex items-center gap-1">
        <div className="w-2.5 h-2.5 rounded-full bg-rose-300/60 dark:bg-rose-400/40" />
        <div className="w-2.5 h-2.5 rounded-full bg-amber-300/60 dark:bg-amber-400/40" />
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-300/60 dark:bg-emerald-400/40" />
      </div>
      <span className="mx-auto text-[11px] font-medium text-gray-600 dark:text-gray-400">{title}</span>
      <span className="w-10" />
    </div>
  );
}
