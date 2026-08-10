import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './theme.css';
import { appliquerTheme, themeMemorise } from './lib/theme';

/**
 * Le thème AVANT tout (b233) : posé depuis la copie locale, avant que React
 * ne monte quoi que ce soit. `App` le resynchronise ensuite sur `prefs.theme`,
 * qui fait foi — mais si on attendait le store, l'app s'ouvrirait en sombre
 * puis basculerait en clair sous les yeux, à chaque lancement.
 */
appliquerTheme(themeMemorise());

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

/**
 * HORS LIGNE (b221) — l'app se disait « local-first » et ne l'était qu'à
 * moitié : les DONNÉES vivaient bien sur le téléphone, mais le CODE était
 * retéléchargé à chaque lancement. En mode avion, rien ne s'ouvrait.
 *
 * Le service worker met la coquille de l'app en cache. Il est enregistré
 * APRÈS le premier rendu : jamais au prix de l'affichage. Et il n'est
 * enregistré que depuis l'app musicien — la page du spectateur, elle, doit
 * toujours voir le direct tel qu'il est à l'instant.
 */
function garderLAppHorsLigne() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // En développement le fichier n'existe pas : ce n'est pas une erreur.
    });
  });
}
garderLAppHorsLigne();

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
