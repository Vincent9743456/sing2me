/**
 * MA PAGE PUBLIQUE, VUE DEPUIS L'APP (b242, retour de Vincent : « ça devrait
 * afficher ma page telle que le public doit la voir »).
 *
 * L'écran « Page publique / QR » ne montrait qu'un QR code et une rangée de
 * boutons de partage. On ne pouvait donc pas vérifier ce qu'un spectateur
 * voit vraiment — la seule chose qui compte quand on donne son adresse.
 *
 * Cet aperçu affiche la page RÉELLEMENT publiée : elle est relue depuis le
 * serveur (pas reconstruite de mémoire) et rendue par `PublicPageView`, le
 * composant de la vraie page. Ce qu'on regarde ici est, au pixel près, ce
 * que verra un visiteur à cet instant.
 *
 * On ne QUITTE pas l'app pour ça (règle b187) : dans l'app installée sur
 * iPhone, une page ouverte hors du cadre ne laisse aucun retour.
 *
 * Le QR reste (« il faut tout de même pouvoir partager le QR code et le voir
 * pour impression ») : affiché en grand, enregistrable en image, et
 * partageable par la feuille du système quand elle existe. Les raccourcis
 * e-mail et WhatsApp, eux, sont partis — ils ne servaient à rien que la
 * feuille de partage ou le lien copié ne fassent déjà.
 */
import QRCode from 'qrcode';
import React, { useEffect, useState } from 'react';

import { Modal } from './ui';
import { useToast } from './Feedback';
import { PublicPageView } from './PublicPageView';
import { fetchPublicPage, PublicPage } from '../lib/publicPages';
import { t } from '../i18n';

