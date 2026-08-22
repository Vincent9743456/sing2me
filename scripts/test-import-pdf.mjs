/**
 * Tests du réimport d'un PDF (b369) — l'export mojosong doit se relire
 * lui-même. Logique pure uniquement.
 * Lancement : node scripts/test-import-pdf.mjs
 */
import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'mojotest-'));
const pont = join(dir, 'pont.ts');
const racine = new URL('../src/lib/', import.meta.url).pathname;
writeFileSync(
  pont,
  `export { decoupeAccordsColles, estAnnotationDeGrille, importText } from '${racine}importer';\n` +
    `export { lireEnTeteDeSection } from '${racine}sections';\n` +
    `export { accordsPreserves, fusionMiseEnForme } from '${racine}aiFormat';\n` +
    `export { accordAppauvri, appliquerRecuperation, verdictRecuperation } from '${racine}recupaccords';\n`,
);
const out = join(dir, 'pont.mjs');
buildSync({ entryPoints: [pont], bundle: true, format: 'esm', outfile: out });
const {
  decoupeAccordsColles,
  estAnnotationDeGrille,
  importText,
  lireEnTeteDeSection,
  accordsPreserves,
  fusionMiseEnForme,
  accordAppauvri,
  appliquerRecuperation,
  verdictRecuperation,
} = await import(out);

let ko = 0;
function egal(nom, obtenu, attendu) {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  const ok = a === b;
  if (!ok) ko++;
  console.log(`${ok ? 'OK ' : 'KO '} ${nom} — ${a}${ok ? '' : ` ≠ ${b}`}`);
}

// Accords physiquement collés : découpés par la grammaire, jamais un mot.
egal('AC#mBmD', decoupeAccordsColles('AC#mBmD'), ['A', 'C#m', 'Bm', 'D']);
egal('CCmaj7', decoupeAccordsColles('CCmaj7'), ['C', 'Cmaj7']);
egal('AmEm', decoupeAccordsColles('AmEm'), ['Am', 'Em']);
egal('ADAGE (mot)', decoupeAccordsColles('ADAGE'), null);
egal('CAFE (mot)', decoupeAccordsColles('CAFE'), null);
egal('Amen (mot)', decoupeAccordsColles('Amen'), null);
egal('Do (mot)', decoupeAccordsColles('Do'), null);

// « X 2 » est une consigne de répétition, pas la parole sous les accords.
egal('X 2', estAnnotationDeGrille('   X 2'), true);
egal('x2', estAnnotationDeGrille('x2'), true);
egal('parole', estAnnotationDeGrille('Oui mais voilà'), false);

// En-tête espacé par l'interlettrage de l'export PDF.
egal(
  'CO U P L E T 1',
  lireEnTeteDeSection('CO U P L E T 1'),
  { label: 'Couplet', num: '1', decore: true },
);
egal('R E F R A I N', lireEnTeteDeSection('R E F R A I N')?.label, 'Refrain');
egal('parole espacée', lireEnTeteDeSection('Il y a longtemps'), null);

// Aller-retour de notre propre export : Tonalité/Capo redeviennent des
// métadonnées, {Couplet}/{Refrain} redeviennent des sections, l'intro
// collée redevient des accords.
const exporte = [
  'Tonalité Am · Capo 2',
  'Intro',
  'AC#mBmD',
  '        X 2',
  '{Couplet}',
  'A                 C#m',
  'J’aimerais tant lui dire mes envies mes désirs',
  '{Refrain}',
  'Bm                D',
  'Mes rêves et mes fantasmes mon cœur et mon espace',
].join('\n');
const res = importText(exporte, 'Test');
egal('tonalité relue', res.song.key, 'Am');
egal('capo relu', res.song.capo, 2);
egal('intro éclatée', res.song.lyrics.includes('[A] [C#m] [Bm] [D]'), true);
egal('X 2 hors fusion', res.song.lyrics.includes('X 2'), true);
egal('section Couplet', /Couplet(?: 1)? :/.test(res.song.lyrics), true);
egal('section Refrain', /Refrain :/.test(res.song.lyrics), true);
egal('Tonalité hors paroles', res.song.lyrics.includes('Tonalité'), false);

// ── b394 — « The Greatest Bastard » (signalement de Vincent) : les accords
// étendus (G9, D/F#) survivent à l'analyse locale, un accord de fin de
// phrase reste sur sa ligne, et la fusion IA REFUSE une version qui
// renomme ou perd un accord (G9 devenu G → on garde le local).
{
  const src = [
    '[Verse 1]',
    'D',
    'I made you laugh, I made you cry',
    'D/F#',
    'I made you open up your eyes',
    'G9                 A',
    "Didn't I?",
  ].join('\n');
  const local = importText(src, 'The Greatest Bastard');
  egal('G9 conservé au local', local.song.lyrics.includes('[G9]'), true);
  egal('D/F# conservé au local', local.song.lyrics.includes('[D/F#]'), true);
  egal(
    'accord de fin de phrase sur sa ligne',
    /\[G9\]Didn't I\?\s+\[A\]/.test(local.song.lyrics),
    true,
  );

  // L'IA renvoie une version qui a simplifié G9 → G : refusée, on garde
  // le local (même chemin que « l'IA n'a pas répondu »).
  const iaTexte = local.song.lyrics.replace(/\[G9\]/g, '[G]');
  const iaOutcome = importText(iaTexte, 'The Greatest Bastard');
  const fusion = fusionMiseEnForme(src, local, iaTexte, iaOutcome);
  egal('IA qui renomme → refusée', fusion.parIA, false);
  egal('IA refusée → G9 garde sa neuvième', fusion.song.lyrics.includes('[G9]'), true);

  // Comparaisons directes du garde-fou.
  egal('préservés à l’identique', accordsPreserves('[G9]la [A]suite', '[G9]la [A]suite'), true);
  egal('renommé G9→G : non', accordsPreserves('[G9]la [A]suite', '[G]la [A]suite'), false);
  egal('accord perdu : non', accordsPreserves('[G9]la [A]suite', '[G9]la suite'), false);
  egal('accords AJOUTÉS : oui', accordsPreserves('[G9]la suite', '[G9]la [A]suite'), true);
}

