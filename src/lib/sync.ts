/**
 * Fusion bibliothèque locale ↔ sauvegarde cloud (étape 1 des comptes).
 * Règle : par élément (id), la version la plus récemment modifiée gagne
 * (updatedAt) ; sans horodatage, la version locale gagne. Les éléments
 * présents d'un seul côté sont conservés — rien n'est perdu.
 */
import {
  ArtistProfile,
  Band,
  BandRemoval,
  Concert,
  Prefs,
  Setlist,
  Song,
  Tombstone,
} from '../types';

export interface SyncState {
  songs: Song[];
  setlists: Setlist[];
  concerts: Concert[];
  bands: Band[];
  artist: ArtistProfile;
  prefs: Prefs;
  /** Suppressions à propager (pierres tombales) */
  deleted?: Tombstone[];
  /** Retraits de morceaux des répertoires de groupes (propagés) */
  bandRemovals?: BandRemoval[];
  /**
   * Point zéro d'une réinitialisation, par catégorie (b137). Les pierres
   * tombales sont plafonnées à 500 : après un reset d'une GROSSE
   * bibliothèque, les plus anciennes disparaissaient et le cloud
   * ressuscitait les morceaux effacés (bug signalé par Marco). Cet
   * horodatage, lui, ne dépend pas du volume : tout élément du cloud
   * absent en local et plus vieux que la date du reset est ignoré.
   */
  resetAt?: ResetMarks;
}

/** Date de réinitialisation par catégorie (ISO). */
export interface ResetMarks {
  songs?: string;
  setlists?: string;
  concerts?: string;
  bands?: string;
}

interface WithId {
  id: string;
  updatedAt?: string;
}

/** Fusionne deux collections par id ; le plus récent (updatedAt) gagne. */
export function mergeById<T extends WithId>(local: T[], cloud: T[]): T[] {
  const result = new Map<string, T>();
  for (const item of cloud) result.set(item.id, item);
  for (const item of local) {
    const other = result.get(item.id);
    if (!other) {
      result.set(item.id, item);
      continue;
    }
    const a = item.updatedAt ?? '';
    const b = other.updatedAt ?? '';
    // Égalité ou absence d'horodatage : la version locale gagne.
    result.set(item.id, b > a ? other : item);
  }
  return [...result.values()];
}

function pick(local: string, cloud: string | undefined): string {
  return local !== '' ? local : (cloud ?? '');
}

/**
 * Fusion des groupes par id. Les groupes n'ont pas d'horodatage : la fusion
 * générique « le local gagne à égalité » pouvait effacer une photo (ou une
 * bio, un nom…) si un appareil détenait une copie plus ancienne du groupe.
 * Ici on UNIT les champs : une valeur déjà saisie d'un côté n'est jamais
 * écrasée par une valeur vide de l'autre. Le local reste la base (membres
 * réconciliés, cloudId), mais photo/nom/bio/liens sont rescapés du cloud.
 */
function mergeBandsById(local: Band[], cloud: Band[]): Band[] {
  const result = new Map<string, Band>();
  for (const b of cloud) result.set(b.id, b);
  for (const b of local) {
    const other = result.get(b.id);
    if (!other) {
      result.set(b.id, b);
      continue;
    }
    result.set(b.id, {
      ...b,
      name: b.name || other.name,
      photo: b.photo || other.photo,
      bio: b.bio || other.bio,
      tipUrl: b.tipUrl || other.tipUrl,
      links: b.links.length > 0 ? b.links : (other.links ?? []),
      cloudId: b.cloudId || other.cloudId,
    });
  }
  return [...result.values()];
}

