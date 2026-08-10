/**
 * LE GROUPE FACE AU PUBLIC (b227, décisions de Vincent).
 *
 * Deux réglages, et un seul écran pour les deux, parce qu'ils répondent à la
 * même question : « est-ce que ce groupe existe pour mes spectateurs ? ».
 *
 *  1. **MASQUER AU PUBLIC.** « Un groupe que je fais à l'occasion avec un
 *     pote, avec qui on ne fait pas de concert, n'a pas vocation à être
 *     exposé. » Masqué, il disparaît des identités publiques ET on ne peut
 *     plus lancer de direct à son nom — sinon le masquer ne servirait à
 *     rien, un seul concert suffirait à l'exposer. C'est un choix PERSONNEL,
 *     jamais partagé avec les autres membres : c'est ma page publique.
 *
 *  2. **L'ADRESSE DU GROUPE.** Un groupe n'a pas de QR à lui — le QR est celui
 *     de l'artiste, et c'est l'artiste qui décide au lancement de ce que voit
 *     le public. Mais le groupe a une adresse, et depuis b232 cette adresse
 *     ouvre SA page : sa photo, sa présentation, ses liens, ses musiciens
 *     (« ça devrait renvoyer vers la page Zakoustiks, pas la mienne »). Elle
 *     se donne à l'oral (« tape …/zakoustiks ») ; pendant un direct de groupe,
 *     elle mène au concert, comme le QR du lanceur.
 *     Réservée au détenteur — la base le vérifie, pas seulement cet écran —
 *     et elle suit le groupe s'il est transmis, sans rien à recopier.
 */
import React, { useEffect, useState } from 'react';

import { ConfirmSheet } from './Feedback';
import { getValidSession } from '../lib/auth';
import {
  claimBandPage,
  fetchBandPageName,
  publicPagesAvailable,
  publierFicheGroupe,
  releaseBandPage,
} from '../lib/publicPages';
import { normalizePublicName, publicNameError } from '../lib/publicName';
import { useStore } from '../store';
import { t } from '../i18n';
import { Band } from '../types';

export function BandPublicCard({
  band,
  onSave,
}: {
  band: Band;
  onSave: (band: Band) => void;
}) {
  const { artist } = useStore();
  const masque = band.hiddenFromPublic === true;
  const cloudId = band.cloudId ?? '';
  const estDetenteur = band.owned !== false;

  const [adresse, setAdresse] = useState('');
  const [saisie, setSaisie] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [confirmMasquer, setConfirmMasquer] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      const n = await fetchBandPageName(cloudId);
      if (annule) return;
      setAdresse(n);
      setSaisie(n === '' ? normalizePublicName(band.name) : n);
    })();
    return () => {
      annule = true;
    };
  }, [cloudId, band.name]);

  /** Masquer retire l'adresse : masqué avec une adresse publique = mensonge. */
  async function masquer() {
    onSave({ ...band, hiddenFromPublic: true });
    if (adresse !== '' && cloudId !== '') {
      const s = await getValidSession();
      if (s) {
        await releaseBandPage(s, cloudId);
        setAdresse('');
      }
    }
  }

  async function reserver() {
    if (busy) return;
    const nom = normalizePublicName(saisie);
    const err = publicNameError(nom);
    if (err) {
      setErreur(err);
      return;
    }
    setBusy(true);
    setErreur(null);
    setOk(false);
    try {
      const s = await getValidSession();
      if (!s) {
        setErreur(t('Connecte-toi d’abord (onglet Artiste).'));
        return;
      }
      await claimBandPage(s, cloudId, nom);
      // Une adresse qui n'ouvrirait rien ne servirait à personne : la fiche
      // du groupe part dans la foulée (b232).
      await publierFicheGroupe(s, band, artist);
      setAdresse(nom);
      setOk(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t('La réservation a échoué.'));
    } finally {
      setBusy(false);
    }
  }

  const hote = `${location.host}/`;

  return (
    <div className="card">
      <h2 className="pagetitle" style={{ marginTop: 0 }}>
        {t('Ce groupe et le public')}
      </h2>

      <label className="hstack" style={{ padding: '6px 0', cursor: 'pointer', gap: 10 }}>
        <input
          type="checkbox"
          checked={masque}
          onChange={() => {
            if (masque) onSave({ ...band, hiddenFromPublic: undefined });
            else setConfirmMasquer(true);
          }}
        />
        <span style={{ flex: 1 }}>
          {t('Masquer ce groupe au public')}{' '}
          <span className="help" style={{ display: 'inline' }}>
            —{' '}
            {t(
              'il n’apparaît pas sur ta fiche publique, et tu ne peux pas lancer de direct à son nom',
            )}
          </span>
        </span>
      </label>

      {confirmMasquer && (
        <ConfirmSheet
          title={t('Masquer « {nom} » au public ?', {
            nom: band.name || t('ce groupe'),
          })}
          message={t(
            'Il disparaît de tes identités publiques et son adresse est retirée. Tes morceaux, tes setlists et les autres membres ne changent pas — et ce choix ne concerne que toi.',
          )}
          confirmLabel={t('Masquer')}
          onConfirm={() => {
            setConfirmMasquer(false);
            void masquer();
          }}
          onClose={() => setConfirmMasquer(false)}
        />
      )}

      {masque ? (
        <p className="help">
          {t(
            'Groupe masqué : rien de ce qui le concerne n’est proposé au public.',
          )}
        </p>
      ) : !publicPagesAvailable() || cloudId === '' ? (
        <p className="help">
          {t(
            'Publie le groupe (invite un musicien) pour lui donner une adresse publique.',
          )}
        </p>
      ) : !estDetenteur ? (
        <p className="help">
          {adresse !== ''
            ? `${hote}${adresse} — ${t('adresse choisie par le créateur du groupe')}`
            : t('Seul le créateur du groupe peut lui donner une adresse.')}
        </p>
      ) : (
        <>
          <p className="help" style={{ marginTop: 0 }}>
            {t(
              'Une adresse à dicter (« tape {hote}legroupe »). Elle ouvre la page du groupe — sa photo, sa présentation, ses musiciens — et pendant un direct du groupe, elle mène au concert, comme ton QR.',
              { hote },
            )}
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="help" style={{ margin: 0, whiteSpace: 'nowrap' }}>
              {hote}
            </span>
            <input
              type="text"
              value={saisie}
              placeholder="legroupe"
              aria-label={t('Adresse publique du groupe')}
              onChange={(e) => {
                setSaisie(e.target.value);
                setOk(false);
                setErreur(null);
              }}
            />
            <button
              className="btn small"
              style={{ flexShrink: 0 }}
              disabled={busy || normalizePublicName(saisie) === adresse}
              onClick={() => void reserver()}
            >
              {busy ? t('…') : adresse === '' ? t('Réserver') : t('Changer')}
            </button>
          </div>
          {erreur !== null && (
            <p className="help" style={{ color: 'var(--danger)' }}>
              {erreur}
            </p>
          )}
          {ok && <p className="help">{t('✓ Adresse enregistrée.')}</p>}
          {adresse !== '' && !ok && (
            <p className="help">
              {t('Adresse actuelle :')} <strong>{hote}{adresse}</strong>
            </p>
          )}
        </>
      )}
    </div>
  );
}
