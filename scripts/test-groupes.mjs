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
writeFileSync(
  pont,
  `export { decoupeLiens } from '${racine}liens';\n` +
    `export { dedupeBandMembers, resoudreInvitations } from '${racine}model';\n`,
);
const out = join(dir, 'pont.mjs');
buildSync({ entryPoints: [pont], bundle: true, format: 'esm', outfile: out });
const { decoupeLiens, dedupeBandMembers, resoudreInvitations } = await import(out);

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

/* ------------------------------------------------------------------ */
/* b475 — le cas de Marco : « Chris » invité par lien, arrivé sous      */
/* « borelli.christophe » — deux profils au lieu d'un.                  */
/* ------------------------------------------------------------------ */

const groupeAvec = (members) => ({
  id: 'g1', name: 'Exigus', photo: '', bio: '', tipUrl: '', links: [],
  members, owned: true, cloudId: 'cid',
});

// La ligne en attente reçoit l'identifiant du compte qui a consommé le lien,
// puis fusionne avec la ligne du compte.
{
  const avant = groupeAvec([
    { id: 'm1', name: 'Chris', instrument: 'basse', pending: true },
    { id: 'm2', name: 'borelli.christophe', userId: 'u-chris', verified: true },
  ]);
  const apres = dedupeBandMembers(
    resoudreInvitations(avant, [{ name: 'Chris', userId: 'u-chris' }]),
  );
  egal('marco : une seule ligne après résolution', apres.members.length, 1);
  egal('marco : la ligne porte le compte', apres.members[0].userId, 'u-chris');
  egal('marco : l’instrument noté sur « Chris » est gardé', apres.members[0].instrument, 'basse');
}

// Sans ligne du compte (fiche pas encore resynchronisée) : la ligne en
// attente devient la ligne du membre, plus « en attente ».
{
  const apres = resoudreInvitations(
    groupeAvec([{ id: 'm1', name: 'Chris', pending: true }]),
    [{ name: 'Chris', userId: 'u-chris' }],
  );
  egal('résolution seule : identifiant posé', apres.members[0].userId, 'u-chris');
  egal('résolution seule : plus en attente', apres.members[0].pending, undefined);
}

// Prudences b249 : un nom qui correspond à DEUX lignes n'attribue rien, et
// une ligne qui porte déjà un identifiant n'est jamais réécrite.
{
  const deux = resoudreInvitations(
    groupeAvec([
      { id: 'm1', name: 'Chris', pending: true },
      { id: 'm2', name: 'chris' },
    ]),
    [{ name: 'Chris', userId: 'u-chris' }],
  );
  egal('deux homonymes : rien n’est attribué', deux.members.map((m) => m.userId ?? ''), ['', '']);
  const deja = groupeAvec([{ id: 'm1', name: 'Chris', userId: 'u-autre' }]);
  egal('identifiant déjà posé : intact', resoudreInvitations(deja, [{ name: 'Chris', userId: 'u-chris' }]) === deja, true);
}

if (ko > 0) {
  console.log(`\n${ko} test(s) en échec.`);
  process.exit(1);
}
console.log('\nTous les tests passent.');
