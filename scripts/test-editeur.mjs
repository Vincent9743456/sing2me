/**
 * Tests de l'éditeur de partition (b499, lot 1 des tests du 05/09/2026 —
 * « l'éditeur se fige quand on supprime des lignes en haut du texte »).
 * Logique pure, sans navigateur. Lancement : node scripts/test-editeur.mjs
 *
 * Le scénario du bug : ouvrir une partition, supprimer les N premières
 * lignes, enregistrer. Trois vérités à garantir :
 *  1. le geste d'enregistrement ne JETTE JAMAIS — un échec est une VALEUR
 *     que l'écran affiche (avant b499, une exception gelait l'écran en
 *     silence : « Enregistrer » ne faisait rien) ;
 *  2. une ligne de structure à la forme ancienne (champ manquant) ne fait
 *     échouer ni l'enregistrement ni le CHARGEMENT de la bibliothèque
 *     (migrateSong la répare) ;
 *  3. la sortie de secours « texte seul » écrit toujours les paroles.
 */
import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'mojotest-'));
const pont = join(dir, 'pont.ts');
const racine = new URL('../src/', import.meta.url).pathname;
writeFileSync(
  pont,
  `export {
    preparerEnregistrement,
    enregistrerSansGeler,
    enregistrementTexteSeul,
    partitionChangee,
    editeurModifie,
  } from '${racine}lib/songedit';\n` +
    `export { migrateSong } from '${racine}lib/model';\n`,
);
const out = join(dir, 'pont.mjs');
buildSync({ entryPoints: [pont], bundle: true, format: 'esm', outfile: out });
const {
  preparerEnregistrement,
  enregistrerSansGeler,
  enregistrementTexteSeul,
  partitionChangee,
  migrateSong,
} = await import(out);
rmSync(dir, { recursive: true, force: true });

let echecs = 0;
function ok(cond, nom) {
  if (cond) console.log(`  ✓ ${nom}`);
  else {
    echecs++;
    console.error(`  ✗ ${nom}`);
  }
}

const PAROLES = [
  'Intro :',
  '[Am]   [Em]   [G]',
  "Ain't no sun[Am]shine when she's gone",
  "It's not warm [Em]when she's a[G]way",
  '',
  'Couplet 1 :',
  "And she's always gone too [Em]long",
  'Anytime [G]she goes a[Am]way',
].join('\n');

const now = '2026-09-01T10:00:00.000Z';
const ligne = (id, label, chords) => ({ id, label, chords, comment: '' });
function morceau(versions, structure) {
  return {
    id: 's1',
    title: "Ain't No Sunshine",
    artist: 'Bill Withers',
    key: 'Am',
    tempo: 78,
    capo: 0,
    durationSec: 0,
    tags: [],
    structure,
    structureNotes: '',
    lyrics: PAROLES,
    versions,
    activeVersionId: versions[0].id,
    createdAt: now,
    updatedAt: now,
    rehearsalNotes: [],
    hearts: 0,
    fanMessages: [],
  };
}
const version = (id, name, bandId, structure) => ({
  id,
  name,
  bandId,
  key: 'Am',
  tempo: 78,
  capo: 0,
  structure,
  lyrics: PAROLES,
});

function champsPour(existing, lyrics) {
  return {
    draft: { ...existing, lyrics },
    existing,
    durationText: '',
    tagsText: '',
    versionName: existing.versions[0].name,
    versionBandId: existing.versions[0].bandId,
  };
}

/** Le geste du bug : les N premières lignes en moins. */
const sansLesPremieres = (n) => PAROLES.split('\n').slice(n).join('\n');

console.log('1. Supprimer les premières lignes puis enregistrer');
{
  const structure = [ligne('r1', 'Intro', 'Am Em G'), ligne('r2', 'Couplet', 'Am Em')];
  const s = morceau([version('v1', 'Original', '', structure)], structure);
  for (const n of [1, 2, 3, 4]) {
    const ch = champsPour(s, sansLesPremieres(n));
    const r = enregistrerSansGeler(ch, 'current');
    ok(r.ok === true, `${n} lignes supprimées → enregistrement ok`);
    ok(
      r.ok && r.song.lyrics === sansLesPremieres(n),
      `${n} lignes supprimées → paroles amputées écrites telles quelles`,
    );
  }
  const ch = champsPour(s, sansLesPremieres(2));
  ok(partitionChangee(ch) === true, 'la suppression compte comme un changement de partition');
}

