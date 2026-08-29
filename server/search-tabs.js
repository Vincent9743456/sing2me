/**
 * Fonction serveur Vercel : recherche sur Ultimate Guitar et renvoie la
 * liste des versions disponibles (Chords, Tabs, Bass, Ukulélé…) avec
 * leur note et leur nombre de votes, pour sélection dans l'application.
 */

function unescapeHtml(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Types non importables en texte
const EXCLUDED_TYPES = ['Pro', 'Power', 'Official', 'Video', 'Video Lesson'];

/** Retire les accents/diacritiques : « Un autre Finistère » → « Un autre
 *  Finistere ». La source indexe souvent les titres sans accents ; une
 *  recherche accentuée peut alors ne rien matcher (404). */
function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Récupère et parse une page de résultats UG (best-effort). */
async function fetchResultsPage(q, pageNum) {
  const url =
    'https://www.ultimate-guitar.com/search.php?search_type=title&value=' +
    encodeURIComponent(q) +
    (pageNum > 1 ? `&page=${pageNum}` : '');
  const page = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
    },
  });
  if (!page.ok) return { ok: false, status: page.status, results: [] };
  const html = await page.text();
  const match = html.match(/class="js-store"\s+data-content="([^"]+)"/);
  if (!match) return { ok: false, status: 422, results: [] };
  try {
    const store = JSON.parse(unescapeHtml(match[1]));
    const data = store?.store?.page?.data ?? {};
    return {
      ok: true,
      status: 200,
      results: Array.isArray(data.results) ? data.results : [],
    };
  } catch {
    return { ok: false, status: 422, results: [] };
  }
}

// Nombre de résultats importables (texte) dans une page.
const usable = (p) =>
  p.results.filter(
    (r) =>
      r &&
      typeof r.type === 'string' &&
      !EXCLUDED_TYPES.includes(r.type) &&
      typeof r.tab_url === 'string',
  ).length;

/**
 * Recherche paginée pour UNE requête. Plusieurs pages, mais EN SÉQUENCE
 * et en s'arrêtant poliment : le parallèle déclenchait la limite de débit
 * (429). On garde ce qu'on a déjà si une page suivante est refusée.
 * `maxPages` : les tentatives de REPLI (b472) se contentent de 2 pages —
 * chaque page en moins ménage la limite de débit et le délai de réponse.
 */
async function searchPaged(q, maxPages = 4) {
  const pages = [];
  let good = 0;
  for (let n = 1; n <= maxPages; n++) {
    let p = await fetchResultsPage(q, n);
    if (p.status === 429 && n === 1) {
      // Seule la première page mérite une seconde chance (3 s)
      await new Promise((r) => setTimeout(r, 3000));
      p = await fetchResultsPage(q, 1);
    }
    pages.push(p);
    good += usable(p);
    if (p.status === 429) break; // la source sature : on rend ce qu'on a
    // b472 : une page en échec (404 = aucun résultat) rend les suivantes
    // inutiles — insister quadruplait le temps de réponse des requêtes
    // « titre + artiste », que la source ne connaît pas.
    if (!p.ok) break;
    // Assez de versions texte ? Inutile d'insister — chaque page en moins
    // ménage la limite de débit.
    if (good >= 15) break;
    if (n < maxPages) await new Promise((r) => setTimeout(r, 250));
  }
  return { pages, good };
}

