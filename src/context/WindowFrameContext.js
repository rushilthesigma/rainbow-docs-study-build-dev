import { createContext, useContext } from 'react';

// Set to true by Window.jsx for its content area, so Modal knows it's
// rendering inside a window frame and should use absolute (not fixed) inset.
export const WindowFrameContext = createContext(false);
export const useInsideWindowFrame = () => useContext(WindowFrameContext);
