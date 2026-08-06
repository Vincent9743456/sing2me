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

  /**
   * Lien « mailto » pré-rempli. Pour une invitation de groupe, le texte
   * met en avant l'intérêt de Sing2Me pour donner envie de télécharger
   * l'appli et de créer son compte (l'adhésion vaut acceptation).
   */
  function inviteMessage(): { subject: string; body: string } {
    const inv = payload.invite;
    let subject: string;
    let body: string;
    if (inv) {
      // F1 : message court, complet, une seule URL en dernière position
      // (aperçu propre dans WhatsApp/SMS).
      subject = `${inv.from} t'invite à rejoindre ${inv.band} sur Sing2Me`;
      body =
        `🎶 ${inv.from} t'invite à rejoindre ${inv.band} sur Sing2Me.\n` +
        `Partitions, setlists et répéts du groupe, partagées ` +
        `automatiquement.\n` +
        `C'est gratuit, rien à installer — clique et c'est prêt :\n` +
        `${url}`;
    } else {
      subject = 'Un morceau partagé avec toi depuis Sing2Me 🎶';
      body =
        `Je te partage ça — ouvre simplement ce lien, aucune appli requise :` +
        `\n${url}\n\n` +
        `Partagé avec Sing2Me, le songbook des musiciens : paroles, accords, ` +
        `transposition, mode scène. C'est gratuit — n'hésite pas à l'essayer.`;
    }
    return { subject, body };
  }

  function mailtoHref(): string {
    const { subject, body } = inviteMessage();
    return `mailto:?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  }

  /** Lien WhatsApp pré-rempli (un seul champ : accroche + message). */
  function whatsappHref(): string {
    const { subject, body } = inviteMessage();
    return `https://wa.me/?text=${encodeURIComponent(`${subject}\n\n${body}`)}`;
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
            <div className="hstack" style={{ gap: 8, justifyContent: 'center' }}>
              {typeof navigator !== 'undefined' &&
                typeof navigator.share === 'function' && (
                  <button
                    className="btn"
                    onClick={() => {
                      const { subject, body } = inviteMessage();
                      void navigator
                        .share({ title: subject, text: body })
                        .catch(() => {
                          /* partage annulé */
                        });
                    }}
                  >
                    📤 Partager
                  </button>
                )}
              <button className="btn ghost" onClick={copy}>
                {copied ? '✓ Lien copié !' : 'Copier le lien'}
              </button>
              <a
                className="btn ghost"
                href={mailtoHref()}
                style={{ textDecoration: 'none' }}
              >
                ✉️ Email
              </a>
              <a
                className="btn ghost"
                href={whatsappHref()}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: 'none' }}
              >
                💬 WhatsApp
              </a>
            </div>
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
