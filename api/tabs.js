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
import { identifie } from '../server/identity.js';
import { autorise, refuseTrop } from '../server/ratelimit.js';

const handlers = { fetch: fetchTab, search: searchTabs, social: socialImport };

// Compat : si la réécriture Vercel ne transmet pas ?fn= (anciens bundles
// appelant l'URL d'origine, ex. /api/fetch-tab), on route par le chemin.
const byPath = {
  'fetch-tab': 'fetch',
  'search-tabs': 'search',
  'social-import': 'social',
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
  // Garde-fou d'usage (b220) : pas d'IA ici, mais du trafic sortant qu'on
  // ne veut pas voir transformé en aspirateur de catalogue.
  const qui = await identifie(req);
  const verdict = await autorise('tabs', req, qui.user?.id ?? '');
  if (!verdict.ok) {
    refuseTrop(res, verdict);
    return;
  }
  return h(req, res);
}
