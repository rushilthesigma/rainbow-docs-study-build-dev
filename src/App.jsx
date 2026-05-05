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
import AssessmentsPage from './pages/AssessmentsPage';
import StudyPage from './pages/StudyPage';
// MathPracticePage was folded into MathTutorApp (canvas + tutor unified).
import CurriculumAssessmentPage from './pages/CurriculumAssessmentPage';
import PracticeLessonPage from './pages/PracticeLessonPage';
import SocialPage from './pages/SocialPage';
import SettingsPage from './pages/SettingsPage';
import AppShell from './components/layout/AppShell';
import DesktopShell from './components/desktop/DesktopShell';
import MobileShell from './components/mobile/MobileShell';
import MobileLanding from './components/mobile/MobileLanding';
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
      <Route path="/assessments" element={<AppRoute><AssessmentsPage /></AppRoute>} />
      <Route path="/social" element={<AppRoute><SocialPage /></AppRoute>} />
      <Route path="/settings" element={<AppRoute><SettingsPage /></AppRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function AppRouter() {
  const { user, loading } = useAuth();
  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem('covalent-onboarded'));
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

  // Signed-out: phone gets MobileLanding, desktop gets the full
  // marketing landing page. The mobile landing's "Sign in" CTA fires
  // the same Google flow LandingPage uses (handled inside MobileLanding
  // by reusing the Google Identity Services button mounted there).
  if (!user) {
    if (isMobile) {
      return <Routes><Route path="*" element={<MobileLandingRoute />} /></Routes>;
    }
    return <Routes><Route path="*" element={<LandingPage />} /></Routes>;
  }

  if (!onboarded) {
    // Desktop onboarding is built for wide layouts and looks broken
    // on a phone. On mobile, auto-complete it so users land directly
    // in MobileShell.
    if (isMobile) {
      localStorage.setItem('covalent-onboarded', 'true');
      setOnboarded(true);
      return <LoadingSpinner fullScreen />;
    }
    return <Onboarding onComplete={() => { setOnboarded(true); window.location.reload(); }} />;
  }
  return isMobile ? <MobileShell /> : <DesktopShell />;
}

// Tiny wrapper so MobileLanding's "Sign in" CTA fires the real Google
// flow used by the desktop LandingPage. Cheapest path: render the
// LandingPage offscreen and trigger its hidden Google button.
function MobileLandingRoute() {
  function triggerGoogle() {
    // The hidden Google button rendered by LandingPage stays in the
    // DOM as long as that component is mounted. Falling back to the
    // GIS prompt if the button isn't there (e.g. script failed to load).
    const el = document.querySelector('[aria-hidden="true"] div[role=button], [aria-hidden="true"] button');
    if (el) el.click();
    else if (window.google?.accounts?.id) window.google.accounts.id.prompt();
  }
  return (
    <>
      <MobileLanding onSignIn={triggerGoogle} />
      {/* LandingPage is rendered for its side effects only — it loads
          the Google Identity Services script + mounts the hidden
          sign-in button that `triggerGoogle` above clicks. Hidden via
          fixed off-screen positioning. */}
      <div style={{ position: 'fixed', left: -99999, top: 0, width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden="true">
        <LandingPage />
      </div>
    </>
  );
}

export default function App() {
  return (
    <UIPreferenceProvider>
      <AppRouter />
    </UIPreferenceProvider>
  );
}
