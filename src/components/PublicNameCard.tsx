/**
 * Réservation du NOM PUBLIC dictable de l'artiste (chantier 4).
 * L'artiste choisit un nom (minuscules, sans espaces ni accents), unique,
 * et obtient une URL simple à dicter : livemyband.fr/lenom (domaine actuel
 * pour l'instant). Publie sa fiche publique (page ouverte par le lien / QR).
 */
import React, { useEffect, useState } from 'react';

import { getValidSession } from '../lib/auth';
import {
  claimPublicPage,
  fetchMyPublicName,
  publicPagesAvailable,
} from '../lib/publicPages';
import { normalizePublicName, publicNameError } from '../lib/publicName';
import { ArtistProfile } from '../types';

export function PublicNameCard({ artist }: { artist: ArtistProfile }) {
  const [claimed, setClaimed] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await getValidSession();
      if (!s || cancelled) return;
      const name = await fetchMyPublicName(s);
      if (cancelled) return;
      if (name) {
        setClaimed(name);
        setInput(name);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!publicPagesAvailable()) return null;

  const normalized = normalizePublicName(input);
  const formatError = normalized === '' ? null : publicNameError(normalized);
  const base = `${location.origin}/`;

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
        setError('Connecte-toi d’abord (onglet Artiste) pour réserver ton nom.');
        return;
      }
      await claimPublicPage(s, name, artist);
      setClaimed(name);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La réservation a échoué.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="label" style={{ marginBottom: 6 }}>
        🔗 Ton lien public dictable
      </div>
      <p className="help" style={{ marginTop: 0 }}>
        Un nom simple à dire au public (« tape {base.replace(/^https?:\/\//, '')}
        tonnom ») — minuscules, sans espaces ni accents.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="help" style={{ margin: 0 }}>
          {base.replace(/^https?:\/\//, '')}
        </span>
        <input
          type="text"
          value={input}
          placeholder="tonnom"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => {
            setInput(e.target.value);
            setSaved(false);
          }}
        />
      </div>
      {normalized !== '' && (
        <p className="help" style={{ marginTop: 6 }}>
          Ton lien : <strong>{base}{normalized}</strong>
        </p>
      )}
      {formatError && (
        <p className="help" style={{ color: 'var(--danger)', marginTop: 6 }}>
          {formatError}
        </p>
      )}
      <div className="spacer" />
      <button
        className="btn block"
        disabled={busy || normalized === '' || !!formatError}
        onClick={() => void publish()}
      >
        {busy
          ? '…'
          : claimed === normalized && claimed !== null
            ? 'Republier ma fiche'
            : 'Réserver ce nom'}
      </button>
      {error && (
        <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>
      )}
      {saved && (
        <p style={{ color: 'var(--accent)', marginTop: 8, fontWeight: 650 }}>
          ✓ En ligne : {base}
          {claimed}
        </p>
      )}
    </div>
  );
}
