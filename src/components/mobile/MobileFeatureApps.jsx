import QBpediaApp from '../desktop/apps/QBpediaApp';
import AdminApp from '../desktop/apps/AdminApp';
import ErrorBoundary from '../shared/ErrorBoundary';

function FeatureSurface({ label, scroll = false, children }) {
  return (
    <div
      data-app-theme="dark"
      className={`h-full min-h-0 bg-[#0a0a14] text-white p-3 ${scroll ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden flex flex-col'}`}
    >
      <ErrorBoundary label={`${label} could not open`}>
        {children}
      </ErrorBoundary>
    </div>
  );
}

export function MobileQBpedia({ onNavigate }) {
  return (
    <FeatureSurface label="QBpedia">
      <div
        className="mobile-accent-scope h-full min-h-0"
        style={{ '--app-accent': '#8b5cf6', '--app-accent-contrast': '#ffffff' }}
      >
        <QBpediaApp mobile onOpenApp={(appId) => onNavigate?.(appId)} />
      </div>
    </FeatureSurface>
  );
}

export function MobileAdmin() {
  return (
    <FeatureSurface label="Admin" scroll>
      <AdminApp />
    </FeatureSurface>
  );
}
