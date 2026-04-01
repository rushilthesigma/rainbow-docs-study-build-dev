import { createContext, useContext, useState, useCallback } from 'react';

const PanelContext = createContext(null);

export function PanelProvider({ children }) {
  const [panels, setPanels] = useState([]);

  const addPanel = useCallback((panel) => {
    setPanels(prev => {
      if (prev.find(p => p.id === panel.id)) return prev;
      return [...prev, { ...panel, minimized: false }];
    });
  }, []);

  const removePanel = useCallback((id) => {
    setPanels(prev => prev.filter(p => p.id !== id));
  }, []);

  const minimizePanel = useCallback((id) => {
    setPanels(prev => prev.map(p => p.id === id ? { ...p, minimized: true } : p));
  }, []);

  const restorePanel = useCallback((id) => {
    setPanels(prev => prev.map(p => p.id === id ? { ...p, minimized: false } : p));
  }, []);

  const updatePanel = useCallback((id, updates) => {
    setPanels(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  return (
    <PanelContext.Provider value={{ panels, addPanel, removePanel, minimizePanel, restorePanel, updatePanel }}>
      {children}
    </PanelContext.Provider>
  );
}

export function usePanels() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error('usePanels must be used within PanelProvider');
  return ctx;
}
