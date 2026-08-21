/**
 * Tests de la refonte navigation & actions primaires (b378+) — logique pure.
 * Lancement : node scripts/test-nav-refonte.mjs
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
  `export { cibleDuLive, libelleBadge } from '${racine}livenav';\n` +
    `export { nomParDefautSetlist } from '${racine}livedates';\n`,
);
const out = join(dir, 'pont.mjs');
buildSync({ entryPoints: [pont], bundle: true, format: 'esm', outfile: out });
const { cibleDuLive, libelleBadge, nomParDefautSetlist } = await import(out);

let ko = 0;
function egal(nom, obtenu, attendu) {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  const ok = a === b;
  if (!ok) ko++;
  console.log(`${ok ? 'OK ' : 'KO '} ${nom} — ${a}${ok ? '' : ` ≠ ${b}`}`);
}

// Lot 1 — cible du badge : Régie si une setlist est diffusée, sinon panneau.
egal('badge → régie', cibleDuLive('sl42'), { type: 'regie', chemin: '/remote/sl42' });
egal('badge → panneau (pas de setlist)', cibleDuLive(''), { type: 'panneau' });

// Lot 1 — libellé : compteur seulement quand il est connu et non nul.
egal('libellé sans compteur', libelleBadge(null), 'Live');
egal('libellé compteur 0', libelleBadge(0), 'Live');
egal('libellé 12 spectateurs', libelleBadge(12), 'Live · 12');

// Lot 2 — 2.4 : nom par défaut d'une setlist, daté, jamais « (sans nom) ».
egal('nom par défaut août', nomParDefautSetlist(new Date('2026-08-21T12:00:00')), 'Setlist du 21 août');
// La setlist est créée « aujourd'hui » : l'année n'est jamais utile.
egal('nom par défaut décembre', nomParDefautSetlist(new Date('2025-12-24T12:00:00')), 'Setlist du 24 décembre');

rmSync(dir, { recursive: true, force: true });
console.log(ko === 0 ? '\nTous les tests passent.' : `\n${ko} test(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
