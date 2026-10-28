import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { Toaster } from 'sonner';
import { store } from '@/store';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
      {/* Error / success toasts for the whole app (utils/notify.ts, store/errorToastMiddleware.ts) */}
      <Toaster position="top-right" richColors closeButton theme="system" />
    </Provider>
  </React.StrictMode>
);