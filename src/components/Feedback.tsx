/**
 * Feedback — feuilles du bas (bottom sheets) qui remplacent les
 * alert/confirm/prompt natifs (règle 10 du CLAUDE.md) :
 *  • Sheet        : primitive (fond + panneau bas + poignée).
 *  • MenuSheet    : liste d'actions (le « ⋯ » d'un morceau, d'un en-tête…).
 *  • ConfirmSheet : confirmation destructive ou non, deux boutons.
 *  • Toast        : notification passagère (via ToastProvider / useToast).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';

import { Icon, IconName } from './Icon';

export function Sheet({
  title,
  children,
  onClose,
}: {
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-grab" aria-hidden="true" />
        {title && <h3 className="sheet-title">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
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
        <button
          key={i}
          className={`sheetitem ${it.danger ? 'danger' : ''}`}
          onClick={() => {
            it.onClick();
            onClose();
          }}
        >
          {it.icon && <Icon name={it.icon} size={19} />}
          <span>{it.label}</span>
        </button>
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
        {confirmLabel}
      </button>
      <button
        className="btn ghost block"
        style={{ marginTop: 8 }}
        onClick={onClose}
      >
        Annuler
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
