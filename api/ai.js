/**
 * Regroupement des fonctions IA (limite : 12 fonctions serverless sur le
 * plan Vercel Hobby — 1 fichier api/ = 1 fonction).
 *
 * Les URLs publiques ne changent PAS : vercel.json réécrit
 *   /api/ai-clean   → /api/ai?fn=clean
 *   /api/ai-note    → /api/ai?fn=note
 *   /api/setlist-ai → /api/ai?fn=setlist
 *   /api/ai-transcribe → /api/ai?fn=transcribe
 * La logique de chaque endpoint vit dans server/.
 */
import clean from '../server/ai-clean.js';
import note from '../server/ai-note.js';
import setlist from '../server/setlist-ai.js';
import transcribe from '../server/ai-transcribe.js';
import { identifie } from '../server/identity.js';
import { autorise, refuseTrop } from '../server/ratelimit.js';

const handlers = { clean, note, setlist, transcribe };

// Compat : si la réécriture Vercel ne transmet pas ?fn= (anciens bundles
// appelant l'URL d'origine, ex. /api/ai-clean), on route par le chemin.
const byPath = {
  'ai-clean': 'clean',
  'ai-note': 'note',
  'setlist-ai': 'setlist',
  'ai-transcribe': 'transcribe',
};

export default async function handler(req, res) {
  let fn = typeof req.query?.fn === 'string' ? req.query.fn : '';
  if (fn === '') {
    const seg = String(req.url || '')
      .split('?')[0]
      .split('/')
      .filter(Boolean)
      .pop();
    fn = byPath[seg] ?? '';
  }
  const h = handlers[fn];
  if (!h) {
    res.status(404).json({ error: 'Fonction inconnue' });
    return;
  }
  // Garde-fou d'usage (b220) : ces appels coûtent de l'argent réel, et
  // depuis b220 la mise en forme est automatique — donc bouclable. On
  // compte AVANT d'appeler le modèle ; qui ne s'identifie pas a droit à
  // beaucoup moins. Un plafond atteint ne casse rien : le client garde son
  // analyse locale.
  const qui = await identifie(req);
  const verdict = await autorise(fn, req, qui.user?.id ?? '');
  if (!verdict.ok) {
    refuseTrop(res, verdict);
    return;
  }
  return h(req, res);
}
