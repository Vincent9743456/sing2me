/**
 * Fonction serveur Vercel : récupère une partition depuis un lien
 * Ultimate Guitar et renvoie son contenu brut + métadonnées.
 *
 * Le navigateur ne peut pas interroger ultimate-guitar.com directement
 * (CORS) : cette fonction fait l'intermédiaire, côté serveur.
 * NB : en développement local (`npm run dev`), cette route n'existe pas —
 * utiliser `vercel dev`, ou la version déployée.
 *
 * Formats gérés :
 * - tablatures publiques : tabs.ultimate-guitar.com/tab/artiste/chanson-123
 * - tablatures personnelles partagées : /user/tab/view?h=…&tab_id=…
 *   (structure de page différente → recherche du contenu dans tout le
 *   JSON de la page, pas seulement au chemin habituel)
 */

const ALLOWED_HOSTS = ['ultimate-guitar.com', 'tabs.ultimate-guitar.com'];

function unescapeHtml(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Entités HTML restées dans le CONTENU des partitions (&eacute; → é…)
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  agrave: 'à', aacute: 'á', acirc: 'â', auml: 'ä', atilde: 'ã',
  ccedil: 'ç', ocirc: 'ô', ouml: 'ö', oacute: 'ó', ograve: 'ò', otilde: 'õ',
  icirc: 'î', iuml: 'ï', iacute: 'í', igrave: 'ì',
  ucirc: 'û', ugrave: 'ù', uuml: 'ü', uacute: 'ú',
  ntilde: 'ñ', yuml: 'ÿ', aelig: 'æ', oelig: 'œ', szlig: 'ß',
  aring: 'å', oslash: 'ø', hellip: '…', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', deg: '°',
  laquo: '«', raquo: '»',
  // &acute; sert d'apostrophe chez UG (« J&acute;avais »)
  acute: "'", grave: '`', uml: '¨', cedil: '¸', tilde: '˜', circ: 'ˆ',
  middot: '·', bull: '•', prime: '′', euro: '€', pound: '£', cent: '¢',
  copy: '©', reg: '®', trade: '™', times: '×', divide: '÷', plusmn: '±',
  sup2: '²', sup3: '³', frac12: '½', frac14: '¼', frac34: '¾',
  iexcl: '¡', iquest: '¿',
};

function decodeEntitiesOnce(text) {
  return text
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d{1,7});/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]{2,8});/g, (m, name) => {
      const exact = NAMED_ENTITIES[name];
      if (exact) return exact;
      const lower = NAMED_ENTITIES[name.toLowerCase()];
      if (lower && name[0] === name[0].toUpperCase()) return lower.toUpperCase();
      return lower ?? m;
    });
}

// Itératif : décode les encodages en couches (&amp;eacute;…) jusqu'à stabilité
function decodeEntities(text) {
  if (typeof text !== 'string') return text;
  let prev = text;
  for (let i = 0; i < 5; i++) {
    const next = decodeEntitiesOnce(prev);
    if (next === prev) return next;
    prev = next;
  }
  return prev;
}

/**
 * Cherche récursivement dans le JSON de la page un objet `wiki_tab`
 * contenant le texte de la partition (les tablatures personnelles ne le
 * rangent pas au même endroit que les publiques).
 */
