import MathTutorApp from '../desktop/apps/MathTutorApp';
import QBpediaApp from '../desktop/apps/QBpediaApp';
import WidgetsApp from '../desktop/apps/WidgetsApp';
import AdminApp from '../desktop/apps/AdminApp';
import ErrorBoundary from '../shared/ErrorBoundary';
import { WidgetProvider } from '../../context/WidgetContext';

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

export function MobileMathTutor() {
  return (
    <FeatureSurface label="Math Tutor">
      <MathTutorApp />
    </FeatureSurface>
  );
}

export function MobileQBpedia({ onNavigate }) {
  return (
    <FeatureSurface label="QBpedia">
      <QBpediaApp onOpenApp={(appId) => onNavigate?.(appId)} />
    </FeatureSurface>
  );
}

export function MobileWidgets() {
  return (
    <WidgetProvider>
      <FeatureSurface label="Widgets">
        <WidgetsApp />
      </FeatureSurface>
    </WidgetProvider>
  );
}

export function MobileAdmin() {
  return (
    <FeatureSurface label="Admin" scroll>
      <AdminApp />
    </FeatureSurface>
  );
}
