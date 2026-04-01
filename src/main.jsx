import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { PanelProvider } from './context/PanelContext';
import { SplitViewProvider } from './context/SplitViewContext';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PanelProvider>
          <SplitViewProvider>
            <App />
          </SplitViewProvider>
        </PanelProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
