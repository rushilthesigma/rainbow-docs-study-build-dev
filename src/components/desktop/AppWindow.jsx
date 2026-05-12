import CurriculaApp from './apps/CurriculaApp';
import SlideshowApp from './apps/SlideshowApp';
import LessonsApp from './apps/LessonsApp';
import NotesApp from './apps/NotesApp';
import SocialApp from './apps/SocialApp';
import AdminApp from './apps/AdminApp';
import QuizBowlApp from './apps/QuizBowlApp';
import MathTutorApp from './apps/MathTutorApp';
import MobilePreview from '../admin/MobilePreview';
import StudyPage from '../../pages/StudyPage';
import SettingsPage from '../../pages/SettingsPage';
import DebatePanel from '../study/DebatePanel';

// The standalone Assessments app was retired — per-curriculum quizzes
// (CurriculumAssessmentPage) still exist inside lessons; the
// generic "make a quiz on any topic" surface is gone.
// Dev Forum was also retired — the AI-collaboration board got removed
// along with its server endpoints.
const APP_COMPONENTS = {
  curricula: CurriculaApp,
  lessons: LessonsApp,
  study: StudyPage,
  notes: NotesApp,
  mathtutor: MathTutorApp,
  social: SocialApp,
  quizbowl: QuizBowlApp,
  admin: AdminApp,
  slides: SlideshowApp,
  mobilepreview: MobilePreview,
  settings: SettingsPage,
  debate: DebatePanel,
};

// Apps that need flex container without scroll (they manage their own scrolling)
const FLEX_APPS = new Set(['notes', 'study', 'debate', 'mathtutor', 'social', 'mobilepreview']);

// Slides gets a full-bleed container: no padding, no overflow-hidden so
// floating dropdowns (theme picker etc.) are not clipped by the window edge.
// The SlideshowApp component manages its own padding per view.
const FULLBLEED_APPS = new Set(['slides']);

export default function AppWindow({ appId }) {
  const Component = APP_COMPONENTS[appId];
  if (!Component) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Unknown app</div>;

  if (FULLBLEED_APPS.has(appId)) {
    return (
      <div className="h-full flex flex-col">
        <Component />
      </div>
    );
  }

  if (FLEX_APPS.has(appId)) {
    return (
      <div className="h-full overflow-hidden p-4 md:p-5 flex flex-col">
        <Component />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden p-4 md:p-5 flex flex-col">
      <Component />
    </div>
  );
}
