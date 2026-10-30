import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/index.css';

// iOS ignora user-scalable=no: bloqueia os eventos de gesto e a pinça com dois dedos.
const stop = (e) => e.preventDefault();
['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, stop, { passive: false }));
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// Service worker apenas em produção (evita cache confuso durante o desenvolvimento).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
