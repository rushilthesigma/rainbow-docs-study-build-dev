import { createContext, useContext, useState, useCallback } from 'react';

const SplitViewContext = createContext(null);

export function SplitViewProvider({ children }) {
  const [rightPanel, setRightPanel] = useState(null); // 'study' | 'notes' | 'flashcards' | null

  const openSplit = useCallback((panel) => setRightPanel(panel), []);
  const closeSplit = useCallback(() => setRightPanel(null), []);
  const isActive = rightPanel !== null;

  return (
    <SplitViewContext.Provider value={{ isActive, rightPanel, openSplit, closeSplit }}>
      {children}
    </SplitViewContext.Provider>
  );
}

export function useSplitView() {
  const ctx = useContext(SplitViewContext);
  if (!ctx) throw new Error('useSplitView must be used within SplitViewProvider');
  return ctx;
}
