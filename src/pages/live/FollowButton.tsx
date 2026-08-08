/**
 * « Suivre l'artiste » (fanbase V1, consentement RGPD). Brique d'engagement
 * chargée en différé — jamais avant l'affichage des paroles.
 */
import React, { useState } from 'react';

import { t } from '../../i18n';
import { followArtist } from '../../lib/fanbase';

export default function FollowButton({ artistName }: { artistName: string }) {
  const [open, setOpen] = useState(false);
  const [followed, setFollowed] = useState(() => {
    if (artistName === '') return false;
    try {
      const list = JSON.parse(
        localStorage.getItem('sing2me/following') ?? '[]',
      ) as string[];
      return list.includes(artistName);
    } catch {
      return false;
    }
  });
  const [email, setEmail] = useState(
    () => localStorage.getItem('sing2me/fanEmail') ?? '',
  );
  const [consent, setConsent] = useState(false);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (artistName === '') return null;

  function rememberLocal() {
    try {
      const list = JSON.parse(
        localStorage.getItem('sing2me/following') ?? '[]',
      ) as string[];
      if (!list.includes(artistName)) {
        localStorage.setItem(
          'sing2me/following',
          JSON.stringify([...list, artistName]),
        );
      }
    } catch {
      /* stockage indisponible */
    }
  }

  async function submit() {
    if (busy || !consent || !email.includes('@')) return;
    setBusy(true);
    setError(null);
    try {
      await followArtist(artistName, email.trim(), share);
      localStorage.setItem('sing2me/fanEmail', email.trim());
      rememberLocal();
      setFollowed(true);
      setOpen(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('Le suivi a échoué — réessaie.'),
      );
    } finally {
      setBusy(false);
    }
  }

  if (followed) {
    return (
      <div style={{ textAlign: 'center', margin: '14px 0' }}>
        <button className="btn ghost" disabled>
          {t('✓ Tu suis {name}', { name: artistName })}
        </button>
        <p className="help" style={{ marginTop: 6 }}>
          {t('Tu seras prévenu(e) de ses prochains concerts.')}
        </p>
      </div>
    );
  }

  return (
    <div style={{ margin: '14px 0' }}>
      {!open ? (
        <div style={{ textAlign: 'center' }}>
          <button className="btn" onClick={() => setOpen(true)}>
            {t('⭐ Suivre {name}', { name: artistName })}
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="label" style={{ marginBottom: 6 }}>
            {t('⭐ Suivre {name}', { name: artistName })}
          </div>
          <input
            type="email"
            value={email}
            placeholder={t('Ton email')}
            autoCapitalize="none"
            autoCorrect="off"
            style={{ marginBottom: 8 }}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label
            style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}
          >
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              style={{ width: 'auto', marginTop: 3 }}
            />
            <span className="help" style={{ margin: 0 }}>
              {t(
                'Je souhaite recevoir les actualités de {name} (prochains concerts). Désabonnement possible à tout moment.',
                { name: artistName },
              )}
            </span>
          </label>
          <label
            style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}
          >
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => setShare(e.target.checked)}
              style={{ width: 'auto', marginTop: 3 }}
            />
            <span className="help" style={{ margin: 0 }}>
              {t('Partager mon email avec {name} (facultatif).', {
                name: artistName,
              })}
            </span>
          </label>
          <button
            className="btn block"
            disabled={busy || !consent || !email.includes('@')}
            onClick={() => void submit()}
          >
            {busy ? '…' : t('Suivre')}
          </button>
          {error && (
            <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