// ── b395 — « Retrouver les accords d'origine » : la récupération à la
// source ne remplace une partition que sur preuve écrasante. Un accord
// stocké doit être un APPAUVRISSEMENT de l'accord retrouvé (G pour G9),
// jamais un autre accord (A n'est pas Am, C n'est pas C#m).
{
  egal('G appauvri de G9', accordAppauvri('G', 'G9'), true);
  egal('D appauvri de D/F#', accordAppauvri('D', 'D/F#'), true);
  egal('C appauvri de Cmaj7', accordAppauvri('C', 'Cmaj7'), true);
  egal('Am appauvri de Am7', accordAppauvri('Am', 'Am7'), true);
  egal('B appauvri de B7sus4', accordAppauvri('B', 'B7sus4'), true);
  egal('identique : oui', accordAppauvri('G9', 'G9'), true);
  egal('A n’est pas Am', accordAppauvri('A', 'Am'), false);
  egal('C n’est pas C#m', accordAppauvri('C', 'C#m'), false);
  egal('G n’est pas G#', accordAppauvri('G', 'G#'), false);
  egal('C n’est pas Cdim', accordAppauvri('C', 'Cdim'), false);
  egal('G9 n’est pas G (sens unique)', accordAppauvri('G9', 'G'), false);

  const paroles = [
    'Je marche seul dans la ville endormie',
    'Et la pluie tombe encore sur mes souvenirs',
    'Rien ne pourra jamais nous retenir',
  ];
  const stocke = {
    lyrics: [
      `[G]${paroles[0]}`,
      `[D]${paroles[1]}`,
      `[A]${paroles[2]}`,
    ].join('\n'),
  };
  const releve = (accords) => ({
    song: {
      lyrics: [
        `[${accords[0]}]${paroles[0]}`,
        `[${accords[1]}]${paroles[1]}`,
        `[${accords[2]}]${paroles[2]}`,
      ].join('\n'),
      structure: [],
      key: 'G',
      capo: 2,
    },
  });

  const bon = verdictRecuperation(stocke, releve(['G9', 'D/F#', 'A']));
  egal('preuve faite → réparer', bon.verdict, 'reparer');
  egal('2 accords retrouvés', bon.accords, 2);
  egal(
    'mêmes accords → identique (on ne touche pas)',
    verdictRecuperation(stocke, releve(['G', 'D', 'A'])).verdict,
    'identique',
  );
  egal(
    'un accord étranger → incertain',
    verdictRecuperation(stocke, releve(['G9', 'Bm', 'A'])).verdict,
    'incertain',
  );
  egal(
    'autres paroles → incertain',
    verdictRecuperation(stocke, {
      song: {
        lyrics: '[G9]Des mots totalement différents\n[D/F#]qui ne parlent pas du tout\n[A]de la même chanson ce soir',
      },
    }).verdict,
    'incertain',
  );
  egal(
    'nombre d’accords différent → incertain',
    verdictRecuperation(stocke, {
      song: { lyrics: `[G9]${paroles[0]}\n[D/F#]${paroles[1]}\n${paroles[2]}` },
    }).verdict,
    'incertain',
  );
  egal(
    'trop peu d’accords → incertain',
    verdictRecuperation(
      { lyrics: `[G]${paroles[0]}` },
      { song: { lyrics: `[G9]${paroles[0]}` } },
    ).verdict,
    'incertain',
  );

  // La réparation remplace la partition, garde une photo pour revenir en
  // arrière, suit la version active — et ne touche à rien d'autre.
  const morceau = {
    id: 'm1',
    title: 'Ma chanson',
    artist: 'Quelqu’un',
    key: 'G',
    capo: 0,
    structure: [],
    lyrics: stocke.lyrics,
    activeVersionId: 'v1',
    versions: [
      { id: 'v1', name: 'Standard', bandId: '', key: 'G', tempo: 0, capo: 0, structure: [], lyrics: stocke.lyrics },
      { id: 'v2', name: 'Groupe', bandId: 'b1', key: 'G', tempo: 0, capo: 0, structure: [], lyrics: 'autre' },
    ],
    needsCheck: { reason: 'doute d’avant' },
  };
  const repare = appliquerRecuperation(morceau, releve(['G9', 'D/F#', 'A']));
  egal('accords réparés', repare.lyrics.includes('[G9]'), true);
  egal('capo suivi', repare.capo, 2);
  egal('titre intact', repare.title, 'Ma chanson');
  egal('photo d’avant posée', repare.beforeAi?.lyrics === stocke.lyrics, true);
  egal('doute levé (règle 11)', repare.needsCheck, undefined);
  egal(
    'version active suivie',
    repare.versions[0].lyrics.includes('[D/F#]'),
    true,
  );
  egal('autre version intacte', repare.versions[1].lyrics, 'autre');
  const photo = { lyrics: 'photo ancienne', structure: [], key: 'C', capo: 1 };
  egal(
    'photo existante jamais écrasée',
    appliquerRecuperation({ ...morceau, beforeAi: photo }, releve(['G9', 'D', 'A']))
      .beforeAi.lyrics,
    'photo ancienne',
  );
}

rmSync(dir, { recursive: true, force: true });
console.log(ko === 0 ? '\nTous les tests passent.' : `\n${ko} test(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
