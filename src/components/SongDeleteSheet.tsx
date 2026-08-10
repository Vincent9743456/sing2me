/**
 * LA FEUILLE DE SUPPRESSION D'UN MORCEAU (b239).
 *
 * Supprimer ne veut pas dire la même chose selon d'où vient le morceau
 * (voir `src/lib/deletesong.ts`). Cette feuille dit CE QUI VA SE PASSER,
 * dans les trois cas, et c'est la SEULE façon de proposer la suppression
 * d'un morceau : sinon un écran finirait par promettre « supprimé » là où
 * l'app garde une proposition, ou par offrir un bouton qui ne fait rien.
 *
 * Elle interroge la même fonction que le store, donc l'annonce et l'effet ne
 * peuvent pas diverger.
 */
import React from 'react';

import { ConfirmSheet, Sheet } from './Feedback';
import { sortDuMorceau } from '../lib/deletesong';
import { useStore } from '../store';
import { t } from '../i18n';
import { Song } from '../types';

export function SongDeleteSheet({
  song,
  onDeleted,
  onClose,
}: {
  song: Song;
  /** Appelé seulement quand le morceau a VRAIMENT quitté la bibliothèque
   *  ou les morceaux joués — pour fermer l'écran, désélectionner, etc. */
  onDeleted?: () => void;
  onClose: () => void;
}) {
  const { setlists, bands, deleteSong } = useStore();
  const sort = sortDuMorceau(song, setlists);
  const titre = song.title || t('ce morceau');
  const nomDuGroupe = (id: string) =>
    bands.find((b) => b.id === id)?.name || t('ton groupe');

  // Programmé dans une setlist du GROUPE : rien à confirmer, il n'y a pas
  // d'issue ici. On explique, et on donne le chemin qui existe vraiment.
  if (sort.mode === 'refus') {
    return (
      <Sheet
        title={t('« {title} » est au programme', { title: titre })}
        onClose={onClose}
      >
        <p className="help" style={{ marginTop: 0 }}>
          {t(
            'Ce morceau est dans la setlist « {setlist} » de {groupe}. Tant qu’il y est, tu ne peux pas le supprimer : le programme engage les autres musiciens, pas seulement toi.',
            { setlist: sort.setlist, groupe: nomDuGroupe(sort.bandId) },
          )}
        </p>
        <p className="help">
          {t('Retire-le d’abord de la setlist, puis reviens ici.')}
        </p>
        <button className="btn block" onClick={onClose}>
          {t('J’ai compris')}
        </button>
      </Sheet>
    );
  }

  // Morceau du répertoire d'un groupe : il ne disparaît pas, il retourne
  // d'où il vient — les Idées. On le DIT, sinon la promesse est fausse.
  if (sort.mode === 'idee') {
    return (
      <ConfirmSheet
        title={t('Retirer « {title} » de tes morceaux ?', { title: titre })}
        message={t(
          'Il vient du répertoire de {groupe} : il ne sera pas effacé, il retournera dans tes Idées, en proposition. Tu pourras le reprendre quand tu veux.',
          { groupe: nomDuGroupe(sort.bandId) },
        )}
        confirmLabel={t('Remettre en proposition')}
        onConfirm={() => {
          deleteSong(song.id);
          onDeleted?.();
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <ConfirmSheet
      title={t('Supprimer « {title} » ?', { title: titre })}
      message={t('Le morceau sera aussi retiré des setlists.')}
      confirmLabel={t('Supprimer')}
      danger
      onConfirm={() => {
        deleteSong(song.id);
        onDeleted?.();
      }}
      onClose={onClose}
    />
  );
}
