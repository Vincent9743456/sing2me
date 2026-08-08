/**
 * Mot du public aux musiciens (engagement). Chargé en différé — jamais
 * avant l'affichage des paroles.
 */
import React, { useState } from 'react';

import { t } from '../../i18n';
import { sendMessage } from '../../lib/live';

export default function MessageBox({
  songTitle = '',
  liveId = '',
  artist = '',
}: {
  songTitle?: string;
  liveId?: string;
  /** Artiste dont on regarde la page : propriétaire du mot hors direct. */
  artist?: string;
}) {
  const [name, setName] = useState(
    () => localStorage.getItem('sing2me/fanName') ?? '',
  );
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Raison technique d'un refus : JAMAIS montrée à un spectateur. Elle
  // n'apparaît que si la page est ouverte avec ?diag=1 — c'est le seul moyen
  // de diagnostiquer un livre d'or muet sans console sur un téléphone.
  const [detail, setDetail] = useState('');
  const diag = (() => {
    try {
      return new URLSearchParams(location.search).get('diag') === '1';
    } catch {
      return false;
    }
  })();
  // Livre d'or indisponible sur cette installation : on masque la boîte au
  // lieu d'exposer une erreur technique au public (b137). Mémorisé pour ne
  // pas la reproposer à chaque morceau du concert.
  // Clé changée en b168 : un spectateur qui avait rencontré le livre d'or
  // en panne l'avait masqué DÉFINITIVEMENT sur son téléphone. La nouvelle clé
  // rend la boîte à tout le monde une fois la panne corrigée.
  const [available, setAvailable] = useState(
    () => localStorage.getItem('sing2me/guestbookOff2') === null,
  );

  async function onSend() {
    if (text.trim() === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await sendMessage(
        name.trim(),
        text.trim(),
        liveId,
        songTitle,
        artist,
      );
      if (res === 'unavailable') {
        try {
          localStorage.setItem('sing2me/guestbookOff2', '1');
        } catch {
          /* stockage indisponible : on masque au moins pour cette page */
        }
        setAvailable(false);
        return;
      }
      localStorage.setItem('sing2me/fanName', name.trim());
      setSent(true);
      setText('');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("L'envoi a échoué — réessaie dans un instant."),
      );
      setDetail(
        (e as Error & { detail?: string })?.detail ?? '',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!available) return null;

  return (
    <div className="tipbox">
      <div className="tiptitle">
        {songTitle !== ''
          ? t('💬 Un mot sur « {title} » ?', { title: songTitle })
          : t('💬 Un mot pour les musiciens ?')}
      </div>
      {sent ? (
        <>
          <p style={{ margin: '6px 0', fontWeight: 650 }}>
            {t('✅ Message transmis aux musiciens — merci ! 🎸')}
          </p>
          <button className="btn ghost small" onClick={() => setSent(false)}>
            {t('Envoyer un autre mot')}
          </button>
        </>
      ) : (
        <>
          <input
            type="text"
            value={name}
            placeholder={t('Ton prénom (optionnel)')}
            style={{ marginBottom: 8 }}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            value={text}
            placeholder={t('Bravo pour ce concert !…')}
            style={{ minHeight: 70, marginBottom: 8 }}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="btn"
            disabled={text.trim() === '' || busy}
            onClick={() => void onSend()}
          >
            {busy ? t('Envoi…') : t('Envoyer')}
          </button>
          {error && (
            <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>
          )}
          {diag && detail !== '' && (
            <p
              style={{
                marginTop: 6,
                fontFamily: 'monospace',
                fontSize: '0.72rem',
                color: 'var(--text-faint)',
                wordBreak: 'break-word',
              }}
            >
              {detail}
            </p>
          )}
        </>
      )}
    </div>
  );
}
