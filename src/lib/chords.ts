/**
 * Moteur musical : notes, accords, transposition, capo.
 */

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// Orthographe d'USAGE, sans contexte de tonalité : les bases de la
// musique — C# et F# s'écrivent en dièses, Eb/Ab/Bb en bémols
// (un A# est presque toujours un Bb).
const MIXED = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Choix d'orthographe des notes : `true` = bémols (tonalités
 * bémolisées), `false` = dièses (tonalités diésées), `'auto'` =
 * orthographe d'usage note par note (pas de contexte, ou Do/La m).
 */
export type Spelling = boolean | 'auto';

const NOTE_INDEX: { [name: string]: number } = {};
SHARP.forEach((n, i) => (NOTE_INDEX[n] = i));
FLAT.forEach((n, i) => (NOTE_INDEX[n] = i));
// équivalences supplémentaires
NOTE_INDEX['E#'] = 5;
NOTE_INDEX['B#'] = 0;
NOTE_INDEX['Cb'] = 11;
NOTE_INDEX['Fb'] = 4;

/** Tonalités proposées dans les sélecteurs (majeures ; le mode est porté par le suffixe). */
export const KEY_CHOICES = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
];

// Tonalités écrites « en bémols » (armure avec bémols)
const FLAT_MAJOR = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
const FLAT_MINOR = ['D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab'];

export interface ParsedKey {
  root: string;
  minor: boolean;
}

