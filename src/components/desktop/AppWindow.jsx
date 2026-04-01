import CurriculaApp from './apps/CurriculaApp';
import FlashcardsApp from './apps/FlashcardsApp';
import DebateApp from './apps/DebateApp';
import NotesApp from './apps/NotesApp';
import TextbookApp from './apps/TextbookApp';
import SocialApp from './apps/SocialApp';
import StudyPage from '../../pages/StudyPage';
import GoalsPage from '../../pages/GoalsPage';
import AssessmentsPage from '../../pages/AssessmentsPage';
import MathPracticePage from '../../pages/MathPracticePage';
import SettingsPage from '../../pages/SettingsPage';

const APP_COMPONENTS = {
  curricula: CurriculaApp,
  study: StudyPage,
  flashcards: FlashcardsApp,
  notes: NotesApp,
  goals: GoalsPage,
  assessments: AssessmentsPage,
  math: MathPracticePage,
  textbook: TextbookApp,
  social: SocialApp,
  debate: DebateApp,
  settings: SettingsPage,
};

// Apps that need flex container without scroll (they manage their own scrolling)
const FLEX_APPS = new Set(['notes', 'study', 'debate', 'math', 'textbook', 'social']);

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
