/**
 * Coach marks (lot F4, absorbe E4) — un seul système d'aides contextuelles,
 * sobre : une ligne discrète (💡 + texte court + croix), jamais bloquante,
 * jamais plus d'une aide visible à la fois (une par écran). Chaque aide
 * disparaît définitivement quand : l'action visée est faite, OU elle a été
 * fermée, OU vue 3 fois, OU 14 jours depuis la 1re ouverture.
 * Drapeaux localStorage : sing2me/hints/{id} = {views, done, dismissed, first}.
 */
import React, { useEffect, useState } from 'react';

import { Icon } from './Icon';

const OFF_KEY = 'sing2me/hintsOff';

export function hintsOff(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) !== null;
  } catch {
    return false;
  }
}
export function setHintsOff(off: boolean): void {
  try {
    if (off) localStorage.setItem(OFF_KEY, '1');
    else localStorage.removeItem(OFF_KEY);
  } catch {
    // stockage indisponible
  }
}

interface HintState {
  views: number;
  done?: boolean;
  dismissed?: boolean;
  first?: string;
}
function read(id: string): HintState {
  try {
    const r = localStorage.getItem(`sing2me/hints/${id}`);
    return r ? (JSON.parse(r) as HintState) : { views: 0 };
  } catch {
    return { views: 0 };
  }
}
function write(id: string, s: HintState): void {
  try {
    localStorage.setItem(`sing2me/hints/${id}`, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export function CoachMark({
  id,
  text,
  done = false,
}: {
  id: string;
  text: string;
  /** L'action visée est faite → l'aide ne s'affiche plus jamais. */
  done?: boolean;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (hintsOff()) return;
    const s = read(id);
    if (s.done || s.dismissed) return;
    if (done) {
      write(id, { ...s, done: true });
      setShow(false);
      return;
    }
    const first = s.first ?? new Date().toISOString();
    const ageDays = (Date.now() - new Date(first).getTime()) / 86400000;
    if (ageDays > 14) {
      write(id, { ...s, done: true });
      return;
    }
    if ((s.views ?? 0) >= 3) return;
    write(id, { ...s, views: (s.views ?? 0) + 1, first });
    setShow(true);
  }, [id, done]);

  if (!show) return null;
  return (
    <div className="coachmark">
      <span aria-hidden="true">💡</span>
      <span className="grow">{text}</span>
      <button
        className="coachclose"
        aria-label="Fermer l'aide"
        onClick={() => {
          write(id, { ...read(id), dismissed: true });
          setShow(false);
        }}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
