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
import diag from '../server/diag.js';

const handlers = {
  heart,
  message,
  'live-stats': liveStats,
  attend,
  // Diagnostic ON AIR (b178) : réservé à l'artiste, aucune URL publique.
  diag,
};

// Compat : si la réécriture Vercel ne transmet pas ?fn= (anciens bundles
// appelant l'URL d'origine, ex. /api/heart), on route par le chemin.
const byPath = {
  heart: 'heart',
  message: 'message',
  'live-stats': 'live-stats',
  attend: 'attend',
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
