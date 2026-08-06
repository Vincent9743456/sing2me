/**
 * Regroupement de fonctions fanbase & signalement (limite : 12 fonctions
 * serverless sur le plan Vercel Hobby — 1 fichier api/ = 1 fonction).
 *
 * Les URLs publiques ne changent PAS : vercel.json réécrit
 *   /api/follow   → /api/fan?fn=follow
 *   /api/souvenir → /api/fan?fn=souvenir
 *   /api/report   → /api/fan?fn=report
 * La logique de chaque endpoint vit dans server/.
 */
import follow from '../server/follow.js';
import souvenir from '../server/souvenir.js';
import report from '../server/report.js';

const handlers = { follow, souvenir, report };

export default async function handler(req, res) {
  const fn = typeof req.query?.fn === 'string' ? req.query.fn : '';
  const h = handlers[fn];
  if (!h) {
    res.status(404).json({ error: 'Fonction inconnue' });
    return;
  }
  return h(req, res);
}
