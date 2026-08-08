/**
 * Mot du public aux musiciens (engagement). Chargé en différé — jamais
 * avant l'affichage des paroles.
 */
import React, { useEffect, useState } from 'react';

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
  /**
   * Livre d'or en panne : on le DIT (b190).
   *
   * Jusqu'ici la boîte disparaissait sans un mot — l'intention était de ne
   * pas montrer d'erreur technique au public (b137), le résultat était pire :
   * le spectateur tapait son message, appuyait sur Envoyer, et le formulaire
   * s'évanouissait. Rien n'arrivait chez l'artiste et personne ne pouvait le
   * savoir. C'est le scénario le plus probable du mot que Vincent n'a jamais
   * reçu.
   *
   * Le masquage était en plus MÉMORISÉ sur l'appareil : une panne d'une
   * minute condamnait le livre d'or pour toujours sur ce téléphone. On ne
   * mémorise plus rien — la panne d'un soir ne vaut pas condamnation.
   */
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    // Efface le masquage posé par les versions précédentes : un téléphone qui
    // a croisé la panne une fois n'affichait plus JAMAIS le livre d'or.
    try {
      localStorage.removeItem('sing2me/guestbookOff2');
      localStorage.removeItem('sing2me/guestbookOff');
    } catch {
      /* stockage indisponible : rien à nettoyer */
    }
  }, []);

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
        setUnavailable(true);
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

  return (
    <div className="tipbox">
      <div className="tiptitle">
        {songTitle !== ''
          ? t('💬 Un mot sur « {title} » ?', { title: songTitle })
          : t('💬 Un mot pour les musiciens ?')}
      </div>
      {unavailable ? (
        <p className="help" style={{ margin: '6px 0' }}>
          {t(
            'Le livre d’or ne répond pas ce soir — ton mot n’a pas pu partir. Réessaie dans un instant.',
          )}
        </p>
      ) : sent ? (
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
