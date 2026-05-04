import { useState } from 'react';
import BottomTabs from './BottomTabs';
import MobileHeader from './MobileHeader';
import MoreSheet from './MoreSheet';

// Reuse desktop app components
import CurriculaApp from '../desktop/apps/CurriculaApp';
import NotesApp from '../desktop/apps/NotesApp';
import SocialApp from '../desktop/apps/SocialApp';
import StudyPage from '../../pages/StudyPage';
import AssessmentsPage from '../../pages/AssessmentsPage';
import SettingsPage from '../../pages/SettingsPage';

const PAGE_MAP = {
  study: { title: 'Study Mode', component: StudyPage, flex: true },
  curricula: { title: 'Curricula', component: CurriculaApp },
  notes: { title: 'Notes', component: NotesApp, flex: true },
  assessments: { title: 'Assessments', component: AssessmentsPage },
  social: { title: 'Social', component: SocialApp, flex: true },
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
        title={page?.title || 'RushilAI'}
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
