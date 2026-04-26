import CurriculaApp from './apps/CurriculaApp';
import LessonsApp from './apps/LessonsApp';
import DebateApp from './apps/DebateApp';
import NotesApp from './apps/NotesApp';
import TextbookApp from './apps/TextbookApp';
import SocialApp from './apps/SocialApp';
import AdminApp from './apps/AdminApp';
import QuizBowlApp from './apps/QuizBowlApp';
import MathTutorApp from './apps/MathTutorApp';
import StudyPage from '../../pages/StudyPage';
import AssessmentsPage from '../../pages/AssessmentsPage';
import MathPracticePage from '../../pages/MathPracticePage';
import SettingsPage from '../../pages/SettingsPage';

const APP_COMPONENTS = {
  curricula: CurriculaApp,
  lessons: LessonsApp,
  study: StudyPage,
  notes: NotesApp,
  assessments: AssessmentsPage,
  math: MathPracticePage,
  mathtutor: MathTutorApp,
  textbook: TextbookApp,
  social: SocialApp,
  quizbowl: QuizBowlApp,
  debate: DebateApp,
  admin: AdminApp,
  settings: SettingsPage,
};

// Apps that need flex container without scroll (they manage their own scrolling)
const FLEX_APPS = new Set(['notes', 'study', 'debate', 'math', 'mathtutor', 'textbook', 'social']);

export default function AppWindow({ appId }) {
  const Component = APP_COMPONENTS[appId];
  if (!Component) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Unknown app</div>;

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
