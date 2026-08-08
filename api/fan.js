/**
 * Regroupement de fonctions fanbase & signalement (limite : 12 fonctions
 * serverless sur le plan Vercel Hobby — 1 fichier api/ = 1 fonction).
 *
 * Les URLs publiques ne changent PAS : vercel.json réécrit
 *   /api/follow   → /api/fan?fn=follow
 *   /api/souvenir → /api/fan?fn=souvenir
 *   /api/report   → /api/fan?fn=report
 *   /api/admin-stats → /api/fan?fn=stats
 * La logique de chaque endpoint vit dans server/.
 */
import follow from '../server/follow.js';
import souvenir from '../server/souvenir.js';
import report from '../server/report.js';
import stats from '../server/admin-stats.js';

const handlers = { follow, souvenir, report, stats };

// Compat : si la réécriture Vercel ne transmet pas ?fn= (anciens bundles
// appelant l'URL d'origine, ex. /api/follow), on route par le chemin.
const byPath = {
  follow: 'follow',
  souvenir: 'souvenir',
  report: 'report',
  'admin-stats': 'stats',
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
  return h(req, res);
}