function findWikiContent(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  if (
    node.wiki_tab &&
    typeof node.wiki_tab === 'object' &&
    typeof node.wiki_tab.content === 'string' &&
    node.wiki_tab.content.trim() !== ''
  ) {
    return node.wiki_tab.content;
  }
  for (const key of Object.keys(node)) {
    const found = findWikiContent(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/** Cherche récursivement les métadonnées (titre, artiste, tonalité, capo). */
function findMeta(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  const title =
    typeof node.song_name === 'string' && node.song_name.trim() !== ''
      ? node.song_name
      : '';
  const artist =
    typeof node.artist_name === 'string' && node.artist_name.trim() !== ''
      ? node.artist_name
      : '';
  if (title !== '' || artist !== '') return { title, artist };
  for (const key of Object.keys(node)) {
    const found = findMeta(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function findTonality(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  if (typeof node.tonality === 'string' && node.tonality.trim() !== '') {
    return { key: node.tonality, capo: typeof node.capo === 'number' ? node.capo : 0 };
  }
  for (const key of Object.keys(node)) {
    const found = findTonality(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Récupération avec suivi MANUEL des redirections + pot à cookies :
 * les pages « Personal tab » d'UG posent des cookies puis redirigent
 * vers elles-mêmes — le suivi automatique de fetch (sans cookies)
 * boucle et échoue. Renvoie aussi la chaîne suivie (diagnostic).
 */
async function fetchWithCookies(startUrl, headers) {
  let url = startUrl;
  const jar = new Map();
  const chain = [];
  for (let i = 0; i < 10; i++) {
    const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const resp = await fetch(url, {
      redirect: 'manual',
      headers: { ...headers, ...(cookie !== '' ? { Cookie: cookie } : {}) },
    });
    const setCookies =
      typeof resp.headers.getSetCookie === 'function'
        ? resp.headers.getSetCookie()
        : resp.headers.get('set-cookie')
          ? [resp.headers.get('set-cookie')]
          : [];
    for (const c of setCookies) {
      const m = /^([^=;]+)=([^;]*)/.exec(c);
      if (m) jar.set(m[1].trim(), m[2]);
    }
    chain.push(`${resp.status} ${url.slice(0, 120)}`);
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location');
      if (!loc) return { resp, chain };
      url = new URL(loc, url).toString();
      continue;
    }
    return { resp, chain };
  }
  return { resp: null, chain };
}

export default async function handler(req, res) {
  let isPersonal = false;
  const debug = req.query?.debug === '1';
  const withDebug = (obj, chain) => (debug ? { ...obj, debug: chain } : obj);
  // En diagnostic, répondre 200 pour que le corps (chaîne suivie) soit
  // lisible par les outils qui masquent les corps d'erreurs HTTP.
  const errStatus = (s) => (debug ? 200 : s);
  try {
    const url = req.query?.url;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Paramètre url manquant' });
      return;
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      res.status(400).json({ error: 'URL invalide' });
      return;
    }
    const hostOk = ALLOWED_HOSTS.some(
      (h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h),
    );
    if (!hostOk || parsed.protocol !== 'https:') {
      res.status(400).json({
        error:
          "Ce type de lien n'est pas pris en charge — colle le lien d'une page de partition (accords + paroles).",
      });
      return;
    }
    isPersonal = /\/user\/tab\b/.test(parsed.pathname);
    const personalHint =
      ' — ce lien pointe vers une tablature personnelle (« Personal ' +
      'tab »), souvent visible uniquement une fois connecté sur le site. ' +
      'Le plus simple : ouvre la tablature dans ton navigateur, copie ' +
      'son texte et importe-le via « Document / texte ».';

    let page;
    let chain = [];
    try {
      const out = await fetchWithCookies(parsed.toString(), {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
      });
      page = out.resp;
      chain = out.chain;
    } catch (e) {
      res.status(errStatus(502)).json(
        withDebug(
          {
            error:
              'Impossible de charger la page de la partition' +
              (isPersonal ? personalHint : ' — réessaie dans un instant.'),
          },
          [String(e && e.message)],
        ),
      );
      return;
    }
    if (!page) {
      res.status(errStatus(502)).json(
        withDebug(
          {
            error:
              'La page de la partition redirige en boucle' +
              (isPersonal ? personalHint : ''),
          },
          chain,
        ),
      );
      return;
    }
    if (page.status === 429) {
      // Limite de débit UG : une seconde chance après une courte pause
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const retry = await fetchWithCookies(parsed.toString(), {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
        });
        if (retry.resp) {
          page = retry.resp;
          chain = [...chain, ...retry.chain];
        }
      } catch {
        /* on garde la première réponse */
      }
    }
    if (!page.ok) {
      res.status(errStatus(502)).json(
        withDebug(
          {
            error:
              page.status === 429
                ? 'Le service de recherche limite le débit (trop de requêtes rapprochées) — attends une minute et réessaie. (429)'
                : `Le site de la partition a répondu ${page.status}` +
                  (isPersonal ? personalHint : ''),
          },
          chain,
        ),
      );
      return;
    }
    const html = await page.text();

    const match = html.match(/class="js-store"\s+data-content="([^"]+)"/);
    if (!match) {
      res.status(errStatus(422)).json(
        withDebug(
          {
            error: isPersonal
              ? 'Impossible de lire cette tablature personnelle' + personalHint
              : "Impossible de lire cette page — vérifie qu'il s'agit bien d'un lien de partition.",
          },
          [...chain, 'pas de js-store; extrait: ' + html.slice(0, 300)],
        ),
      );
      return;
    }

    let store;
    try {
      store = JSON.parse(unescapeHtml(match[1]));
    } catch {
      res.status(422).json({ error: 'Format de page non reconnu' });
      return;
    }

    const data = store?.store?.page?.data ?? {};
    const tabView = data.tab_view ?? {};
    const tabMeta = data.tab ?? {};
    // Chemin habituel (tablatures publiques), sinon recherche générale
    // (tablatures personnelles : autre structure de page).
    const content =
      typeof tabView?.wiki_tab?.content === 'string' &&
      tabView.wiki_tab.content.trim() !== ''
        ? tabView.wiki_tab.content
        : findWikiContent(store);
    if (!content || typeof content !== 'string') {
      res.status(422).json({
        error: isPersonal
          ? 'Cette tablature personnelle ne contient pas de partition texte lisible' +
            personalHint
          : 'Cette page ne contient pas de partition texte (les versions ' +
            '« Guitar Pro » et « Official » ne sont pas importables — choisis ' +
            'une version Chords, Tab, Bass ou Ukulele).',
      });
      return;
    }

    const meta = tabView?.meta ?? {};
    let title =
      typeof tabMeta.song_name === 'string' ? tabMeta.song_name : '';
    let artist =
      typeof tabMeta.artist_name === 'string' ? tabMeta.artist_name : '';
    if (title === '' && artist === '') {
      const found = findMeta(store);
      if (found) {
        title = found.title;
        artist = found.artist;
      }
    }
    let key = typeof meta.tonality === 'string' ? meta.tonality : '';
    let capo = typeof meta.capo === 'number' ? meta.capo : 0;
    if (key === '') {
      const found = findTonality(store);
      if (found) {
        key = found.key;
        capo = capo || found.capo;
      }
    }
    // Cache CDN : la même partition redemandée (re-import, autre membre)
    // est servie sans retaper UG pendant 24 h.
    res.setHeader(
      'Cache-Control',
      's-maxage=86400, stale-while-revalidate=604800',
    );
    res.status(200).json({
      title: decodeEntities(title),
      artist: decodeEntities(artist),
      key,
      capo,
      content: decodeEntities(content),
    });
  } catch (e) {
    res.status(errStatus(500)).json(
      withDebug(
        {
          error:
            'Erreur inattendue côté serveur' +
            (isPersonal
              ? " — ce lien de tablature personnelle n'a pas pu être lu. " +
                'Copie le texte de la partition et importe-le via « Document / texte ».'
              : ''),
        },
        [String(e && e.message), String(e && e.stack).slice(0, 300)],
      ),
    );
  }
}
