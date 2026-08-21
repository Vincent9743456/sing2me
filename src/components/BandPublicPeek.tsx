/**
 * LA PAGE PUBLIQUE D'UN GROUPE, VUE DEPUIS SA FICHE (b230, demande de
 * Vincent : « il faut pouvoir consulter la page publique des groupes depuis
 * la fiche du Groupe »).
 *
 * On ne QUITTE pas l'app pour ça (règle b187) : dans l'app installée sur
 * iPhone, une page ouverte hors du cadre ne laisse aucun retour. La page se
 * RECOPIE donc ici, telle que la voit un visiteur, et son adresse se copie
 * pour être dictée ou envoyée.
 *
 * Modèle CORRIGÉ en b232 : le groupe a bien une page à LUI — « ça devrait
 * renvoyer vers la page Zakoustiks, pas la mienne » (Vincent). Le renvoi
 * vers le détenteur ne concerne plus que le DIRECT : le QR reste unique,
 * c'est celui du lanceur. La fiche du groupe est donc republiée à
 * l'ouverture de cet aperçu (par son détenteur seulement) : ce qu'on regarde
 * ici est exactement ce que verra un visiteur, à l'instant présent.
 */
import React, { useEffect, useState } from 'react';

import { PublicPagePeek } from './PublicPagePeek';
import { getValidSession } from '../lib/auth';
import { ensureCloudBand } from '../lib/bands';
import {
  ensureBandPage,
  fetchBandPageName,
  publierFicheGroupe,
} from '../lib/publicPages';
import { normalizePublicName, publicNameError } from '../lib/publicName';
import { useStore } from '../store';
import { t } from '../i18n';
import { Band } from '../types';

export function BandPublicPeek({
  band,
  onClose,
}: {
  band: Band;
  onClose: () => void;
}) {
  const { artist, saveBand } = useStore();
  const [adresse, setAdresse] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    void (async () => {
      // L'adresse se crée toute seule d'après le nom du groupe (b271) : cet
      // écran ne dit plus « pas encore d'adresse — le créateur peut lui en
      // donner une », il la MONTRE. On lit d'abord (un membre voit l'adresse
      // sans pouvoir la réserver), on ne réserve qu'à défaut.
      let cid = band.cloudId ?? '';
      let bandPourPage = band;
      let nom = cid !== '' ? await fetchBandPageName(cid) : '';
      if (nom === '' && band.owned === true && band.hiddenFromPublic !== true) {
        const s = await getValidSession();
        if (s) {
          /**
           * UN GROUPE JAMAIS PUBLIÉ A QUAND MÊME DROIT À SA PAGE (b376,
           * constat de Vincent : « le groupe a pourtant un nom » face au
           * message d'erreur). Un groupe créé seul, sans personne d'invité,
           * n'a pas de cloudId — et `ensureBandPage` rendait '' sans un
           * mot, que l'écran maquillait en problème de NOM. On publie donc
           * le groupe ici. Sans risque b213 : il est à moi (`owned`) et n'a
           * JAMAIS été publié — le corollaire interdit seulement de
           * republier un groupe qui ne m'appartient plus.
           */
          if (cid === '') {
            try {
              const ref = await ensureCloudBand(s, band.id, band.name);
              cid = ref.cloudId;
              bandPourPage = { ...band, cloudId: cid };
              // Rattachement dérivé du serveur : pas de tamponneBand (b373).
              saveBand(bandPourPage);
            } catch {
              /* hors ligne ou serveur muet : le message le dira */
            }
          }
          if (cid !== '') nom = await ensureBandPage(s, bandPourPage);
        }
      }
      if (!annule) setAdresse(nom);
    })();
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band.cloudId]);

  // La VRAIE raison d'une absence d'adresse (b376) : le message « nom trop
  // court » ne s'affiche que si le nom est réellement en cause.
  const base = normalizePublicName(band.name ?? '');
  const nomEnCause = base === '' || publicNameError(base) !== null;

  return (
    <PublicPagePeek
      titre={t('Page publique de {nom}', { nom: band.name || t('ce groupe') })}
      adresse={band.hiddenFromPublic === true ? '' : adresse}
      publier={async () => {
        const s = await getValidSession();
        if (s) await publierFicheGroupe(s, band, artist);
      }}
      sansAdresse={
        band.hiddenFromPublic === true
          ? t(
              'Ce groupe est masqué au public : il n’a pas d’adresse, et aucun direct ne peut être lancé à son nom. Retire le masquage depuis l’onglet Groupes pour lui en donner une.',
            )
          : band.owned === true
            ? nomEnCause
              ? t(
                  'Le nom de ce groupe ne permet pas d’en tirer une adresse (il faut au moins 3 lettres ou chiffres). Donne-lui-en une depuis « Modifier ».',
                )
              : t(
                  'L’adresse n’a pas pu être créée — vérifie ta connexion et rouvre cet aperçu.',
                )
            : t(
                'Ce groupe n’a pas encore d’adresse publique. Son créateur peut lui en donner une.',
              )
      }
      onClose={onClose}
    />
  );
}
