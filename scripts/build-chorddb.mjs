/**
 * FABRICATION DE LA TABLE D'ACCORDS (b229).
 *
 * Ce script ne tourne PAS au build : il est lancé à la main, une fois, quand
 * on veut rafraîchir la table. Son résultat (`src/lib/chorddb.ts`) est
 * COMMITÉ — l'application ne dépend donc d'aucun réseau ni d'aucun paquet
 * pour dessiner un accord, ce qui est la règle depuis b225.
 *
 *   node scripts/build-chorddb.mjs [chemin/guitar.json]
 *
 * La source est `chords-db` de David Rubert (MIT) :
 * https://github.com/tombatossals/chords-db — des positions RELEVÉES et
 * vérifiées par des guitaristes, avec le numéro de chaque doigt. C'est
 * exactement ce qui manquait : b225 CALCULAIT des positions à partir de
 * gabarits, et fabriquait au passage des accords injouables (le G6 de
 * Vincent). On ne devine plus rien.
 *
 * ENCODAGE. Une position tient dans une chaîne :
 *
 *     "x32010/032010"        cases / doigts
 *     "335553/134111@3"      idem, avec un barré à la case 3
 *
 * Une case : `x` = corde étouffée, `0` = à vide, `1`-`9` puis `a`,`b`,`c`…
 * pour 10 et au-delà. Un doigt : `0` (aucun) à `4`. Le compactage n'est pas
 * de la coquetterie — il garde la table sous les 20 Ko, donc dans le cache
 * hors ligne sans peser sur le lancement de l'app.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = process.argv[2] ?? '/var/tmp/guitar.json';
const db = JSON.parse(readFileSync(SOURCE, 'utf8'));

/** Nos familles de qualité → le suffixe de chords-db. */
const QUALITES = {
  maj: 'major',
  m: 'minor',
  '7': '7',
  m7: 'm7',
  maj7: 'maj7',
  sus4: 'sus4',
  sus2: 'sus2',
  '6': '6',
  m6: 'm6',
  '9': '9',
  add9: 'add9',
  dim: 'dim',
  dim7: 'dim7',
  aug: 'aug',
  '5': '5',
};

/** Nom de tonalité chords-db → notre écriture (dièses ET bémols). */
const TONALITES = {
  C: ['C'],
  Csharp: ['C#', 'Db'],
  D: ['D'],
  Eb: ['Eb', 'D#'],
  E: ['E'],
  F: ['F'],
  Fsharp: ['F#', 'Gb'],
  G: ['G'],
  Ab: ['Ab', 'G#'],
  A: ['A'],
  Bb: ['Bb', 'A#'],
  B: ['B'],
};

const CHIFFRES = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Deux positions au plus : l'app n'en montre jamais davantage. */
const MAX_POSITIONS = 2;

function encodeCases(frets, baseFret) {
  return frets
    .map((f) => {
      if (f < 0) return 'x';
      if (f === 0) return '0';
      const abs = baseFret + f - 1;
      return CHIFFRES[abs] ?? 'x';
    })
    .join('');
}

function encodePosition(p) {
  const base = p.baseFret ?? 1;
  const cases = encodeCases(p.frets, base);
  if (cases.includes('x') && cases.replace(/[x0]/g, '') === '') return null;
  const doigts = (p.fingers ?? p.frets.map(() => 0))
    .map((d) => (d >= 0 && d <= 4 ? String(d) : '0'))
    .join('');
  // `barres` est en cases RELATIVES, comme `frets`.
  const barre =
    Array.isArray(p.barres) && p.barres.length > 0
      ? base + Math.min(...p.barres) - 1
      : null;
  return `${cases}/${doigts}${barre !== null ? `@${CHIFFRES[barre]}` : ''}`;
}

/** Les positions les plus basses d'abord : c'est là que la main se pose. */
function hauteur(p) {
  const jouees = p.frets.filter((f) => f > 0);
  const base = p.baseFret ?? 1;
  return jouees.length === 0 ? 0 : base + Math.min(...jouees) - 1;
}

/**
 * CONTRÔLE D'HARMONIE — la table est relevée par des humains, donc elle a
 * ses coquilles. Quatre entrées ne produisent pas l'accord qu'elles
 * annoncent (un « C#aug » qui sonne si-fa#-do#, par exemple). On les écarte
 * ici plutôt que de les livrer : la source donne des doigtés VÉRIFIÉS, ce
 * contrôle vérifie qu'ils portent les bonnes NOTES. Deux garde-fous
 * indépendants valent mieux qu'une confiance aveugle.
 */
const INTERVALLES = {
  maj: [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11], sus4: [0, 5, 7], sus2: [0, 2, 7], '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9], '9': [0, 2, 4, 7, 10], add9: [0, 2, 4, 7],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], aug: [0, 4, 8], '5': [0, 7],
};
const DEMI = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const CORDES_VIDE = [4, 9, 2, 7, 11, 4]; // mi la ré sol si mi

