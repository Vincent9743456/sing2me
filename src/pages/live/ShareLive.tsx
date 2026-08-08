/**
 * « Faire venir du monde » : un spectateur ou un musicien qui a rejoint le
 * direct partage l'accès autour de lui — QR à faire scanner sur son écran,
 * partage natif (SMS, WhatsApp…) et copie du lien. Chunk DIFFÉRÉ : la
 * bibliothèque QR n'est téléchargée que si quelqu'un ouvre ce panneau.
 */
import QRCode from 'qrcode';
import React, { useEffect, useState } from 'react';

import { t } from '../../i18n';

export default function ShareLive({
  url,
  artistName,
  joinCode,
  onClose,
}: {
  /** Lien direct vers CE live (avec code de salon quand il existe). */
  url: string;
  artistName: string;
  joinCode: string;
  onClose: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await QRCode.toDataURL(url, { width: 440, margin: 1 });
        if (!cancelled) setQr(data);
      } catch {
        if (!cancelled) setQr(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const title =
    artistName !== ''
      ? t('{name} est en direct 🎶', { name: artistName })
      : t('Concert en direct 🎶');

  async function share() {
    try {
      await navigator.share({ title, text: title, url });
    } catch {
      /* partage annulé : rien à faire */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* presse-papier indisponible : le lien reste affiché en clair */
    }
  }

  return (
    <div
      className="stagelist"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="inner">
        <button className="btn block" onClick={onClose}>
          {t('← Revenir aux paroles')}
        </button>
        <h2 style={{ textAlign: 'center', margin: '16px 0 4px' }}>
          {t('📣 Faire venir du monde')}
        </h2>
        <p className="help" style={{ textAlign: 'center', marginTop: 0 }}>
          {t(
            'Fais scanner ce QR sur ton écran, ou envoie le lien : la personne arrive directement sur le direct.',
          )}
        </p>
        {qr && (
          <div className="qrbox">
            <img src={qr} alt={t("QR d'accès au direct")} />
            <div className="linkbox">{url}</div>
          </div>
        )}
        <div className="rowactions" style={{ justifyContent: 'center' }}>
          {canShare && (
            <button className="btn" onClick={() => void share()}>
              {t('📤 Partager')}
            </button>
          )}
          <button className="btn ghost" onClick={() => void copy()}>
            {copied ? t('✓ Lien copié') : t('🔗 Copier le lien')}
          </button>
        </div>
        {joinCode !== '' && (
          <p className="help" style={{ textAlign: 'center' }}>
            {t(
              "Depuis l'appli Sing2Me : onglet Concerts → « Rejoindre un direct », code",
            )}{' '}
            <strong>{joinCode}</strong>.
          </p>
        )}
        <button className="btn ghost block" onClick={onClose}>
          {t('← Revenir aux paroles')}
        </button>
      </div>
    </div>
  );
}
