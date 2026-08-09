/**
 * Rappel de sauvegarde — discret, et surtout PAS ANXIOGÈNE.
 *
 * Consigne de Vincent. Ce qui distingue un rappel utile d'une alarme :
 *
 *  - il parle de GARDER, jamais de perdre. Aucun mot sur la panne, le
 *    risque ou la disparition — celui qui lit veut jouer de la musique,
 *    pas penser à un sinistre ;
 *  - il emprunte le ton d'une bonne idée, pas d'un avertissement : couleur
 *    d'accent, jamais le rouge ni l'ambre réservés aux vrais ennuis ;
 *  - « Plus tard » est une vraie réponse, à égalité avec « Enregistrer »,
 *    et elle vaut trois mois de silence ;
 *  - il ne se montre qu'à qui a quelque chose à garder, et jamais dans les
 *    premiers jours. Les règles de silence vivent dans `lib/backup.ts`.
 *
 * Une seule ligne + deux boutons : c'est un encart, pas une carte de plus
 * dans une pile (règle 5 du design system).
 */
import React from 'react';

import { t } from '../i18n';
import { rappelSauvegarde } from '../lib/backup';
import { navigate } from '../router';
import { AppState, useStore } from '../store';

/** Trois mois de silence après un « Plus tard ». */
const SILENCE_JOURS = 90;

export function BackupNudge() {
  const store = useStore();
  const etat: AppState = {
    songs: store.songs,
    setlists: store.setlists,
    concerts: store.concerts,
    bands: store.bands,
    artist: store.artist,
    prefs: store.prefs,
    deleted: store.deleted,
    bandRemovals: store.bandRemovals,
    resetAt: store.resetAt,
  };
  const rappel = rappelSauvegarde(etat);
  if (rappel === null) return null;

  function plusTard() {
    const d = new Date();
    d.setDate(d.getDate() + SILENCE_JOURS);
    store.savePrefs({ ...store.prefs, backupSnoozeUntil: d.toISOString() });
  }

  return (
    <div
      className="card"
      style={{ borderColor: 'var(--accent-dark)', marginBottom: 'var(--sp-3)' }}
    >
      <strong>
        {rappel.quoi === 'jamais'
          ? t('💾 Garde une copie de ta bibliothèque')
          : t('💾 Ta copie a un peu vieilli')}
      </strong>
      <p className="help" style={{ margin: '4px 0 10px' }}>
        {rappel.quoi === 'jamais'
          ? t(
              '{n} morceaux. Un fichier que tu gardes chez toi, sur ton téléphone — deux secondes.',
              { n: rappel.morceaux },
            )
          : t(
              'La dernière date d’il y a {mois} mois, et tu as ajouté {n} morceaux depuis.',
              { mois: rappel.depuis, n: rappel.ajoutes },
            )}
      </p>
      <div className="rowactions" style={{ flexWrap: 'wrap' }}>
        <button className="btn small" onClick={() => navigate('/reglages')}>
          {rappel.quoi === 'jamais'
            ? t('Enregistrer une sauvegarde')
            : t('Mettre à jour')}
        </button>
        <button className="btn ghost small" onClick={plusTard}>
          {t('Plus tard')}
        </button>
      </div>
    </div>
  );
}
