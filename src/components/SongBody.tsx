/**
 * Corps d'un morceau selon la vue choisie :
 * - complete : notes de structure + paroles avec accords
 * - paroles  : paroles seules (public, écran du QR)
 */
import React, { useState } from 'react';

import { t } from '../i18n';
import { parseContent, ParsedLine, stripChords } from '../lib/chordpro';
import { Spelling, transposeContent } from '../lib/chords';
import { ChordSheet } from './ChordDiagram';
import { positionsPour } from '../lib/chordshapes';
import { parolesPubliques, parolesRetouchees } from '../lib/publiclyrics';
import { repairChordedLyrics } from '../lib/textRepair';
import { Song, SongNote, ViewMode } from '../types';

export function ChordLine({ line }: { line: ParsedLine }) {
  const hasChords = line.segments.some((s) => s.chord !== null);
  // En-tête de section (b219) : le repère de lecture que l'import
  // reconnaissait puis jetait. Ni parole ni accord — sa propre ligne.
  if (line.section != null) {
    return <div className="songsection">{line.section}</div>;
  }
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
  } else if (parolesRetouchees(song)) {
    // L'artiste a écrit lui-même ce que lit le public (b223) : c'est ce
    // texte-là, sur TOUS les écrans où quelqu'un lit des paroles seules —
    // sinon la vue « paroles » d'ici montrerait autre chose que le direct.
    content = parolesPubliques(song);
  } else {
    // Une seule fonction prépare les « paroles seules » (b219) : la vue
    // paroles d'ici et ce qui part vers le public sortent du même moule.
    content = stripChords(content);
  }
  const lines = parseContent(content);

  // « Structure » = notes générales libres (plus de découpage par
  // sections ni d'accords par partie).
  const structureNotes = (song.structureNotes ?? '').trim();

  /**
   * POSITION D'ACCORD AU CLIC (b225, demande de Vincent — comme le font les
   * autres recueils). Par DÉLÉGATION sur le bloc entier : threader une
   * fonction jusque dans chaque segment aurait alourdi le rendu de la
   * partition, qui est le chemin le plus chaud de l'app.
   *
   * Un accord qu'on ne sait pas dessiner ne s'ouvre PAS — pas de feuille
   * vide, et surtout pas de doigté inventé.
   */
  const [accordOuvert, setAccordOuvert] = useState<{
    symbole: string;
    ancre: { x: number; bas: number; haut: number };
  } | null>(null);
  const positions =
    accordOuvert === null ? [] : positionsPour(accordOuvert.symbole);

  function surClicAccord(e: React.MouseEvent<HTMLDivElement>) {
    if (!showChords) return;
    const cible = (e.target as HTMLElement).closest('.chord');
    if (!cible) return;
    const symbole = (cible.textContent ?? '').trim();
    if (symbole === '' || positionsPour(symbole).length === 0) return;
    // La pastille se pose SOUS l'accord touché : elle doit savoir où il est.
    const r = cible.getBoundingClientRect();
    setAccordOuvert({
      symbole,
      ancre: { x: r.left + r.width / 2, bas: r.bottom, haut: r.top },
    });
  }

  return (
    <div style={{ fontSize: `${fontSize}rem` }} onClick={surClicAccord}>
      {accordOuvert !== null && positions.length > 0 && (
        <ChordSheet
          symbole={accordOuvert.symbole}
          positions={positions}
          ancre={accordOuvert.ancre}
          onClose={() => setAccordOuvert(null)}
        />
      )}
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
