/**
 * Encourage l'ajout de Sing2Me à l'écran d'accueil (PWA).
 *  • Android / Chrome : bouton « Installer » (rejoue l'invite native captée
 *    dans main.tsx).
 *  • iOS Safari : pas d'invite native → petite consigne « Partager → Sur
 *    l'écran d'accueil ».
 * Masqué si déjà installé (mode standalone) ou une fois écarté.
 */
import React, { useEffect, useState } from 'react';

const DISMISS_KEY = 'sing2me/installDismissed';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
function isIOS(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream
  );
}

export function InstallHint() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState<(Event & { prompt: () => void }) | null>(
    null,
  );

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* stockage indisponible */
    }
    if (isIOS()) {
      setIos(true);
      setShow(true);
      return;
    }
    // Android/Chrome : l'invite a peut-être déjà été captée dans main.tsx.
    if (window.__s2mInstallPrompt) {
      setPrompt(window.__s2mInstallPrompt);
      setShow(true);
    }
    const onReady = () => {
      if (window.__s2mInstallPrompt) {
        setPrompt(window.__s2mInstallPrompt);
        setShow(true);
      }
    };
    window.addEventListener('s2m-installable', onReady);
    const onInstalled = () => setShow(false);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('s2m-installable', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* stockage indisponible */
    }
    setShow(false);
  };

  return (
    <div className="installhint" role="dialog" aria-label="Installer Sing2Me">
      <span className="installhint-ico" aria-hidden="true">
        📲
      </span>
      <div className="grow" style={{ minWidth: 0 }}>
        <strong>Installe Sing2Me</strong>
        <div className="help" style={{ margin: 0 }}>
          {ios
            ? 'Touche Partager, puis « Sur l’écran d’accueil » — accès direct, plein écran.'
            : 'Un accès direct depuis ton écran d’accueil, en plein écran.'}
        </div>
      </div>
      {!ios && prompt && (
        <button
          className="btn small"
          onClick={() => {
            try {
              prompt.prompt();
            } catch {
              /* invite indisponible */
            }
            dismiss();
          }}
        >
          Installer
        </button>
      )}
      <button
        className="btn ghost small installhint-x"
        onClick={dismiss}
        aria-label="Fermer"
      >
        ✕
      </button>
    </div>
  );
}
