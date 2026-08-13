/**
 * Routeur minimaliste basé sur le hash (#/…) : fonctionne sur n'importe
 * quel hébergement statique (Vercel) sans configuration serveur.
 */
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'library' }
  | { name: 'song'; id: string }
  | { name: 'songEdit'; id: string | null }
  | { name: 'import'; mode?: 'bulk' }
  | { name: 'setlists' }
  | { name: 'setlist'; id: string }
  | { name: 'setlistEdit'; id: string | null }
  | { name: 'setlistSono'; id: string }
  | { name: 'songInSet'; setlistId: string; index: number }
  | {
      name: 'stage';
      setlistId: string | null;
      songId: string | null;
      /** Morceau de DÉPART dans la setlist (b164) — 0 par défaut. */
      index: number;
    }
  | { name: 'concerts' }
  | { name: 'concert'; id: string | null }
  | { name: 'artist' }
  | { name: 'settings' }
  | { name: 'dashboard' }
  | { name: 'songbook' }
  | { name: 'bands' }
  | { name: 'band'; id: string }
  | { name: 'bandChat'; id: string }
  | { name: 'live'; code: string }
  | { name: 'follow'; code: string }
  | { name: 'remote'; setlistId: string }
  | { name: 'share'; data: string; shortId?: string }
  | { name: 'cgu' }
  | { name: 'report' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const parts = path.split('/').filter((p) => p !== '');
  switch (parts[0]) {
    case undefined:
      return { name: 'library' };
    case 'song':
      if (parts[1] === 'new') return { name: 'songEdit', id: null };
      if (parts[1] && parts[2] === 'edit')
        return { name: 'songEdit', id: parts[1] };
      if (parts[1]) return { name: 'song', id: parts[1] };
      return { name: 'library' };
    case 'import':
      // #/import/bulk ouvre directement l'import en masse (parcours d'un
      // nouvel entrant qui migre toute sa collection, b295).
      return { name: 'import', mode: parts[1] === 'bulk' ? 'bulk' : undefined };
    case 'setlists':
      return { name: 'setlists' };
    case 'setlist':
      if (parts[1] === 'new') return { name: 'setlistEdit', id: null };
      // Lecture d'un morceau DANS sa setlist : #/setlist/:id/song/:index
      if (parts[1] && parts[2] === 'song' && parts[3] !== undefined) {
        return {
          name: 'songInSet',
          setlistId: parts[1],
          index: Math.max(0, parseInt(parts[3], 10) || 0),
        };
      }
      // Vue d'ensemble imprimable : #/setlist/:id/apercu
      if (parts[1] && parts[2] === 'apercu') {
        return { name: 'setlist', id: parts[1] };
      }
      // Écran dédié Sono & scène : #/setlist/:id/sono
      if (parts[1] && parts[2] === 'sono') {
        return { name: 'setlistSono', id: parts[1] };
      }
      // Par défaut, ouvrir une setlist = l'éditer directement.
      if (parts[1]) return { name: 'setlistEdit', id: parts[1] };
      return { name: 'setlists' };
    case 'stage':
      if (parts[1] === 'song' && parts[2])
        return { name: 'stage', setlistId: null, songId: parts[2], index: 0 };
      // Le mode scène s'ouvre SUR le morceau qu'on regardait (b164) :
      // /stage/:setlistId/:index — sans index, on démarre au début.
      return {
        name: 'stage',
        setlistId: parts[1] ?? null,
        songId: null,
        index: Math.max(0, Number(parts[2] ?? 0) || 0),
      };
    case 'concerts':
      return { name: 'concerts' };
    case 'concert':
      return { name: 'concert', id: parts[1] === 'new' ? null : (parts[1] ?? null) };
    case 'artist':
      return { name: 'artist' };
    case 'reglages':
      return { name: 'settings' };
    case 'tableau-de-bord':
      return { name: 'dashboard' };
    case 'export-pdf':
      return { name: 'songbook' };
    case 'bands':
      return { name: 'bands' };
    case 'band':
      if (parts[1] && parts[2] === 'chat')
        return { name: 'bandChat', id: parts[1] };
      if (parts[1]) return { name: 'band', id: parts[1] };
      return { name: 'artist' };
    case 'live':
      return { name: 'live', code: parts[1] ?? '' };
    case 'follow':
      return { name: 'follow', code: parts[1] ?? '' };
    case 'remote':
      if (parts[1]) return { name: 'remote', setlistId: parts[1] };
      return { name: 'setlists' };
    case 's':
      return { name: 'share', data: parts.slice(1).join('/') };
    case 'p':
      // Lien court : le contenu est chargé depuis le serveur
      return { name: 'share', data: '', shortId: parts[1] ?? '' };
    case 'cgu':
      return { name: 'cgu' };
    case 'report':
      return { name: 'report' };
    default:
      return { name: 'library' };
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string): void {
  location.hash = path.startsWith('/') ? '#' + path : '#/' + path;
}

export function goBack(): void {
  history.back();
}
