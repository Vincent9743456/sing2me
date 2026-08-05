/**
 * Routeur minimaliste basé sur le hash (#/…) : fonctionne sur n'importe
 * quel hébergement statique (Vercel) sans configuration serveur.
 */
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'library' }
  | { name: 'song'; id: string }
  | { name: 'songEdit'; id: string | null }
  | { name: 'import' }
  | { name: 'setlists' }
  | { name: 'setlist'; id: string | null }
  | { name: 'songInSet'; setlistId: string; index: number }
  | { name: 'stage'; setlistId: string | null; songId: string | null }
  | { name: 'concerts' }
  | { name: 'concert'; id: string | null }
  | { name: 'artist' }
  | { name: 'band'; id: string }
  | { name: 'bandChat'; id: string }
  | { name: 'live' }
  | { name: 'follow' }
  | { name: 'remote'; setlistId: string }
  | { name: 'share'; data: string; shortId?: string }
  | { name: 'cgu' };

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
      return { name: 'import' };
    case 'setlists':
      return { name: 'setlists' };
    case 'setlist':
      // Lecture d'un morceau DANS sa setlist : #/setlist/:id/song/:index
      if (parts[1] && parts[2] === 'song' && parts[3] !== undefined) {
        return {
          name: 'songInSet',
          setlistId: parts[1],
          index: Math.max(0, parseInt(parts[3], 10) || 0),
        };
      }
      return { name: 'setlist', id: parts[1] === 'new' ? null : (parts[1] ?? null) };
    case 'stage':
      if (parts[1] === 'song' && parts[2])
        return { name: 'stage', setlistId: null, songId: parts[2] };
      return { name: 'stage', setlistId: parts[1] ?? null, songId: null };
    case 'concerts':
      return { name: 'concerts' };
    case 'concert':
      return { name: 'concert', id: parts[1] === 'new' ? null : (parts[1] ?? null) };
    case 'artist':
      return { name: 'artist' };
    case 'band':
      if (parts[1] && parts[2] === 'chat')
        return { name: 'bandChat', id: parts[1] };
      if (parts[1]) return { name: 'band', id: parts[1] };
      return { name: 'artist' };
    case 'live':
      return { name: 'live' };
    case 'follow':
      return { name: 'follow' };
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
