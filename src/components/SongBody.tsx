/**
 * Corps d'un morceau selon la vue choisie :
 * - complete : notes de structure + paroles avec accords
 * - paroles  : paroles seules (public, écran du QR)
 */
import React from 'react';

import { t } from '../i18n';
import { parseContent, ParsedLine } from '../lib/chordpro';
import { Spelling, transposeContent } from '../lib/chords';
import { repairChordedLyrics } from '../lib/textRepair';
import { Song, SongNote, ViewMode } from '../types';

export function ChordLine({ line }: { line: ParsedLine }) {
  const hasChords = line.segments.some((s) => s.chord !== null);
  if (
    line.segments.length === 1 &&
    line.segments[0].chord === null &&
    line.segments[0].text.trim() === ''
  ) {
    return <div style={{ height: '0.8em' }} />;
  }
  // Grille d'accords brute (« |Em D G| ») : affichée telle quelle, en
  // couleur d'accord, sans reflow (espacement et barres préservés).
  if (line.plainChords) {
    return <div className="chordrow">{line.segments[0].text}</div>;
  }
  return (
    // Ligne d'accords SEULS (intro, ponts…) : les paroles ne sont pas
    // rendues, donc rien ne sépare les segments — la classe ajoute
    // l'espacement (sinon « Gm Bb Cm » s'affiche collé « GmBbCm »).
    <div className={`chordline${line.chordsOnly ? ' chordsonly' : ''}`}>
      {line.segments.map((seg, i) => (
        <span className="seg" key={i}>
          {hasChords && <span className="chord">{seg.chord ?? ' '}</span>}
          {!line.chordsOnly && (
            <span className="lyric">{seg.text === '' ? ' ' : seg.text}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * Notes de répétition d'un morceau (b147). Le ciblage par section
 * n'existe plus depuis que « Structure » est devenu un texte libre :
 * toutes les notes sont générales.
 */
export function globalNotes(song: Song): SongNote[] {
  return song.rehearsalNotes;
}

function NoteLine({ note }: { note: SongNote }) {
  return (
    <span className="stnote">
      {note.visibility === 'privee' ? '🔒 ' : '💬 '}
      {note.text}
      {note.author !== '' && <em className="stauthor"> — {note.author}</em>}
    </span>
  );
}


export function SongBody({
  song,
  view = 'complete',
  semitones = 0,
  capo = 0,
  preferFlat = false,
  fontSize = 1,
}: {
  song: Song;
  view?: ViewMode;
  semitones?: number;
  capo?: number;
  preferFlat?: Spelling;
  fontSize?: number;
}) {
  const shift = semitones - capo;

  const showChords = view === 'complete';
  // Filet de sécurité : les entités HTML restées dans d'anciennes données
  // sont décodées aussi à l'affichage — même coupées en deux par un
  // accord (« d&eac[F#m]ute;sormais » → « dé[F#m]sormais »).
  let content = repairChordedLyrics(song.lyrics);
  if (showChords) {
    content = transposeContent(content, shift, preferFlat);
  } else {
    content = content.replace(/\[([^\]\n]+)\]/g, '');
  }
  let lines = parseContent(content);
  if (!showChords) {
    // en « paroles seules », on retire les lignes qui n'étaient que des grilles
    const srcLines = song.lyrics.split('\n');
    lines = lines.filter((l, i) => {
      const wasGrid =
        (srcLines[i] ?? '').includes('[') &&
        l.segments.every((s) => s.text.trim() === '');
      return !wasGrid;
    });
  }

  // « Structure » = notes générales libres (plus de découpage par
  // sections ni d'accords par partie).
  const structureNotes = (song.structureNotes ?? '').trim();

  return (
    <div style={{ fontSize: `${fontSize}rem` }}>
      {view === 'complete' && structureNotes !== '' && (
        <details className="stfold" open>
          <summary>{t('🗺 Structure')}</summary>
          <p
            className="help"
            style={{ whiteSpace: 'pre-wrap', margin: '6px 0 10px' }}
          >
            {structureNotes}
          </p>
        </details>
      )}
      {lines.map((line, i) => (
        <ChordLine key={i} line={line} />
      ))}
    </div>
  );
}
