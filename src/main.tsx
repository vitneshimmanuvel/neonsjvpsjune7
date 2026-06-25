import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// Apply the theme mode early to avoid flash of default style
try {
  const savedMode = localStorage.getItem('theme-mode') || 'light';
  document.documentElement.classList.remove('light', 'dark', 'monitor');
  document.documentElement.classList.add(savedMode);
} catch (e) {
  console.error('Failed to initialize theme mode:', e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
