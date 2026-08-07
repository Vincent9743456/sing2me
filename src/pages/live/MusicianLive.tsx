/**
 * Vue musicien-invité du lien public UNIQUE (bifurcation « bœuf ») :
 * partition complète avec accords, transposée. Fonctionne SANS compte —
 * les accords viennent de l'état du direct (song.chords). Chargée en
 * différé : le spectateur ne télécharge cette brique que s'il la demande.
 */
import React, { useEffect, useMemo, useState } from 'react';

import { ChordLine } from '../../components/SongBody';
import { parseContent } from '../../lib/chordpro';
import {
  spellingForKey,
  semitonesBetween,
  transposeContent,
  transposeKeyName,
} from '../../lib/chords';
import { LiveState } from '../../lib/live';
import { decodeHtmlEntities, repairChordedLyrics } from '../../lib/textRepair';

export default function MusicianLive({
  state,
  onPublic,
  onKeep,
}: {
  state: LiveState;
  onPublic: () => void;
  /** App seulement : copie perso du morceau en cours (Idée). Renvoie un
   *  message de confirmation (« Gardé » / « Déjà dans ta bibliothèque »). */
  onKeep?: (song: NonNullable<LiveState['song']>) => string;
}) {
  const [keepMsg, setKeepMsg] = useState('');
  const [fontSize, setFontSize] = useState(1.05);
  // 'shapes' = les formes du leader (+ capo) ; 'real' = les vrais accords.
  const [chordMode, setChordMode] = useState<'shapes' | 'real'>('shapes');
  // Transposition PERSONNELLE du musicien invité (bœuf) : décalage en
  // demi-tons appliqué par-dessus la tonalité du leader — chacun sa vue.
  const [myShift, setMyShift] = useState(0);
  const song = state.song;
  const songTitle = song?.title ?? '';
  useEffect(() => {
    setKeepMsg('');
  }, [songTitle]);
  const active = state.status === 'on' || state.status === 'pause';

  const capo = song?.capo ?? 0;
  // Tonalité des formes que joue le leader.
  const shapeKey = song?.playedKey ?? '';
  // Tonalité réelle (ce qui sonne) = formes + capo.
  const realKey = shapeKey !== '' ? transposeKeyName(shapeKey, capo) : '';
  const showReal = chordMode === 'real' && capo > 0;

  const semis = useMemo(() => {
    if (!song?.chordKey || !shapeKey) {
      return (showReal ? capo : 0) + myShift;
    }
    if (song.chordKey === '' || shapeKey === '') {
      return (showReal ? capo : 0) + myShift;
    }
    const toShapes = semitonesBetween(song.chordKey, shapeKey) ?? 0;
    return toShapes + (showReal ? capo : 0) + myShift;
  }, [song, shapeKey, showReal, capo, myShift]);
  // Ma tonalité affichée = celle du leader décalée de mon transport perso.
  const baseKey = showReal ? realKey : shapeKey;
  const myKey =
    baseKey !== '' && myShift !== 0
      ? transposeKeyName(baseKey, myShift)
      : baseKey;
  const preferFlat = useMemo(() => spellingForKey(myKey), [myKey]);
  const lines = useMemo(() => {
    if (!song) return [];
    if (song.chords && song.chords !== '') {
      return parseContent(
        transposeContent(repairChordedLyrics(song.chords), semis, preferFlat),
      );
    }
    return parseContent(decodeHtmlEntities(song.lyrics));
  }, [song, semis, preferFlat]);
  const hasChords = !!song?.chords && song.chords !== '';

  return (
    <>
      {/* Retour visible SANS défiler (symétrique du bouton d'entrée côté
          public) — le bouton en bas de partition reste pour qui a tout lu. */}
      <div style={{ textAlign: 'center', margin: '0 0 10px' }}>
        <button className="btn ghost small" onClick={onPublic}>
          ← Revenir à la vue public
        </button>
      </div>
      <div className={`livebadge ${state.status === 'pause' ? 'pause' : ''}`}>
        {state.status === 'pause'
          ? '⏸ PAUSE'
          : state.mode === 'repet'
            ? '🎸 RÉPÉTITION'
            : '🎸 VUE MUSICIEN'}
      </div>
      {!active || !song ? (
        <p style={{ textAlign: 'center', fontSize: '1.05rem' }}>
          En attente de la session…
          <br />
          <span className="help">
            Dès que le leader lance un morceau, ta partition s'affiche ici,
            avec les accords dans la tonalité jouée.
          </span>
        </p>
      ) : (
        <>
          <h1 className="livetitle">{song.title}</h1>
          <p className="help" style={{ textAlign: 'center', marginTop: 0 }}>
            {[
              song.artist,
              showReal
                ? realKey !== ''
                  ? `Accords réels · ${realKey}`
                  : 'Accords réels'
                : shapeKey !== ''
                  ? capo > 0
                    ? `Formes ${shapeKey} · Capo ${capo} (sonne en ${realKey})`
                    : `Tonalité ${shapeKey}`
                  : '',
              myShift !== 0
                ? `Ma transpo ${myShift > 0 ? '+' : ''}${myShift}${
                    myKey !== '' ? ` (${myKey})` : ''
                  }`
                : '',
            ]
              .filter((x) => x !== '')
              .join(' · ')}
          </p>
          {capo > 0 && (
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <button
                className="btn ghost small"
                onClick={() =>
                  setChordMode((m) => (m === 'real' ? 'shapes' : 'real'))
                }
              >
                {showReal
                  ? `🎸 Voir comme le leader (${shapeKey}, capo ${capo})`
                  : `🎸 Voir les vrais accords (${realKey})`}
              </button>
            </div>
          )}
          {hasChords && (
            <div className="rowactions" style={{ justifyContent: 'center' }}>
              <button
                className="btn ghost"
                aria-label="Transposer un demi-ton plus bas"
                onClick={() => setMyShift((s) => Math.max(-11, s - 1))}
              >
                ♭ −1
              </button>
              {myShift !== 0 && (
                <button className="btn ghost" onClick={() => setMyShift(0)}>
                  Tonalité du leader
                </button>
              )}
              <button
                className="btn ghost"
                aria-label="Transposer un demi-ton plus haut"
                onClick={() => setMyShift((s) => Math.min(11, s + 1))}
              >
                ♯ +1
              </button>
            </div>
          )}
          <div style={{ fontSize: `${fontSize}rem`, padding: '0 4px' }}>
            {lines.map((line, i) => (
              <ChordLine key={i} line={line} />
            ))}
          </div>
          {/* Bœuf : garder une copie PERSONNELLE du morceau en cours
              (arrive en « Idée » — jamais partagée, décision Vincent). */}
          {onKeep && (
            <div style={{ textAlign: 'center', margin: '10px 0' }}>
              <button
                className="btn ghost small"
                disabled={keepMsg !== ''}
                onClick={() => setKeepMsg(onKeep(song))}
              >
                {keepMsg !== '' ? `✓ ${keepMsg}` : '➕ Garder ce morceau'}
              </button>
            </div>
          )}
          <div className="rowactions" style={{ justifyContent: 'center' }}>
            <button
              className="btn ghost"
              onClick={() =>
                setFontSize((f) => Math.max(0.8, +(f - 0.1).toFixed(2)))
              }
            >
              A−
            </button>
            <button
              className="btn ghost"
              onClick={() =>
                setFontSize((f) => Math.min(1.8, +(f + 0.1).toFixed(2)))
              }
            >
              A＋
            </button>
          </div>
        </>
      )}
      <p className="help" style={{ textAlign: 'center' }}>
        <button className="btn ghost small" onClick={onPublic}>
          ← Vue public
        </button>
      </p>
    </>
  );
}
