import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from '@/store';
import { ThemedToaster } from '@/components/ui/ThemedToaster';
import { applyThemeMode } from '@/utils/theme';
import App from './App';
import './index.css';

// Saved light / dark choice, set before the first render so a dark page never flashes light
applyThemeMode();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
      <ThemedToaster />
    </Provider>
  </React.StrictMode>
);
