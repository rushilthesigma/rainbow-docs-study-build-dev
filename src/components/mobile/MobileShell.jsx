import { useState } from 'react';
import BottomTabs from './BottomTabs';
import MobileHeader from './MobileHeader';
import MoreSheet from './MoreSheet';

// Reuse desktop app components
import CurriculaApp from '../desktop/apps/CurriculaApp';
import FlashcardsApp from '../desktop/apps/FlashcardsApp';
import NotesApp from '../desktop/apps/NotesApp';
import DebateApp from '../desktop/apps/DebateApp';
import SocialApp from '../desktop/apps/SocialApp';
import TextbookApp from '../desktop/apps/TextbookApp';
import StudyPage from '../../pages/StudyPage';
import GoalsPage from '../../pages/GoalsPage';
import AssessmentsPage from '../../pages/AssessmentsPage';
import MathPracticePage from '../../pages/MathPracticePage';
import SettingsPage from '../../pages/SettingsPage';

const PAGE_MAP = {
  study: { title: 'Study Mode', component: StudyPage, flex: true },
  curricula: { title: 'Curricula', component: CurriculaApp },
  flashcards: { title: 'Flashcards', component: FlashcardsApp },
  notes: { title: 'Notes', component: NotesApp, flex: true },
  goals: { title: 'Goals', component: GoalsPage },
  assessments: { title: 'Assessments', component: AssessmentsPage },
  math: { title: 'Math Canvas', component: MathPracticePage, flex: true },
  debate: { title: 'Debate', component: DebateApp, flex: true },
  social: { title: 'Social', component: SocialApp, flex: true },
  textbook: { title: 'Textbooks', component: TextbookApp },
  settings: { title: 'Settings', component: SettingsPage },
};

export default function MobileShell() {
  const [activeTab, setActiveTab] = useState('study');
  const [moreOpen, setMoreOpen] = useState(false);
  const [activePage, setActivePage] = useState('study'); // can differ from tab when using "More"

  function handleTabSelect(tabId) {
    if (tabId === 'more') {
      setMoreOpen(true);
      return;
    }
    setActiveTab(tabId);
    setActivePage(tabId);
  }

  function handleMoreSelect(pageId) {
    setActivePage(pageId);
    setActiveTab('more');
  }

  const page = PAGE_MAP[activePage];
  const PageComponent = page?.component;
  const isMainTab = ['study', 'curricula', 'flashcards', 'notes'].includes(activePage);

  return (
    <div className="h-screen flex flex-col bg-[#F4F5F7] dark:bg-[#0D0D14]">
      <MobileHeader
        title={page?.title || 'Covalent'}
        onBack={!isMainTab ? () => { setActivePage(activeTab !== 'more' ? activeTab : 'study'); setActiveTab(activeTab !== 'more' ? activeTab : 'study'); } : null}
      />

      <main className="flex-1 min-h-0 overflow-hidden flex flex-col" style={{ marginBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
        <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden ${page?.flex ? 'flex flex-col' : 'p-4'}`}>
          {PageComponent && <PageComponent />}
        </div>
      </main>

      <BottomTabs active={isMainTab ? activePage : 'more'} onSelect={handleTabSelect} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} onSelect={handleMoreSelect} />
    </div>
  );
}
