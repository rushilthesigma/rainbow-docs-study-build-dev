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
import MathPracticePage from './pages/MathPracticePage';
import CurriculumAssessmentPage from './pages/CurriculumAssessmentPage';
import PracticeLessonPage from './pages/PracticeLessonPage';
import SocialPage from './pages/SocialPage';
import DebatePage from './pages/DebatePage';
import SettingsPage from './pages/SettingsPage';
import AppShell from './components/layout/AppShell';
import DesktopShell from './components/desktop/DesktopShell';
import MobileApp from './components/mobile/MobileApp';
import Onboarding from './components/desktop/Onboarding';
import LoadingSpinner from './components/shared/LoadingSpinner';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullScreen />;
  if (!user) return <Navigate to="/" replace />;
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
      <Route path="/math" element={<AppRoute><MathPracticePage /></AppRoute>} />
      <Route path="/social" element={<AppRoute><SocialPage /></AppRoute>} />
      <Route path="/debate" element={<AppRoute><DebatePage /></AppRoute>} />
      <Route path="/settings" element={<AppRoute><SettingsPage /></AppRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function AppRouter() {
  const { user, loading } = useAuth();
  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem('covalent-onboarded'));
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768); }
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
  if (!user) return <Routes><Route path="*" element={<LandingPage />} /></Routes>;

  // Mobile gets its own UI — no onboarding
  if (isMobile) return <MobileApp />;

  if (!onboarded) {
    return <Onboarding onComplete={() => { setOnboarded(true); window.location.reload(); }} />;
  }

  return <DesktopShell />;
}

export default function App() {
  return (
    <UIPreferenceProvider>
      <AppRouter />
    </UIPreferenceProvider>
  );
}
