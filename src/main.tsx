import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

import { initNativeApp } from './lib/nativeApp.ts'

// Apply the theme mode early to avoid flash of default style
try {
  const savedMode = localStorage.getItem('theme-mode') || 'light';
  document.documentElement.classList.remove('light', 'dark', 'monitor');
  document.documentElement.classList.add(savedMode);
} catch (e) {
  console.error('Failed to initialize theme mode:', e);
}

// Initialize Capacitor native plugins (Status Bar, Back Button, Splash Screen)
initNativeApp();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
