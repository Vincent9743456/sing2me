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
  /** Ligne d'accords « brute » (sans crochets) : intro / grille de mesures
   *  du type « |Em D G| » — à afficher telle quelle, en couleur d'accord. */
  plainChords?: boolean;
}

const CHORD_RE = /\[([^\]\n]+)\]/g;

// Jeton d'accord strict (racine + qualité contrôlée + basse) : permet de
// reconnaître une ligne d'accords écrite SANS crochets (« Em D G »,
// « |C |G D | »…) sans confondre avec des paroles.
const PLAIN_CHORD_TOKEN =
  /^\(?[A-G](?:#|b)?(?:maj|min|dim|aug|sus|add|m|M|\+|°|ø)?\d*(?:(?:sus|add|maj)\d+)?(?:\/[A-G](?:#|b)?)?\)?$/;
// Jetons décoratifs tolérés dans une grille (les barres « | » sont
// détachées avant le découpage, elles n'apparaissent donc pas ici).
const PLAIN_NOISE_TOKEN = /^(%|-|–|—|:|x\d+|\(x\d+\)|N\.?C\.?|\.|,)$/i;

/**
 * La ligne est-elle une ligne d'accords brute (sans crochets) ? On détache
 * d'abord les barres de mesure collées aux accords (« |Em », « G| ») puis on
 * exige que chaque jeton soit un accord ou un décor — au moins un accord.
 */
export function isPlainChordLine(line: string): boolean {
  if (line.includes('[')) return false; // accords entre crochets : déjà gérés
  const tokens = line
    .replace(/\|/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t !== '');
  if (tokens.length === 0) return false;
  let chords = 0;
  for (const t of tokens) {
    if (PLAIN_CHORD_TOKEN.test(t)) chords++;
    else if (!PLAIN_NOISE_TOKEN.test(t)) return false;
  }
  return chords > 0;
}

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

  // Aucun accord entre crochets, mais la ligne EST une grille d'accords
  // (« |Em D G| ») → on la marque pour l'afficher en couleur d'accord.
  const noBracketChords = segments.every((s) => s.chord === null);
  if (noBracketChords && isPlainChordLine(line)) {
    return { segments, chordsOnly: true, plainChords: true };
  }

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
