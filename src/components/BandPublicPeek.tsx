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

import { Modal } from './ui';
import { useToast } from './Feedback';
import { getValidSession } from '../lib/auth';
import {
  fetchBandPageName,
  fetchPublicPage,
  publierFicheGroupe,
  PublicPage,
} from '../lib/publicPages';
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
  const toast = useToast();
  const { artist } = useStore();
  const [adresse, setAdresse] = useState<string | null>(null);
  const [page, setPage] = useState<PublicPage | null>(null);
  const [charge, setCharge] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      const nom = await fetchBandPageName(band.cloudId ?? '');
      if (annule) return;
      setAdresse(nom);
      if (nom !== '') {
        // Rafraîchir avant de montrer : sans quoi on regarderait une fiche
        // publiée au dernier enregistrement de profil, pas celle d'aujourd'hui.
        const s = await getValidSession();
        if (s) await publierFicheGroupe(s, band, artist);
        if (annule) return;
        const p = await fetchPublicPage(nom);
        if (!annule) setPage(p);
      }
      if (!annule) setCharge(true);
    })();
    return () => {
      annule = true;
    };
    // Une seule visite = un seul rafraîchissement : on ne republie pas la
    // fiche à chaque frappe dans le nom du groupe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band.cloudId]);

  const lien = adresse ? `${location.origin}/${adresse}` : '';

  async function copier() {
    try {
      await navigator.clipboard.writeText(lien);
      toast.show(t('Lien copié.'));
    } catch {
      toast.show(t('Copie impossible — sélectionne le lien à la main.'));
    }
  }

  return (
    <Modal
      title={t('Page publique de {nom}', { nom: band.name || t('ce groupe') })}
      onClose={onClose}
    >
      {band.hiddenFromPublic === true ? (
        <p className="help" style={{ marginTop: 0 }}>
          {t(
            'Ce groupe est masqué au public : il n’a pas d’adresse, et aucun direct ne peut être lancé à son nom. Retire le masquage depuis l’onglet Groupes pour lui en donner une.',
          )}
        </p>
      ) : !charge ? (
        <p className="help" style={{ marginTop: 0 }}>{t('Chargement…')}</p>
      ) : adresse === '' ? (
        <p className="help" style={{ marginTop: 0 }}>
          {t(
            'Ce groupe n’a pas encore d’adresse publique. Le créateur peut lui en donner une depuis « Modifier ».',
          )}
        </p>
      ) : (
        <>
          <div className="hstack" style={{ gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
              {lien.replace(/^https?:\/\//, '')}
            </code>
            <button
              className="btn ghost small"
              style={{ flexShrink: 0 }}
              onClick={() => void copier()}
            >
              {t('Copier')}
            </button>
          </div>
          <p className="help">
            {t(
              'Cette adresse ouvre la page du groupe. Pendant un direct du groupe, elle mène au concert — comme ton QR.',
            )}
          </p>
          <div className="spacer" />
          {page === null ? (
            <p className="help">
              {t(
                'La page n’a pas pu être chargée. Elle existe peut-être quand même : réessaie avec du réseau.',
              )}
            </p>
          ) : (
            <div className="pubframe" style={{ textAlign: 'center' }}>
              {page.profile.photo ? (
                <img
                  src={page.profile.photo}
                  alt=""
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    objectFit: 'cover',
                  }}
                />
              ) : null}
              <h3 style={{ margin: '8px 0 4px' }}>
                {page.profile.name || t('(sans nom)')}
              </h3>
              {page.profile.bio ? (
                <p style={{ whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>
                  {page.profile.bio}
                </p>
              ) : (
                <p className="help" style={{ margin: '0 0 8px' }}>
                  {t('(aucune présentation)')}
                </p>
              )}
              {(page.profile.publicMembers ?? []).length > 0 && (
                <p className="help" style={{ margin: '0 0 8px' }}>
                  {(page.profile.publicMembers ?? [])
                    .map((m) => m.name)
                    .join(' · ')}
                </p>
              )}
              {(page.profile.links ?? []).length > 0 && (
                <div className="chips" style={{ justifyContent: 'center' }}>
                  {(page.profile.links ?? []).map((l, i) => (
                    <span className="chip static" key={i}>
                      {l.label || t('Lien')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
      <div className="spacer" />
      <button className="btn ghost block" onClick={onClose}>
        {t('Fermer')}
      </button>
    </Modal>
  );
}
