/**
 * LES SECTIONS D'UNE PARTITION — Intro, Couplet 1, Refrain, Pont…
 *
 * Le vocabulaire vivait en double : une expression régulière dans
 * l'importateur (pour DÉCOUPER le fichier) et rien du tout à l'affichage —
 * l'importateur reconnaissait « Refrain », s'en servait pour construire le
 * résumé de structure… puis JETAIT le mot. Depuis que « Structure » est
 * devenu un bloc de notes libres, plus aucun écran ne le montrait : le
 * musicien recevait un bloc de paroles continu, sans savoir où commence le
 * refrain.
 *
 * Un seul endroit décrit donc les sections, et il ne dépend de rien (il est
 * embarqué jusque dans l'entrée publique légère).
 *
 * MARQUEUR RETENU : la ligne « Refrain : » — du texte ordinaire, écrit
 * comme un musicien l'écrirait. Surtout PAS « [Refrain] » : tout le reste de
 * l'application lit les crochets comme des accords (`[Coda]`, `[Couplet 1]`
 * et `[Final]` commencent par C, C et F — ils seraient transposés).
 */

const NOMS = [
  'intro',
  'couplet',
  'verse',
  'strophe',
  'refrain',
  'chorus',
  'pont',
  'bridge',
  'pre[- ]?chorus',
  'pr[eé][- ]?refrain',
  'solo',
  'instrumental',
  'interlude',
  'outro',
  'coda',
  'final',
].join('|');

/**
 * Groupes : 1 = crochet/parenthèse ouvrante, 2 = nom, 3 = numéro,
 * 4 = deux-points. Les décorations sont facultatives ici : à l'IMPORT, une
 * ligne « Refrain » toute seule est bien un en-tête.
 */
export const SECTION_HEADER_RE = new RegExp(
  `^\\s*([\\[(])?\\s*(${NOMS})\\s*(\\d*)\\s*[\\])]?\\s*(:)?\\s*$`,
  'i',
);

const LABEL_MAP: { [k: string]: string } = {
  intro: 'Intro',
  couplet: 'Couplet',
  verse: 'Couplet',
  strophe: 'Couplet',
  refrain: 'Refrain',
  chorus: 'Refrain',
  pont: 'Pont',
  bridge: 'Pont',
  prechorus: 'Pré-refrain',
  prerefrain: 'Pré-refrain',
  prérefrain: 'Pré-refrain',
  solo: 'Solo',
  instrumental: 'Instrumental',
  interlude: 'Interlude',
  outro: 'Outro',
  coda: 'Coda',
  final: 'Final',
};

/** « chorus » → « Refrain » ; '' si le mot n'est pas une section connue. */
export function canonicalSection(nom: string): string {
  return LABEL_MAP[nom.toLowerCase().replace(/[- ]/g, '')] ?? '';
}

export interface SectionHeader {
  /** Libellé canonique, sans numéro (« Couplet »). */
  label: string;
  /** Numéro écrit dans le fichier, ou '' (l'import tient un compteur). */
  num: string;
}

/**
 * Lecture TOLÉRANTE, pour l'import : « Refrain », « [Couplet 2] »,
 * « Chorus: », « (pont) »… Tout ce qu'on trouve dans un fichier trouvé
 * sur le web.
 */
export function lireEnTeteDeSection(ligne: string): SectionHeader | null {
  const m = SECTION_HEADER_RE.exec(ligne);
  if (!m) return null;
  const label = canonicalSection(m[2]);
  if (label === '') return null;
  return { label, num: m[3] ?? '' };
}

/**
 * Lecture EXIGEANTE, pour l'AFFICHAGE : une décoration est obligatoire
 * (crochets, parenthèses ou deux-points). Sans elle, une parole qui dirait
 * simplement « Solo » ou « Final » deviendrait un titre de section au beau
 * milieu d'une chanson.
 *
 * Renvoie le libellé prêt à afficher (« Couplet 2 »), ou null.
 */
export function sectionDeLaLigne(ligne: string): string | null {
  const m = SECTION_HEADER_RE.exec(ligne);
  if (!m) return null;
  if (m[1] === undefined && m[4] === undefined) return null;
  const label = canonicalSection(m[2]);
  if (label === '') return null;
  return m[3] !== '' ? `${label} ${m[3]}` : label;
}

/** Écrit l'en-tête tel qu'il est enregistré dans les paroles. */
export function ligneDeSection(label: string): string {
  return `${label} :`;
}
