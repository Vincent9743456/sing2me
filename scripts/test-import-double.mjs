/**
 * Tests de la boîte « ce morceau existe déjà » (b500, lot 2/I-1-I-2 des
 * tests du 05/09/2026). Les deux tests que Vincent réclamait — le nombre
 * de versions et de morceaux après chaque action — plus l'interaction avec
 * le dédoublonnage b316, qui enterrait la promesse « Garder les deux ».
 * Lancement : node scripts/test-import-double.mjs
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
  `export { remplacerReference, titreDisponible } from '${racine}lib/importdouble';\n` +
    `export { dedupeSongsByContent } from '${racine}lib/sync';\n` +
    `export { songKey } from '${racine}lib/normalizeTitle';\n`,
);
const out = join(dir, 'pont.mjs');
buildSync({ entryPoints: [pont], bundle: true, format: 'esm', outfile: out });
const { remplacerReference, titreDisponible, dedupeSongsByContent, songKey } =
  await import(out);
rmSync(dir, { recursive: true, force: true });

let echecs = 0;
function ok(cond, nom) {
  if (cond) console.log(`  ✓ ${nom}`);
  else {
    echecs++;
    console.error(`  ✗ ${nom}`);
  }
}

const ligne = (id, label, chords) => ({ id, label, chords, comment: '' });
function morceau(id, title, lyrics, extras = {}) {
  const vId = `${id}-v1`;
  return {
    id,
    title,
    artist: 'Leonard Cohen',
    key: 'C',
    tempo: 60,
    capo: 0,
    durationSec: 240,
    tags: ['messe', 'lent'],
    structure: [ligne(`${id}-r1`, 'Couplet', 'C Am')],
    structureNotes: '',
    lyrics,
    versions: [
      {
        id: vId,
        name: 'Original',
        bandId: '',
        key: 'C',
        tempo: 60,
        capo: 0,
        structure: [ligne(`${id}-r1`, 'Couplet', 'C Am')],
        lyrics,
      },
    ],
    activeVersionId: vId,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
    rehearsalNotes: [
      { id: 'n1', target: '', bandId: '', text: 'mes annotations de six mois', visibility: 'perso', author: '', createdAt: '2026-03-01T10:00:00.000Z' },
    ],
    hearts: 0,
    fanMessages: [],
  };
}

const ANCIEN = 'Now I[C]’ve heard there was a [Am]secret chord';
const NOUVEAU = '[C]Hallelujah, [Am]Hallelujah (nouvelle mise en forme)';

console.log('1. « Remplacer sa partition de référence » : 1 morceau, 1 version, partition changée');
{
  const existant = morceau('s1', 'Hallelujah', ANCIEN);
  const importe = morceau('imp', 'Hallelujah', NOUVEAU);
  importe.key = 'G';
  importe.tempo = 72;
  const maj = remplacerReference(existant, importe);
  ok(maj.id === 's1', "l'identité du morceau est conservée (id)");
  ok(maj.versions.length === 1, '1 version après remplacement (pas 2)');
  ok(maj.versions[0].lyrics === NOUVEAU, 'la partition de référence porte la nouvelle mise en forme');
  ok(maj.versions[0].key === 'G' && maj.versions[0].tempo === 72, 'tonalité et tempo suivent la nouvelle partition');
  ok(maj.title === 'Hallelujah' && maj.artist === 'Leonard Cohen', 'titre et artiste de la fiche conservés');
  ok(maj.tags.join() === 'messe,lent' && maj.durationSec === 240, 'tags et durée conservés');
  ok(maj.rehearsalNotes[0].text === 'mes annotations de six mois', 'les notes de répétition survivent');
  ok(maj.lyrics === NOUVEAU, 'le miroir de haut niveau suit (référence = version active)');
}

console.log('2. Référence remplacée sans toucher aux AUTRES versions ni à la version active');
{
  const existant = morceau('s2', 'Hallelujah', ANCIEN);
  existant.versions.push({
    ...existant.versions[0],
    id: 's2-v2',
    name: 'Groupe',
    bandId: 'b1',
    lyrics: 'version du groupe',
  });
  existant.activeVersionId = 's2-v2';
  existant.lyrics = 'version du groupe';
  const maj = remplacerReference(existant, morceau('imp', 'Hallelujah', NOUVEAU));
  ok(maj.versions.length === 2, 'les deux versions restent');
  ok(maj.versions[0].lyrics === NOUVEAU, 'la référence est remplacée');
  ok(maj.versions[1].lyrics === 'version du groupe', 'la version de groupe est intacte');
  ok(maj.lyrics === 'version du groupe', 'le miroir reste sur la version ACTIVE (pas de réparation sauvage, b290)');
}

console.log('3. « Garder les deux » : 2 morceaux qui SURVIVENT au dédoublonnage b316');
{
  const existant = morceau('s3', 'Hallelujah', ANCIEN);
  // AVANT b500 : le second morceau au même titre+artiste était enterré par
  // le dédoublonnage — la démonstration du piège :
  const memeTitre = { ...morceau('s4', 'Hallelujah', NOUVEAU), createdAt: '2026-09-05T10:00:00.000Z' };
  const avant = dedupeSongsByContent({ songs: [existant, memeTitre], setlists: [], deleted: [] });
  ok(avant.songs.length === 1, 'PIÈGE démontré : au même titre, le dédoublonnage n’en laisse qu’un');
  ok(avant.songs[0].id === 's3', 'et c’est le plus ancien qui survit — l’import disparaissait');
  // APRÈS b500 : le titre distinct protège la promesse.
  const titre = titreDisponible([existant], 'Hallelujah', 'Leonard Cohen');
  ok(titre === 'Hallelujah (2)', `titre distinct proposé : « ${titre} »`);
  ok(songKey(titre, 'Leonard Cohen') !== songKey('Hallelujah', 'Leonard Cohen'), 'clé de contenu distincte');
  const second = { ...morceau('s5', titre, NOUVEAU), createdAt: '2026-09-05T10:00:00.000Z' };
  const apres = dedupeSongsByContent({ songs: [existant, second], setlists: [], deleted: [] });
  ok(apres.songs.length === 2, 'les DEUX morceaux survivent au dédoublonnage');
}

console.log('4. titreDisponible : incrémente tant que c’est pris, ne touche pas un titre libre');
{
  const libres = titreDisponible([], 'Imagine', 'John Lennon');
  ok(libres === 'Imagine', 'un titre libre reste tel quel');
  const s1 = morceau('a', 'Imagine', 'x');
  s1.artist = 'John Lennon';
  const s2 = morceau('b', 'Imagine (2)', 'x');
  s2.artist = 'John Lennon';
  const suivant = titreDisponible([s1, s2], 'Imagine', 'John Lennon');
  ok(suivant === 'Imagine (3)', '« (2) » déjà pris → « (3) »');
  const autreArtiste = titreDisponible([s1], 'Imagine', 'Ariana Grande');
  ok(autreArtiste === 'Imagine', 'même titre mais autre artiste : pas de suffixe (clés distinctes)');
}

if (echecs > 0) {
  console.error(`\n${echecs} échec(s).`);
  process.exit(1);
}
console.log('\nTout est vert.');
