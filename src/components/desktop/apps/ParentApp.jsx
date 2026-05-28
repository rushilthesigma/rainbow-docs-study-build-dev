import ParentPage from '../../../pages/ParentPage';

// The desktop window for parental controls. ParentPage holds the full
// flow (first-time setup → PIN unlock → dashboard with child cards).
// Wrapping it here lets us register it as an app on the desktop dock
// without duplicating the implementation.
export default function ParentApp() {
  return <ParentPage />;
}
