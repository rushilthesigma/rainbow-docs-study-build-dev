import { useUIPreference } from '../../context/UIPreferenceContext';
import DesktopShell from '../desktop/DesktopShell';

export default function RootShell({ classicChildren }) {
  const { uiMode } = useUIPreference();

  if (uiMode === 'desktop') {
    return <DesktopShell />;
  }

  // Classic mode — render the normal routed content
  return classicChildren;
}
