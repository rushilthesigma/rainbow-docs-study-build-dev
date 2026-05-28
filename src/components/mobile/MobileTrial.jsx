import TrialPage from '../../pages/TrialPage';

// Thin wrapper that renders the full TrialPage inside the mobile shell.
export default function MobileTrial() {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div className="p-4">
        <TrialPage />
      </div>
    </div>
  );
}