/** "Am" → {root:'A', minor:true} ; "Bb" → {root:'Bb', minor:false} */
export function parseKey(key: string): ParsedKey | null {
  const m = /^\s*([A-G](?:#|b)?)\s*(m|min|-)?\s*$/i.exec(key);
  if (!m) return null;
  let root = m[1];
  root = root[0].toUpperCase() + (root[1] ?? '');
  if (!(root in NOTE_INDEX)) return null;
  return { root, minor: m[2] !== undefined };
}

export function keyPrefersFlat(key: ParsedKey): boolean {
  return key.minor
    ? FLAT_MINOR.includes(key.root)
    : FLAT_MAJOR.includes(key.root);
}

/**
 * Orthographe à employer pour une tonalité donnée (chaîne libre) :
 * bémols pour F, Bb, Eb… ; dièses pour G, D, A, E… ; « auto »
 * (orthographe d'usage) quand la tonalité est inconnue ou neutre
 * (C majeur / A mineur, aucune altération à l'armure).
 */
export function spellingForKey(key: string): Spelling {
  const parsed = parseKey(key);
  if (!parsed) return 'auto';
  if (keyPrefersFlat(parsed)) return true;
  const neutral = parsed.minor ? parsed.root === 'A' : parsed.root === 'C';
  return neutral ? 'auto' : false;
}

export function noteIndex(name: string): number | null {
  return name in NOTE_INDEX ? NOTE_INDEX[name] : null;
}

export function transposeNote(
  name: string,
  semitones: number,
  preferFlat: Spelling,
): string {
  const idx = noteIndex(name);
  if (idx === null) return name;
  const next = ((idx + semitones) % 12 + 12) % 12;
  if (preferFlat === true) return FLAT[next];
  if (preferFlat === 'auto') return MIXED[next];
  return SHARP[next];
}

const CHORD_SYM = /^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/;

/** Transpose un symbole d'accord ("F#m7", "Bb/D") de n demi-tons. */
export function transposeChord(
  symbol: string,
  semitones: number,
  preferFlat: Spelling,
): string {
  const m = CHORD_SYM.exec(symbol.trim());
  if (!m) return symbol;
  const root = transposeNote(m[1], semitones, preferFlat);
  const rest = m[2] ?? '';
  const bass = m[3] ? '/' + transposeNote(m[3], semitones, preferFlat) : '';
  return root + rest + bass;
}

/** Transpose tous les accords [X] d'un contenu de section. */
export function transposeContent(
  content: string,
  semitones: number,
  preferFlat: Spelling,
): string {
  if (semitones === 0) return content;
  return content.replace(/\[([^\]\n]+)\]/g, (_all, sym: string) => {
    return '[' + transposeChord(sym, semitones, preferFlat) + ']';
  });
}

/** Transpose un nom de tonalité ("Am" → "Cm" pour +3). */
// Noms canoniques des tonalités par degré chromatique (usage courant) :
// jamais « D# majeur » (→ Eb) ni « Gb mineur » (→ F#m).
const MAJOR_KEY_CANON = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEY_CANON = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

export function transposeKeyName(key: string, semitones: number): string {
  const parsed = parseKey(key);
  if (!parsed) return key;
  const idx = noteIndex(parsed.root);
  if (idx === null) return key;
  const next = ((idx + semitones) % 12 + 12) % 12;
  const canon = parsed.minor ? MINOR_KEY_CANON : MAJOR_KEY_CANON;
  return canon[next] + (parsed.minor ? 'm' : '');
}

/**
 * Devine la tonalité d'un morceau d'après ses accords écrits. Heuristique
 * simple et prévisible : le premier accord est presque toujours la tonique
 * (à défaut, le plus fréquent), avec son mode (majeur / mineur). Sert à
 * corriger une tonalité importée erronée. Renvoie '' si aucun accord.
 */
export function detectKeyFromChords(content: string): string {
  const syms = [...content.matchAll(/\[([^\]\n]+)\]/g)].map((m) => m[1].trim());
  const parsed = syms
    .map((s) => {
      const m = CHORD_SYM.exec(s);
      if (!m) return null;
      const idx = noteIndex(m[1]);
      if (idx === null) return null;
      const minor = /^(m|min|-)(?!aj)/i.test(m[2] ?? '');
      return { idx, minor };
    })
    .filter((x): x is { idx: number; minor: boolean } => x !== null);
  if (parsed.length === 0) return '';
  // Compte des occurrences par (note, mode) pour départager en cas de doute.
  const tally = new Map<string, number>();
  for (const p of parsed) {
    const k = `${p.idx}|${p.minor ? 'm' : ''}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  const count = (p: { idx: number; minor: boolean }) =>
    tally.get(`${p.idx}|${p.minor ? 'm' : ''}`) ?? 0;
  // Le premier accord fait foi, sauf si le dernier (résolution) est plus
  // présent — un signal fort de tonique.
  const pick = count(last) > count(first) ? last : first;
  const canon = pick.minor ? MINOR_KEY_CANON : MAJOR_KEY_CANON;
  return canon[pick.idx] + (pick.minor ? 'm' : '');
}

/** Nombre de demi-tons entre deux tonalités (de from vers to, 0..11). */
export function semitonesBetween(from: string, to: string): number | null {
  const a = parseKey(from);
  const b = parseKey(to);
  if (!a || !b) return null;
  const ia = noteIndex(a.root);
  const ib = noteIndex(b.root);
  if (ia === null || ib === null) return null;
  return ((ib - ia) % 12 + 12) % 12;
}

/** Tonalités « ouvertes » faciles à la guitare. */
const OPEN_MAJOR = ['C', 'G', 'D', 'A', 'E'];
const OPEN_MINOR = ['Am', 'Em', 'Dm'];

/**
 * Suggestion automatique de capo : trouve la position (0-7) qui permet de
 * jouer des formes d'accords ouvertes pour la tonalité donnée (sonnante).
 * Retourne null si la tonalité est déjà « ouverte » ou invalide.
 */
export function suggestCapo(
  soundingKey: string,
): { capo: number; shapeKey: string } | null {
  const parsed = parseKey(soundingKey);
  if (!parsed) return null;
  const openList = parsed.minor ? OPEN_MINOR : OPEN_MAJOR;
  const current = parsed.root + (parsed.minor ? 'm' : '');
  if (openList.includes(current)) return null;
  for (let capo = 1; capo <= 7; capo++) {
    const shapeRoot = transposeNote(parsed.root, -capo, false);
    const shape = shapeRoot + (parsed.minor ? 'm' : '');
    if (openList.includes(shape)) {
      return { capo, shapeKey: shape };
    }
  }
  return null;
}

/**
 * Applique la vue « capo » : les formes affichées sont transposées
 * vers le bas de `capo` demi-tons par rapport à la tonalité sonnante.
 */
export function shapesForCapo(
  content: string,
  capo: number,
  preferFlat: Spelling,
): string {
  if (capo <= 0) return content;
  return transposeContent(content, -capo, preferFlat);
}
