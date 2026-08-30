/**
 * Feedback — feuilles du bas (bottom sheets) qui remplacent les
 * alert/confirm/prompt natifs (règle 10 du CLAUDE.md) :
 *  • Sheet        : primitive (fond + panneau bas + poignée).
 *  • MenuSheet    : liste d'actions (le « ⋯ » d'un morceau, d'un en-tête…).
 *  • ConfirmSheet : confirmation destructive ou non, deux boutons.
 *  • PromptSheet  : saisie d'une courte valeur (remplace prompt()).
 *  • Toast        : notification passagère (via ToastProvider / useToast).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { t } from '../i18n';
import { Icon, IconName } from './Icon';

/** Pile des dialogues ouverts : seul celui du DESSUS répond à Échap —
 *  une feuille ouverte par-dessus une modale ne ferme pas les deux. */
const pileDialogues: symbol[] = [];

/**
 * ACCESSIBILITÉ DES DIALOGUES (b480, audit N-5) : Échap ferme, le focus
 * entre dans le panneau à l'ouverture, Tab tourne DEDANS (piège de focus),
 * et le déclencheur retrouve le focus à la fermeture. Un seul crochet pour
 * les feuilles ET les modales — le même traitement partout.
 */
export function usePiegeModale(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const fermerRef = useRef(onClose);
  fermerRef.current = onClose;
  useEffect(() => {
    const moi = Symbol('dialogue');
    pileDialogues.push(moi);
    const declencheur = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (pileDialogues[pileDialogues.length - 1] !== moi) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        fermerRef.current();
        return;
      }
      if (e.key !== 'Tab' || ref.current === null) return;
      const focusables = ref.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const premier = focusables[0];
      const dernier = focusables[focusables.length - 1];
      const actif = document.activeElement;
      if (e.shiftKey && (actif === premier || actif === ref.current)) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && actif === dernier) {
        e.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = pileDialogues.indexOf(moi);
      if (i >= 0) pileDialogues.splice(i, 1);
      declencheur?.focus?.();
    };
  }, []);
  return ref;
}

export function Sheet({
  title,
  children,
  onClose,
}: {
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = usePiegeModale(onClose);
  // Portalisée dans <body> (b300), même raison que la modale : ouverte depuis
  // le volet d'aperçu collant de la bibliothèque, elle passait sinon derrière
  // la barre d'outils.
  return createPortal(
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
      >
        <div className="sheet-grab" aria-hidden="true" />
        {/* b480 (audit N-5) : une fermeture VISIBLE — le clic à côté et le
            glissement ne se devinent pas au clavier ni au lecteur d'écran. */}
        <button
          className="sheet-close"
          aria-label={t('Fermer')}
          onClick={onClose}
        >
          <Icon name="x" size={16} />
        </button>
        {title && <h3 className="sheet-title">{title}</h3>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export interface MenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  /** Trait au-dessus de l'entrée (b427) : isole une action destructrice
   *  des actions courantes, contre le tap accidentel. */
  sep?: boolean;
  onClick: () => void;
}

export function MenuSheet({
  title,
  items,
  onClose,
}: {
  title?: string;
  items: MenuItem[];
  onClose: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {it.sep === true && <div className="sheetsep" aria-hidden="true" />}
          <button
            className={`sheetitem ${it.danger ? 'danger' : ''}`}
            onClick={() => {
              it.onClick();
              onClose();
            }}
          >
            {it.icon && <Icon name={it.icon} size={19} />}
            <span>{it.label}</span>
          </button>
        </React.Fragment>
      ))}
    </Sheet>
  );
}

export function ConfirmSheet({
  title,
  message,
  confirmLabel = 'Confirmer',
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      {message && (
        <p className="help" style={{ marginTop: 0 }}>
          {message}
        </p>
      )}
      <button
        className={`btn block ${danger ? 'danger' : ''}`}
        onClick={() => {
          onConfirm();
          onClose();
        }}
      >
        {t(confirmLabel)}
      </button>
      <button
        className="btn ghost block"
        style={{ marginTop: 8 }}
        onClick={onClose}
      >
        {t('Annuler')}
      </button>
    </Sheet>
  );
}

export function PromptSheet({
  title,
  message,
  initialValue = '',
  placeholder,
  confirmLabel = 'Valider',
  onSubmit,
  onClose,
}: {
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  function submit() {
    const v = value.trim();
    if (v === '') return;
    onSubmit(v);
    onClose();
  }
  return (
    <Sheet title={title} onClose={onClose}>
      {message && (
        <p className="help" style={{ marginTop: 0 }}>
          {message}
        </p>
      )}
      <input
        type="text"
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        style={{ marginBottom: 8 }}
      />
      <button className="btn block" onClick={submit}>
        {t(confirmLabel)}
      </button>
      <button
        className="btn ghost block"
        style={{ marginTop: 8 }}
        onClick={onClose}
      >
        {t('Annuler')}
      </button>
    </Sheet>
  );
}

/* ---------- Toast ---------- */

interface ToastValue {
  show: (message: string) => void;
}
const ToastCtx = createContext<ToastValue | null>(null);

export function useToast(): ToastValue {
  return useContext(ToastCtx) ?? { show: () => {} };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const hideRef = React.useRef<number | null>(null);
  const show = useCallback((message: string) => {
    setMsg(message);
    if (hideRef.current !== null) window.clearTimeout(hideRef.current);
    hideRef.current = window.setTimeout(() => setMsg(null), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {msg !== null && (
        <div className="toast" role="status" onClick={() => setMsg(null)}>
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
