/**
 * Lecture d'une page Ultimate Guitar ENREGISTRÉE (fichier .html déposé
 * par l'utilisateur). C'est la voie garantie pour les tablatures
 * personnelles (« Personal tabs ») : visibles uniquement connecté à UG,
 * elles échappent au serveur — mais la partition est bien présente dans
 * la page que l'utilisateur enregistre depuis SON navigateur (Ctrl+S).
 * L'acte de copie reste le sien. Fonctions pures — testées.
 */
import { UgTab } from './ug';

function unescapeHtmlAttr(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function findWikiContent(node: unknown, depth = 0): string | null {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  const o = node as Record<string, unknown>;
  const wiki = o.wiki_tab as Record<string, unknown> | undefined;
  if (
    wiki &&
    typeof wiki === 'object' &&
    typeof wiki.content === 'string' &&
    wiki.content.trim() !== ''
  ) {
    return wiki.content;
  }
  for (const key of Object.keys(o)) {
    const found = findWikiContent(o[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function findMeta(
  node: unknown,
  depth = 0,
): { title: string; artist: string } | null {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  const o = node as Record<string, unknown>;
  const title =
    typeof o.song_name === 'string' && o.song_name.trim() !== ''
      ? o.song_name
      : '';
  const artist =
    typeof o.artist_name === 'string' && o.artist_name.trim() !== ''
      ? o.artist_name
      : '';
  if (title !== '' || artist !== '') return { title, artist };
  for (const key of Object.keys(o)) {
    const found = findMeta(o[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function findTonality(
  node: unknown,
  depth = 0,
): { key: string; capo: number } | null {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  const o = node as Record<string, unknown>;
  if (typeof o.tonality === 'string' && o.tonality.trim() !== '') {
    return {
      key: o.tonality,
      capo: typeof o.capo === 'number' ? o.capo : 0,
    };
  }
  for (const key of Object.keys(o)) {
    const found = findTonality(o[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/** Valeur d'un attribut dans une balise brute (guillemets " ou '). */
function attrValue(tag: string, name: string): string | null {
  const d = tag.match(new RegExp(name + '="([^"]*)"'));
  if (d) return d[1];
  const s = tag.match(new RegExp(name + "='([^']*)'"));
  return s ? s[1] : null;
}

/** Titre/artiste de secours depuis <meta og:title> ou <title>. */
function titleFromHtml(html: string): { title: string; artist: string } {
  const og = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
  );
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let raw = unescapeHtmlAttr((og?.[1] ?? t?.[1] ?? '').trim())
    .replace(/\s*[@|]\s*Ultimate[- ]?Guitar(\.Com)?.*$/i, '')
    .replace(/\s*\((official|ver \d+)\)\s*$/i, '')
    .trim();
  let artist = '';
  const by = raw.match(/^(.*?)\s+by\s+(.+)$/i);
  if (by) {
    raw = by[1].trim();
    artist = by[2].trim();
  }
  raw = raw.replace(/\s+(chords|tab|bass|ukulele|acoustic)$/i, '').trim();
  return { title: raw, artist };
}

/**
 * Si le HTML est une page de PARTITION UG enregistrée, en extrait la
 * tablature (titre, artiste, tonalité, capo, contenu). Sinon null —
 * l'appelant retombera sur l'extraction de LIENS (pages de liste).
 *
 * Deux stratégies : le JSON js-store (ordre des attributs libre — les
 * navigateurs réécrivent la page au moment de l'enregistrement), puis en
 * repli le plus grand bloc <pre> (la partition telle qu'affichée), avec
 * titre/artiste repris de <title>/og:title.
 */
export function parseUgTabHtml(html: string): UgTab | null {
  // 1) JSON embarqué (js-store), quel que soit l'ordre des attributs
  const tags = html.match(/<[^>]*js-store[^>]*>/g) ?? [];
  for (const tag of tags) {
    const dc = attrValue(tag, 'data-content');
    if (!dc) continue;
    let store: unknown;
    try {
      store = JSON.parse(unescapeHtmlAttr(dc));
    } catch {
      continue;
    }
    const content = findWikiContent(store);
    if (!content) continue;
    const meta = findMeta(store) ?? { title: '', artist: '' };
    const ton = findTonality(store);
    return {
      title: meta.title,
      artist: meta.artist,
      key: ton?.key ?? '',
      capo: ton?.capo ?? 0,
      content,
    };
  }

  // 2) Repli : la partition telle qu'affichée (plus grand bloc <pre>)
  const pres = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)].map(
    (m) => m[1],
  );
  let best = '';
  for (const p of pres) if (p.length > best.length) best = p;
  if (best.trim() !== '') {
    const text = unescapeHtmlAttr(
      best.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''),
    ).replace(/\r\n?/g, '\n');
    // Garde-fou : un vrai contenu de partition, pas un bout de code
    if (text.trim().length > 40 && text.includes('\n')) {
      const meta = titleFromHtml(html);
      return {
        title: meta.title,
        artist: meta.artist,
        key: '',
        capo: 0,
        content: text,
      };
    }
  }
  return null;
}
