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
 * Rappel du modèle (b227) : un groupe n'a pas de page à lui. Son adresse est
 * un MIROIR vers la page de son détenteur — c'est donc bien cette page-là
 * qu'on montre, et c'est ce que verra quiconque tape l'adresse du groupe.
 */
import React, { useEffect, useState } from 'react';

import { Modal } from './ui';
import { useToast } from './Feedback';
import { fetchBandPageName, fetchPublicPage, PublicPage } from '../lib/publicPages';
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
        const p = await fetchPublicPage(nom);
        if (!annule) setPage(p);
      }
      if (!annule) setCharge(true);
    })();
    return () => {
      annule = true;
    };
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
              'Cette adresse montre la page de celui qui tient le groupe — c’est le même concert que ton QR pendant un direct.',
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
