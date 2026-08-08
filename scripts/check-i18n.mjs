/**
 * Contrôle de couverture des traductions (b156).
 *
 * Compare chaque chaîne d'interface passée à t('…') dans le code aux clés
 * des dictionnaires src/i18n/en-*.ts. Une chaîne sans clé s'affiche en
 * français (repli sûr, jamais d'écran cassé) — ce script sert à ne pas
 * laisser une traduction en arrière par oubli.
 *
 *   node scripts/check-i18n.mjs
 *
 * Sortie : nombre de chaînes par écran, liste de celles sans traduction,
 * code de sortie 1 s'il en reste. Les appels t() portant une expression
 * (concaténation, variable) ne sont pas analysables statiquement : ils
 * sont comptés à part, à vérifier à la main.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const DICT_DIR = path.join(SRC, 'i18n');

/** Toutes les clés connues, tous dictionnaires confondus. */
function knownKeys() {
  const keys = new Set();
  for (const file of fs.readdirSync(DICT_DIR)) {
    if (!file.startsWith('en-') || !file.endsWith('.ts')) continue;
    const src = fs.readFileSync(path.join(DICT_DIR, file), 'utf8');
    for (const m of src.matchAll(/^\s{2}'((?:[^'\\]|\\.)*)':/gm)) keys.add(unesc(m[1]));
    for (const m of src.matchAll(/^\s{2}"((?:[^"\\]|\\.)*)":/gm)) keys.add(unesc(m[1]));
    for (const m of src.matchAll(/^\s{2}([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_]*):/gm)) keys.add(m[1]);
  }
  return keys;
}

function unesc(s) {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/** Tous les .tsx/.ts de src/, hors dictionnaires. */
function sourceFiles(dir = SRC) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'i18n') out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/^i18n\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const known = knownKeys();
let missing = 0;
let complex = 0;
let total = 0;

for (const file of sourceFiles()) {
  const src = fs.readFileSync(file, 'utf8');
  const found = new Set();
  for (const m of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'\s*[,)]/g)) found.add(unesc(m[1]));
  for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"\s*[,)]/g)) found.add(unesc(m[1]));
  // appels t( … ) dont l'argument n'est pas un simple littéral
  for (const m of src.matchAll(/\bt\(\s*(?![`'"])/g)) complex++;
  for (const m of src.matchAll(/\bt\(\s*['"][^\n]*\+\s*$/gm)) complex++;
  if (found.size === 0) continue;
  total += found.size;
  const gaps = [...found].filter((k) => !known.has(k));
  if (gaps.length > 0) {
    missing += gaps.length;
    console.log(`\n${path.relative(ROOT, file)} — ${gaps.length} sans traduction :`);
    for (const g of gaps) console.log('  ✗ ' + JSON.stringify(g));
  }
}

console.log(
  `\n${total} chaînes traduisibles, ${known.size} clés au dictionnaire, ` +
    `${complex} appels non analysables statiquement (à vérifier à la main).`,
);
if (missing === 0) {
  console.log('✅ Couverture complète : aucun écran ne restera à moitié traduit.');
} else {
  console.log(`⚠️ ${missing} chaînes s'afficheront en français.`);
}
process.exit(missing === 0 ? 0 : 1);
