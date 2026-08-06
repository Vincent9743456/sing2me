/**
 * ENTRÉE PUBLIQUE LÉGÈRE (spectateur) — chantier « architecture page
 * publique ». Distincte de l'app musicien (src/main.tsx) : le spectateur ne
 * télécharge que le cœur du direct (paroles + suivi + cœurs + pourboire) ;
 * les briques d'engagement sont des chunks différés (voir pages/Live.tsx).
 *
 * Routage par CHEMIN (pas de hash) — réécritures Vercel :
 *   /live   → page concert (suivi du direct)
 *   /<nom>  → fiche publique dictable d'un artiste (chantier 4)
 * En dev/préversion, /public.html (sans réécriture) affiche la page concert.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';

import { Live } from './pages/Live';
import { PublicArtist } from './pages/PublicArtist';
import { RESERVED_NAMES } from './lib/publicName';
import './theme.css';

function pageFromPath(): React.ReactElement | null {
  const seg = location.pathname
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  // /live, accès direct à /public.html (dev), ou chemin vide → le concert.
  if (seg === '' || seg === 'live' || seg === 'public.html') return <Live />;
  // Nom public dictable (mêmes règles que l'app : minuscules, 3-30, réservés).
  if (/^[a-z0-9]{3,30}$/.test(seg) && !RESERVED_NAMES.has(seg)) {
    return <PublicArtist name={seg} />;
  }
  // Nom réservé (ex. /cgu, /report) : c'est une route de l'app → on y va.
  if (RESERVED_NAMES.has(seg)) {
    location.replace(`/#/${seg}`);
    return null;
  }
  return <Live />;
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>{pageFromPath()}</React.StrictMode>,
  );
}
