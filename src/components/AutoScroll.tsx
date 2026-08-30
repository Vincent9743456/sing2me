/**
 * Défilement automatique à vitesse réglable, pour lire une partition
 * en jouant. Utilisable sur la fenêtre entière ou sur un élément.
 *
 * La vitesse est MÉMORISÉE : par morceau (`memoryKey`) — chaque chanson
 * a son tempo de lecture — avec la dernière vitesse utilisée comme
 * valeur par défaut pour les morceaux jamais réglés.
 */
import { useEffect, useRef, useState } from 'react';

import { Icon } from './Icon';
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
 * Commande flottante sur le bord droit, toujours accessible (au début du
 * morceau comme en plein défilement), sans masquer la partition.
 *
 * b481 (demande de Vincent : « le rendre plus visible et compréhensible ») :
 * le rond gris « ⇣ » ne disait ni la fonction ni comment l'arrêter. Le
 * bouton principal est une pastille verticale qui porte un MOT — « Défiler »
 * à l'arrêt, « Pause » (sur fond ambre, l'état actif existant) quand la
 * partition avance. ＋ / − ne changent pas : ils n'apparaissent qu'en
 * marche, au-dessus et en dessous.
 */
export function AutoScrollFab({
  scroll,
}: {
  scroll: ReturnType<typeof useAutoScroll>;
}) {
  return (
    <div className="scrollfab">
      {scroll.active && (
        <button
          onClick={scroll.faster}
          title={t('Plus vite')}
          aria-label={t('Plus vite')}
        >
          ＋
        </button>
      )}
      <button
        className={`sf-main${scroll.active ? ' active' : ''}`}
        onClick={scroll.toggle}
        title={t('Défilement automatique')}
        aria-label={
          scroll.active
            ? t('Arrêter le défilement')
            : t('Faire défiler la partition toute seule')
        }
        aria-pressed={scroll.active}
      >
        <Icon name={scroll.active ? 'pause' : 'autoscroll'} size={19} />
        <span className="sf-label">
          {scroll.active ? t('Pause') : t('Défiler')}
        </span>
      </button>
      {scroll.active && (
        <button
          onClick={scroll.slower}
          title={t('Moins vite')}
          aria-label={t('Moins vite')}
        >
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
        aria-pressed={scroll.active}
        onClick={scroll.toggle}
      >
        <Icon name={scroll.active ? 'pause' : 'autoscroll'} size={16} />{' '}
        {scroll.active ? t('Pause') : t('Défiler')}
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