/** Les hauteurs réellement produites par une position. */
function hauteurs(frets, baseFret) {
  const out = [];
  frets.forEach((f, i) => {
    if (f < 0) return;
    const abs = f === 0 ? 0 : baseFret + f - 1;
    out.push((CORDES_VIDE[i] + abs) % 12);
  });
  return out;
}

/** La position dit-elle vraiment l'accord annoncé ? */
function harmonieJuste(p, racine, qualite, basse) {
  const r = DEMI[racine];
  const permis = new Set(INTERVALLES[qualite].map((i) => (r + i) % 12));
  if (basse) permis.add(DEMI[basse]);
  const notes = hauteurs(p.frets, p.baseFret ?? 1);
  if (notes.length < 2) return false;
  if (notes.some((n) => !permis.has(n))) return false;
  // La fondamentale doit sonner (sauf renversement, où c'est la basse qui
  // porte l'accord).
  if (!basse && !notes.includes(r)) return false;
  // Un renversement dont la basse n'est pas la note la plus grave n'en est
  // pas un.
  if (basse && notes[0] !== DEMI[basse]) return false;
  return true;
}

/** Quatre doigts, pas cinq : le relevé les numérote, on les compte. */
function doigtsOk(p) {
  const doigts = (p.fingers ?? []).filter((d) => d > 0);
  const distincts = new Set(doigts).size;
  const tenues = p.frets.filter((f) => f > 0).length;
  return (distincts === 0 ? tenues : distincts) <= 4;
}

const table = {};
let positions = 0;
let ecartees = 0;

for (const [cleDb, entrees] of Object.entries(db.chords)) {
  const noms = TONALITES[cleDb];
  if (!noms) continue;
  for (const entree of entrees) {
    const suffixe = entree.suffix;
    // 1. Les qualités que Sing2Me reconnaît.
    const quals = Object.entries(QUALITES)
      .filter(([, s]) => s === suffixe)
      .map(([q]) => q);
    // 2. Les renversements : « /G » (majeur) et « m/G » (mineur).
    const oblique = /^(m?)\/([A-G](?:#|b)?)$/.exec(suffixe);
    const cles = [];
    for (const q of quals) for (const n of noms) cles.push(`${n}|${q}`);
    if (oblique) {
      const q = oblique[1] === 'm' ? 'm' : 'maj';
      for (const n of noms) cles.push(`${n}|${q}|${oblique[2]}`);
    }
    if (cles.length === 0) continue;

    const racine = noms[0];
    const qualite = oblique
      ? oblique[1] === 'm'
        ? 'm'
        : 'maj'
      : quals[0];
    const basseAttendue = oblique ? oblique[2] : null;
    const retenues = [...entree.positions]
      .sort((a, b) => hauteur(a) - hauteur(b))
      .filter((p) => {
        const bon = harmonieJuste(p, racine, qualite, basseAttendue) && doigtsOk(p);
        if (!bon) ecartees++;
        return bon;
      });
    const encodees = retenues
      .map(encodePosition)
      .filter((x) => x !== null)
      .slice(0, MAX_POSITIONS);
    if (encodees.length === 0) continue;
    for (const c of cles) {
      if (!table[c]) {
        table[c] = encodees;
        positions += encodees.length;
      }
    }
  }
}

const cles = Object.keys(table).sort();
const corps = cles
  .map((c) => `  ${JSON.stringify(c)}: ${JSON.stringify(table[c])},`)
  .join('\n');

const source = `/**
 * TABLE DES POSITIONS D'ACCORDS — GÉNÉRÉE, NE PAS MODIFIER À LA MAIN.
 * Régénérer avec : node scripts/build-chorddb.mjs [guitar.json]
 *
 * ------------------------------------------------------------------
 * Source : chords-db — https://github.com/tombatossals/chords-db
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2016 David Rubert
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 * ------------------------------------------------------------------
 *
 * Clé : « FONDAMENTALE|qualité » ou « FONDAMENTALE|qualité|BASSE ».
 * Valeur : « cases/doigts » avec « @case » quand il y a un barré.
 * Une case : x (étouffée), 0 (à vide), 1-9 puis a, b, c… au-delà de 9.
 */
export const ACCORDS: Record<string, string[]> = {
${corps}
};
`;

writeFileSync(new URL('../src/lib/chorddb.ts', import.meta.url), source);
console.log(
  `chorddb : ${cles.length} accords, ${positions} positions, ` +
    `${Math.round(source.length / 1024)} Ko — ${ecartees} positions écartées ` +
    `(harmonie fausse ou plus de quatre doigts)`,
);
