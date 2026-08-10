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
import { fetchBandPageName, publierFicheGroupe } from '../lib/publicPages';
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
  const { artist } = useStore();
  const [adresse, setAdresse] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    void (async () => {
      const nom = await fetchBandPageName(band.cloudId ?? '');
      if (!annule) setAdresse(nom);
    })();
    return () => {
      annule = true;
    };
  }, [band.cloudId]);

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
          : t(
              'Ce groupe n’a pas encore d’adresse publique. Le créateur peut lui en donner une depuis « Modifier ».',
            )
      }
      onClose={onClose}
    />
  );
}
