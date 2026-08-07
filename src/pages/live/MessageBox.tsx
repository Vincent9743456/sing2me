/**
 * Mot du public aux musiciens (engagement). Chargé en différé — jamais
 * avant l'affichage des paroles.
 */
import React, { useState } from 'react';

import { sendMessage } from '../../lib/live';

export default function MessageBox({
  songTitle = '',
  liveId = '',
}: {
  songTitle?: string;
  liveId?: string;
}) {
  const [name, setName] = useState(
    () => localStorage.getItem('sing2me/fanName') ?? '',
  );
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Livre d'or indisponible sur cette installation : on masque la boîte au
  // lieu d'exposer une erreur technique au public (b137). Mémorisé pour ne
  // pas la reproposer à chaque morceau du concert.
  const [available, setAvailable] = useState(
    () => localStorage.getItem('sing2me/guestbookOff') === null,
  );

  async function onSend() {
    if (text.trim() === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await sendMessage(name.trim(), text.trim(), liveId, songTitle);
      if (res === 'unavailable') {
        try {
          localStorage.setItem('sing2me/guestbookOff', '1');
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
          : "L'envoi a échoué — réessaie dans un instant.",
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
          ? `💬 Un mot sur « ${songTitle} » ?`
          : '💬 Un mot pour les musiciens ?'}
      </div>
      {sent ? (
        <>
          <p style={{ margin: '6px 0', fontWeight: 650 }}>
            ✅ Message transmis aux musiciens — merci ! 🎸
          </p>
          <button className="btn ghost small" onClick={() => setSent(false)}>
            Envoyer un autre mot
          </button>
        </>
      ) : (
        <>
          <input
            type="text"
            value={name}
            placeholder="Ton prénom (optionnel)"
            style={{ marginBottom: 8 }}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            value={text}
            placeholder="Bravo pour ce concert !…"
            style={{ minHeight: 70, marginBottom: 8 }}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="btn"
            disabled={text.trim() === '' || busy}
            onClick={() => void onSend()}
          >
            {busy ? 'Envoi…' : 'Envoyer'}
          </button>
          {error && (
            <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>
          )}
        </>
      )}
    </div>
  );
}
