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
import { Icon } from './Icon';
import { t } from '../i18n';
import { Song } from '../types';

/** L'œil, dans la rangée d'actions du morceau. Bascule la partition. */
export function PublicEye({
  actif,
  onToggle,
}: {
  actif: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className={`chip ${actif ? '' : 'off'}`}
      aria-pressed={actif}
      title={t('Lire le morceau comme le liront tes spectateurs')}
      onClick={onToggle}
    >
      👁 {t('Vue du public')}
    </button>
  );
}

/** Le panneau qui remplace la partition : ce que lisent les spectateurs. */
export function PublicView({
  song,
  onClose,
}: {
  song: Song;
  onClose: () => void;
}) {
  const texte = parolesPubliques(song);
  const vide = texte.trim() === '';
  return (
    <div className="pubview">
      <div className="pubview-head">
        <span>👁 {t('Ce que verra le public')}</span>
        <button className="btn ghost small" onClick={onClose}>
          <Icon name="x" size={12} /> {t('Ma partition')}
        </button>
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
