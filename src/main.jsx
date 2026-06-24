import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { SharingProvider } from './context/SharingContext';
import { PanelProvider } from './context/PanelContext';
import { SplitViewProvider } from './context/SplitViewContext';
import { MathCanvasProvider } from './context/MathCanvasContext';
import ErrorBoundary from './components/shared/ErrorBoundary';
import { ToastProvider } from './components/shared/Toast';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary label="The app hit an unexpected error">
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <SharingProvider>
              <PanelProvider>
                <SplitViewProvider>
                  <MathCanvasProvider>
                    <App />
                  </MathCanvasProvider>
                </SplitViewProvider>
              </PanelProvider>
            </SharingProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
