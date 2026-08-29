/**
 * BANNIÈRE « CE MORCEAU IRA AU RÉPERTOIRE DE {GROUPE} » (b472, point 1).
 *
 * Le ＋ de Morceaux en contexte groupe peut lancer la CRÉATION d'un morceau
 * destiné au répertoire (marqueur de session, consommé par store.saveSong à
 * la validation). Une intention qui agit sans se voir serait un piège : la
 * bannière l'affiche pendant tout le trajet de création — import, recherche,
 * collage — et s'écarte d'un geste (règle 11 : toute bannière a une sortie).
 * Le marqueur est relu à CHAQUE rendu : levé ailleurs (retour bibliothèque,
 * import en masse), la bannière disparaît d'elle-même.
 */
import React, { useState } from 'react';

import {
  leverNouveauPourGroupe,
  lireNouveauPourGroupe,
} from '../lib/nouveaupourgroupe';
import { t } from '../i18n';
import { useStore } from '../store';

export function BandeauPourGroupe() {
  const { bands } = useStore();
  const [, rafraichir] = useState(0);
  const bandId = lireNouveauPourGroupe();
  const band = bands.find((b) => b.id === bandId);
  if (!band) return null;
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        marginBottom: 'var(--sp-3)',
      }}
    >
      <span className="help" style={{ flex: 1, margin: 0 }}>
        {t(
          'Ce morceau sera ajouté au répertoire de {band} dès son enregistrement.',
          { band: band.name || t('groupe') },
        )}
      </span>
      <button
        className="btn ghost small"
        title={t('Ne pas l’ajouter au groupe')}
        onClick={() => {
          leverNouveauPourGroupe();
          rafraichir((n) => n + 1);
        }}
      >
        ✕
      </button>
    </div>
  );
}
