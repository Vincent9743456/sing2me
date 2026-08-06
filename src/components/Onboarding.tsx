/**
 * Onboarding (lot E) — en tête de l'onglet Morceaux :
 *  • E2 carte de bienvenue (première ouverture, fermable) ;
 *  • E3 checklist de démarrage (4 étapes cochées automatiquement).
 * Local-first : aucun compte demandé. Horodatage de chaque étape en
 * localStorage (entonnoir de conversion consultable plus tard).
 */
import React, { useEffect, useState } from 'react';

import { navigate } from '../router';
import { EXAMPLE_TAG } from '../seed';
import { useStore } from '../store';
import { Icon } from './Icon';

const WELCOME_KEY = 'sing2me/welcomeDismissed';
const CHECKLIST_HIDDEN = 'sing2me/checklistHidden';
export const STAGE_PLAYED_KEY = 'sing2me/onb/stagePlayed';
const STEPS_KEY = 'sing2me/onb/steps';

function stamp(step: string): void {
  try {
    const raw = localStorage.getItem(STEPS_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    if (!obj[step]) {
      obj[step] = new Date().toISOString();
      localStorage.setItem(STEPS_KEY, JSON.stringify(obj));
    }
  } catch {
    // stockage indisponible
  }
}

export function Onboarding() {
  const { songs, setlists, bands } = useStore();
  const realSongs = songs.filter((s) => !(s.tags ?? []).includes(EXAMPLE_TAG));
  const realSetlists = setlists.filter(
    (sl) => !/\(exemple\)/i.test(sl.name),
  );
  const example =
    songs.find(
      (s) => (s.tags ?? []).includes(EXAMPLE_TAG) && /cerises/i.test(s.title),
    ) ?? songs.find((s) => (s.tags ?? []).includes(EXAMPLE_TAG));

  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    try {
      return localStorage.getItem(WELCOME_KEY) !== null;
    } catch {
      return true;
    }
  });
  const [checklistHidden, setChecklistHidden] = useState(() => {
    try {
      return localStorage.getItem(CHECKLIST_HIDDEN) !== null;
    } catch {
      return true;
    }
  });

  function dismissWelcome() {
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      // ignore
    }
    setWelcomeDismissed(true);
  }

  // Le premier vrai import fait passer de la bienvenue à la checklist.
  useEffect(() => {
    if (realSongs.length > 0 && !welcomeDismissed) dismissWelcome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realSongs.length]);

  const stagePlayed = (() => {
    try {
      return localStorage.getItem(STAGE_PLAYED_KEY) !== null;
    } catch {
      return false;
    }
  })();

  const steps = [
    {
      key: 'import',
      done: realSongs.length > 0,
      label: 'Importe ton premier morceau',
      onClick: () => navigate('/import'),
    },
    {
      key: 'stage',
      done: stagePlayed,
      label: 'Joue-le en mode scène',
      onClick: () => {
        const s = realSongs[0] ?? example;
        if (s) navigate(`/stage/song/${s.id}`);
      },
    },
    {
      key: 'setlist',
      done: realSetlists.length > 0,
      label: 'Crée ta première setlist',
      onClick: () => navigate('/setlist/new'),
    },
    {
      key: 'invite',
      done: bands.some((b) => b.members.length >= 2),
      label: 'Invite ton groupe',
      onClick: () => navigate('/bands'),
    },
  ];
  const allDone = steps.every((s) => s.done);

  // Horodatage des étapes atteintes (entonnoir).
  useEffect(() => {
    for (const s of steps) if (s.done) stamp(s.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.map((s) => s.done).join(',')]);

  // E2 — Carte de bienvenue (avant la checklist).
  if (!welcomeDismissed) {
    return (
      <div className="card onbcard">
        <button
          className="onbclose"
          aria-label="Fermer"
          onClick={dismissWelcome}
        >
          <Icon name="x" size={16} />
        </button>
        <div className="onbtitle">Bienvenue sur Sing2Me 🎶</div>
        <p className="help" style={{ marginTop: 4 }}>
          Commence par importer un morceau — colle un texte, un lien Ultimate
          Guitar, un PDF ou un fichier Word.
        </p>
        <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => navigate('/import')}>
            <Icon name="import" size={16} /> Importer mon premier morceau
          </button>
          {example && (
            <button
              className="btn ghost"
              onClick={() => navigate(`/stage/song/${example.id}`)}
            >
              <Icon name="play" size={15} /> Voir un exemple en mode scène
            </button>
          )}
        </div>
      </div>
    );
  }

  // E3 — Checklist de démarrage.
  if (checklistHidden || allDone) return null;
  return (
    <div className="card onbcard">
      <div className="hstack" style={{ justifyContent: 'space-between' }}>
        <div className="onbtitle" style={{ fontSize: '0.98rem' }}>
          Prise en main
        </div>
        <button
          className="btn ghost small"
          onClick={() => {
            try {
              localStorage.setItem(CHECKLIST_HIDDEN, '1');
            } catch {
              // ignore
            }
            setChecklistHidden(true);
          }}
        >
          Masquer
        </button>
      </div>
      {steps.map((s) => (
        <button
          key={s.key}
          className="onbstep"
          onClick={s.onClick}
          disabled={s.done}
        >
          <span className={`onbcheck ${s.done ? 'on' : ''}`} aria-hidden="true">
            {s.done ? '✓' : ''}
          </span>
          <span className={s.done ? 'onbdone' : ''}>{s.label}</span>
          {!s.done && (
            <span className="onbgo" aria-hidden="true">
              ›
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
