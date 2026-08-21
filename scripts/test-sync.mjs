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
    `export { tamponneBand } from '${racine}types';\n`,
);
const out = join(dir, 'pont.mjs');
buildSync({ entryPoints: [pont], bundle: true, format: 'esm', outfile: out });
const { mergeStates, tamponneBand } = await import(out);

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

rmSync(dir, { recursive: true, force: true });
console.log(ko === 0 ? '\nTous les tests passent.' : `\n${ko} test(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
