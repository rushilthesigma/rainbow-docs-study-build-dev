import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const TabContext = createContext(null);

const ROUTE_META = {
  '/dashboard': { label: 'Dashboard', color: '#3b82f6' },
  '/new': { label: 'New Curriculum', color: '#3b82f6' },
  '/study': { label: 'Study Mode', color: '#3b82f6' },
  '/goals': { label: 'Goals', color: '#f59e0b' },
  '/flashcards': { label: 'Flashcards', color: '#a855f7' },
  '/notes': { label: 'Notes', color: '#10b981' },
  '/assessments': { label: 'Assessments', color: '#ef4444' },
  '/math': { label: 'Math Canvas', color: '#6366f1' },
  '/settings': { label: 'Settings', color: '#6b7280' },
};

function labelForPath(path) {
  // Exact match
  if (ROUTE_META[path]) return ROUTE_META[path];
  // Dynamic routes
  if (path.startsWith('/curriculum/') && path.includes('/lesson/'))
    return { label: 'Lesson', color: '#3b82f6' };
  if (path.startsWith('/curriculum/') && path.includes('/assessment/'))
    return { label: 'Assessment', color: '#ef4444' };
  if (path.startsWith('/curriculum/'))
    return { label: 'Curriculum', color: '#3b82f6' };
  if (path.startsWith('/flashcards/'))
    return { label: 'Flashcards', color: '#a855f7' };
  if (path.startsWith('/notes/'))
    return { label: 'Note', color: '#10b981' };
  return { label: 'Page', color: '#6b7280' };
}

let nextTabId = 1;

function loadTabs() {
  try {
    const saved = sessionStorage.getItem('covalent-tabs');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.tabs?.length) {
        nextTabId = Math.max(...parsed.tabs.map(t => t.id)) + 1;
        return parsed;
      }
    }
  } catch {}
  return null;
}

function saveTabs(tabs, activeTabId) {
  sessionStorage.setItem('covalent-tabs', JSON.stringify({ tabs, activeTabId }));
}

export function TabProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [tabs, setTabs] = useState(() => {
    const saved = loadTabs();
    if (saved) return saved.tabs;
    const meta = labelForPath(location.pathname);
    return [{ id: nextTabId++, path: location.pathname, label: meta.label, color: meta.color }];
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    const saved = loadTabs();
    return saved?.activeTabId || tabs[0]?.id;
  });

  // Sync current location to active tab
  useEffect(() => {
    setTabs(prev => prev.map(t =>
      t.id === activeTabId
        ? { ...t, path: location.pathname, ...labelForPath(location.pathname) }
        : t
    ));
  }, [location.pathname, activeTabId]);

  // Persist
  useEffect(() => { saveTabs(tabs, activeTabId); }, [tabs, activeTabId]);

  const openTab = useCallback((path) => {
    const meta = labelForPath(path);
    const newTab = { id: nextTabId++, path, label: meta.label, color: meta.color };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    navigate(path);
  }, [navigate]);

  const switchTab = useCallback((id) => {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    setActiveTabId(id);
    navigate(tab.path);
  }, [tabs, navigate]);

  const closeTab = useCallback((id) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex(t => t.id === id);
      const next = prev.filter(t => t.id !== id);
      if (id === activeTabId) {
        const newActive = next[Math.min(idx, next.length - 1)];
        setActiveTabId(newActive.id);
        navigate(newActive.path);
      }
      return next;
    });
  }, [activeTabId, navigate]);

  const updateTab = useCallback((id, updates) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  return (
    <TabContext.Provider value={{ tabs, activeTabId, openTab, switchTab, closeTab, updateTab }}>
      {children}
    </TabContext.Provider>
  );
}

export function useTabs() {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error('useTabs must be inside TabProvider');
  return ctx;
}
