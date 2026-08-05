/**
 * Parseur du format [Accord]paroles pour l'affichage.
 */

export interface ChordSegment {
  chord: string | null;
  text: string;
}

export interface ParsedLine {
  segments: ChordSegment[];
  chordsOnly: boolean;
}

const CHORD_RE = /\[([^\]\n]+)\]/g;

export function parseLine(line: string): ParsedLine {
  const segments: ChordSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let pendingChord: string | null = null;

  CHORD_RE.lastIndex = 0;
  while ((match = CHORD_RE.exec(line)) !== null) {
    const before = line.slice(lastIndex, match.index);
    if (before.length > 0 || pendingChord !== null) {
      segments.push({ chord: pendingChord, text: before });
    }
    pendingChord = match[1];
    lastIndex = match.index + match[0].length;
  }
  const rest = line.slice(lastIndex);
  if (rest.length > 0 || pendingChord !== null) {
    segments.push({ chord: pendingChord, text: rest });
  }
  if (segments.length === 0) {
    segments.push({ chord: null, text: line });
  }

  const chordsOnly =
    segments.every((s) => s.text.trim() === '') &&
    segments.some((s) => s.chord !== null);

  return { segments, chordsOnly };
}

export function parseContent(content: string): ParsedLine[] {
  return content.split('\n').map(parseLine);
}

/** Retire tous les accords [X] (pour un partage « paroles seules »). */
export function stripChords(content: string): string {
  return content
    .replace(/\[([^\]\n]+)\]/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .filter((l, i, arr) => !(l.trim() === '' && (arr[i - 1] ?? '').trim() === ''))
    .join('\n');
}
