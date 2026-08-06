/**
 * Signalement de contenu (chantier 3 — paquet défensif).
 * Formulaire simple (URL concernée, motif, contact) transmis aux fondateurs.
 * Accessible en pied des pages publiques et depuis les CGU.
 */
import React, { useState } from 'react';

import { TopBar } from '../components/ui';
import { navigate } from '../router';

export function Report() {
  const [url, setUrl] = useState(
    () => (typeof location !== 'undefined' ? location.href : ''),
  );
  const [reason, setReason] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (reason.trim() === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/fan?fn=report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: url.trim().slice(0, 500),
          reason: reason.trim().slice(0, 4000),
          contact: contact.trim().slice(0, 200),
        }),
      });
      const type = res.headers.get('content-type') ?? '';
      const body = type.includes('application/json') ? await res.json() : {};
      if (!res.ok || body.error) {
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      setSent(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "L'envoi a échoué — réessaie dans un instant.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar title="Signaler un contenu" onBack={() => navigate('/cgu')} />
      <div className="page">
        {sent ? (
          <div className="card" style={{ marginTop: 0 }}>
            <h2 style={{ marginTop: 0 }}>✅ Signalement transmis</h2>
            <p>
              Merci. Nous examinons chaque signalement et retirons rapidement
              tout contenu qui doit l'être.
            </p>
            <button className="btn block" onClick={() => navigate('/')}>
              Revenir à l'accueil
            </button>
          </div>
        ) : (
          <>
            <p className="help">
              Repère un contenu qui ne devrait pas être là (droits d'auteur,
              contenu inapproprié…) ? Signale-le : nous nous engageons à
              examiner chaque demande et à retirer rapidement ce qui doit
              l'être.
            </p>
            <div className="field">
              <label>Adresse concernée</label>
              <input
                type="text"
                value={url}
                placeholder="https://…"
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Motif du signalement</label>
              <textarea
                value={reason}
                placeholder="Décris le problème (contenu, droits, etc.)"
                style={{ minHeight: 110 }}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Ton contact (facultatif — pour te répondre)</label>
              <input
                type="text"
                value={contact}
                placeholder="Email ou nom"
                onChange={(e) => setContact(e.target.value)}
              />
            </div>
            <button
              className="btn block"
              disabled={reason.trim() === '' || busy}
              onClick={() => void submit()}
            >
              {busy ? 'Envoi…' : 'Envoyer le signalement'}
            </button>
            {error && (
              <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>
            )}
          </>
        )}
      </div>
    </>
  );
}
