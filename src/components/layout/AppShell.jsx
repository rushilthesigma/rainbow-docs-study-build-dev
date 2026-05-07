import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import TabBar from './TabBar';
import SplitView from './SplitView';
import MinimizedPills from '../shared/MinimizedPills';
import { useSplitView } from '../../context/SplitViewContext';
import { TabProvider } from '../../context/TabContext';

function AppShellInner({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  const { isActive: splitActive } = useSplitView();

  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex h-screen bg-[#F4F5F7] dark:bg-[#111111]">
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar
        hidden={isMobile && !sidebarOpen}
        onNavigate={() => { if (isMobile) setSidebarOpen(false); }}
      />

      <div className={`flex-1 flex flex-col transition-all overflow-hidden ${isMobile ? 'ml-0' : 'ml-60'}`}>
        <TabBar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} showHamburger={isMobile} />
        {splitActive && !isMobile ? (
          <SplitView>{children}</SplitView>
        ) : (
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 flex flex-col">
            {children}
          </main>
        )}
      </div>

      <MinimizedPills />
    </div>
  );
}

export default function AppShell({ children }) {
  return (
    <TabProvider>
      <AppShellInner>{children}</AppShellInner>
    </TabProvider>
  );
}
