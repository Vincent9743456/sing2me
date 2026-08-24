/**
 * Tests de la synchro multi-appareils (b373, constat de Marco : « les
 * morceaux passent, pas les setlists ni les groupes ») — logique pure.
 * Lancement : node scripts/test-sync.mjs
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
  `export { mergeStates } from '${racine}lib/sync';\n` +
    `export { tamponneBand } from '${racine}types';\n` +
    `export { applyBandData, exportBandData, mergeBandData } from '${racine}lib/bandSync';\n`,
);
const out = join(dir, 'pont.mjs');
buildSync({ entryPoints: [pont], bundle: true, format: 'esm', outfile: out });
const { mergeStates, tamponneBand, applyBandData, exportBandData, mergeBandData } =
  await import(out);

let ko = 0;
function egal(nom, obtenu, attendu) {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  const ok = a === b;
  if (!ok) ko++;
  console.log(`${ok ? 'OK ' : 'KO '} ${nom} — ${a}${ok ? '' : ` ≠ ${b}`}`);
}

const artist = { name: '', bio: '', photo: '', tipUrl: '', links: [], gear: [] };
const base = () => ({
  songs: [], setlists: [], concerts: [], bands: [],
  artist: structuredClone(artist), prefs: {}, deleted: [], bandRemovals: [], resetAt: {},
});
const groupe = (extra = {}) => ({
  id: 'g1', name: 'Zakoustiks', photo: '', bio: '', tipUrl: '',
  links: [], members: [], owned: true, cloudId: '', ...extra,
});

// 1. Création : un groupe et une setlist créés sur A arrivent sur B.
{
  const cloud = { ...base(), bands: [groupe()], setlists: [{ id: 's1', name: 'Été', items: [], bandId: '', updatedAt: '2026-08-18T10:00:00Z' }] };
  const surB = mergeStates(base(), cloud);
  egal('création groupe → B', surB.bands.length, 1);
  egal('création setlist → B', surB.setlists.length, 1);
}

// 2. LE BUG DE MARCO : renommage horodaté sur A → B l'adopte.
{
  const surA = tamponneBand(groupe({ name: 'Les Zakoustiks', photo: 'P2' }));
  const localB = { ...base(), bands: [groupe({ photo: 'P1' })] };
  const surB = mergeStates(localB, { ...base(), bands: [surA] });
  egal('renommage propagé', surB.bands[0].name, 'Les Zakoustiks');
  egal('photo propagée', surB.bands[0].photo, 'P2');
}

// 3. Musicien ajouté À LA MAIN sur A (horodaté) → il arrive sur B.
{
  const surA = tamponneBand(groupe({ members: [{ id: 'm1', name: 'Gaëlle', instrument: '' }] }));
  const surB = mergeStates({ ...base(), bands: [groupe()] }, { ...base(), bands: [surA] });
  egal('musicien manuel propagé', surB.bands[0].members.length, 1);
}

// 4. Une RÉPARATION (sans horodatage) ne gagne jamais contre un geste.
{
  const gesteA = tamponneBand(groupe({ name: 'Les Zakoustiks' }));
  const reparationB = groupe(); // vieux nom, jamais tamponnée
  const surB = mergeStates({ ...base(), bands: [reparationB] }, { ...base(), bands: [gesteA] });
  egal('réparation muette ne gagne pas', surB.bands[0].name, 'Les Zakoustiks');
}

// 5. Données d'avant b373 (aucun horodatage) : l'union d'avant, à l'identique
//    — une valeur connue n'est jamais perdue face à un vide.
{
  const localB = { ...base(), bands: [groupe({ photo: '' })] };
  const cloudA = { ...base(), bands: [groupe({ photo: 'P1', name: '' })] };
  const surB = mergeStates(localB, cloudA);
  egal('legacy — photo rescapée', surB.bands[0].photo, 'P1');
  egal('legacy — nom local gardé', surB.bands[0].name, 'Zakoustiks');
}

// 6. Le cloudId n'est JAMAIS perdu, même quand l'autre côté est plus récent.
{
  const gesteSansCloud = tamponneBand(groupe({ name: 'Nouveau nom' }));
  const localAvecCloud = { ...base(), bands: [groupe({ cloudId: 'CID' })] };
  const surB = mergeStates(localAvecCloud, { ...base(), bands: [gesteSansCloud] });
  egal('cloudId rescapé', surB.bands[0].cloudId, 'CID');
  egal('nom récent gardé', surB.bands[0].name, 'Nouveau nom');
}

// 7. Setlist éditée sur A (plus récente) → B l'adopte ; l'inverse non.
{
  const vieille = { id: 's1', name: 'Été', items: [], bandId: '', updatedAt: '2026-08-18T10:00:00Z' };
  const recente = { ...vieille, name: 'Été v2', updatedAt: '2026-08-18T11:00:00Z' };
  const surB = mergeStates({ ...base(), setlists: [structuredClone(vieille)] }, { ...base(), setlists: [recente] });
  egal('setlist récente gagne', surB.setlists[0].name, 'Été v2');
  const surA = mergeStates({ ...base(), setlists: [structuredClone(recente)] }, { ...base(), setlists: [vieille] });
  egal('setlist vieille ne régresse pas', surA.setlists[0].name, 'Été v2');
}

// 8. LE BUG DE MARCO (b374) : un point zéro de réinitialisation existe
//    (resetAt.bands, propagé par le cloud) — un groupe SANS date créé sur un
//    autre appareil doit quand même arriver. Avant : jeté pour toujours.
{
  const cloudA = { ...base(), bands: [groupe()], resetAt: { bands: '2026-08-01T00:00:00Z' } };
  const surB = mergeStates(base(), cloudA);
  egal('groupe sans date survit au point zéro', surB.bands.length, 1);
}

// 9. Le point zéro continue de filtrer ce qu'il doit : un élément DATÉ
//    d'avant la réinitialisation, absent en local, ne ressuscite pas.
{
  const vieux = { ...groupe(), updatedAt: '2026-07-01T00:00:00Z' };
  const cloudA = { ...base(), bands: [vieux], resetAt: { bands: '2026-08-01T00:00:00Z' } };
  const surB = mergeStates(base(), cloudA);
  egal('groupe daté d’avant le reset écarté', surB.bands.length, 0);
  const recent = { ...groupe(), updatedAt: '2026-08-15T00:00:00Z' };
  const surB2 = mergeStates(base(), { ...base(), bands: [recent], resetAt: { bands: '2026-08-01T00:00:00Z' } });
  egal('groupe daté d’après le reset gardé', surB2.bands.length, 1);
}

// 10. Une setlist datée d'après le reset passe aussi (le cas « playlist de
//     3 morceaux » de Marco, une fois le point zéro derrière elle).
{
  const sl = { id: 's9', name: 'Répète', items: [], bandId: '', updatedAt: '2026-08-18T12:00:00Z' };
  const cloudA = { ...base(), setlists: [sl], resetAt: { setlists: '2026-08-01T00:00:00Z' } };
  const surB = mergeStates(base(), cloudA);
  egal('setlist créée après le reset arrive', surB.setlists.length, 1);
}

// 11. b420 — LA PROVENANCE D'UNE PROPOSITION VOYAGE ET SURVIT.
//     Marco propose un morceau (version de groupe estampillée `par`) : le
//     blob exporté la porte, le membre qui l'applique la reçoit, et une
//     fusion avec un export SANS provenance (client d'avant b420, membre
//     qui a accepté sans elle) ne la perd jamais.
{
  const chanson = (extra = {}) => ({
    id: 'm1', title: 'Acoustic medley', artist: 'Bob Marley',
    key: 'C', tempo: 0, capo: 0, durationSec: 0, tags: [], structure: [],
    lyrics: 'la la', versions: [
      { id: 'v0', name: 'Originale', bandId: '', key: 'C', tempo: 0, capo: 0, structure: [], lyrics: 'la la', updatedAt: '2026-08-20T10:00:00Z' },
      { id: 'v1', name: 'Zakoustiks', bandId: 'g1', key: 'C', tempo: 0, capo: 0, structure: [], lyrics: 'la la', updatedAt: '2026-08-20T10:00:00Z', par: { id: 'compte-marco', nom: 'Marco' } },
    ],
    activeVersionId: 'v0', rehearsalNotes: [], hearts: 0, fanMessages: [],
    createdAt: '2026-08-20T10:00:00Z', updatedAt: '2026-08-20T10:00:00Z', ...extra,
  });
  // Export chez Marco : la provenance part dans le blob.
  const blob = exportBandData([chanson()], [], 'g1');
  egal('export porte la provenance', blob.songs[0].version.par?.nom, 'Marco');
  // Application chez Vincent (bibliothèque vide) : proposition reçue avec elle.
  const chezVincent = applyBandData(blob, [], [], 'zk-local');
  egal('proposition reçue avec provenance',
    chezVincent.songs[0].versions.find((v) => v.bandId === 'zk-local')?.par?.nom,
    'Marco');
  egal('proposition en attente', chezVincent.songs[0].idea, true);
  // Fusion avec un export SANS provenance mais plus récent : elle survit.
  const sansPar = structuredClone(blob);
  delete sansPar.songs[0].version.par;
  sansPar.songs[0].version.lyrics = 'la la la';
  sansPar.songs[0].version.updatedAt = '2026-08-21T10:00:00Z';
  sansPar.songs[0].updatedAt = '2026-08-21T10:00:00Z';
  const fusion = mergeBandData(blob, sansPar);
  egal('édition la plus récente gagne', fusion.songs[0].version.lyrics, 'la la la');
  egal('la provenance ne se perd pas', fusion.songs[0].version.par?.nom, 'Marco');
  // Rattrapage : une proposition déjà reçue SANS provenance la gagne quand
  // un blob l'apporte — sans réécrire le contenu.
  const ancienne = chanson({ id: 'm2', idea: true, pendingBandId: 'zk-local' });
  ancienne.versions[1] = { ...ancienne.versions[1], bandId: 'zk-local' };
  delete ancienne.versions[1].par;
  const rattrape = applyBandData(blob, [ancienne], [], 'zk-local');
  egal('provenance rattrapée sur l’existant',
    rattrape.songs[0].versions.find((v) => v.bandId === 'zk-local')?.par?.nom,
    'Marco');
}

// 12. b421 — ON NE SE PROPOSE PAS UN MORCEAU À SOI-MÊME.
//     Le blob porte la provenance de Marco : chez Marco, le morceau entre
//     (ou reste) en bibliothèque, jamais en proposition ; chez Vincent, il
//     reste une proposition.
{
  const blob = {
    songs: [{
      key: 'acoustic medley @ bob marley', title: 'Acoustic medley', artist: 'Bob Marley',
      durationSec: 0, tags: [], notes: [], updatedAt: '2026-08-20T10:00:00Z',
      version: { name: 'Zakoustiks', key: 'C', tempo: 0, capo: 0, structure: [], lyrics: 'la la', updatedAt: '2026-08-20T10:00:00Z', par: { id: 'compte-marco', nom: 'Marco' } },
    }],
    setlists: [], removed: [], removedNotes: [],
  };
  // Chez MARCO (bibliothèque vide — ex. réinstallation) : pas de proposition.
  const chezMarco = applyBandData(blob, [], [], 'zk', undefined, undefined, 'compte-marco');
  egal('ma propre proposition ne me revient pas', chezMarco.songs[0].idea, undefined);
  egal('…et entre en bibliothèque', chezMarco.songs[0].pendingBandId, undefined);
  // Chez VINCENT : proposition normale.
  const chezVincent = applyBandData(blob, [], [], 'zk', undefined, undefined, 'compte-vincent');
  egal('chez l’autre membre, proposition', chezVincent.songs[0].idea, true);
  // Une proposition DÉJÀ en boîte qui s'avère la mienne est adoptée.
  const enBoite = {
    id: 'p1', title: 'Acoustic medley', artist: 'Bob Marley', key: 'C', tempo: 0,
    capo: 0, durationSec: 0, tags: [], structure: [], lyrics: 'la la',
    idea: true, pendingBandId: 'zk',
    versions: [
      { id: 'v0', name: 'Originale', bandId: '', key: 'C', tempo: 0, capo: 0, structure: [], lyrics: 'la la', updatedAt: '2026-08-19T10:00:00Z' },
      { id: 'vz', name: 'Zakoustiks', bandId: 'zk', key: 'C', tempo: 0, capo: 0, structure: [], lyrics: 'la la', updatedAt: '2026-08-19T10:00:00Z' },
    ],
    activeVersionId: 'v0', rehearsalNotes: [], hearts: 0, fanMessages: [],
    createdAt: '2026-08-19T10:00:00Z', updatedAt: '2026-08-19T10:00:00Z',
  };
  const adoptee = applyBandData(blob, [enBoite], [], 'zk', undefined, undefined, 'compte-marco');
  egal('proposition en boîte adoptée (c’était la mienne)', adoptee.songs[0].idea, false);
  egal('…sans groupe en attente', adoptee.songs[0].pendingBandId, undefined);
}

rmSync(dir, { recursive: true, force: true });
console.log(ko === 0 ? '\nTous les tests passent.' : `\n${ko} test(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
