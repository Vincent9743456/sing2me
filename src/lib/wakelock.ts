/**
 * Anti-veille (Wake Lock) : l'écran reste allumé tant que la page est
 * visible — indispensable en concert. Jamais bloquant : si le navigateur
 * refuse (batterie faible, non supporté), on continue sans.
 *
 * Note : une application web ne peut pas couper les appels ni les
 * notifications — c'est le mode « Ne pas déranger » du téléphone qui s'en
 * charge (voir l'astuce affichée dans les vues de concert).
 */
import { useEffect } from 'react';

export function useWakeLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    let lock: { release: () => Promise<void> } | null = null;
    let live = true;
    async function acquire() {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: {
            request: (t: 'screen') => Promise<{ release: () => Promise<void> }>;
          };
        };
        if (nav.wakeLock && live) lock = await nav.wakeLock.request('screen');
      } catch {
        // non bloquant
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
      if (lock) void lock.release();
    };
  }, [active]);
}
