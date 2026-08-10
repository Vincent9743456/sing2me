/**
 * Parseur du format [Accord]paroles pour l'affichage.
 */
import { sectionDeLaLigne } from './sections';

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
  /** En-tête de section (« Refrain », « Couplet 2 ») : ni parole ni accord,
   *  un repère de lecture. Absent sur toutes les autres lignes. */
  section?: string;
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
  // Un en-tête de section se lit AVANT tout : « Coda : » et « Final : »
  // commencent par une note, ils passeraient pour des accords.
  const section = sectionDeLaLigne(line);
  if (section !== null) {
    return {
      segments: [{ chord: null, text: section }],
      chordsOnly: false,
      section,
    };
  }
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

/**
 * PAROLES SEULES — ce que lit le public (page du QR, vue « paroles »,
 * partage). Les accords partent, mais une ligne qui n'était QUE des accords
 * s'en va aussi : elle laissait sinon un blanc au milieu de la chanson, et
 * l'intro (« |Em D G| ») ouvrait le texte sur une ligne vide.
 *
 * Les en-têtes de sections restent : ils disent au spectateur où il en est.
 * Les blancs sont normalisés (jamais deux d'affilée, aucun en tête ni en
 * queue) et les espaces de fin de ligne retirés — dans un texte centré, ils
 * décalent visiblement le vers.
 */
export function stripChords(content: string): string {
  const brut: string[] = [];
  for (const src of content.split('\n')) {
    if (sectionDeLaLigne(src) !== null) {
      brut.push(src.trim());
      continue;
    }
    if (isPlainChordLine(src)) continue;
    const l = src.replace(/\[([^\]\n]+)\]/g, '').replace(/\s+$/g, '');
    // Il ne restait que des accords sur cette ligne.
    if (l.trim() === '' && src.trim() !== '') continue;
    brut.push(l);
  }
  // Un en-tête sans une seule parole en dessous n'apprend rien à qui LIT :
  // l'intro n'était qu'une grille d'accords, elle vient de disparaître.
  const utiles = brut.filter((l, i) => {
    if (sectionDeLaLigne(l) === null) return true;
    for (let j = i + 1; j < brut.length; j++) {
      if (sectionDeLaLigne(brut[j]) !== null) return false;
      if (brut[j].trim() !== '') return true;
    }
    return false;
  });
  const out: string[] = [];
  for (const l of utiles) {
    if (l.trim() === '' && (out[out.length - 1] ?? '').trim() === '') continue;
    out.push(l);
  }
  while (out.length > 0 && (out[out.length - 1] ?? '').trim() === '') out.pop();
  return out.join('\n');
}
