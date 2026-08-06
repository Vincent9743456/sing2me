/**
 * Regroupement de fonctions ON AIR (limite : 12 fonctions serverless sur
 * le plan Vercel Hobby — 1 fichier api/ = 1 fonction).
 *
 * Les URLs publiques ne changent PAS : vercel.json réécrit
 *   /api/heart      → /api/live-x?fn=heart
 *   /api/message    → /api/live-x?fn=message
 *   /api/live-stats → /api/live-x?fn=live-stats
 *   /api/attend     → /api/live-x?fn=attend
 * La logique de chaque endpoint vit dans server/ (jamais déployé en
 * fonction — hors du dossier api/).
 */
import heart from '../server/heart.js';
import message from '../server/message.js';
import liveStats from '../server/live-stats.js';
import attend from '../server/attend.js';

const handlers = {
  heart,
  message,
  'live-stats': liveStats,
  attend,
};

export default async function handler(req, res) {
  const fn = typeof req.query?.fn === 'string' ? req.query.fn : '';
  const h = handlers[fn];
  if (!h) {
    res.status(404).json({ error: 'Fonction inconnue' });
    return;
  }
  return h(req, res);
}
