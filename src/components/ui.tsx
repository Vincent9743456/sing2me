import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { t } from '../i18n';
import { navigate, Route } from '../router';
import { Icon, IconName } from './Icon';
import { Brand, LogoMark } from './Logo';
import { LiveBadge } from './OnAir';

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
        {t(
          "🔕 Active « Ne pas déranger » sur ton téléphone : aucun appel ni notification pendant le concert. L'écran, lui, restera allumé automatiquement.",
        )}
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

/**
 * Accordéon du design system : fond de surface, chevron animé, typo
 * cohérente — remplace les anciens plis « ▸ » orange. `sub` (optionnel)
 * résume le contenu quand c'est fermé.
 */
export function Accordion({
  title,
  sub,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`accordion ${open ? 'open' : ''}`}>
      <button
        className="accordion-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="accordion-title">{title}</div>
          {sub != null && <div className="accordion-sub">{sub}</div>}
        </div>
        <span className={`capsule-chevron ${open ? 'open' : ''}`}>
          <Icon name="chevron-down" size={18} />
        </span>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}

/** Rangée de navigation au même gabarit que l'accordéon (écran dédié). */
export function AccordionNav({
  title,
  sub,
  onClick,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div className="accordion">
      <button className="accordion-head" onClick={onClick}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="accordion-title">{title}</div>
          {sub != null && <div className="accordion-sub">{sub}</div>}
        </div>
        <span className="capsule-chevron">
          <Icon name="chevron-right" size={18} />
        </span>
      </button>
    </div>
  );
}

/**
 * Barre de VALIDATION commune (b149, demande Vincent) : toute création ou
 * modification se confirme par un bouton visible. La barre n'apparaît que
 * lorsqu'il y a des changements non enregistrés — « Valider » les
 * enregistre, « Annuler » les abandonne. Les gestes fluides (ajout et
 * déplacement de morceaux) ne passent pas par elle.
 */
export function SaveBar({
  visible,
  onSave,
  onCancel,
  label = 'Valider',
}: {
  visible: boolean;
  onSave: () => void;
  onCancel: () => void;
  label?: string;
}) {
  if (!visible) return null;
  return (
    <div
      className="savebar"
      role="toolbar"
      aria-label={t('Modifications en attente')}
    >
      <button className="btn ghost" onClick={onCancel}>
        {t('Annuler')}
      </button>
      <button className="btn" onClick={onSave}>
        ✓ {t(label)}
      </button>
    </div>
  );
}

export function TopBar({
  title,
  onBack,
  right,
  live = true,
}: {
  title: React.ReactNode;
  onBack?: () => void;
  right?: React.ReactNode;
  /** Badge d'état du live intégré à la barre (b378) — rendu seulement
   *  pendant une session. `false` sur les pages où il n'a pas de sens
   *  (import, partage…). */
  live?: boolean;
}) {
  return (
    <div className="topbar">
      <div className="side">
        {onBack ? (
          <button className="btn icon" onClick={onBack} aria-label={t('Retour')}>
            <Icon name="chevron-left" size={22} />
          </button>
        ) : (
          /* LA MARQUE SUR TÉLÉPHONE (b238, constat de Vincent : « le logo
             n'apparaît pas sur le téléphone »). Elle ne vivait que dans la
             barre latérale, qui n'existe qu'à partir de 900 px : sur un
             téléphone, l'emblème ne se voyait donc nulle part une fois
             connecté. Il prend la gouttière gauche, déjà réservée au bouton
             Retour — donc rien ne bouge, et il s'efface dès qu'on entre dans
             un écran d'où l'on revient. Décoratif et NON cliquable : l'onglet
             Morceaux mène déjà à l'accueil, on n'ouvre pas un deuxième
             chemin vers la même action. */
          <span className="topbrand" aria-hidden="true">
            <LogoMark size={56} />
          </span>
        )}
      </div>
      <h1>{title}</h1>
      <div className="side right">
        {right}
        {/* b378 (refonte navigation, lot 1) : le header ne porte plus le
            LANCEMENT du live (il vit dans l'onglet Live) — seulement
            l'INDICATEUR d'état, rendu uniquement quand une session est
            active. Hors session, l'emplacement est libre (lot 2). */}
        {live && <LiveBadge />}
      </div>
    </div>
  );
}

