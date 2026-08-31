/**
 * Signalement de contenu (chantier 3 — paquet défensif).
 * Formulaire simple (URL concernée, motif, contact) transmis aux fondateurs.
 * Accessible en pied des pages publiques et depuis les CGU.
 */
import React, { useState } from 'react';

import { TopBar } from '../components/ui';
import { t } from '../i18n';
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
          : t("L'envoi a échoué — réessaie dans un instant."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar title={t('Signaler un contenu')} onBack={() => navigate('/cgu')} />
      <div className="page">
        {sent ? (
          <div className="card" style={{ marginTop: 0 }}>
            <h2 style={{ marginTop: 0 }}>{t('✅ Signalement transmis')}</h2>
            <p>
              {t(
                "Merci. Chaque signalement est examiné : la diffusion publique d'un contenu qui ne devrait pas s'y trouver peut être coupée rapidement.",
              )}
            </p>
            <button className="btn block" onClick={() => navigate('/')}>
              {t("Revenir à l'accueil")}
            </button>
          </div>
        ) : (
          <>
            {/* b487 : le signalement porte sur ce qui est PUBLIC — mojosong
                ne consulte pas les bibliothèques privées, il n'y a donc pas
                de « retrait de contenu » à promettre : ce qu'on coupe, c'est
                la DIFFUSION (page, direct, lien de partage). */}
            <p className="help">
              {t(
                "Un contenu accessible publiquement via mojosong pose problème (droits d'auteur, contenu inapproprié…) ? Signale-le avec son adresse : chaque demande est examinée, et la diffusion publique d'un contenu qui ne devrait pas s'y trouver peut être coupée rapidement.",
              )}
            </p>
            <div className="field">
              <label>{t('Adresse concernée')}</label>
              <input
                type="text"
                value={url}
                placeholder="https://…"
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="field">
              <label>{t('Motif du signalement')}</label>
              <textarea
                value={reason}
                placeholder={t('Décris le problème (contenu, droits, etc.)')}
                style={{ minHeight: 110 }}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="field">
              <label>{t('Ton contact (facultatif — pour te répondre)')}</label>
              <input
                type="text"
                value={contact}
                placeholder={t('Email ou nom')}
                onChange={(e) => setContact(e.target.value)}
              />
            </div>
            <button
              className="btn block"
              disabled={reason.trim() === '' || busy}
              onClick={() => void submit()}
            >
              {busy ? t('Envoi…') : t('Envoyer le signalement')}
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
