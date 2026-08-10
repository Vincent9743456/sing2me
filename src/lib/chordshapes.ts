/**
 * POSITIONS D'ACCORDS À LA GUITARE (b225, demande de Vincent : « permettre
 * l'affichage d'une position d'accords guitare en cliquant sur l'accord »).
 *
 * Trois principes, dans cet ordre :
 *
 *  1. **HORS LIGNE, TOUJOURS.** Pas de service, pas de base distante, pas de
 *     dépendance : un musicien qui déchiffre un accord est souvent dans une
 *     cave de répétition sans réseau. Tout est calculé ici, en quelques
 *     centaines d'octets.
 *
 *  2. **LA POSITION OUVERTE D'ABORD.** C'est celle que le monde entier joue
 *     et celle qu'on veut voir quand on demande « c'est quoi, ce Bm7 ? ».
 *     Elle vient d'une table écrite à la main, parce qu'aucune règle ne la
 *     génère : un C ouvert n'est pas « un barré à la case 0 ».
 *
 *  3. **LE BARRÉ ENSUITE, CALCULÉ.** Toute la logique du manche tient dans
 *     deux gabarits — la forme de E (fondamentale sur la 6ᵉ corde) et la
 *     forme de A (sur la 5ᵉ) — qu'on déplace. Ça couvre les douze
 *     fondamentales sans écrire cent quarante-quatre tableaux, et ça donne
 *     au musicien EXACTEMENT ce qu'il cherche : « et plus haut sur le
 *     manche, ça donne quoi ? ».
 *
 * Cordes indexées de la 6ᵉ (mi grave) à la 1ʳᵉ (mi aigu). Une case vaut
 * `MUET` (corde non jouée), 0 (à vide) ou le numéro de case ABSOLU.
 *
 * On ne prétend PAS être exhaustif : un accord inconnu ne renvoie rien, et
 * l'interface le dit plutôt que d'inventer une position fausse — un doigté
 * faux est pire que pas de doigté.
 */
import { noteIndex } from './chords';

export const MUET = -1;

export interface Position {
  /** 6 cases, de la 6ᵉ corde à la 1ʳᵉ. MUET, 0 (à vide) ou case absolue. */
  cases: number[];
  /** Barré éventuel : une case, de la corde `de` à la corde `a` (indices). */
  barre?: { case_: number; de: number; a: number };
  /** Position ouverte (au sillet) — celle qu'on joue par défaut. */
  ouverte: boolean;
  /** Corde qui porte la fondamentale : 6 ou 5 (0 quand on ne sait pas). */
  cordeRacine: number;
  /**
   * Le LIBELLÉ n'est pas ici : ce module ne parle aucune langue. C'est
   * l'interface qui l'écrit (`ChordDiagram`), avec `t()` — un module de
   * calcul qui fabrique du texte finit par le fabriquer en français dans
   * l'app anglaise.
   */
}

/** Symbole d'accord découpé : fondamentale, qualité, basse éventuelle. */
const SYMBOLE = /^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/;

/**
 * Familles reconnues. La clé est la qualité NORMALISÉE ; les variantes
 * d'écriture (« min », « -", « M7 »…) y sont ramenées par `normalise`.
 */
type Qualite =
  | 'maj' | 'm' | '7' | 'm7' | 'maj7' | 'sus4' | 'sus2'
  | '6' | 'm6' | '9' | 'add9' | 'dim' | 'dim7' | 'aug' | '5';