const TABS: { route: string; match: Route['name'][]; ico: IconName; label: string }[] = [
  { route: '/', match: ['library', 'song', 'songEdit', 'import'], ico: 'music', label: 'Morceaux' },
  {
    route: '/setlists',
    match: ['setlists', 'setlist', 'setlistEdit'],
    ico: 'list',
    label: 'Setlists',
  },
  // « Live » (décision Vincent, b176) : cet onglet ne sert plus seulement à
  // planifier des concerts, il porte aussi l'historique des directs joués.
  { route: '/concerts', match: ['concerts', 'concert', 'pastlive'], ico: 'star', label: 'Live' },
  { route: '/bands', match: ['bands', 'band', 'bandChat'], ico: 'users', label: 'Groupes' },
  {
    route: '/artist',
    match: ['artist', 'settings', 'songbook'],
    ico: 'user',
    label: 'Artiste',
  },
];

export function TabBar({
  current,
  bandsBadge = 0,
}: {
  current: Route['name'];
  /** Pastille de notifications sur l'onglet Groupes. */
  bandsBadge?: number;
}) {
  // NE PAS déplacer cette barre en JavaScript (b184). Une tentative (b181)
  // la recollait au bas du viewport VISUEL à chaque événement de défilement :
  // pendant l'inertie iOS, ce recalage produisait exactement le symptôme
  // qu'il visait — « le menu du bas remonte quand on scrolle ». Une barre
  // `position: fixed`, sans transform, sans flou et sans script, est ce que
  // le navigateur place le mieux.
  return (
    <nav className="tabbar">
      <div className="brand">
        <Brand size={48} />
      </div>
      {TABS.map((tab) => (
        <button
          key={tab.route}
          className={tab.match.includes(current) ? 'active' : ''}
          onClick={() => navigate(tab.route)}
        >
          <span className="ico">
            <Icon name={tab.ico} size={19} />
            {tab.route === '/bands' && bandsBadge > 0 && (
              <span className="tabbadge" aria-label={`${bandsBadge} notification${bandsBadge > 1 ? 's' : ''}`}>
                {bandsBadge > 9 ? '9+' : bandsBadge}
              </span>
            )}
          </span>
          {t(tab.label)}
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

/**
 * b152 vivait ici : `useKeyboardLift` remontait feuilles et modales au-dessus
 * du clavier en posant une translation SUR l'élément. Supprimé en b264 — la
 * mesure est globale (`src/lib/clavier.ts`) et c'est le VOILE qui s'arrête
 * au-dessus du clavier (`bottom: var(--clavier)`), donc la feuille naît au
 * bon endroit sans que personne n'ait à y penser. La translation, elle,
 * bornait la hauteur sans donner de quoi faire défiler : une feuille trop
 * longue restait illisible par le bas.
 */

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // PORTALISÉ dans <body> (b300) : une feuille ouverte depuis un conteneur
  // « collant » à défilement interne — le volet d'aperçu de la bibliothèque
  // (`.libpreview`, position: sticky + overflow) — était PIÉGÉE dans son
  // empilement et la barre d'outils passait par-dessus (bug signalé par
  // Vincent). Rattachée au body, la modale échappe à tout ancêtre et se pose
  // au-dessus de l'app. `document.body` existe toujours au rendu client.
  return createPortal(
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
    </div>,
    document.body,
  );
}

/**
 * Barre de progression d'un traitement long (import en masse, reprise de la
 * bibliothèque). Vit ici depuis b220 : deux écrans en avaient besoin, et un
 * composant par fonction (règle 4 du design system).
 */
export function ProgressBar({
  done,
  total,
  label,
}: {
  done: number;
  total: number;
  label: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div aria-live="polite">
      <div
        className={`progressbar ${done >= total ? 'done' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <p className="help" style={{ textAlign: 'center', marginTop: 2 }}>
        {label} : {done}/{total}
      </p>
    </div>
  );
}
