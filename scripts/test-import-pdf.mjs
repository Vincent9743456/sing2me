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
    `export { lireEnTeteDeSection } from '${racine}sections';\n`,
);
const out = join(dir, 'pont.mjs');
buildSync({ entryPoints: [pont], bundle: true, format: 'esm', outfile: out });
const { decoupeAccordsColles, estAnnotationDeGrille, importText, lireEnTeteDeSection } =
  await import(out);

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

rmSync(dir, { recursive: true, force: true });
console.log(ko === 0 ? '\nTous les tests passent.' : `\n${ko} test(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
