/**
 * POSITIONS D'ACCORDS À LA GUITARE — LUES, JAMAIS INVENTÉES (b229).
 *
 * b225 CALCULAIT les positions à partir de gabarits déplaçables. L'idée
 * paraissait élégante ; elle était fausse. Elle vérifiait l'harmonie — les
 * bonnes notes — et jamais l'ergonomie, et elle a produit un G6 barré case 3
 * qui demande quatre doigts au-dessus du barré alors qu'il n'en reste que
 * trois (signalement de Vincent). b228 avait colmaté en refusant tout ce qui
 * n'était pas tenable ; c'était un pansement sur une méthode, pas une
 * méthode.
 *
 * Vincent a tranché : « trop dangereux de les inventer ». Donc on ne les
 * invente plus. `src/lib/chorddb.ts` contient des positions RELEVÉES par des
 * guitaristes — avec le numéro de chaque doigt et l'emplacement du barré —
 * tirées de `chords-db` (David Rubert, licence MIT) et figées dans le dépôt.
 *
 * Ce que ça garde du cahier des charges :
 *   - HORS LIGNE : la table est commitée, aucune dépendance, aucun réseau ;
 *   - RIEN D'INVENTÉ : un accord absent de la table n'ouvre pas ;
 *   - LÉGER : 32 Ko, encodés (« x32010/032010@3 »).
 *
 * `estJouable` reste, en filet : si la table venait un jour à contenir une
 * position hors de portée, elle ne passerait pas.
 */
import { noteIndex } from './chords';
import { ACCORDS } from './chorddb';

export const MUET = -1;

export interface Position {
  /** 6 cases, de la 6ᵉ corde à la 1ʳᵉ. MUET, 0 (à vide) ou case absolue. */
  cases: number[];
  /** Doigt par corde (0 = aucun, 1 = index … 4 = auriculaire). */
  doigts: number[];
  /** Barré éventuel : une case, de la corde `de` à la corde `a` (indices). */
  barre?: { case_: number; de: number; a: number };
  /** Position ouverte (au sillet) — celle qu'on joue par défaut. */
  ouverte: boolean;
  /** Corde qui porte la fondamentale : 6 ou 5 (0 quand elle est ailleurs). */
  cordeRacine: number;
  /** Basse imposée par un accord barre-oblique (« A/C# ») — absent sinon. */
  basse?: string;
}

/** Symbole d'accord découpé : fondamentale, qualité, basse éventuelle. */
const SYMBOLE = /^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/;

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

/** Note à vide de chaque corde, de la 6ᵉ à la 1ʳᵉ. */
const CORDES = ['E', 'A', 'D', 'G', 'B', 'E'];

const CHIFFRES = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Les deux écritures possibles d'une hauteur (dièse et bémol). */
const DIESES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BEMOLS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Écritures équivalentes d'une note (« C# » et « Db » désignent la même). */
function ecritures(note: string): string[] {
  const i = noteIndex(note);
  if (i === null) return [note];
  return [...new Set([DIESES[i], BEMOLS[i]])];
}

/** Note produite par une corde à une case donnée (0..11). */
function noteDe(corde: number, caseF: number): number {
  const base = noteIndex(CORDES[corde]);
  return base === null ? -1 : (base + caseF) % 12;
}

/**
 * COMBIEN DE DOIGTS CETTE POSITION DEMANDE-T-ELLE ?
 *
 * La table donne le numéro de chaque doigt : on compte donc des doigts
 * DISTINCTS, sans rien supposer. Un doigt qui revient sur plusieurs cordes,
 * c'est un barré — celui que le relevé a noté.
 */
export function doigtsNecessaires(
  cases: number[],
  _barre?: { case_: number; de: number; a: number },
  doigts?: number[],
): number {
  if (doigts && doigts.some((d) => d > 0)) {
    return new Set(doigts.filter((d) => d > 0)).size;
  }
  return cases.filter((c) => c > 0).length;
}

const EMPAN_MAX = 5;

/**
 * Cette position est-elle tenable ? La table est relevée par des
 * guitaristes, donc ce contrôle ne devrait jamais rien rejeter — il est là
 * pour que ça reste vrai si la table change un jour.
 */
export function estJouable(p: Position): boolean {
  // Deux cordes suffisent : un accord de puissance (« C5 ») n'en a que deux,
  // et c'est un accord.
  if (p.cases.filter((c) => c !== MUET).length < 2) return false;
  const doigtees = p.cases.filter((c) => c > 0);
  if (doigtees.length > 0 && Math.max(...doigtees) - Math.min(...doigtees) > EMPAN_MAX) {
    return false;
  }
  return doigtsNecessaires(p.cases, p.barre, p.doigts) <= 4;
}

/** Décode une position encodée (« x32010/032010@3 »). */
function decode(code: string, fondamentale: string, basse: string): Position | null {
  const m = /^([x0-9a-z]{6})\/([0-4]{6})(?:@([0-9a-z]))?$/.exec(code);
  if (!m) return null;
  const cases = [...m[1]].map((c) => (c === 'x' ? MUET : CHIFFRES.indexOf(c)));
  const doigts = [...m[2]].map((d) => Number(d));
  if (cases.some((c) => c !== MUET && c < 0)) return null;
  let barre: Position['barre'];
  if (m[3] !== undefined) {
    const caseB = CHIFFRES.indexOf(m[3]);
    const sur = cases
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c === caseB)
      .map((x) => x.i);
    if (sur.length >= 2) {
      barre = { case_: caseB, de: Math.min(...sur), a: Math.max(...sur) };
    }
  }
  const doigtees = cases.filter((c) => c > 0);
  const idxRacine = noteIndex(fondamentale);
  const grave = cases.findIndex((c) => c !== MUET);
  const cordeRacine =
    idxRacine !== null && grave >= 0 && noteDe(grave, cases[grave]) === idxRacine
      ? 6 - grave
      : 0;
  return {
    cases,
    doigts,
    barre,
    ouverte: doigtees.length === 0 || Math.max(...doigtees) <= 4,
    cordeRacine: cordeRacine === 6 || cordeRacine === 5 ? cordeRacine : 0,
    ...(basse !== '' ? { basse } : {}),
  };
}

/**
 * Positions proposées pour un symbole d'accord, la plus basse d'abord.
 * Tableau VIDE quand la table ne connaît pas l'accord : on n'invente pas.
 */
export function positionsPour(symbole: string): Position[] {
  const m = SYMBOLE.exec((symbole ?? '').trim());
  if (!m) return [];
  const qualite = normalise(m[2] ?? '');
  if (qualite === null) return [];
  const basse = m[3] ?? '';
  if (noteIndex(m[1]) === null) return [];
  if (basse !== '' && noteIndex(basse) === null) return [];

  // La table connaît les deux écritures (« C# » et « Db ») : on essaie
  // l'une puis l'autre plutôt que d'imposer la nôtre.
  for (const racine of ecritures(m[1])) {
    const bassesPossibles = basse === '' ? [''] : ecritures(basse);
    for (const b of bassesPossibles) {
      const cle = b === '' ? `${racine}|${qualite}` : `${racine}|${qualite}|${b}`;
      const codes = ACCORDS[cle];
      if (!codes) continue;
      const out = codes
        .map((c) => decode(c, m[1], basse))
        .filter((p): p is Position => p !== null)
        .filter(estJouable);
      if (out.length > 0) return out.slice(0, 2);
    }
  }
  return [];
}

/** Y a-t-il quelque chose à montrer pour ce symbole ? */
export function connaitLAccord(symbole: string): boolean {
  return positionsPour(symbole).length > 0;
}
