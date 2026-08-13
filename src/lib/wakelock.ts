/**
 * Anti-veille (Wake Lock) : l'écran reste allumé tant que la page est
 * visible — indispensable en concert (mode scène, direct, page publique
 * suivie). Jamais bloquant : si le navigateur refuse (batterie faible, non
 * supporté), on continue sans.
 *
 * Trois reprises, parce qu'iOS lâche le verrou facilement :
 *  · au retour au premier plan (`visibilitychange`) — appel, notification,
 *    bouton d'accueil ;
 *  · quand le sentinelle émet `release` alors que l'écran est TOUJOURS
 *    visible (iOS le relâche parfois sur une interruption brève sans changer
 *    la visibilité) ;
 *  · à chaque montage du composant qui l'utilise.
 *
 * Ce que ça NE peut PAS faire : passer outre le mode « Économie d'énergie »
 * d'iOS, qui REFUSE la demande — l'écran se remet alors en veille, et aucune
 * application web ne peut l'en empêcher. De même, on ne coupe ni les appels
 * ni les notifications : c'est « Ne pas déranger » qui s'en charge (astuce
 * affichée dans les vues de concert).
 */
import { useEffect } from 'react';

type Sentinel = {
  release: () => Promise<void>;
  addEventListener?: (type: 'release', cb: () => void) => void;
  removeEventListener?: (type: 'release', cb: () => void) => void;
};

export function useWakeLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    let lock: Sentinel | null = null;
    let live = true;
    const onRelease = () => {
      // iOS relâche parfois le verrou sur une interruption brève SANS
      // changement de visibilité : on le reprend si l'écran est là.
      if (live && document.visibilityState === 'visible') void acquire();
    };
    async function acquire() {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: 'screen') => Promise<Sentinel> };
        };
        if (!nav.wakeLock || !live) return;
        lock?.removeEventListener?.('release', onRelease);
        lock = await nav.wakeLock.request('screen');
        lock.addEventListener?.('release', onRelease);
      } catch {
        // refusé (économie d'énergie, non supporté…) : non bloquant
      }
    }
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.removeEventListener?.('release', onRelease);
      if (lock) void lock.release();
    };
  }, [active]);
}
