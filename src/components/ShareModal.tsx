/**
 * Modale de partage : lien autonome + QR code.
 * Le contenu est entièrement encodé dans le lien — le destinataire
 * n'a besoin d'aucune application ni d'aucun compte.
 */
import QRCode from 'qrcode';
import React, { useEffect, useState } from 'react';

import { createShortLink, encodeShare, shareUrl } from '../lib/share';
import { useStore } from '../store';
import { SharePayload } from '../types';
import { Modal } from './ui';

export function ShareModal({
  title,
  payload,
  onClose,
  children,
}: {
  title: string;
  payload: SharePayload;
  onClose: () => void;
  /** options supplémentaires (ex. interrupteur « avec accords ») */
  children?: React.ReactNode;
}) {
  const { prefs } = useStore();
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [isShort, setIsShort] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setQr(null);
    setIsShort(false);
    (async () => {
      try {
        // 1. Lien court (contenu stocké côté serveur) : QR minuscule,
        //    toujours scannable. 2. Repli : lien long autonome.
        const short = await createShortLink(prefs.liveKey, payload);
        const u = short ?? shareUrl(await encodeShare(payload));
        if (cancelled) return;
        setUrl(u);
        setIsShort(short !== null);
        try {
          const dataUrl = await QRCode.toDataURL(u, { width: 440, margin: 1 });
          if (!cancelled) setQr(dataUrl);
        } catch {
          // URL trop longue pour un QR : le lien reste copiable
        }
      } catch {
        if (!cancelled) setUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload, prefs.liveKey]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // navigateur sans presse-papiers : l'utilisateur peut sélectionner le lien
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      {children}
      <div className="qrbox">
        {qr ? (
          <img src={qr} alt="QR code de partage" />
        ) : (
          <p className="help">
            {url === null
              ? 'Préparation du lien…'
              : 'Contenu trop volumineux pour un QR code — utilise le lien ' +
                'ci-dessous. (Astuce : avec la clé On Air renseignée et la ' +
                'version en ligne, le lien devient court et le QR revient.)'}
          </p>
        )}
        {url && (
          <>
            <button className="btn" onClick={copy}>
              {copied ? '✓ Lien copié !' : 'Copier le lien'}
            </button>
            <div className="linkbox">{url}</div>
            <p className="help" style={{ textAlign: 'center' }}>
              Le destinataire n'a besoin d'aucune application : le lien ouvre
              une page web.
              {isShort
                ? ' (Lien court — le contenu est servi par ton cloud.)'
                : ''}
            </p>
          </>
        )}
      </div>
      <button className="btn ghost block" onClick={onClose}>
        Fermer
      </button>
    </Modal>
  );
}
