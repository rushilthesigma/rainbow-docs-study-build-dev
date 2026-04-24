import { createContext, useContext } from 'react';

// True only inside the landing-page MiniOS. Real app usage = false.
const DemoModeContext = createContext(false);

export function DemoModeProvider({ children }) {
  return <DemoModeContext.Provider value={true}>{children}</DemoModeContext.Provider>;
}

export function useDemoMode() {
  return useContext(DemoModeContext);
}
