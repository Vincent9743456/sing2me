/**
 * Conversion du format Ultimate Guitar ([tab]…[/tab], [ch]C[/ch])
 * vers du texte « accords au-dessus des paroles », que l'import
 * intelligent sait ensuite analyser.
 */
import { decodeHtmlEntities } from './textRepair';

/** Titre/artiste des résultats UG : entités HTML restées en clair décodées
 *  (« Je L&#039;aime &Agrave; Mourir » → « Je L'aime À Mourir »). */
function cleanMeta(s: unknown): string {
  return typeof s === 'string' ? decodeHtmlEntities(s) : '';
}

export interface UgTab {
  title: string;
  artist: string;
  key: string;
  capo: number;
  content: string;
}

/** Nettoie le contenu UG en texte importable. */
export function ugContentToText(content: string): string {
  return decodeHtmlEntities(content)
    .replace(/\r\n?/g, '\n')
    .replace(/\[\/?tab\]/g, '')
    .replace(/\[\/?ch\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Assemble un texte complet (avec en-têtes) prêt pour importText. */
export function ugTabToImportText(tab: UgTab): string {
  const headers: string[] = [];
  if (tab.title) headers.push(`Title: ${tab.title}`);
  if (tab.artist) headers.push(`Artist: ${tab.artist}`);
  if (tab.key) headers.push(`Key: ${tab.key}`);
  if (tab.capo > 0) headers.push(`Capo: ${tab.capo}`);
  const head = headers.length > 0 ? headers.join('\n') + '\n\n' : '';
  return head + ugContentToText(tab.content);
}

export interface UgSearchResult {
  title: string;
  artist: string;
  /** Chords, Tabs, Bass Tabs, Ukulele Chords… */
  type: string;
  version: number;
  rating: number;
  votes: number;
  url: string;
}

const OFFLINE_MSG =
  "Cette fonction nécessite la version en ligne de l'application " +
  '(déployée sur Vercel).';

async function readJson(res: Response): Promise<any> {
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    throw new Error(OFFLINE_MSG);
  }
  return res.json();
}

/** Recherche sur Ultimate Guitar (via la fonction serveur). */
export async function searchUgTabs(query: string): Promise<UgSearchResult[]> {
  let res: Response;
  try {
    res = await fetch(`/api/tabs?fn=search&q=${encodeURIComponent(query)}`);
  } catch {
    throw new Error(OFFLINE_MSG);
  }
  const body = await readJson(res);
  if (!res.ok || body.error) throw new Error(body.error ?? `Erreur ${res.status}`);
  const rows = Array.isArray(body.results) ? body.results : [];
  return rows.map((r: UgSearchResult) => ({
    ...r,
    title: cleanMeta(r.title),
    artist: cleanMeta(r.artist),
  }));
}

/** Nettoyage de partition par IA (si configurée côté serveur).
 *  `hint` : indice titre/artiste (utile pour décoder les PDF brouillés). */
export async function aiCleanText(text: string, hint?: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/ai?fn=clean', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(hint ? { text, hint } : { text }),
    });
  } catch {
    throw new Error(OFFLINE_MSG);
  }
  const body = await readJson(res);
  if (!res.ok || body.error) throw new Error(body.error ?? `Erreur ${res.status}`);
  if (typeof body.text !== 'string' || body.text.trim() === '') {
    throw new Error("L'IA n'a rien renvoyé");
  }
  return body.text;
}

/**
 * Cherche la tonalité (et le capo) d'un morceau sur le web via Ultimate
 * Guitar : la version « accords » la mieux notée fait foi. Best-effort —
 * renvoie null si rien de fiable n'est trouvé.
 */
export async function findSongKey(
  title: string,
  artist: string,
): Promise<{ key: string; capo: number } | null> {
  const q = `${title} ${artist}`.trim();
  if (q === '') return null;
  const results = await searchUgTabs(q);
  const ranked = [...results].sort((a, b) => b.votes - a.votes);
  const top = ranked.find((r) => /chord/i.test(r.type)) ?? ranked[0];
  if (!top) return null;
  const tab = await fetchUgTab(top.url);
  if (tab.key.trim() === '') return null;
  return { key: tab.key, capo: tab.capo };
}

/** Appelle la fonction serveur /api/fetch-tab. */
export async function fetchUgTab(url: string): Promise<UgTab> {
  let res: Response;
  try {
    res = await fetch(`/api/tabs?fn=fetch&url=${encodeURIComponent(url)}`);
  } catch {
    throw new Error(
      "Impossible de joindre le serveur d'import. Cette fonction nécessite " +
        "la version en ligne de l'application (déployée sur Vercel).",
    );
  }
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    throw new Error(
      "L'import par lien nécessite la version en ligne de l'application " +
        '(déployée sur Vercel) — en local, colle plutôt le texte de la partition.',
    );
  }
  const body = (await res.json()) as Partial<UgTab> & { error?: string };
  if (!res.ok || body.error) {
    throw new Error(body.error ?? `Erreur ${res.status}`);
  }
  return {
    title: cleanMeta(body.title),
    artist: cleanMeta(body.artist),
    key: body.key ?? '',
    capo: body.capo ?? 0,
    content: body.content ?? '',
  };
}