/** Ramène une qualité écrite de vingt façons à une famille connue. */
export function normalise(qualite: string): Qualite | null {
  const q = qualite.trim();
  if (q === '' || q === 'maj' || q === 'M') return 'maj';
  if (/^(m|min|-)$/.test(q)) return 'm';
  if (/^(7|dom7)$/.test(q)) return '7';
  if (/^(m7|min7|-7)$/.test(q)) return 'm7';
  if (/^(maj7|M7|Δ|ma7)$/.test(q)) return 'maj7';
  if (/^(sus|sus4)$/.test(q)) return 'sus4';
  if (q === 'sus2') return 'sus2';
  if (q === '6') return '6';
  if (/^(m6|min6)$/.test(q)) return 'm6';
  if (q === '9') return '9';
  if (/^(add9|add2)$/.test(q)) return 'add9';
  if (/^(dim|°|o)$/.test(q)) return 'dim';
  if (/^(dim7|°7|o7)$/.test(q)) return 'dim7';
  if (/^(aug|\+|#5)$/.test(q)) return 'aug';
  if (/^(5|no3)$/.test(q)) return '5';
  return null;
}

/**
 * POSITIONS OUVERTES — écrites à la main, parce qu'elles ne se déduisent de
 * rien. Clé : `fondamentale|qualité`. Ce sont celles qu'on joue vraiment ;
 * la liste s'arrête volontairement là où l'usage s'arrête.
 */
const OUVERTES: Record<string, number[]> = {
  'C|maj': [MUET, 3, 2, 0, 1, 0],
  'C|7': [MUET, 3, 2, 3, 1, 0],
  'C|maj7': [MUET, 3, 2, 0, 0, 0],
  'C|add9': [MUET, 3, 2, 0, 3, 0],
  'D|maj': [MUET, MUET, 0, 2, 3, 2],
  'D|m': [MUET, MUET, 0, 2, 3, 1],
  'D|7': [MUET, MUET, 0, 2, 1, 2],
  'D|m7': [MUET, MUET, 0, 2, 1, 1],
  'D|maj7': [MUET, MUET, 0, 2, 2, 2],
  'D|sus4': [MUET, MUET, 0, 2, 3, 3],
  'D|sus2': [MUET, MUET, 0, 2, 3, 0],
  'E|maj': [0, 2, 2, 1, 0, 0],
  'E|m': [0, 2, 2, 0, 0, 0],
  'E|7': [0, 2, 0, 1, 0, 0],
  'E|m7': [0, 2, 0, 0, 0, 0],
  'E|maj7': [0, 2, 1, 1, 0, 0],
  'E|sus4': [0, 2, 2, 2, 0, 0],
  'F|maj7': [MUET, MUET, 3, 2, 1, 0],
  'G|maj': [3, 2, 0, 0, 0, 3],
  'G|7': [3, 2, 0, 0, 0, 1],
  'G|maj7': [3, 2, 0, 0, 0, 2],
  'G|sus4': [3, 3, 0, 0, 1, 3],
  'A|maj': [MUET, 0, 2, 2, 2, 0],
  'A|m': [MUET, 0, 2, 2, 1, 0],
  'A|7': [MUET, 0, 2, 0, 2, 0],
  'A|m7': [MUET, 0, 2, 0, 1, 0],
  'A|maj7': [MUET, 0, 2, 1, 2, 0],
  'A|sus4': [MUET, 0, 2, 2, 3, 0],
  'A|sus2': [MUET, 0, 2, 2, 0, 0],
  'B|7': [MUET, 2, 1, 2, 0, 2],
  'B|m7': [MUET, 2, 0, 2, 0, 2],
};

/**
 * GABARITS DÉPLAÇABLES. Écarts en cases par rapport à la fondamentale, la
 * corde qui la porte étant à 0. `null` = corde non jouée.
 */
const FORME_MI: Partial<Record<Qualite, (number | null)[]>> = {
  maj: [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  '7': [0, 2, 0, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0],
  sus4: [0, 2, 2, 2, 0, 0],
  '6': [0, 2, 2, 1, 2, 0],
  m6: [0, 2, 2, 0, 2, 0],
  '9': [0, 2, 0, 1, 0, 2],
  aug: [0, 3, 2, 1, 1, 0],
  '5': [0, 2, 2, null, null, null],
};

const FORME_LA: Partial<Record<Qualite, (number | null)[]>> = {
  maj: [null, 0, 2, 2, 2, 0],
  m: [null, 0, 2, 2, 1, 0],
  '7': [null, 0, 2, 0, 2, 0],
  m7: [null, 0, 2, 0, 1, 0],
  maj7: [null, 0, 2, 1, 2, 0],
  sus4: [null, 0, 2, 2, 3, 0],
  sus2: [null, 0, 2, 2, 0, 0],
  '6': [null, 0, 2, 2, 2, 2],
  m6: [null, 0, 2, 2, 1, 2],
  '9': [null, 0, 2, 4, 2, 3],
  add9: [null, 0, 2, 4, 2, 0],
  dim: [null, 0, 1, 2, 1, null],
  dim7: [null, 0, 1, 2, 1, 2],
  aug: [null, 0, 3, 2, 2, 1],
  '5': [null, 0, 2, 2, null, null],
};

/** Note à vide de chaque corde, de la 6ᵉ à la 1ʳᵉ. */
const CORDES = ['E', 'A', 'D', 'G', 'B', 'E'];

/** Écart en demi-tons de `note` au-dessus de la corde à vide `corde`. */
function ecart(corde: string, note: string): number | null {
  const a = noteIndex(corde);
  const b = noteIndex(note);
  if (a === null || b === null) return null;
  return ((b - a) % 12 + 12) % 12;
}

/** Applique un gabarit à une case de barré. */
function poser(
  gabarit: (number | null)[],
  caseBarre: number,
  cordeRacine: number,
): Position | null {
  const cases = gabarit.map((d) => (d === null ? MUET : d + caseBarre));
  // Un gabarit posé à la case 0 n'est pas un barré : c'est la position
  // ouverte, déjà dans la table (et jouée autrement).
  const jouees = cases
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c !== MUET);
  if (jouees.length === 0) return null;
  // Les cordes tenues à la case du barré, de la plus grave à la plus aiguë.
  const surLeBarre = jouees.filter((x) => x.c === caseBarre).map((x) => x.i);
  const barre =
    caseBarre > 0 && surLeBarre.length >= 2
      ? {
          case_: caseBarre,
          de: Math.min(...surLeBarre),
          a: Math.max(...surLeBarre),
        }
      : undefined;
  return {
    cases,
    barre,
    ouverte: caseBarre === 0,
    cordeRacine: cordeRacine === 0 ? 6 : 5,
  };
}

/**
 * Positions proposées pour un symbole d'accord, la plus courante d'abord.
 * Tableau VIDE quand on ne sait pas : mieux vaut ne rien montrer qu'un
 * doigté faux.
 */
export function positionsPour(symbole: string): Position[] {
  const m = SYMBOLE.exec((symbole ?? '').trim());
  if (!m) return [];
  const fondamentale = m[1];
  const qualite = normalise(m[2] ?? '');
  if (qualite === null) return [];
  if (noteIndex(fondamentale) === null) return [];

  const out: Position[] = [];
  const ouverte = OUVERTES[`${fondamentale}|${qualite}`];
  if (ouverte) {
    out.push({ cases: [...ouverte], ouverte: true, cordeRacine: 0 });
  }

  // Barrés : forme de Mi (fondamentale sur la 6ᵉ corde), puis forme de La.
  const gMi = FORME_MI[qualite];
  const eMi = ecart(CORDES[0], fondamentale);
  if (gMi && eMi !== null) {
    const p = poser(gMi, eMi, 0);
    if (p && eMi > 0) out.push(p);
  }
  const gLa = FORME_LA[qualite];
  const eLa = ecart(CORDES[1], fondamentale);
  if (gLa && eLa !== null) {
    const p = poser(gLa, eLa, 1);
    if (p && eLa > 0) out.push(p);
  }
  // Une fondamentale à vide (E, A) n'a pas de barré à la case 0 : sa position
  // ouverte est déjà là. Mais on veut quand même une deuxième option plus
  // haut sur le manche — la même forme une octave au-dessus.
  if (out.length === 1 && gMi && eMi === 0) {
    const p = poser(gMi, 12, 0);
    if (p) out.push(p);
  }
  if (out.length === 1 && gLa && eLa === 0) {
    const p = poser(gLa, 12, 1);
    if (p) out.push(p);
  }
  // Les positions les plus basses d'abord : c'est là que la main se pose.
  return out
    .slice(0, 3)
    .sort((a, b) => hauteur(a) - hauteur(b));
}

/** Case la plus basse réellement jouée (0 pour une position ouverte). */
function hauteur(p: Position): number {
  const jouees = p.cases.filter((c) => c > 0);
  return jouees.length === 0 ? 0 : Math.min(...jouees);
}

/** Y a-t-il quelque chose à montrer pour ce symbole ? */
export function connaitLAccord(symbole: string): boolean {
  return positionsPour(symbole).length > 0;
}
