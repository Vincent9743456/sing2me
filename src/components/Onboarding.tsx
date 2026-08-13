/**
 * Onboarding (lot E) — en tête de l'onglet Morceaux :
 *  • E2 carte de bienvenue (première ouverture, fermable) ;
 *  • E3 checklist de démarrage (4 étapes cochées automatiquement).
 * Local-first : aucun compte demandé. Horodatage de chaque étape en
 * localStorage (entonnoir de conversion consultable plus tard).
 */
import React, { useEffect, useState } from 'react';

import { t } from '../i18n';
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

  // F3 : arrivée par invitation → bannière de bienvenue + checklist « invité ».
  const [justJoined, setJustJoined] = useState<{
    name: string;
    bandId: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem('sing2me/justJoined');
      return raw ? (JSON.parse(raw) as { name: string; bandId: string }) : null;
    } catch {
      return null;
    }
  });
  function dismissJoined() {
    try {
      localStorage.removeItem('sing2me/justJoined');
    } catch {
      // ignore
    }
    setJustJoined(null);
  }
  const invited = justJoined !== null;

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

  const flag = (k: string) => {
    try {
      return localStorage.getItem(k) !== null;
    } catch {
      return false;
    }
  };
  const setFlag = (k: string) => {
    try {
      localStorage.setItem(k, '1');
    } catch {
      // ignore
    }
  };

  const normalSteps = [
    {
      key: 'import',
      done: realSongs.length > 0,
      label: t('Importe ton premier morceau'),
      onClick: () => navigate('/import'),
    },
    {
      key: 'stage',
      done: stagePlayed,
      label: t('Joue-le en mode scène'),
      onClick: () => {
        const s = realSongs[0] ?? example;
        if (s) navigate(`/stage/song/${s.id}`);
      },
    },
    {
      key: 'setlist',
      done: realSetlists.length > 0,
      label: t('Crée ta première setlist'),
      onClick: () => navigate('/setlist/new'),
    },
    {
      key: 'invite',
      done: bands.some((b) => b.members.length >= 2),
      label: t('Invite ton groupe'),
      onClick: () => navigate('/bands'),
    },
  ];

  const invitedSteps = [
    {
      key: 'discover',
      done: flag('sing2me/onb/inv/discover'),
      label: t('Découvre le répertoire de {name}', {
        name: justJoined?.name ?? t('ton groupe'),
      }),
      onClick: () => {
        setFlag('sing2me/onb/inv/discover');
        try {
          if (justJoined) {
            localStorage.setItem('sing2me/libBandFilter', justJoined.bandId);
          }
        } catch {
          // ignore
        }
        navigate('/');
      },
    },
    {
      key: 'stage',
      done: stagePlayed,
      label: t('Joue un morceau en mode scène'),
      onClick: () => {
        const s = realSongs[0] ?? songs[0];
        if (s) navigate(`/stage/song/${s.id}`);
      },
    },
    {
      key: 'chat',
      done: flag('sing2me/onb/inv/chat'),
      label: t('Dis bonjour dans la discussion du groupe'),
      onClick: () => {
        setFlag('sing2me/onb/inv/chat');
        if (justJoined) navigate(`/band/${justJoined.bandId}/chat`);
      },
    },
    {
      key: 'import',
      done: realSongs.length > 0,
      label: t('Ajoute tes propres morceaux'),
      onClick: () => navigate('/import'),
    },
  ];

  const steps = invited ? invitedSteps : normalSteps;
  const allDone = steps.every((s) => s.done);

  // Horodatage des étapes atteintes (entonnoir).
  useEffect(() => {
    for (const s of steps) if (s.done) stamp(s.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.map((s) => s.done).join(',')]);

  // F3 — Bannière de bienvenue après une adhésion par invitation.
  const banner = justJoined ? (
    <div className="card onbcard" style={{ borderColor: 'var(--ok)' }}>
      <button
        className="onbclose"
        aria-label={t('Fermer')}
        onClick={dismissJoined}
      >
        <Icon name="x" size={16} />
      </button>
      <div className="onbtitle">
        {t('🎉 Tu as rejoint {name} !', { name: justJoined.name })}
      </div>
      <p className="help" style={{ marginTop: 4 }}>
        {t(
          'Son répertoire arrive dans ta bibliothèque. Tes propres morceaux restent à toi.',
        )}
      </p>
      <button
        className="btn"
        onClick={() => navigate(`/band/${justJoined.bandId}`)}
      >
        <Icon name="users" size={15} /> {t('Voir le groupe')}
      </button>
    </div>
  ) : null;

  // E2 — Carte de bienvenue (nouvel utilisateur non invité).
  const welcome =
    !invited && !welcomeDismissed ? (
      <div className="card onbcard">
        <button
          className="onbclose"
          aria-label={t('Fermer')}
          onClick={dismissWelcome}
        >
          <Icon name="x" size={16} />
        </button>
        <div className="onbtitle">{t('Bienvenue sur DodoSongs 🎶')}</div>
        <p className="help" style={{ marginTop: 4 }}>
          {t(
            'Tu as déjà une collection de partitions ? Importe-la en une fois : dépose tes fichiers (txt, ChordPro, OnSong, Word, PDF) ou tes pages enregistrées, DodoSongs met tout au propre.',
          )}
        </p>
        <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => navigate('/import/bulk')}>
            <Icon name="import" size={16} /> {t('Importer ma collection')}
          </button>
          <button className="btn ghost" onClick={() => navigate('/import')}>
            {t('Ajouter un seul morceau')}
          </button>
          {example && (
            <button
              className="btn ghost"
              onClick={() => navigate(`/stage/song/${example.id}`)}
            >
              <Icon name="play" size={15} /> {t('Voir un exemple en mode scène')}
            </button>
          )}
        </div>
      </div>
    ) : null;

  // E3 — Checklist de démarrage (variante « invité » si arrivée par lien).
  const showChecklist =
    (invited || welcomeDismissed) && !checklistHidden && !allDone;
  const checklist = showChecklist ? (
    <div className="card onbcard">
      <div className="hstack" style={{ justifyContent: 'space-between' }}>
        <div className="onbtitle" style={{ fontSize: '0.98rem' }}>
          {t('Prise en main')}
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
          {t('Masquer')}
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
  ) : null;

  if (!banner && !welcome && !checklist) return null;
  return (
    <>
      {banner}
      {welcome}
      {checklist}
    </>
  );
}
