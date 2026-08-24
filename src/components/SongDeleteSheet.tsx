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
import React, { useState } from 'react';

import { ConfirmSheet, Sheet } from './Feedback';
import { sortDuMorceau } from '../lib/deletesong';
import { versionForBand } from '../lib/model';
import { songKey } from '../lib/importer';
import {
  auRepertoire,
  retireDuRepertoire,
  texteRetrait,
} from '../lib/retraitgroupe';
import { useStore } from '../store';
import { t } from '../i18n';
import { Band, Song } from '../types';

export function SongDeleteSheet({
  song: songDeLEcran,
  band = null,
  onDeleted,
  onClose,
}: {
  song: Song;
  /**
   * Le répertoire de groupe qu'on est en train de regarder (b279, demande de
   * Vincent : « appuyer sur la corbeille doit préciser si l'intention est de
   * supprimer totalement le morceau ou uniquement le retirer du groupe »).
   *
   * Depuis une vue de répertoire, la corbeille est ambiguë — et la mauvaise
   * réponse coûte cher : on efface un morceau alors qu'on voulait seulement
   * le sortir d'un groupe. On demande donc l'INTENTION avant, au lieu de la
   * deviner. Ailleurs (`null`), il n'y a pas d'ambiguïté : rien ne change.
   */
  band?: Band | null;
  /** Appelé seulement quand le morceau a VRAIMENT quitté la bibliothèque
   *  ou les morceaux joués — pour fermer l'écran, désélectionner, etc. */
  onDeleted?: () => void;
  onClose: () => void;
}) {
  const {
    songs,
    setlists,
    bands,
    deleteSong,
    saveSong,
    recordBandRemoval,
    retirerProposition,
  } = useStore();
  /**
   * LE MORCEAU DU STORE, PAS CELUI DE L'ÉCRAN (b279). Les listes passent
   * parfois une copie CONTEXTUELLE — réduite à la version affichée — et un
   * écran qui annonce ce qu'il va supprimer doit compter sur la vraie
   * donnée : sinon il promet « 1 version » et en efface trois.
   */
  const song = songs.find((x) => x.id === songDeLEcran.id) ?? songDeLEcran;
  /** On a demandé l'intention et l'utilisateur a choisi « supprimer ». */
  const [suppression, setSuppression] = useState(false);
  const [retrait, setRetrait] = useState(false);
  /** La sortie d'une proposition (b421) : retrait du répertoire confirmé. */
  const [retraitProposition, setRetraitProposition] = useState(false);
  // Avec MES groupes (b281) : un rattachement orphelin ne doit pas faire
  // passer un morceau personnel pour un morceau de répertoire.
  const sort = sortDuMorceau(song, setlists, bands);
  const titre = song.title || t('ce morceau');
  const nomDuGroupe = (id: string) =>
    bands.find((b) => b.id === id)?.name || t('ton groupe');
  /** Deux intentions possibles : on demande, on ne devine pas. */
  const ambigu =
    band !== null && auRepertoire(song, band.id) && !suppression && !retrait;

  if (retrait && band !== null) {
    const txt = texteRetrait(song, band);
    return (
      <ConfirmSheet
        title={txt.titre}
        message={txt.message}
        confirmLabel={txt.libelle}
        danger
        onConfirm={() => {
          saveSong(retireDuRepertoire(song, band.id));
          recordBandRemoval(band.id, songKey(song.title, song.artist));
          onDeleted?.();
          onClose();
        }}
        onClose={onClose}
      />
    );
  }

  if (ambigu && band !== null) {
    return (
      <Sheet title={t('« {title} » — que veux-tu faire ?', { title: titre })} onClose={onClose}>
        <p className="help" style={{ marginTop: 0 }}>
          {t(
            'Tu regardes le répertoire de {groupe}. Retirer du répertoire et supprimer le morceau ne sont pas la même chose — dis-moi laquelle.',
            { groupe: band.name || t('ce groupe') },
          )}
        </p>
        <button className="btn block" onClick={() => setRetrait(true)}>
          ↩ {t('Le retirer du répertoire de {band}', { band: band.name || t('ce groupe') })}
        </button>
        <p className="help">
          {t('Il reste dans ta bibliothèque — tu continues de le jouer en solo.')}
        </p>
        <div className="spacer" />
        <button
          className="btn ghost block"
          style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
          onClick={() => setSuppression(true)}
        >
          🗑 {t('Supprimer le morceau…')}
        </button>
        <p className="help">
          {t('Là, il quitte ta bibliothèque. L’écran suivant dit exactement ce qui se passe.')}
        </p>
        {/* UNE QUESTION A TOUJOURS UNE SORTIE (b283, demande de Vincent).
            Cette feuille est la seule à en proposer DEUX sans proposer de ne
            rien faire : les ConfirmSheet ont leur « Annuler », celle du refus
            son « J'ai compris ». Le fond ferme bien, mais sur un téléphone la
            feuille occupe presque tout l'écran — il n'y a plus de fond à
            toucher, et rien ne dit qu'on peut renoncer. */}
        <div className="spacer" />
        <button className="btn ghost block" onClick={onClose}>
          {t('Annuler')}
        </button>
      </Sheet>
    );
  }

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

  // UNE PROPOSITION NE SE REFUSE PAS (b418, arbitrage Vincent — remplace
  // l'écartée de b240, qui laissait les deux côtés se raconter une
  // histoire différente). Rien à confirmer : on explique le modèle, et le
  // seul geste qui existe est ailleurs — « ✓ Accepter ».
  if (sort.mode === 'proposition') {
    // Une proposition vient d'une PERSONNE (b420, règle de Vincent) — on la
    // nomme quand la provenance est connue ; sinon on dit d'où vient le
    // morceau, jamais « proposé par un groupe ».
    const qui = versionForBand(song, sort.bandId)?.par?.nom ?? '';
    const groupe = nomDuGroupe(sort.bandId);
    // LA SORTIE (b421, constat de Vincent : « je ne peux pas les supprimer
    // alors que c'est moi qui les ai envoyés ») : retirer le morceau du
    // répertoire du groupe — l'acte de niveau groupe auquel tout membre a
    // droit (b110), et celui que b418 décrivait déjà comme la fin d'une
    // proposition. Second geste + confirmation : il touche tout le groupe.
    if (retraitProposition) {
      return (
        <ConfirmSheet
          title={t('Retirer « {title} » du répertoire de {band} ?', {
            title: titre,
            band: groupe,
          })}
          message={t(
            'Le morceau quittera le répertoire pour TOUT le groupe. Ceux qui l’ont accepté gardent leur copie personnelle ; chez les autres — toi compris — la proposition disparaît.',
          )}
          confirmLabel={t('Retirer du répertoire')}
          danger
          onConfirm={() => {
            retirerProposition(song.id);
            onDeleted?.();
            onClose();
          }}
          onClose={onClose}
        />
      );
    }
    return (
      <Sheet
        title={t('« {title} » est une proposition', { title: titre })}
        onClose={onClose}
      >
        <p className="help" style={{ marginTop: 0 }}>
          {qui !== ''
            ? t(
                'Ce morceau t’est proposé par {qui} pour le répertoire de {groupe}. Une proposition ne se supprime pas : elle attend simplement ton acceptation — et elle disparaîtra d’elle-même si le groupe la retire de son répertoire.',
                { qui, groupe },
              )
            : t(
                'Ce morceau vient du répertoire de {groupe}. Une proposition ne se supprime pas : elle attend simplement ton acceptation — et elle disparaîtra d’elle-même si le groupe la retire de son répertoire.',
                { groupe },
              )}
        </p>
        <button className="btn block" onClick={onClose}>
          {t('J’ai compris')}
        </button>
        <p className="help">
          {t(
            'Tu l’avais apporté toi-même, ou il n’a plus sa place ? Retire-le du répertoire du groupe :',
          )}
        </p>
        <button
          className="btn ghost block"
          style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
          onClick={() => setRetraitProposition(true)}
        >
          ↩ {t('Le retirer du répertoire de {band}', { band: groupe })}
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
          'Il vient du répertoire de {groupe} : il ne sera pas effacé, il retournera dans tes propositions. Tu pourras le reprendre quand tu veux.',
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

  /* ON DIT CE QU'ON EMPORTE (b279, demande de Vincent : « préciser que toutes
     les versions seront supprimées »). Le chiffre doit être sous les yeux
     AVANT, pas découvert après.
     Mesuré en écrivant le test : on n'arrive ici QUE pour un morceau qui
     n'appartient à aucun répertoire de groupe — sinon la règle de b239 a
     déjà pris la main plus haut, et rien n'est supprimé du tout. Le décompte
     ne porte donc jamais sur des versions de groupe : annoncer « dont N de
     groupe » aurait décrit un cas qui ne se produit pas. */
  const total = song.versions.length;
  return (
    <ConfirmSheet
      title={t('Supprimer « {title} » ?', { title: titre })}
      message={
        total > 1
          ? t(
              'Ses {n} versions seront supprimées, et le morceau quittera aussi les setlists.',
              { n: total },
            )
          : t('Le morceau sera aussi retiré des setlists.')
      }
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
