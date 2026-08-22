/**
 * Tests des limites de plan (b381, simplifiées b386 : « 50 chansons c'est
 * tout ») — logique pure de src/lib/limites.ts.
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
    LIMITES, limitesDuPlan, estUnPlan, compteMorceauxPerso,
    peutAjouterMorceau, placesRestantes, presDeLaLimite,
  } from '${racine}limites';\n`,
);
const out = join(dir, 'pont.mjs');
buildSync({ entryPoints: [pont], bundle: true, format: 'esm', outfile: out });
const {
  LIMITES,
  limitesDuPlan,
  estUnPlan,
  compteMorceauxPerso,
  peutAjouterMorceau,
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

// b387 — les trois offres : gratuit (50 morceaux · 15 spectateurs),
// musicien (morceaux illimités · 15 spectateurs), scène (tout illimité).
// Groupes, setlists et import ouverts partout ; 'pro' = héritage b381.
egal('free maxSongs', LIMITES.free.maxSongs, 50);
egal('free groupes illimités', LIMITES.free.maxOwnedGroups, null);
egal('free cap de salle', LIMITES.free.maxSpectateurs, 15);
egal('free bulkImport ouvert', LIMITES.free.bulkImport, true);
egal('free setlists illimitées', LIMITES.free.maxSetlists, null);
egal('musicien morceaux illimités', LIMITES.musicien.maxSongs, null);
egal('musicien cap de salle', LIMITES.musicien.maxSpectateurs, 15);
egal('scene tout illimité (morceaux)', LIMITES.scene.maxSongs, null);
egal('scene tout illimité (salle)', LIMITES.scene.maxSpectateurs, null);
egal('pro = scène (héritage)', LIMITES.pro.maxSpectateurs, null);
egal('admin sans plafond', LIMITES.admin.maxSongs, null);

// Un plan inconnu (valeur future, cache abîmé) retombe sur free.
egal('plan inconnu → free', limitesDuPlan('platine').maxSongs, 50);
egal('estUnPlan free', estUnPlan('free'), true);
egal('estUnPlan musicien', estUnPlan('musicien'), true);
egal('estUnPlan scene', estUnPlan('scene'), true);
egal('estUnPlan vide', estUnPlan(''), false);

// Comptage : tout sauf les propositions en attente — un morceau de groupe
// compte dès qu'il est ACCEPTÉ par l'utilisateur (arbitrage b386).
{
  const songs = [
    {},                // morceau ordinaire
    { idea: false },   // proposition ACCEPTÉE : compte
    { idea: true },    // proposition en attente : ne compte pas
    { idea: true },
    { reserve: true }, // champ b385 inerte : il compte comme les autres
  ];
  egal('compte hors propositions', compteMorceauxPerso(songs), 3);
  egal('bibliothèque vide', compteMorceauxPerso([]), 0);
}

// La garde : sous la limite oui, à la limite non, illimité toujours.
egal('49/50 : on peut ajouter', peutAjouterMorceau('free', 49), true);
egal('50/50 : on ne peut plus', peutAjouterMorceau('free', 50), false);
egal('au-delà (bêta 60) : non plus', peutAjouterMorceau('free', 60), false);
egal('musicien : toujours', peutAjouterMorceau('musicien', 500), true);
egal('scene : toujours', peutAjouterMorceau('scene', 500), true);
egal('admin : toujours', peutAjouterMorceau('admin', 500), true);

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