console.log('2. Deux versions (originale + groupe) : même geste, même issue');
{
  const structure = [ligne('r1', 'Intro', 'Am Em G')];
  const s = morceau(
    [version('v1', 'Original', '', structure), version('v2', 'Groupe', 'b1', structure)],
    structure,
  );
  const ch = champsPour(s, sansLesPremieres(3));
  const seule = enregistrerSansGeler(ch, 'current');
  ok(seule.ok === true, 'portée « cette version » → ok');
  const toutes = enregistrerSansGeler(ch, 'all');
  ok(toutes.ok === true, 'portée « toutes les versions » → ok');
  ok(
    toutes.ok && toutes.song.versions.every((v) => v.lyrics === sansLesPremieres(3)),
    'portée « toutes » → chaque version reçoit les paroles',
  );
}

console.log('3. Ligne de structure à la forme ancienne : rien ne gèle');
{
  // Avant b499 : `.trim()` sur un champ absent jetait — le geste mourait en
  // silence. La ligne malformée du pire cas : tout absent sauf l'id.
  const malformees = [{ id: 'r1' }, { id: 'r2', label: 'Intro' }, null];
  const s = morceau([version('v1', 'Original', '', malformees)], malformees);
  const ch = champsPour(s, sansLesPremieres(2));
  const r = enregistrerSansGeler(ch, 'current');
  ok(r.ok === true, 'enregistrement ok malgré les lignes malformées');
  const rAll = enregistrerSansGeler(ch, 'all');
  ok(rAll.ok === true, 'portée « toutes » ok malgré les lignes malformées');
}

console.log('4. migrateSong répare les lignes malformées (bibliothèque jamais vide)');
{
  const malformees = [{ id: 'r1' }, { label: 'Refrain' }, null];
  const brut = morceau([version('v1', 'Original', '', malformees)], malformees);
  delete brut.structureNotes; // le vrai déclencheur : la passe structureNotes lisait r.comment
  let migre = null;
  let jete = false;
  try {
    migre = migrateSong(brut);
  } catch {
    jete = true;
  }
  ok(jete === false, 'migrateSong ne jette pas sur une ligne malformée');
  ok(
    migre !== null &&
      migre.structure.every(
        (r) =>
          typeof r.id === 'string' &&
          typeof r.label === 'string' &&
          typeof r.chords === 'string' &&
          typeof r.comment === 'string',
      ),
    'chaque ligne réparée porte ses quatre champs',
  );
  ok(
    migre !== null &&
      migre.versions.every((v) =>
        v.structure.every((r) => typeof r.comment === 'string'),
      ),
    'les lignes des versions sont réparées aussi',
  );
  // Idempotence : un morceau sain ressort tel quel (mêmes références).
  const sain = morceau(
    [version('v1', 'Original', '', [ligne('r1', 'Intro', 'Am')])],
    [ligne('r1', 'Intro', 'Am')],
  );
  const deux = migrateSong(migrateSong(sain));
  ok(
    JSON.stringify(deux.structure) === JSON.stringify(sain.structure),
    'idempotent sur un morceau sain',
  );
}

console.log('5. La sortie de secours « texte seul » écrit toujours');
{
  const malformees = [{ id: 'r1' }];
  const s = morceau([version('v1', 'Original', '', malformees)], malformees);
  const ch = champsPour(s, sansLesPremieres(3));
  const secours = enregistrementTexteSeul(ch);
  ok(secours.lyrics === sansLesPremieres(3), 'les paroles amputées sont écrites');
  ok(secours.id === s.id, "le morceau garde son identité (id)");
  ok(
    secours.versions.find((v) => v.id === s.activeVersionId)?.lyrics ===
      sansLesPremieres(3),
    'la version active reçoit les paroles',
  );
}

console.log('6. Un enregistrement normal reste inchangé (non-régression)');
{
  const structure = [ligne('r1', 'Intro', 'Am Em G')];
  const s = morceau([version('v1', 'Original', '', structure)], structure);
  const ch = {
    ...champsPour(s, PAROLES),
    durationText: '3:45',
    tagsText: 'soul, ouverture',
  };
  const song = preparerEnregistrement(ch, 'current');
  ok(song.durationSec === 225, 'durée « 3:45 » → 225 s');
  ok(song.tags.join('|') === 'soul|ouverture', 'tags découpés');
  ok(song.structure.length === 1, 'les lignes de structure pleines restent');
}

if (echecs > 0) {
  console.error(`\n${echecs} échec(s).`);
  process.exit(1);
}
console.log('\nTout est vert.');
