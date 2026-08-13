/**
 * Fonction serveur Vercel : pré-remplissage du profil depuis un lien
 * public (Facebook, Instagram, site…) via les balises Open Graph.
 * GET /api/social-import?url=…  →  {name, bio, photo}
 */

function unescapeHtml(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function meta(html, prop) {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return unescapeHtml(m[1]);
  }
  return '';
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
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
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      res.status(400).json({ error: 'URL invalide' });
      return;
    }
    const page = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (compatible; mojosong/1.0)',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    if (!page.ok) {
      res.status(502).json({
        error: `La page a répondu ${page.status} — essaie un autre lien (page publique).`,
      });
      return;
    }
    const html = (await page.text()).slice(0, 500_000);

    let name = meta(html, 'og:title');
    if (name === '') {
      const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (t) name = unescapeHtml(t[1]).trim();
    }
    // nettoyage des suffixes type " | Facebook", " (@compte) • Instagram…"
    name = name
      .replace(/\s*[|•·-]\s*(Facebook|Instagram|TikTok|YouTube|Spotify).*$/i, '')
      .replace(/\s*\(@[^)]+\)\s*$/, '')
      .trim();
    const bio = meta(html, 'og:description') || meta(html, 'description');
    const photo = meta(html, 'og:image');

    if (name === '' && bio === '' && photo === '') {
      res.status(422).json({
        error:
          "Impossible de lire ce lien (page privée ?). Essaie l'URL publique de ta page.",
      });
      return;
    }
    res.status(200).json({ name, bio: bio.slice(0, 600), photo });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
