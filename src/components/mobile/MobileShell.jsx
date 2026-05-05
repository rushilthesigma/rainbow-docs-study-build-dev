import { useState, useRef, useImperativeHandle, forwardRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import BottomTabs from './BottomTabs';
import MobileHeader from './MobileHeader';
import MoreSheet from './MoreSheet';
import MobileHome from './MobileHome';
import MobileCurricula from './MobileCurricula';
import MobileLessons from './MobileLessons';
import MobileNotes from './MobileNotes';
import MobileQuizBowl from './MobileQuizBowl';
import MobileSettings from './MobileSettings';
import MobileStudy from './MobileStudy';
import MobilePage from './MobilePage';

import AssessmentsPage from '../../pages/AssessmentsPage';
import GoalsPage from '../../pages/GoalsPage';
import FlashcardsPage from '../../pages/FlashcardsPage';
import SocialApp from '../desktop/apps/SocialApp';

// Pages without a bespoke mobile build are wrapped with `MobilePage`
// so they share the same centered title + spacious layout as the
// purpose-built mobile screens.
function WrappedAssessments() { return <MobilePage eyebrow="Practice" title="Assessments"><AssessmentsPage /></MobilePage>; }
function WrappedGoals()       { return <MobilePage eyebrow="Targets" title="Goals"><GoalsPage /></MobilePage>; }
function WrappedFlashcards()  { return <MobilePage eyebrow="Memory" title="Flashcards"><FlashcardsPage /></MobilePage>; }
function WrappedSocial()      { return <MobilePage eyebrow="Friends" title="Social"><div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#13131f] overflow-hidden"><SocialApp /></div></MobilePage>; }

// Page registry for the mobile shell. Bespoke mobile components own
// their full layout (centered titles inside); the wrapped legacy pages
// get the title from MobilePage. `hideHeader` hides the top
// MobileHeader for screens that already render their own centered
// title, avoiding doubled-up titles.
const PAGE_MAP = {
  home:        { title: 'RushilAI',  component: MobileHome,       isHome: true,  hideHeader: false },
  curricula:   { title: 'Courses',   component: MobileCurricula,                 hideHeader: true  },
  lessons:     { title: 'Lessons',   component: MobileLessons,                   hideHeader: true  },
  notes:       { title: 'Notes',     component: MobileNotes,                     hideHeader: true  },
  // Tabs surfaced via "More":
  study:       { title: 'Study',        component: MobileStudy,        hideHeader: true },
  quizbowl:    { title: 'Quiz Bowl',    component: MobileQuizBowl,     hideHeader: true },
  flashcards:  { title: 'Flashcards',   component: WrappedFlashcards,  hideHeader: true },
  goals:       { title: 'Goals',        component: WrappedGoals,       hideHeader: true },
  assessments: { title: 'Assessments',  component: WrappedAssessments, hideHeader: true },
  social:      { title: 'Social',       component: WrappedSocial,      hideHeader: true },
  settings:    { title: 'Settings',     component: MobileSettings,     hideHeader: true },
};

const MAIN_TABS = ['home', 'curricula', 'lessons', 'notes'];

// Modern mobile shell. Renders full-bleed in a phone viewport (or
// inside the AdminApp Mobile Preview cutout — either way it sizes to
// its parent via h-full + w-full).
//
// Exposes an imperative `goBack()` / `goHome()` API via ref so the
// Mobile Preview app's dev toolbar can drive navigation from outside.
const MobileShell = forwardRef(function MobileShell(_props, ref) {
  const [activeTab, setActiveTab] = useState('home');
  const [activePage, setActivePage] = useState('home');
  const [moreOpen, setMoreOpen] = useState(false);
  // Browser-style nav history. `back` is the stack of previously
  // visited (tab, page) pairs; `forward` mirrors what we've popped
  // off so the user can redo with the forward button. Stored in state
  // (not refs) so the back/forward buttons can disable themselves
  // accurately on every render.
  const [backStack, setBackStack] = useState([]);
  const [forwardStack, setForwardStack] = useState([]);

  function navigate(nextTab, nextPage) {
    if (nextTab === activeTab && nextPage === activePage) return;
    setBackStack((s) => [...s, { activeTab, activePage }]);
    setForwardStack([]); // any new navigation invalidates the redo trail
    setActiveTab(nextTab);
    setActivePage(nextPage);
  }

  function goBackOne() {
    setBackStack((s) => {
      if (!s.length) return s;
      const prev = s[s.length - 1];
      setForwardStack((f) => [...f, { activeTab, activePage }]);
      setActiveTab(prev.activeTab);
      setActivePage(prev.activePage);
      setMoreOpen(false);
      return s.slice(0, -1);
    });
  }
  function goForwardOne() {
    setForwardStack((f) => {
      if (!f.length) return f;
      const next = f[f.length - 1];
      setBackStack((b) => [...b, { activeTab, activePage }]);
      setActiveTab(next.activeTab);
      setActivePage(next.activePage);
      setMoreOpen(false);
      return f.slice(0, -1);
    });
  }

  function handleTabSelect(tabId) {
    if (tabId === 'more') { setMoreOpen(true); return; }
    navigate(tabId, tabId);
  }

  function handleMoreSelect(pageId) {
    navigate('more', pageId);
  }

  // MobileHome triggers tab navigation via its own callbacks (so quick
  // actions can route into "More" pages even from the home grid).
  function navigateFromHome(target) {
    if (MAIN_TABS.includes(target)) navigate(target, target);
    else if (PAGE_MAP[target]) navigate('more', target);
  }

  useImperativeHandle(ref, () => ({
    goBack: () => {
      if (backStack.length) goBackOne();
      else { setActiveTab('home'); setActivePage('home'); setMoreOpen(false); }
    },
    goHome: () => {
      setBackStack([]); setForwardStack([]);
      setActiveTab('home'); setActivePage('home');
      setMoreOpen(false);
    },
  }), [backStack.length]);

  const page = PAGE_MAP[activePage] || PAGE_MAP.home;
  const PageComponent = page.component;
  const isMain = MAIN_TABS.includes(activePage);
  const onBack = !isMain
    ? () => navigate(activeTab !== 'more' ? activeTab : 'home', activeTab !== 'more' ? activeTab : 'home')
    : null;

  return (
    <div className="relative h-full w-full flex flex-col bg-[#F4F5F7] dark:bg-[#0a0a14] overflow-hidden">
      {/* Most pages render their own centered title; we still show the
          shared MobileHeader for the home tab + when there's a back
          button to surface, so navigation stays consistent. */}
      {(!page.hideHeader || onBack) && (
        <MobileHeader title={page.hideHeader ? '' : page.title} onBack={onBack} />
      )}

      <main
        className="flex-1 min-h-0 overflow-hidden flex flex-col"
        // Browser controls row (32) + bottom tab bar (58) + iOS home
        // indicator inset. Subtract this from the content area so the
        // last bit of every page isn't covered by chrome.
        style={{ paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {page.isHome
            ? <PageComponent onNavigate={navigateFromHome} />
            : <PageComponent />}
        </div>
      </main>

      {/* Browser-style back / forward row sits ABOVE the tab bar. */}
      <BrowserControls
        canBack={backStack.length > 0}
        canForward={forwardStack.length > 0}
        onBack={goBackOne}
        onForward={goForwardOne}
      />
      <BottomTabs active={isMain ? activePage : 'more'} onSelect={handleTabSelect} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} onSelect={handleMoreSelect} />
    </div>
  );
});

export default MobileShell;

// Slim row that sits ABOVE the bottom tab bar. Two icon buttons drive
// the in-shell back / forward stacks. Disabled state when there's
// nothing to navigate to in that direction.
function BrowserControls({ canBack, canForward, onBack, onForward }) {
  return (
    <div
      className="absolute left-0 right-0 z-20 flex items-center justify-center gap-3 px-3 py-1.5 border-t border-gray-200 dark:border-white/[0.06] bg-white/85 dark:bg-[#0c0c16]/85 backdrop-blur-xl"
      style={{
        bottom: 'calc(58px + env(safe-area-inset-bottom, 0px))',
        height: 32,
      }}
    >
      <button
        onClick={onBack}
        disabled={!canBack}
        aria-label="Back"
        className="w-8 h-8 rounded-full grid place-items-center text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-white/[0.06] disabled:opacity-30 disabled:active:bg-transparent transition-colors"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        onClick={onForward}
        disabled={!canForward}
        aria-label="Forward"
        className="w-8 h-8 rounded-full grid place-items-center text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-white/[0.06] disabled:opacity-30 disabled:active:bg-transparent transition-colors"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
