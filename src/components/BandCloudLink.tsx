/**
 * RÉSOLVEUR DES LIENS D'E-MAIL DE GROUPE (b446, demande de Vincent : « un
 * mail délivré à un membre du groupe doit comporter un lien permettant
 * d'accéder à l'événement »).
 *
 * Le facteur (server/notify.js) ne connaît un groupe que par son id CLOUD ;
 * l'app, elle, navigue par id LOCAL. Cette page fait le pont : elle
 * retrouve le groupe sur l'appareil et ouvre sa DISCUSSION — c'est là que
 * vivent messages ET morceaux proposés (b174), donc là que mène tout
 * résumé. Si le groupe n'est pas (encore) là — nouveau téléphone, synchro
 * en cours —, on laisse quelques secondes à la synchro, puis on retombe
 * sur l'onglet Groupes : un lien d'e-mail n'ouvre jamais une page morte.
 */
import React, { useEffect } from 'react';

import { TopBar } from './ui';
import { t } from '../i18n';
import { navigate } from '../router';
import { useStore } from '../store';

export function BandCloudLink({ cloudId }: { cloudId: string }) {
  const { bands } = useStore();
  const cible =
    cloudId !== ''
      ? bands.find((b) => (b.cloudId ?? '') === cloudId)
      : undefined;

  useEffect(() => {
    if (cible) {
      navigate(`/band/${cible.id}/chat`);
      return;
    }
    // La synchro peut livrer le groupe dans les secondes qui viennent
    // (l'effet se rejoue dès qu'il apparaît) ; au-delà, l'onglet Groupes
    // est la meilleure destination — les invitations en attente y vivent.
    const echeance = window.setTimeout(() => navigate('/bands'), 8000);
    return () => window.clearTimeout(echeance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cible?.id]);

  return (
    <>
      <TopBar title={t('Groupes')} live={false} />
      <div className="page">
        <p className="help" style={{ textAlign: 'center' }}>
          {t('Ouverture du groupe…')}
        </p>
      </div>
    </>
  );
}
