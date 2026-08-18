/**
 * Tests de la refonte Live (lots A→C) — logique pure uniquement.
 * Lancement : node scripts/test-live-refonte.mjs
 * (esbuild, déjà présent via Vite, compile les modules TS à la volée.)
 */
import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'mojotest-'));
const pont = join(dir, 'pont.ts');
writeFileSync(
  pont,
  "export * from '" +
    new URL('../src/lib/livedates.ts', import.meta.url).pathname +
    "';\n",
);
const out = join(dir, 'pont.mjs');
buildSync({ entryPoints: [pont], bundle: true, format: 'esm', outfile: out });
const {
  sansActivite,
  dateDeTitre,
  dateRelative,
  cleMois,
  libelleMois,
  prochainVendredi,
} = await import(out);

let ko = 0;
function egal(nom, obtenu, attendu) {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  const ok = a === b;
  if (!ok) ko++;
  console.log(`${ok ? 'OK ' : 'KO '} ${nom} — ${a}${ok ? '' : ` ≠ ${b}`}`);
}

// A5 — classement « sans activité »
egal('sansActivite 0/0/0', sansActivite({ uniques: 0, hearts: 0, messages: [] }), true);
egal('sansActivite 1 spectateur', sansActivite({ uniques: 1, hearts: 0, messages: [] }), false);
egal('sansActivite 1 mot', sansActivite({ uniques: 0, hearts: 0, messages: [{}] }), false);

// A4 — titre par défaut, année seulement si différente
const ref = new Date('2026-08-17T12:00:00');
egal('titre même année', dateDeTitre('2026-08-17T22:13:00', ref), '17 août');
egal('titre autre année', dateDeTitre('2025-12-24T20:00:00', ref), '24 décembre 2025');

// A7 — bascules J / J-1 / J-3 / J-8
egal('relative J', dateRelative('2026-08-17T09:00:00', ref), { quand: 'aujourdhui' });
egal('relative J-1', dateRelative('2026-08-16T23:50:00', ref), { quand: 'hier' });
egal('relative J-3', dateRelative('2026-08-14T22:00:00', ref), { quand: 'ilya', jours: 3 });
const j8 = dateRelative('2026-08-09T22:00:00', ref);
egal('relative J-8 → absolu', j8.quand, 'absolu');

// B14 — prochain vendredi (lundi 17 août 2026 → vendredi 21 ; un vendredi
// reste le jour même ; un samedi → vendredi suivant)
egal('vendredi depuis lundi', prochainVendredi(new Date('2026-08-17T12:00:00')), '2026-08-21');
egal('vendredi le vendredi', prochainVendredi(new Date('2026-08-21T12:00:00')), '2026-08-21');
egal('vendredi depuis samedi', prochainVendredi(new Date('2026-08-22T12:00:00')), '2026-08-28');

// A8 — regroupement par mois
egal('cleMois', cleMois('2026-08-17T22:13:00'), '2026-08');
egal('libelleMois', libelleMois('2026-07'), 'juillet 2026');

rmSync(dir, { recursive: true, force: true });
console.log(ko === 0 ? '\nTous les tests passent.' : `\n${ko} test(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
