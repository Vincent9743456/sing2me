/**
 * Tests des limites de plan (b381, réalignées b385 sur l'offre v2) —
 * logique pure de src/lib/limites.ts.
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
    compteMorceauxActifs, compteReserve,
    peutActiverMorceau, placesRestantes, presDeLaLimite,
  } from '${racine}limites';\n`,
);
const out = join(dir, 'pont.mjs');
buildSync({ entryPoints: [pont], bundle: true, format: 'esm', outfile: out });
const {
  LIMITES,
  limitesDuPlan,
  estUnPlan,
  compteMorceauxActifs,
  compteReserve,
  peutActiverMorceau,
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

// L'offre v2 : gratuit = 50 morceaux ACTIFS, réserve et groupes illimités,
// import en masse ouvert ; le cap de salle (15) existe en config mais n'est
// pas encore appliqué. Pro et admin sans plafond.
egal('free maxSongs (actifs)', LIMITES.free.maxSongs, 50);
egal('free groupes illimités', LIMITES.free.maxOwnedGroups, null);
egal('free cap de salle (config seulement)', LIMITES.free.maxSpectateurs, 15);
egal('free bulkImport ouvert', LIMITES.free.bulkImport, true);
egal('free setlists illimitées', LIMITES.free.maxSetlists, null);
egal('free live illimité', LIMITES.free.liveSessions, null);
egal('pro sans plafond', LIMITES.pro.maxSongs, null);
egal('admin salle sans plafond', LIMITES.admin.maxSpectateurs, null);

// Un plan inconnu (valeur future, cache abîmé) retombe sur free : le côté
// sûr est de ne rien débloquer qu'on ne connaît pas.
egal('plan inconnu → free', limitesDuPlan('platine').maxSongs, 50);
egal('estUnPlan free', estUnPlan('free'), true);
egal('estUnPlan vide', estUnPlan(''), false);

// Morceaux ACTIFS = hors propositions (idea) ET hors réserve (reserve).
{
  const songs = [
    {},                              // actif
    { idea: false },                 // proposition acceptée : actif
    { idea: true },                  // proposition en attente : ne compte pas
    { reserve: true },               // en réserve : ne compte pas
    { reserve: false },              // explicitement actif
    { idea: true, reserve: true },   // ni l'un ni l'autre ne compte
  ];
  egal('compte des actifs', compteMorceauxActifs(songs), 3);
  egal('compte de la réserve', compteReserve(songs), 1);
  egal('bibliothèque vide', compteMorceauxActifs([]), 0);
}

// La garde d'ACTIVATION : sous la limite oui, à la limite non — mais rien
// n'est jamais refusé à l'écriture, l'excédent entre en réserve.
egal('49/50 : on peut activer', peutActiverMorceau('free', 49), true);
egal('50/50 : on ne peut plus', peutActiverMorceau('free', 50), false);
egal('au-delà (bêta 60) : non plus', peutActiverMorceau('free', 60), false);
egal('pro : toujours', peutActiverMorceau('pro', 500), true);
egal('admin : toujours', peutActiverMorceau('admin', 500), true);

// Places restantes : jamais négatif, null = illimité.
egal('places 50-48', placesRestantes(50, 48), 2);
egal('places bêta au-delà', placesRestantes(50, 60), 0);
egal('places illimité', placesRestantes(null, 60), null);

// Le rappel discret ne parle qu'à l'approche (≥ 80 %).
egal('39/50 : pas de rappel', presDeLaLimite(39, 50), false);
egal('40/50 : rappel', presDeLaLimite(40, 50), true);
egal('50/50 : rappel', presDeLaLimite(50, 50), true);
egal('illimité : jamais', presDeLaLimite(1000, null), false);

rmSync(dir, { recursive: true, force: true });
console.log(ko === 0 ? '\nTous les tests passent.' : `\n${ko} test(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
