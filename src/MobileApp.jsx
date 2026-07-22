import { useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { UIPreferenceProvider } from './context/UIPreferenceContext';
import MobileSignIn from './components/mobile/MobileSignIn';
import MobileShell from './components/mobile/MobileShell';
import MobileQuizBowlOnboarding from './components/mobile/MobileQuizBowlOnboarding';
import LoadingSpinner from './components/shared/LoadingSpinner';

function isDemoEmail(email) {
  const value = String(email || '').toLowerCase();
  return value.startsWith('demo-landing-') || value.endsWith('@covalent.test') || value === 'dev@covalent.test';
}

function MobileAppRouter() {
  const { user, loading, logout } = useAuth();
  const isDemoSession = !!user && (user.isDemo === true || isDemoEmail(user.email));

  useEffect(() => {
    if (loading || !isDemoSession) return;
    logout().catch(() => {});
  }, [isDemoSession, loading, logout]);

  if (loading || isDemoSession) return <LoadingSpinner fullScreen />;
  if (!user) return <MobileSignIn />;
  if (!user.data?.preferences?.onboarded) return <MobileQuizBowlOnboarding />;
  return <MobileShell />;
}

export default function MobileApp() {
  return (
    <UIPreferenceProvider>
      <MobileAppRouter />
    </UIPreferenceProvider>
  );
}