export function mergeStates(
  local: SyncState,
  cloud: Partial<SyncState> | null,
): SyncState {
  if (!cloud) return local;
  // Profil artiste : le plus récemment modifié gagne (updatedAt). Pour les
  // données existantes sans horodatage, on UNIT les champs (le non-vide
  // gagne) afin que photo/liens/bio ajoutés sur un appareil se propagent —
  // l'ancien « tout-ou-rien selon le nom » perdait ces ajouts.
  const artist: ArtistProfile = (() => {
    const la = local.artist;
    const ca = cloud.artist;
    if (!ca) return la;
    const lu = la.updatedAt ?? '';
    const cu = ca.updatedAt ?? '';
    if (lu !== '' || cu !== '') return cu > lu ? ca : la;
    return {
      ...ca,
      ...la,
      name: la.name || ca.name,
      bio: la.bio || ca.bio,
      photo: la.photo || ca.photo,
      tipUrl: la.tipUrl || ca.tipUrl,
      links: la.links.length > 0 ? la.links : (ca.links ?? []),
      gear: la.gear && la.gear.length > 0 ? la.gear : ca.gear,
      publicScreen: la.publicScreen ?? ca.publicScreen,
    };
  })();
  const prefs: Prefs = {
    defaultView: local.prefs.defaultView,
    userName: pick(local.prefs.userName, cloud.prefs?.userName),
    liveKey: pick(local.prefs.liveKey, cloud.prefs?.liveKey),
  };
  // Pierres tombales : une suppression sur UN appareil vaut partout.
  // (la clé — titre normalisé — est CONSERVÉE : anti-résurrection groupe)
  const tombs = new Map<string, Tombstone>();
  for (const t of [...(local.deleted ?? []), ...(cloud.deleted ?? [])]) {
    const cur = tombs.get(t.id);
    if (!cur || t.at > cur.at) {
      tombs.set(t.id, cur?.key && !t.key ? { ...t, key: cur.key } : t);
    }
  }
  // Retraits de répertoires de groupes : union, le plus récent gagne.
  const removals = new Map<string, BandRemoval>();
  for (const r of [...(local.bandRemovals ?? []), ...(cloud.bandRemovals ?? [])]) {
    const k = `${r.bandId}|${r.key}`;
    const cur = removals.get(k);
    if (!cur || r.at > cur.at) removals.set(k, r);
  }
  const alive = <T extends { id: string }>(items: T[]): T[] =>
    items.filter((x) => !tombs.has(x.id));
  // Points zéro : le plus récent des deux côtés gagne (un reset fait sur un
  // appareil vaut pour tous).
  const resetAt: ResetMarks = {};
  for (const k of ['songs', 'setlists', 'concerts', 'bands'] as const) {
    const l = local.resetAt?.[k] ?? '';
    const c = cloud.resetAt?.[k] ?? '';
    const best = l > c ? l : c;
    if (best !== '') resetAt[k] = best;
  }
  /**
   * Ne laisse pas le cloud ressusciter ce qu'une réinitialisation a effacé :
   * un élément ABSENT en local et plus vieux que le point zéro est écarté.
   * Un élément modifié APRÈS le reset (autre appareil, geste volontaire)
   * revient normalement.
   */
  const afterReset = <T extends { id: string; updatedAt?: string }>(
    items: T[],
    localItems: T[],
    mark?: string,
  ): T[] => {
    if (!mark) return items;
    const mine = new Set(localItems.map((x) => x.id));
    return items.filter((x) => mine.has(x.id) || (x.updatedAt ?? '') > mark);
  };
  return {
    songs: afterReset(
      alive(mergeById(local.songs, cloud.songs ?? [])),
      local.songs,
      resetAt.songs,
    ),
    setlists: afterReset(
      alive(mergeById(local.setlists, cloud.setlists ?? [])),
      local.setlists,
      resetAt.setlists,
    ),
    concerts: afterReset(
      alive(mergeById(local.concerts, cloud.concerts ?? [])),
      local.concerts,
      resetAt.concerts,
    ),
    bands: afterReset(
      alive(mergeBandsById(local.bands, cloud.bands ?? [])),
      local.bands,
      resetAt.bands,
    ),
    resetAt,
    artist,
    prefs,
    deleted: [...tombs.values()]
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(-500),
    bandRemovals: [...removals.values()]
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(-500),
  };
}
