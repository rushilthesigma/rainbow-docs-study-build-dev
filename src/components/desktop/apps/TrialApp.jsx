import TrialPage from '../../../pages/TrialPage';

// Thin wrapper — renders the full TrialPage inside a desktop window.
// AppWindow puts this in FLEX_APPS so it gets p-4/p-5 + flex-col without
// its own overflow scroller (TrialSession manages height internally).
export default function TrialApp() {
  return <TrialPage />;
}
