/**
 * Regroupement des fonctions IA (limite : 12 fonctions serverless sur le
 * plan Vercel Hobby — 1 fichier api/ = 1 fonction).
 *
 * Les URLs publiques ne changent PAS : vercel.json réécrit
 *   /api/ai-clean   → /api/ai?fn=clean
 *   /api/ai-note    → /api/ai?fn=note
 *   /api/setlist-ai → /api/ai?fn=setlist
 * La logique de chaque endpoint vit dans server/.
 */
import clean from '../server/ai-clean.js';
import note from '../server/ai-note.js';
import setlist from '../server/setlist-ai.js';

const handlers = { clean, note, setlist };

export default async function handler(req, res) {
  const fn = typeof req.query?.fn === 'string' ? req.query.fn : '';
  const h = handlers[fn];
  if (!h) {
    res.status(404).json({ error: 'Fonction inconnue' });
    return;
  }
  return h(req, res);
}
