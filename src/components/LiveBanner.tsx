/**
 * Bannière « session en cours » des MEMBRES : quand le leader passe ON AIR
 * (concert ou répétition), les membres de SON groupe voient cette invitation
 * sur tous les onglets principaux et rejoignent le suivi en un tap — sans
 * bouton manuel (l'ancien raccourci « satellite » est supprimé, décision
 * Vincent : ON AIR déclenche tout).
 *
 * Portée « mon groupe » : n'apparaît que si le direct est tagué avec le
 * cloudId d'un groupe auquel J'appartiens (jamais pour un artiste inconnu
 * ni un live solo). Le leader (ON AIR actif sur cet appareil) ne la voit pas.
 */
import React, { useEffect, useMemo, useState } from 'react';

import { currentLiveRef, fetchLiveForBands } from '../lib/live';
import { navigate } from '../router';
import { useStore } from '../store';

export function LiveBanner() {
  const { bands } = useStore();
  // Mes groupes indexés par cloudId (seul identifiant partagé entre membres).
  const myGroups = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bands) if (b.cloudId) m.set(b.cloudId, b.name);
    return m;
  }, [bands]);
  const [session, setSession] = useState<{
    mode: 'concert' | 'repet';
    title: string;
    by: string;
    group: string;
    code: string;
  } | null>(null);
  const groupsKey = [...myGroups.keys()].sort().join('|');
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      // Le leader (ON AIR actif sur cet appareil, ou lancement en cours —
      // la référence de SON live existe) n'a pas besoin de bannière.
      if (
        (localStorage.getItem('sing2me/onair') ?? 'off') !== 'off' ||
        currentLiveRef() !== null
      ) {
        if (!cancelled) setSession(null);
        return;
      }
      try {
        // Multi-live (b121) : le serveur résout directement le live actif
        // d'un de MES groupes — plus de scène globale.
        const s = await fetchLiveForBands([...myGroups.keys()]);
        if (cancelled) return;
        const mine = s !== null && s.bandId !== '' && myGroups.has(s.bandId);
        setSession(
          s && mine
            ? {
                mode: s.mode,
                title: s.song?.title ?? s.bandSong?.title ?? '',
                by: s.startedBy,
                group: myGroups.get(s.bandId) ?? '',
                code: s.joinCode,
              }
            : null,
        );
      } catch {
        if (!cancelled) setSession(null);
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 45000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsKey]);

  if (!session) return null;
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderColor: 'var(--accent)',
      }}
    >
      <span style={{ flex: 1 }}>
        {session.mode === 'repet' ? '🎸 Répétition' : '🔴 Concert'} en cours
        {session.group !== '' && (
          <>
            {' '}
            — <strong>{session.group}</strong>
          </>
        )}
        {session.title !== '' && <> · {session.title}</>}
        {session.by !== '' && (
          <span
            style={{
              display: 'block',
              color: 'var(--muted)',
              fontSize: '0.85em',
            }}
          >
            lancé par {session.by}
          </span>
        )}
      </span>
      <button
        className="btn"
        onClick={() =>
          navigate(session.code !== '' ? `/follow/${session.code}` : '/follow')
        }
      >
        Rejoindre 📡
      </button>
    </div>
  );
}
