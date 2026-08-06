/**
 * Regroupement des fonctions d'import de partitions (limite : 12 fonctions
 * serverless sur le plan Vercel Hobby — 1 fichier api/ = 1 fonction).
 *
 * Les URLs publiques ne changent PAS : vercel.json réécrit
 *   /api/fetch-tab     → /api/tabs?fn=fetch
 *   /api/search-tabs   → /api/tabs?fn=search
 *   /api/social-import → /api/tabs?fn=social
 * La logique de chaque endpoint vit dans server/.
 */
import fetchTab from '../server/fetch-tab.js';
import searchTabs from '../server/search-tabs.js';
import socialImport from '../server/social-import.js';

const handlers = { fetch: fetchTab, search: searchTabs, social: socialImport };

export default async function handler(req, res) {
  const fn = typeof req.query?.fn === 'string' ? req.query.fn : '';
  const h = handlers[fn];
  if (!h) {
    res.status(404).json({ error: 'Fonction inconnue' });
    return;
  }
  return h(req, res);
}
