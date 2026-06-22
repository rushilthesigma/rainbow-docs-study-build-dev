import CurriculaApp from './apps/CurriculaApp';
import LessonsApp from './apps/LessonsApp';
import NotesApp from './apps/NotesApp';
import AdminApp from './apps/AdminApp';
import QuizBowlApp from './apps/QuizBowlApp';
import QBpediaApp from './apps/QBpediaApp';
import MathTutorApp from './apps/MathTutorApp';
import WidgetsApp from './apps/WidgetsApp';
import MobilePreview from '../admin/MobilePreview';
import StudyPage from '../../pages/StudyPage';
import SettingsPage from '../../pages/SettingsPage';
import DebatePanel from '../study/DebatePanel';
import ErrorBoundary from '../shared/ErrorBoundary';
import { useUIPreference } from '../../context/UIPreferenceContext';

// The standalone Assessments app was retired - per-curriculum quizzes
// (CurriculumAssessmentPage) still exist inside lessons; the
// generic "make a quiz on any topic" surface is gone.
// Dev Forum was also retired - the AI-collaboration board got removed
// along with its server endpoints.
// Slides was axed too - the deck-builder is no longer mounted here.
// Study Groups was removed entirely (feature deleted).
const APP_COMPONENTS = {
  curricula: CurriculaApp,
  lessons: LessonsApp,
  study: StudyPage,
  notes: NotesApp,
  mathtutor: MathTutorApp,
  quizbowl: QuizBowlApp,
  qbpedia: QBpediaApp,
  admin: AdminApp,
  mobilepreview: MobilePreview,
  settings: SettingsPage,
  debate: DebatePanel,
  widgets: WidgetsApp,
};

// Apps that need flex container without scroll (they manage their own scrolling)
const FLEX_APPS = new Set(['notes', 'study', 'debate', 'mathtutor', 'mobilepreview', 'qbpedia']);

// Full-bleed apps (no padding, no overflow-hidden) - widgets gallery
// owns its own internal padding, so the default p-4/p-5 wrapper would
// double-pad the layout.
const FULLBLEED_APPS = new Set(['widgets']);

export default function AppWindow({ appId, meta = {}, windowId }) {
  const Component = APP_COMPONENTS[appId];
  const { theme } = useUIPreference();
  // The desktop apps are written dark-first with `text-white/X` and
  // `bg-white/X` classes baked in. Tagging the window root with
  // data-app-theme="light" triggers the global shim in index.css that
  // remaps those whites to legible dark tones - so the app pages don't
  // each have to thread a theme prop through their entire tree.
  const themeAttr = theme === 'light' ? 'light' : 'dark';

  if (!Component) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Unknown app</div>;

  const safe = (
    <ErrorBoundary label={`The ${appId} app crashed`}>
      <Component windowId={windowId} {...meta} />
    </ErrorBoundary>
  );

  if (FULLBLEED_APPS.has(appId)) {
    return <div data-app-theme={themeAttr} className="h-full flex flex-col">{safe}</div>;
  }

  if (FLEX_APPS.has(appId)) {
    return (
      <div data-app-theme={themeAttr} className="h-full overflow-hidden p-4 md:p-5 flex flex-col">{safe}</div>
    );
  }

  return (
    <div data-app-theme={themeAttr} className="h-full overflow-y-auto overflow-x-hidden p-4 md:p-5 flex flex-col">
      {safe}
    </div>
  );
}
