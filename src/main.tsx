import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
        <Toaster
          expand
          position="top-right"
          richColors
          theme="light"
          toastOptions={{
            classNames: {
              toast:
                'border border-slate-300 bg-white text-slate-900 shadow-[0_18px_40px_rgba(74,55,31,0.08)]',
            },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
