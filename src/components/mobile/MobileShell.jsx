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

// Page registry for the mobile shell.
//   - `hideHeader`   → suppresses MobileHeader (page renders its own).
//   - `manageLayout` → page owns its own scrolling + flex layout
//     (chat-style screens that pin a footer to the bottom). Without
//     this flag the shell wraps the page in an `overflow-y-auto`
//     scroller, which conflicts with the page's own `flex-col h-full`
//     and breaks the input-pinning. With it, the shell hands a bounded
//     `flex-1 overflow-hidden` container directly to the page.
const PAGE_MAP = {
  home:        { title: 'RushilAI',  component: MobileHome,       isHome: true,  hideHeader: false },
  curricula:   { title: 'Courses',   component: MobileCurricula,                 hideHeader: true  },
  lessons:     { title: 'Lessons',   component: MobileLessons,                   hideHeader: true  },
  notes:       { title: 'Notes',     component: MobileNotes,                     hideHeader: true,  manageLayout: true },
  // Tabs surfaced via "More":
  study:       { title: 'Study',        component: MobileStudy,        hideHeader: true, manageLayout: true },
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
        // Bottom tab bar (58) + browser controls row (32) + iOS home
        // indicator inset. Subtract this from the content area so the
        // last bit of every page isn't covered by chrome.
        style={{ paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))' }}
      >
        {page.manageLayout ? (
          // Pages that own their own scrolling get a bounded container
          // and render directly — no inner overflow-y-auto wrapper.
          <div className="flex-1 min-h-0 overflow-hidden">
            <PageComponent />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            {page.isHome
              ? <PageComponent onNavigate={navigateFromHome} />
              : <PageComponent />}
          </div>
        )}
      </main>

      {/* Bottom-of-screen chrome stack, top-to-bottom:
            1. BottomTabs (apps row, 58px tall)
            2. BrowserControls (back / forward, 32px tall)
          The browser controls are explicitly BELOW the apps row so the
          finger sits over the tabs first when reaching for them. */}
      <BottomTabs active={isMain ? activePage : 'more'} onSelect={handleTabSelect} />
      <BrowserControls
        canBack={backStack.length > 0}
        canForward={forwardStack.length > 0}
        onBack={goBackOne}
        onForward={goForwardOne}
      />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} onSelect={handleMoreSelect} />
    </div>
  );
});

export default MobileShell;

// Slim row that sits at the VERY BOTTOM of the screen, BELOW the
// tab bar. Two icon buttons drive the in-shell back / forward
// stacks. Disabled state when there's nothing to navigate to in
// that direction. The iOS home-indicator inset is absorbed into
// this row's padding-bottom so the buttons stay tap-able.
function BrowserControls({ canBack, canForward, onBack, onForward }) {
  return (
    <div
      className="fixed left-0 right-0 bottom-0 z-30 flex items-center justify-center gap-3 px-3 border-t border-gray-200 dark:border-white/[0.06] bg-white/85 dark:bg-[#0c0c16]/85 backdrop-blur-xl"
      style={{
        height: 'calc(32px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
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
