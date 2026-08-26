/**
 * Tests de la mesure du clavier (b264 → b448) — logique pure.
 * Lancement : node scripts/test-clavier.mjs
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
  `export { hauteurDuClavier, fenetreDeReference, SEUIL_CLAVIER } from '${racine}clavier';\n`,
);
const out = join(dir, 'pont.mjs');
buildSync({ entryPoints: [pont], bundle: true, format: 'esm', outfile: out });
const { hauteurDuClavier, fenetreDeReference, SEUIL_CLAVIER } = await import(out);

let ko = 0;
function egal(nom, obtenu, attendu) {
  const ok = obtenu === attendu;
  if (!ok) ko++;
  console.log(`${ok ? 'OK ' : 'KO '} ${nom} — ${obtenu}${ok ? '' : ` ≠ ${attendu}`}`);
}

// hauteurDuClavier (b264) — la décision brute.
egal('clavier fermé', hauteurDuClavier(844, 844, 0), 0);
egal('clavier ouvert (Safari)', hauteurDuClavier(844, 500, 0), 344);
egal('décalage iOS soustrait', hauteurDuClavier(844, 500, 44), 300);
egal('barre d’adresse ≤ seuil', hauteurDuClavier(844, 844 - SEUIL_CLAVIER, 0), 0);
egal('juste au-dessus du seuil', hauteurDuClavier(844, 844 - SEUIL_CLAVIER - 1, 0), SEUIL_CLAVIER + 1);

// fenetreDeReference (b448) — la fenêtre SANS clavier.
egal('hors saisie : recalée sur la courante', fenetreDeReference(844, 700, 690, false), 700);
egal('hors saisie : la plus grande des deux sources', fenetreDeReference(0, 690, 844, false), 844);
egal('en saisie : ne descend jamais', fenetreDeReference(844, 500, 500, true), 844);
egal('en saisie sans mémoire : la courante', fenetreDeReference(0, 500, 500, true), 500);
egal('en saisie : monte si la courante dépasse', fenetreDeReference(500, 844, 500, true), 844);

// Le scénario b448 (PWA iOS : la mise en page rétrécit AVEC le clavier).
// Avant : hauteurDuClavier(innerHeight=500, visible=500, 0) → 0, barre visible.
{
  const ref = fenetreDeReference(844, 500, 500, true);
  egal('PWA iOS : le clavier est bien vu', hauteurDuClavier(ref, 500, 0), 344);
}

// Le scénario b449 (clavier ouvert PUIS défilement : la fenêtre visuelle
// descend en bas de la mise en page, offsetTop = 424). L'ancienne formule
// unique concluait « fermé » ; l'état OUVERT se juge sans le décalage.
{
  const ref = fenetreDeReference(844, 844, 844, true);
  egal('défilement : la géométrie retombe à 0', hauteurDuClavier(ref, 420, 424), 0);
  egal('défilement : le clavier reste OUVERT', hauteurDuClavier(ref, 420, 0), 424);
}

if (ko > 0) {
  console.log(`\n${ko} test(s) en échec.`);
  process.exit(1);
}
console.log('\nTous les tests passent.');
