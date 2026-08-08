/**
 * Défilement automatique à vitesse réglable, pour lire une partition
 * en jouant. Utilisable sur la fenêtre entière ou sur un élément.
 *
 * La vitesse est MÉMORISÉE : par morceau (`memoryKey`) — chaque chanson
 * a son tempo de lecture — avec la dernière vitesse utilisée comme
 * valeur par défaut pour les morceaux jamais réglés.
 */
import { useEffect, useRef, useState } from 'react';

import { t } from '../i18n';

const GLOBAL_KEY = 'sing2me/scrollSpeed';
const MIN_SPEED = 10;
const MAX_SPEED = 150;

function readSpeed(memoryKey?: string): number {
  try {
    const per =
      memoryKey !== undefined && memoryKey !== ''
        ? localStorage.getItem(`sing2me/scroll/${memoryKey}`)
        : null;
    const v = per ?? localStorage.getItem(GLOBAL_KEY);
    const n = v !== null ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) && n >= MIN_SPEED && n <= MAX_SPEED ? n : 30;
  } catch {
    return 30;
  }
}

function writeSpeed(value: number, memoryKey?: string): void {
  try {
    localStorage.setItem(GLOBAL_KEY, String(value));
    if (memoryKey !== undefined && memoryKey !== '') {
      localStorage.setItem(`sing2me/scroll/${memoryKey}`, String(value));
    }
  } catch {
    /* stockage indisponible : la vitesse reste pour la session */
  }
}

export function useAutoScroll(
  target?: React.RefObject<HTMLElement | null>,
  /** Identifiant de mémorisation (id du morceau) */
  memoryKey?: string,
) {
  const [active, setActive] = useState(false);
  const [speed, setSpeed] = useState(() => readSpeed(memoryKey)); // px/s

  // Changement de morceau (navigation dans une setlist) → sa vitesse
  useEffect(() => {
    setSpeed(readSpeed(memoryKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryKey]);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      acc += speed * dt;
      if (acc >= 1) {
        const px = Math.floor(acc);
        acc -= px;
        const el = target?.current;
        if (el) el.scrollTop += px;
        else window.scrollBy(0, px);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, speed, target]);

  const adjust = (delta: number) =>
    setSpeed((s) => {
      const next = Math.min(MAX_SPEED, Math.max(MIN_SPEED, s + delta));
      writeSpeed(next, memoryKey);
      return next;
    });

  return {
    active,
    speed,
    toggle: () => setActive((a) => !a),
    stop: () => setActive(false),
    slower: () => adjust(-10),
    faster: () => adjust(10),
  };
}

/**
 * Commande flottante : discrète sur le bord droit, toujours accessible
 * (au début du morceau comme en plein défilement), sans masquer la partition.
 */
export function AutoScrollFab({
  scroll,
}: {
  scroll: ReturnType<typeof useAutoScroll>;
}) {
  return (
    <div className="scrollfab">
      {scroll.active && (
        <button onClick={scroll.faster} title={t('Plus vite')}>
          ＋
        </button>
      )}
      <button
        className={scroll.active ? 'active' : ''}
        onClick={scroll.toggle}
        title={t('Défilement automatique')}
      >
        {scroll.active ? '⏸' : '⇣'}
      </button>
      {scroll.active && (
        <button onClick={scroll.slower} title={t('Moins vite')}>
          −
        </button>
      )}
    </div>
  );
}

export function AutoScrollControls({
  scroll,
}: {
  scroll: ReturnType<typeof useAutoScroll>;
}) {
  return (
    <>
      <button
        className={`btn ${scroll.active ? '' : 'ghost'}`}
        title={t('Défilement automatique')}
        onClick={scroll.toggle}
      >
        {scroll.active ? '⏸' : '⇣'} {t('Défil.')}
      </button>
      {scroll.active && (
        <>
          <button className="btn ghost" onClick={scroll.slower}>
            −
          </button>
          <button className="btn ghost" onClick={scroll.faster}>
            ＋
          </button>
        </>
      )}
    </>
  );
}
