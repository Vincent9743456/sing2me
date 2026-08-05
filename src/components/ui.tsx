import React, { useState } from 'react';

import { navigate, Route } from '../router';
import { Icon, IconName } from './Icon';
import { Brand } from './Logo';

/**
 * Astuce « mode concert », affichée une seule fois : l'écran reste allumé
 * automatiquement (anti-veille), mais seuls les réglages du téléphone
 * peuvent couper appels et notifications.
 */
export function DndHint() {
  const [seen, setSeen] = useState(
    () => localStorage.getItem('sing2me/dndHint') === '1',
  );
  if (seen) return null;
  return (
    <div className="dndhint">
      <span>
        🔕 Active « Ne pas déranger » sur ton téléphone : aucun appel ni
        notification pendant le concert. L'écran, lui, restera allumé
        automatiquement.
      </span>
      <button
        className="btn ghost small"
        onClick={() => {
          localStorage.setItem('sing2me/dndHint', '1');
          setSeen(true);
        }}
      >
        OK
      </button>
    </div>
  );
}

export function TopBar({
  title,
  onBack,
  right,
}: {
  title: React.ReactNode;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="topbar">
      <div className="side">
        {onBack && (
          <button className="btn icon" onClick={onBack} aria-label="Retour">
            <Icon name="chevron-left" size={22} />
          </button>
        )}
      </div>
      <h1>{title}</h1>
      <div className="side right">{right}</div>
    </div>
  );
}

const TABS: { route: string; match: Route['name'][]; ico: IconName; label: string }[] = [
  { route: '/', match: ['library', 'song', 'songEdit', 'import'], ico: 'music', label: 'Morceaux' },
  { route: '/setlists', match: ['setlists', 'setlist'], ico: 'list', label: 'Setlists' },
  { route: '/concerts', match: ['concerts', 'concert'], ico: 'star', label: 'Concerts' },
  { route: '/bands', match: ['bands', 'band', 'bandChat'], ico: 'users', label: 'Groupes' },
  { route: '/artist', match: ['artist'], ico: 'user', label: 'Artiste' },
];

export function TabBar({ current }: { current: Route['name'] }) {
  return (
    <nav className="tabbar">
      <div className="brand">
        <Brand size={26} />
      </div>
      {TABS.map((tab) => (
        <button
          key={tab.route}
          className={tab.match.includes(current) ? 'active' : ''}
          onClick={() => navigate(tab.route)}
        >
          <span className="ico">
            <Icon name={tab.ico} size={19} />
          </span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
