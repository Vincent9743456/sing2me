import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './theme.css';

// Capture l'invite d'installation (Android/Chrome) le plus tôt possible :
// l'événement peut se déclencher avant le montage de React. On le stocke pour
// que la bannière « Ajouter à l'écran d'accueil » puisse le rejouer.
declare global {
  interface Window {
    __s2mInstallPrompt?: Event & { prompt: () => void };
  }
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__s2mInstallPrompt = e as Event & { prompt: () => void };
  window.dispatchEvent(new Event('s2m-installable'));
});

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