export function PublicPagePeek({
  titre,
  /**
   * `null` = on cherche encore l'adresse (b245). La distinction compte :
   * annoncer « pas encore réservée » pendant qu'on interroge le serveur, ce
   * n'est pas une nuance d'affichage — c'est dire le contraire de la vérité.
   */
  adresse,
  /** Rafraîchit la fiche AVANT de la relire — pour que l'aperçu montre
   *  l'état du jour et pas celui du dernier enregistrement. */
  publier,
  /** Message affiché quand il n'y a pas encore d'adresse. */
  sansAdresse,
  onClose,
}: {
  titre: string;
  adresse: string | null;
  publier?: () => Promise<void>;
  sansAdresse?: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [page, setPage] = useState<PublicPage | null | undefined>(undefined);
  const [qr, setQr] = useState<string>('');

  const lien =
    adresse !== null && adresse !== '' ? `${location.origin}/${adresse}` : '';

  useEffect(() => {
    let annule = false;
    void (async () => {
      if (adresse === null) return; // recherche en cours : on n'affiche rien
      if (adresse === '') {
        setPage(null);
        return;
      }
      try {
        if (publier) await publier();
      } catch {
        // Publication impossible (hors ligne) : on montre ce qui est en
        // ligne, c'est encore ce que verrait un visiteur maintenant.
      }
      const p = await fetchPublicPage(adresse);
      if (!annule) setPage(p);
      try {
        const d = await QRCode.toDataURL(`${location.origin}/${adresse}`, {
          width: 640,
          margin: 1,
        });
        if (!annule) setQr(d);
      } catch {
        /* pas de QR : le lien reste dictable, c'est l'essentiel */
      }
    })();
    return () => {
      annule = true;
    };
    // Une visite = une publication : on ne republie pas à chaque frappe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adresse]);

  async function copier() {
    try {
      await navigator.clipboard.writeText(lien);
      toast.show(t('Lien copié.'));
    } catch {
      toast.show(t('Copie impossible — sélectionne le lien à la main.'));
    }
  }

  /**
   * ENREGISTRER LE QR (b399, signalement de Vincent : « le bouton ne semble
   * pas fonctionner »). C'était un <a download> pointant sur l'URL data: du
   * QR — et iOS REFUSE de télécharger une URL data:, en silence, surtout
   * dans l'app installée. Le chemin qui marche partout est celui de la
   * sauvegarde (Settings.sauvegarder, éprouvé sur iPhone : le fichier
   * atterrit dans « Fichiers ») : un Blob + URL d'objet + clic simulé.
   * Si même ça échoue, la feuille du système reste (« Enregistrer
   * l'image » → Photos) — une action doit toujours pouvoir se terminer
   * (b216), jamais échouer sans un mot.
   */
  async function enregistrer() {
    if (qr === '') return;
    let blob: Blob;
    try {
      blob = await (await fetch(qr)).blob();
    } catch {
      toast.show(t('Le QR n’a pas pu être enregistré — réessaie.'));
      return;
    }
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mojosong-qr.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return;
    } catch {
      /* téléchargement impossible ici : la feuille du système prend le relais */
    }
    const nav = navigator as Navigator & {
      canShare?: (d: unknown) => boolean;
      share?: (d: unknown) => Promise<void>;
    };
    const fichier = new File([blob], 'mojosong-qr.png', { type: 'image/png' });
    if (nav.share && nav.canShare?.({ files: [fichier] })) {
      try {
        await nav.share({ files: [fichier] });
      } catch {
        /* feuille refermée sans choisir : rien à dire */
      }
      return;
    }
    toast.show(
      t('Appuie longuement sur le QR pour l’enregistrer dans tes photos.'),
    );
  }

  /** Partage par la feuille du système — l'IMAGE du QR quand l'appareil sait
   *  la prendre, le lien sinon. */
  async function partager() {
    const nav = navigator as Navigator & {
      canShare?: (d: unknown) => boolean;
      share?: (d: unknown) => Promise<void>;
    };
    if (!nav.share) return;
    try {
      if (qr !== '' && nav.canShare) {
        const blob = await (await fetch(qr)).blob();
        const fichier = new File([blob], 'mojosong-qr.png', {
          type: 'image/png',
        });
        if (nav.canShare({ files: [fichier] })) {
          await nav.share({ files: [fichier], title: titre, text: lien });
          return;
        }
      }
      await nav.share({ title: titre, text: titre, url: lien });
    } catch {
      /* partage annulé : rien à dire */
    }
  }

  const peutPartager =
    typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <Modal title={titre} onClose={onClose}>
      {adresse === null ? (
        <p className="help" style={{ marginTop: 0 }}>
          {t('Recherche de l’adresse…')}
        </p>
      ) : adresse === '' ? (
        <p className="help" style={{ marginTop: 0 }}>
          {sansAdresse ?? t('Pas encore d’adresse publique.')}
        </p>
      ) : (
        <>
          <div className="hstack" style={{ gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
              {lien.replace(/^https?:\/\//, '')}
            </code>
            <button
              className="btn ghost small"
              style={{ flexShrink: 0 }}
              onClick={() => void copier()}
            >
              {t('Copier')}
            </button>
          </div>

          {qr !== '' && (
            <div className="qrbox" style={{ marginTop: 'var(--sp-3)' }}>
              <img src={qr} alt={t('QR code de ta page publique')} />
              <div className="chips" style={{ justifyContent: 'center' }}>
                {/* Enregistrer l'image : c'est ce qui permet de l'imprimer,
                    de l'afficher dans la salle, de l'envoyer à qui on veut —
                    sans dépendre de la feuille du système. */}
                <button
                  className="btn ghost small"
                  onClick={() => void enregistrer()}
                >
                  {t('⤓ Enregistrer le QR')}
                </button>
                {peutPartager && (
                  <button
                    className="btn ghost small"
                    onClick={() => void partager()}
                  >
                    {t('↗ Partager')}
                  </button>
                )}
              </div>
              <p className="help" style={{ margin: 0, textAlign: 'center' }}>
                {t('À imprimer et à poser dans la salle — il ne change jamais.')}
              </p>
            </div>
          )}

          <div className="spacer" />
          <div className="pubview-head">{t('CE QUE VOIT LE PUBLIC')}</div>
          {page === undefined ? (
            <p className="help" style={{ marginTop: 0 }}>{t('Chargement…')}</p>
          ) : page === null ? (
            <p className="help" style={{ marginTop: 0 }}>
              {t(
                'La page n’a pas pu être chargée. Elle existe peut-être quand même : réessaie avec du réseau.',
              )}
            </p>
          ) : (
            /* `.public` autour de l'aperçu : c'est sous cette classe que
               vivent les styles de la vraie page (photo ronde, liens,
               pourboire). Sans elle, l'aperçu montrerait des liens bruts et
               ne ressemblerait justement PAS à la page. */
            <div className="pubframe">
              <div className="public" style={{ padding: 0 }}>
              <PublicPageView
                profile={page.profile}
                sorte={page.sorte === 'groupe' ? 'groupe' : 'artiste'}
                nomDeSecours={adresse}
              />
              </div>
            </div>
          )}
        </>
      )}
      <div className="spacer" />
      <button className="btn ghost block" onClick={onClose}>
        {t('Fermer')}
      </button>
    </Modal>
  );
}
