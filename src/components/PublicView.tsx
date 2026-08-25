/**
 * VUE DU PUBLIC — LECTURE SEULE (b302, précision de Vincent).
 *
 * b294 avait retiré la RETOUCHE du texte public (« ça introduit une
 * complexité ») — mais avec elle avait disparu la simple CONSULTATION, qui,
 * elle, doit rester : l'artiste veut voir ce que ses spectateurs liront
 * (paroles seules, préparées depuis la partition), pour se rassurer avant un
 * concert. Ici on REGARDE, on ne corrige pas : pour changer ce que voit le
 * public, on modifie la partition générale.
 *
 * Même rendu que le vrai écran du public (`PublicLyrics` + `parolesPubliques`),
 * pour que l'aperçu et la diffusion ne puissent pas diverger.
 */
import React from 'react';

import { PublicLyrics } from './PublicLyrics';
import { parolesPubliques } from '../lib/publiclyrics';
import { t } from '../i18n';
import { Song } from '../types';

/**
 * VRAI BASCULE À DEUX SEGMENTS (b428, passe UX de Vincent) : les deux états
 * se lisent en permanence — « Ma partition | Vue du public » — et l'actif se
 * voit. Remplace le couple pastille « Vue du public » / bouton « ✕ Ma
 * partition », qui disait la même chose avec deux vocabulaires.
 */
export function VueToggle({
  actif,
  onChange,
}: {
  actif: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <span className="segtoggle" role="group" aria-label={t('Vue affichée')}>
      <button
        className={actif ? 'off' : ''}
        aria-pressed={!actif}
        onClick={() => onChange(false)}
      >
        {t('Ma partition')}
      </button>
      <button
        className={actif ? '' : 'off'}
        aria-pressed={actif}
        title={t('Lire le morceau comme le liront tes spectateurs')}
        onClick={() => onChange(true)}
      >
        👁 {t('Vue du public')}
      </button>
    </span>
  );
}

/** Le panneau qui remplace la partition : ce que lisent les spectateurs. */
export function PublicView({
  song,
}: {
  song: Song;
  /** Conservé pour compatibilité d'appel — la sortie passe par le bascule. */
  onClose?: () => void;
}) {
  const texte = parolesPubliques(song);
  const vide = texte.trim() === '';
  return (
    <div className="pubview">
      <div className="pubview-head">
        <span>👁 {t('Ce que verra le public')}</span>
      </div>
      <div className="pubframe">
        {vide ? (
          <p className="help" style={{ textAlign: 'center', margin: 0 }}>
            {t(
              'Aucune parole à afficher — le public verra l’écran de concert sans texte.',
            )}
          </p>
        ) : (
          <PublicLyrics text={texte} style={{ marginTop: 0 }} />
        )}
      </div>
      <p className="help">
        {t(
          'Préparé automatiquement depuis ta partition : les accords sont retirés, les sections rappelées. Pour changer ce que lit le public, modifie la partition.',
        )}
      </p>
    </div>
  );
}
