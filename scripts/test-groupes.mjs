/**
 * Tests de la section Groupes (revue UX b441+) — logique pure.
 * Lancement : node scripts/test-groupes.mjs
 */
import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'mojotest-'));
const pont = join(dir, 'pont.ts');
const racine = new URL('../src/lib/', import.meta.url).pathname;
writeFileSync(pont, `export { decoupeLiens } from '${racine}liens';\n`);
const out = join(dir, 'pont.mjs');
buildSync({ entryPoints: [pont], bundle: true, format: 'esm', outfile: out });
const { decoupeLiens } = await import(out);

let ko = 0;
function egal(nom, obtenu, attendu) {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  const ok = a === b;
  if (!ok) ko++;
  console.log(`${ok ? 'OK ' : 'KO '} ${nom} — ${a}${ok ? '' : ` ≠ ${b}`}`);
}

// b441 — liens cliquables dans la discussion.
egal('texte sans lien', decoupeLiens('salut la répét est à 20h'), [
  { type: 'texte', contenu: 'salut la répét est à 20h' },
]);
egal('lien seul', decoupeLiens('https://youtu.be/abc123'), [
  { type: 'lien', url: 'https://youtu.be/abc123' },
]);
egal('lien au milieu', decoupeLiens('regarde https://youtu.be/abc et dis-moi'), [
  { type: 'texte', contenu: 'regarde ' },
  { type: 'lien', url: 'https://youtu.be/abc' },
  { type: 'texte', contenu: ' et dis-moi' },
]);
egal('ponctuation finale hors du lien', decoupeLiens('vois https://ex.com/page.'), [
  { type: 'texte', contenu: 'vois ' },
  { type: 'lien', url: 'https://ex.com/page' },
  { type: 'texte', contenu: '.' },
]);
egal(
  'parenthèse wikipédia conservée',
  decoupeLiens('https://fr.wikipedia.org/wiki/Rock_(musique)'),
  [{ type: 'lien', url: 'https://fr.wikipedia.org/wiki/Rock_(musique)' }],
);
egal(
  'parenthèse de phrase détachée',
  decoupeLiens('(voir https://ex.com)'),
  [
    { type: 'texte', contenu: '(voir ' },
    { type: 'lien', url: 'https://ex.com' },
    { type: 'texte', contenu: ')' },
  ],
);
egal('www nu = pas un lien', decoupeLiens('va sur www.exemple.com'), [
  { type: 'texte', contenu: 'va sur www.exemple.com' },
]);
egal('deux liens', decoupeLiens('https://a.fr et https://b.fr'), [
  { type: 'lien', url: 'https://a.fr' },
  { type: 'texte', contenu: ' et ' },
  { type: 'lien', url: 'https://b.fr' },
]);
egal('multiligne', decoupeLiens('titre\nhttps://a.fr\nfin'), [
  { type: 'texte', contenu: 'titre\n' },
  { type: 'lien', url: 'https://a.fr' },
  { type: 'texte', contenu: '\nfin' },
]);

if (ko > 0) {
  console.log(`\n${ko} test(s) en échec.`);
  process.exit(1);
}
console.log('\nTous les tests passent.');
