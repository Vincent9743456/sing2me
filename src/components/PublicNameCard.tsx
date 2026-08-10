/**
 * Adresse publique dictable de l'artiste (chantier 4, revue b137).
 *
 * Le nom est réservé AUTOMATIQUEMENT depuis le nom d'artiste (b136) ; cette
 * carte sert à le voir, et à en CHANGER tant que le nom visé est libre.
 * Changer d'adresse casse les QR déjà imprimés : la confirmation le dit.
 */
import React, { useEffect, useState } from 'react';
import { useStore } from '../store';

import { ConfirmSheet } from './Feedback';
import { getValidSession } from '../lib/auth';
import {
  claimPublicPage,
  profilAPublier,
  publierFichesGroupes,
  fetchMyPublicName,
  isPublicNameFree,
  publicPagesAvailable,
  rememberPublicName,
} from '../lib/publicPages';
import { normalizePublicName, publicNameError } from '../lib/publicName';
import { ArtistProfile } from '../types';
import { t } from '../i18n';

export function PublicNameCard({ artist }: { artist: ArtistProfile }) {
  // Les groupes non masqués voyagent avec la fiche (b231).
  const { bands } = useStore();
  const [claimed, setClaimed] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Disponibilité du nom saisi : null = pas (encore) de réponse.
  const [free, setFree] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmMove, setConfirmMove] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await getValidSession();
      if (!s || cancelled) return;
      setUserId(s.userId);
      const name = await fetchMyPublicName(s);
      if (cancelled) return;
      if (name) {
        setClaimed(name);
        setInput(name);
        rememberPublicName(name);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const normalized = normalizePublicName(input);
  const formatError = normalized === '' ? null : publicNameError(normalized);
  const isCurrent = claimed !== null && normalized === claimed;

  // Vérification de disponibilité au fil de la frappe (400 ms) : l'artiste
  // sait AVANT de valider si l'adresse visée est libre.
  useEffect(() => {
    if (normalized === '' || formatError !== null || isCurrent) {
      setFree(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    // `timer` : évite de masquer la fonction de traduction `t`.
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await isPublicNameFree(normalized, userId);
        setFree(res);
        setChecking(false);
      })();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [normalized, formatError, isCurrent, userId]);

  if (!publicPagesAvailable()) return null;

  const base = `${location.origin}/`;
  const host = base.replace(/^https?:\/\//, '');

  async function publish() {
    if (busy) return;
    const name = normalizePublicName(input);
    const err = publicNameError(name);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const s = await getValidSession();
      if (!s) {
        setError(
          t('Connecte-toi d’abord (onglet Artiste) pour réserver ton nom.'),
        );
        return;
      }
      await claimPublicPage(s, name, await profilAPublier(artist, bands));
      await publierFichesGroupes(s, bands, artist);
      setClaimed(name);
      rememberPublicName(name);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('La réservation a échoué.'));
    } finally {
      setBusy(false);
    }
  }

  /** Changer d'adresse casse les QR déjà imprimés → on confirme d'abord. */
  function onValidate() {
    if (claimed !== null && !isCurrent) setConfirmMove(true);
    else void publish();
  }

  return (
    <div className="card">
      <div className="label" style={{ marginBottom: 6 }}>
        {t('🔗 Ton adresse publique')}
      </div>
      {claimed !== null ? (
        <p className="help" style={{ marginTop: 0 }}>
          {t('Ton adresse actuelle — celle que ton QR ouvre, et que tu peux annoncer au micro :')}{' '}
          <strong style={{ color: 'var(--accent)' }}>
            {host}
            {claimed}
          </strong>
        </p>
      ) : (
        <p className="help" style={{ marginTop: 0 }}>
          {t(
            'Une adresse simple à dire au public (« tape {host}tonnom ») — minuscules, sans espaces ni accents.',
            { host },
          )}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="help" style={{ margin: 0 }}>
          {host}
        </span>
        <input
          type="text"
          value={input}
          placeholder={t('tonnom')}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => {
            setInput(e.target.value);
            setSaved(false);
            setError(null);
          }}
        />
      </div>
      {formatError && (
        <p className="help" style={{ color: 'var(--danger)', marginTop: 6 }}>
          {formatError}
        </p>
      )}
      {!formatError && normalized !== '' && !isCurrent && (
        <p className="help" style={{ marginTop: 6 }}>
          {checking
            ? '…'
            : free === true
              ? t('✓ {addr} est libre', { addr: `${host}${normalized}` })
              : free === false
                ? t('Déjà pris — essaie {name}2 ou autre chose.', {
                    name: normalized,
                  })
                : t('Ta future adresse : {addr}', {
                    addr: `${host}${normalized}`,
                  })}
        </p>
      )}
      <div className="spacer" />
      <button
        className="btn block"
        disabled={busy || normalized === '' || !!formatError || free === false}
        onClick={onValidate}
      >
        {busy
          ? '…'
          : claimed === null
            ? t('Réserver cette adresse')
            : isCurrent
              ? t('Republier ma fiche')
              : t('Changer mon adresse')}
      </button>
      {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
      {saved && (
        <p style={{ color: 'var(--accent)', marginTop: 8, fontWeight: 650 }}>
          {t('✓ En ligne : {addr}', { addr: `${host}${claimed}` })}
        </p>
      )}

      {confirmMove && (
        <ConfirmSheet
          title={t('Passer à {addr} ?', { addr: `${host}${normalized}` })}
          message={t(
            'Ton ancienne adresse ({addr}) ne mènera plus à ta page : les QR déjà imprimés et les liens partagés cesseront de fonctionner. Il faudra réimprimer ton QR.',
            { addr: `${host}${claimed}` },
          )}
          confirmLabel={t('Changer mon adresse')}
          onConfirm={() => void publish()}
          onClose={() => setConfirmMove(false)}
        />
      )}
    </div>
  );
}
