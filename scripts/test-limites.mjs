/**
 * Tests des limites de plan (b381) — logique pure de src/lib/limites.ts.
 * Lancement : node scripts/test-limites.mjs
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
  `export {
    LIMITES, limitesDuPlan, estUnPlan,
    compteMorceauxPerso, compteGroupesCrees,
    peutAjouterMorceau, peutCreerGroupe,
    placesRestantes, presDeLaLimite,
  } from '${racine}limites';\n`,
);
const out = join(dir, 'pont.mjs');
buildSync({ entryPoints: [pont], bundle: true, format: 'esm', outfile: out });
const {
  LIMITES,
  limitesDuPlan,
  estUnPlan,
  compteMorceauxPerso,
  compteGroupesCrees,
  peutAjouterMorceau,
  peutCreerGroupe,
  placesRestantes,
  presDeLaLimite,
} = await import(out);

let ko = 0;
function egal(nom, obtenu, attendu) {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  const ok = a === b;
  if (!ok) ko++;
  console.log(`${ok ? 'OK ' : 'KO '} ${nom} — ${a}${ok ? '' : ` ≠ ${b}`}`);
}

// La config validée : free 30 morceaux / 2 groupes créés, import en masse
// ouvert ; pro et admin sans plafond.
egal('free maxSongs', LIMITES.free.maxSongs, 30);
egal('free maxOwnedGroups', LIMITES.free.maxOwnedGroups, 2);
egal('free bulkImport ouvert', LIMITES.free.bulkImport, true);
egal('free setlists illimitées', LIMITES.free.maxSetlists, null);
egal('free live illimité', LIMITES.free.liveSessions, null);
egal('pro sans plafond', LIMITES.pro.maxSongs, null);
egal('admin sans plafond', LIMITES.admin.maxOwnedGroups, null);

// Un plan inconnu (valeur future, cache abîmé) retombe sur free : le côté
// sûr est de ne rien débloquer qu'on ne connaît pas.
egal('plan inconnu → free', limitesDuPlan('platine').maxSongs, 30);
egal('estUnPlan free', estUnPlan('free'), true);
egal('estUnPlan vide', estUnPlan(''), false);

// Morceaux comptés = bibliothèque perso HORS propositions (idea = true) :
// un répertoire reçu sur invitation ne consomme rien ; l'accepter, si.
{
  const songs = [
    {},                 // morceau ordinaire
    { idea: false },    // proposition acceptée : compte
    { idea: true },     // proposition en attente : ne compte pas
    { idea: true },
  ];
  egal('compte hors propositions', compteMorceauxPerso(songs), 2);
  egal('bibliothèque vide', compteMorceauxPerso([]), 0);
}

// Groupes comptés = groupes CRÉÉS (owned) — rejoindre ne compte jamais.
{
  const bands = [{ owned: true }, { owned: false }, {}];
  egal('groupes créés seulement', compteGroupesCrees(bands), 1);
}

// Les gardes : sous la limite oui, à la limite non, illimité toujours.
egal('29/30 : on peut ajouter', peutAjouterMorceau('free', 29), true);
egal('30/30 : on ne peut plus', peutAjouterMorceau('free', 30), false);
egal('au-delà (bêta 45) : non plus', peutAjouterMorceau('free', 45), false);
egal('pro : toujours', peutAjouterMorceau('pro', 500), true);
egal('1/2 groupes : on peut créer', peutCreerGroupe('free', 1), true);
egal('2/2 groupes : non', peutCreerGroupe('free', 2), false);
egal('admin : toujours', peutCreerGroupe('admin', 10), true);

// Places restantes : jamais négatif, null = illimité.
egal('places 30-28', placesRestantes(30, 28), 2);
egal('places bêta au-delà', placesRestantes(30, 45), 0);
egal('places illimité', placesRestantes(null, 45), null);

// Le rappel discret ne parle qu'à l'approche (≥ 80 %).
egal('23/30 : pas de rappel', presDeLaLimite(23, 30), false);
egal('24/30 : rappel', presDeLaLimite(24, 30), true);
egal('30/30 : rappel', presDeLaLimite(30, 30), true);
egal('illimité : jamais', presDeLaLimite(1000, null), false);
egal('2/2 groupes : rappel', presDeLaLimite(2, 2), true);
egal('1/2 groupes : pas encore', presDeLaLimite(1, 2), false);

rmSync(dir, { recursive: true, force: true });
console.log(ko === 0 ? '\nTous les tests passent.' : `\n${ko} test(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