export default async function handler(req, res) {
  try {
    const q = req.query?.q;
    if (!q || typeof q !== 'string' || q.trim() === '') {
      res.status(400).json({ error: 'Paramètre q manquant' });
      return;
    }
    const query = q.trim();
    let { pages, good } = await searchPaged(query);
    // Repli sans accents : la source indexe souvent les titres sans
    // diacritiques (« Finistère » rangé sous « Finistere »). Si la
    // recherche accentuée ne ramène rien d'importable, on retente une
    // version sans accents avant de renoncer.
    const flat = stripAccents(query);
    if (good === 0 && flat !== query) {
      const alt = await searchPaged(flat);
      if (alt.good > 0 || pages.every((p) => !p.ok)) {
        pages = alt.pages;
        good = alt.good;
      }
    }
    /*
     * REPLI « TITRE + ARTISTE » (b472, cas de Vincent : « sweet dreams
     * marilyn manson » ne rendait rien). La source ne cherche que dans les
     * TITRES (search_type=title) : les mots de l'artiste font échouer la
     * requête entière. Quand la recherche complète ne rend rien, on retire
     * des mots par la FIN (l'artiste se tape après le titre), jusqu'à 3,
     * et on retient les mots retirés comme ARTISTE VOULU : ses versions
     * remontent en tête du classement (jamais d'exclusion — les autres
     * versions restent visibles derrière).
     */
    let artisteVoulu = [];
    if (good === 0) {
      const mots = query.split(/\s+/).filter((m) => m !== '');
      for (let k = 1; k <= 3 && mots.length - k >= 1 && good === 0; k++) {
        const titre = mots.slice(0, mots.length - k).join(' ');
        let alt = await searchPaged(titre, 2);
        if (alt.good === 0) {
          const flatTitre = stripAccents(titre);
          if (flatTitre !== titre) alt = await searchPaged(flatTitre, 2);
        }
        if (alt.good > 0) {
          pages = alt.pages;
          good = alt.good;
          artisteVoulu = mots
            .slice(mots.length - k)
            .map((m) => stripAccents(m.toLowerCase()));
        }
      }
    }
    /** L'artiste du résultat porte-t-il TOUS les mots retirés ? */
    const artisteCorrespond = (nom) => {
      if (artisteVoulu.length === 0) return false;
      const ref = stripAccents(String(nom).toLowerCase());
      return artisteVoulu.every((m) => ref.includes(m));
    };
    if (!pages.some((p) => p.ok)) {
      const status = pages[0]?.status ?? 502;
      // 404 = recherche sans résultat côté source : ce n'est pas une
      // panne. On renvoie une liste vide pour que l'app affiche
      // « Aucune version trouvée » plutôt qu'une erreur alarmante.
      if (status === 404) {
        res.setHeader('Cache-Control', 's-maxage=3600');
        res.status(200).json({ results: [] });
        return;
      }
      res.status(502).json({
        error:
          status === 429
            ? 'Le service de recherche limite le débit (trop de requêtes rapprochées) — attends une minute et réessaie.'
            : status === 422
              ? 'Format de page de recherche non reconnu'
              : `Le service de recherche a répondu ${status}`,
      });
      return;
    }
    const raw = pages.flatMap((p) => p.results);
    const seen = new Set();
    const results = raw
      .filter(
        (r) =>
          r &&
          typeof r.tab_url === 'string' &&
          r.tab_url !== '' &&
          typeof r.type === 'string' &&
          !EXCLUDED_TYPES.includes(r.type),
      )
      .filter((r) => {
        if (seen.has(r.tab_url)) return false;
        seen.add(r.tab_url);
        return true;
      })
      .map((r) => ({
        title: r.song_name ?? '',
        artist: r.artist_name ?? '',
        type: r.type,
        version: typeof r.version === 'number' ? r.version : 1,
        rating: typeof r.rating === 'number' ? Math.round(r.rating * 10) / 10 : 0,
        votes: typeof r.votes === 'number' ? r.votes : 0,
        url: r.tab_url,
      }))
      .sort(
        // b472 : l'artiste demandé d'abord, puis les votes — « sweet dreams
        // marilyn manson » remonte la version de Marilyn Manson en tête.
        (a, b) =>
          Number(artisteCorrespond(b.artist)) -
            Number(artisteCorrespond(a.artist)) || b.votes - a.votes,
      )
      .slice(0, 60);
    // Cache CDN : la même recherche relancée (par n'importe qui) ne
    // retape pas UG pendant 24 h — précieux contre la limite de débit.
    res.setHeader(
      'Cache-Control',
      's-maxage=86400, stale-while-revalidate=604800',
    );
    res.status(200).json({ results });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
