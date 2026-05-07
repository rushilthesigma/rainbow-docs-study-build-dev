import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { UIPreferenceProvider, useUIPreference } from './context/UIPreferenceContext';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import NewCurriculumPage from './pages/NewCurriculumPage';
import CurriculumPage from './pages/CurriculumPage';
import LessonPage from './pages/LessonPage';
import GoalsPage from './pages/GoalsPage';
import FlashcardsPage from './pages/FlashcardsPage';
import FlashcardDeckPage from './pages/FlashcardDeckPage';
import NotesPage from './pages/NotesPage';
import NoteEditorPage from './pages/NoteEditorPage';
import StudyPage from './pages/StudyPage';
// MathPracticePage was folded into MathTutorApp (canvas + tutor unified).
import CurriculumAssessmentPage from './pages/CurriculumAssessmentPage';
import PracticeLessonPage from './pages/PracticeLessonPage';
import SocialPage from './pages/SocialPage';
import SettingsPage from './pages/SettingsPage';
import AppShell from './components/layout/AppShell';
import DesktopShell from './components/desktop/DesktopShell';
import MobileShell from './components/mobile/MobileShell';
import Onboarding from './components/desktop/Onboarding';
import LoadingSpinner from './components/shared/LoadingSpinner';

// Phone / narrow-viewport breakpoint. Below this width we render the
// real MobileShell (the same one the admin Mobile Preview app shows
// inside its phone cutout — it IS the mobile site). Tablet and up
// gets the macOS-style DesktopShell.
const MOBILE_BREAKPOINT = 768;
function getIsMobile() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

// Demo / throwaway accounts (landing-page mini-OS spawns them with emails
// like demo-landing-XXX@covalent.test). They MUST not appear in the real
// dashboard — if a demo session leaks into the protected app shell
// (token contamination, restored from a stale localStorage, etc.), force
// a logout + bounce to the landing page so the user signs in fresh.
function isDemoEmail(email) {
  const e = String(email || '').toLowerCase();
  return e.startsWith('demo-landing-') || e.endsWith('@covalent.test') || e === 'dev@covalent.test';
}

function ProtectedRoute({ children }) {
  const { user, loading, logout } = useAuth();
  const [bounced, setBounced] = useState(false);
  // Trust the server flag first (it knows the canonical demo-email rules);
  // fall back to client-side regex if the server response is older.
  const isDemoSession = !!user && (user.isDemo === true || isDemoEmail(user.email));

  useEffect(() => {
    if (loading || !user || bounced) return;
    if (isDemoSession) {
      setBounced(true);
      // Fire-and-forget logout — clears the demo token + sets user=null,
      // which flips the route guard below and redirects to "/".
      logout().catch(() => {});
    }
  }, [loading, user, isDemoSession, bounced, logout]);

  if (loading) return <LoadingSpinner fullScreen />;
  if (!user) return <Navigate to="/" replace />;
  if (isDemoSession) {
    // Show the spinner while the logout effect resolves — never render
    // the protected children with a demo identity.
    return <LoadingSpinner fullScreen />;
  }
  return children;
}

function AppRoute({ children }) {
  return <ProtectedRoute><AppShell>{children}</AppShell></ProtectedRoute>;
}

function ClassicRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<AppRoute><DashboardPage /></AppRoute>} />
      <Route path="/new" element={<AppRoute><NewCurriculumPage /></AppRoute>} />
      <Route path="/curriculum/:id" element={<AppRoute><CurriculumPage /></AppRoute>} />
      <Route path="/curriculum/:id/lesson/:lessonId" element={<AppRoute><LessonPage /></AppRoute>} />
      <Route path="/curriculum/:id/assessment/:lessonId" element={<AppRoute><CurriculumAssessmentPage /></AppRoute>} />
      <Route path="/curriculum/:id/practice/:lessonId" element={<AppRoute><PracticeLessonPage /></AppRoute>} />
      <Route path="/study" element={<AppRoute><StudyPage /></AppRoute>} />
      <Route path="/goals" element={<AppRoute><GoalsPage /></AppRoute>} />
      <Route path="/flashcards" element={<AppRoute><FlashcardsPage /></AppRoute>} />
      <Route path="/flashcards/:id" element={<AppRoute><FlashcardDeckPage /></AppRoute>} />
      <Route path="/notes" element={<AppRoute><NotesPage /></AppRoute>} />
      <Route path="/notes/:id" element={<AppRoute><NoteEditorPage /></AppRoute>} />
      <Route path="/social" element={<AppRoute><SocialPage /></AppRoute>} />
      <Route path="/settings" element={<AppRoute><SettingsPage /></AppRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function AppRouter() {
  const { user, loading } = useAuth();
  // Onboarded flag lives in user.data.preferences (server-side), not
  // localStorage. Falls back to false for fresh accounts.
  const onboarded = !!user?.data?.preferences?.onboarded;
  // Re-evaluate on resize so a desktop user dragging the window narrow
  // (or a phone rotating between portrait / landscape) flips shells live.
  const [isMobile, setIsMobile] = useState(getIsMobile);
  useEffect(() => {
    function onResize() { setIsMobile(getIsMobile()); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // When the user returns from Stripe Checkout the URL gets ?upgraded=1.
  // Ping /api/billing/sync so Pro activates immediately even if the
  // webhook isn't configured (which is the default in dev).
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('upgraded')) {
      import('./api/billing').then(({ syncBilling }) => {
        syncBilling().catch(() => {}).finally(() => {
          // Strip the query param so a refresh doesn't re-trigger
          const url = new URL(window.location.href);
          url.searchParams.delete('upgraded');
          window.history.replaceState({}, '', url.toString());
        });
      });
    }
  }, [user]);

  if (loading) return <LoadingSpinner fullScreen />;

  // Signed-out: same macOS-style login screen on every viewport. The
  // page is responsive — wallpaper + form scale to phone width without
  // breaking the layout, so we don't need a separate mobile variant.
  if (!user) {
    return <Routes><Route path="*" element={<LandingPage />} /></Routes>;
  }

  if (!onboarded) {
    // Desktop onboarding is built for wide layouts and looks broken
    // on a phone. On mobile, auto-mark onboarded server-side so the
    // user lands directly in MobileShell.
    if (isMobile) {
      // Fire-and-forget — by the time fetchUser refreshes, the gate
      // re-evaluates with onboarded=true and we render MobileShell.
      autoCompleteOnboarding(user);
      return <LoadingSpinner fullScreen />;
    }
    return <Onboarding onComplete={() => { /* fetchUser inside Onboarding refreshes the gate */ }} />;
  }
  return isMobile ? <MobileShell /> : <DesktopShell />;
}

// Mobile auto-onboard helper. Imported lazily so the syncData module
// doesn't get pulled into the main bundle just for the rare case of
// a fresh signed-in mobile user hitting the gate.
let _autoCompleteOnboardingPromise = null;
function autoCompleteOnboarding(user) {
  if (_autoCompleteOnboardingPromise) return;
  _autoCompleteOnboardingPromise = (async () => {
    try {
      const { syncData } = await import('./api/auth');
      await syncData({
        preferences: { ...(user?.data?.preferences || {}), onboarded: true },
      });
      // Reload so AuthContext refetches the user with the new flag
      // and the gate flips through to MobileShell. Easier than wiring
      // fetchUser through the helper.
      window.location.reload();
    } catch (err) {
      console.error('Auto-onboard failed:', err);
      _autoCompleteOnboardingPromise = null; // allow retry
    }
  })();
}

export default function App() {
  return (
    <UIPreferenceProvider>
      <AppRouter />
    </UIPreferenceProvider>
  );
}
