/**
 * Corps d'un morceau selon la vue choisie :
 * - complete : structure + paroles avec accords (chant/guitare)
 * - accords  : structure avec suites d'accords en grand (basse)
 * - structure: structure et commentaires (batterie)
 * - paroles  : paroles seules (public)
 */
import React from 'react';

import { parseContent, ParsedLine } from '../lib/chordpro';
import { Spelling, transposeContent } from '../lib/chords';
import { repairChordedLyrics } from '../lib/textRepair';
import { fillStructureChords, transposeChordSequence } from '../lib/model';
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
  return (
    <div className="chordline">
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

/** Notes générales : sans cible, ou dont la cible n'existe plus. */
export function globalNotes(song: Song): SongNote[] {
  const labels = new Set(song.structure.map((r) => r.label.trim()));
  return song.rehearsalNotes.filter(
    (n) => n.target === '' || !labels.has(n.target),
  );
}

function NoteLine({ note }: { note: SongNote }) {
  return (
    <span className="stnote">
      {note.visibility === 'privee' ? '🔒 ' : '💬 '}
      {note.target !== '' ? '' : ''}
      {note.text}
      {note.author !== '' && <em className="stauthor"> — {note.author}</em>}
    </span>
  );
}

function StructureBlock({
  song,
  shift,
  preferFlat,
  showChords,
  showComments,
  big,
}: {
  song: Song;
  shift: number;
  preferFlat: Spelling;
  showChords: boolean;
  showComments: boolean;
  big: boolean;
}) {
  const rows = fillStructureChords(
    song.structure.filter(
      (r) =>
        r.label.trim() !== '' ||
        r.chords.trim() !== '' ||
        r.comment.trim() !== '',
    ),
  );
  if (rows.length === 0) return null;
  const seen = new Set<string>();
  return (
    <div className={`structure ${big ? 'big' : ''}`}>
      {rows.map((row) => {
        const label = row.label.trim();
        const first = !seen.has(label);
        seen.add(label);
        const notes =
          showComments && first
            ? song.rehearsalNotes.filter((n) => n.target === label)
            : [];
        return (
          <div className="strow" key={row.id}>
            <span className="stlabel">{row.label}</span>
            {showChords && row.chords.trim() !== '' && (
              <span
                className={`stchords ${row.inheritedFrom !== '' ? 'inherited' : ''}`}
                title={
                  row.inheritedFrom !== ''
                    ? `Mêmes accords que ${row.inheritedFrom}`
                    : undefined
                }
              >
                {transposeChordSequence(row.chords, shift, preferFlat)}
              </span>
            )}
            {showComments && row.comment.trim() !== '' && (
              <span className="stcomment">{row.comment}</span>
            )}
            {notes.map((n) => (
              <NoteLine note={n} key={n.id} />
            ))}
          </div>
        );
      })}
    </div>
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

  if (view === 'accords' || view === 'structure') {
    return (
      <div style={{ fontSize: `${fontSize}rem` }}>
        <StructureBlock
          song={song}
          shift={shift}
          preferFlat={preferFlat}
          showChords={view === 'accords'}
          showComments
          big
        />
        {song.structure.length === 0 && (
          <p className="help">
            Pas encore de structure pour ce morceau — ajoute-la en modifiant
            le morceau (Intro, Couplet, Refrain… avec accords et
            commentaires).
          </p>
        )}
      </div>
    );
  }

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
          <summary>🗺 Structure</summary>
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
