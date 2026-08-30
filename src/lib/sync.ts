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
  defaultPrefs,
  emptyArtist,
  Prefs,
  Setlist,
  Song,
  Tombstone,
} from '../types';
import { songKey } from './normalizeTitle';

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
  /**
   * Réinitialisation des LIVES (b200). Ils vivent côté serveur et
   * appartiennent parfois à tout un groupe : on ne les efface donc pas, on
   * cesse d'afficher ceux qui ont commencé avant cette date. Même principe
   * que la suppression d'un live, qui est déjà locale (b183).
   */
  lives?: string;
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
    /**
     * LE PLUS RÉCENT DEVIENT LA BASE (b373, constat de Marco : renommer un
     * groupe, changer sa photo ou ajouter un musicien à la main ne se
     * propageait JAMAIS — le local restait toujours la base, et l'union ne
     * remplit que les champs vides). `updatedAt` n'est posé que par les
     * GESTES de l'utilisateur (`tamponneBand`) : une réparation automatique
     * garde l'horodatage existant et ne gagne donc jamais la fusion.
     * Sans horodatage des deux côtés (données d'avant b373), on retombe
     * exactement sur l'ancien comportement : base locale + union.
     */
    const a = b.updatedAt ?? '';
    const c = other.updatedAt ?? '';
    const [recent, ancien] = c > a ? [other, b] : [b, other];
    result.set(b.id, {
      ...recent,
      name: recent.name || ancien.name,
      photo: recent.photo || ancien.photo,
      bio: recent.bio || ancien.bio,
      tipUrl: recent.tipUrl || ancien.tipUrl,
      links:
        (recent.links?.length ?? 0) > 0 ? recent.links : (ancien.links ?? []),
      cloudId: recent.cloudId || ancien.cloudId,
    });
  }
  return [...result.values()];
}

/**
 * L'état d'un compte qui n'a encore rien (b259). Sert de point de départ
 * quand on change de compte : la bibliothèque du compte précédent ne doit
 * pas servir de base à celle qui arrive.
 */
export function etatVide(): SyncState {
  return {
    songs: [],
    setlists: [],
    concerts: [],
    bands: [],
    artist: emptyArtist(),
    prefs: defaultPrefs(),
    deleted: [],
    bandRemovals: [],
    resetAt: {},
  };
}

/**
 * EFFONDRE LES DOUBLONS DE MORCEAUX PAR CONTENU (b316).
 *
 * Bug signalé par Vincent : des morceaux ENTIERS dupliqués (avec toutes leurs
 * versions), jamais reconnus comme doublons. Cause : une double connexion /
 * course de synchro recrée la bibliothèque avec des identifiants NEUFS
 * (l'import ne consulte que le local, jamais le cloud), et la fusion
 * (`mergeById`) ne compare QUE les `id` — deux copies au même titre + artiste
 * mais à id différents survivent côte à côte pour toujours. Aucun
 * dédoublonnage par CONTENU n'existait pour les vrais morceaux (seuls les
 * exemples en avaient un, `dedupeExamples`) : c'était le trou.
 *
 * On garde AU PLUS un morceau par clé de contenu (titre + artiste normalisés,
 * `songKey`) et on enterre les surplus (tombstone par id), en redirigeant les
 * items de setlist du perdant vers le gardé.
 *
 * GARDE-FOUS (hérités des cicatrices b247/b248/b286/b290) :
 *  · CLÉ EXACTE, jamais par sous-chaîne — « Marc » ≠ « Marco ». Un morceau
 *    sans titre (clé vide) n'est jamais regroupé.
 *  · SURVIVANT DÉTERMINISTE sur des champs IMMUABLES (createdAt le plus
 *    ancien, départagé par le plus petit id) : deux appareils choisissent
 *    TOUJOURS le même survivant, même en pleine synchro. Trancher sur
 *    `updatedAt` (qui change à chaque édition) ferait qu'un appareil enterre
 *    A et l'autre B → les deux tombstones s'unissent → le morceau
 *    DISPARAÎTRAIT des deux côtés. Interdit.
 *  · JAMAIS DE PERTE DE VERSION (leçon b290) : on n'enterre un perdant que si
 *    TOUTES ses versions (par `bandId`) sont déjà représentées dans le
 *    survivant. Un perdant qui porte une version de groupe absente du
 *    survivant n'est PAS effondré — mieux vaut un doublon visible qu'une
 *    version perdue. On ne devine jamais « la vérité » entre deux contenus :
 *    le survivant garde le sien, on n'écrase rien.
 *  · IDEMPOTENT : sans doublon effondrable, l'objet est renvoyé TEL QUEL
 *    (aucun tombstone ajouté) — rejouable à chaque chargement et fusion.
 */
export function dedupeSongsByContent<
  S extends { songs: Song[]; setlists: Setlist[]; deleted?: Tombstone[] },
>(state: S): S {
  // Regrouper par clé de contenu (titre + artiste). Clé vide → jamais groupé.
  // Les BROUILLONS de création (b319) ne participent JAMAIS : leur doublon
  // éventuel avec un morceau validé s'arbitre À LA VALIDATION, par
  // l'utilisateur (ouvrir l'existant / remplacer / garder les deux) — jamais
  // par une fusion silencieuse qui enterrerait son travail en cours.
  const groups = new Map<string, Song[]>();
  for (const s of state.songs) {
    if (s.status === 'draft' || s.status === 'formatting') continue;
    const k = songKey(s.title, s.artist);
    if (k === '') continue;
    const g = groups.get(k);
    if (g) g.push(s);
    else groups.set(k, [s]);
  }

  const morts: string[] = []; // ids enterrés (perdants absorbables)
  const remap = new Map<string, string>(); // item de setlist : perdant → gardé
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    // Survivant : createdAt le plus ancien, départagé par le plus petit id.
    // Champs IMMUABLES → choix identique sur TOUS les appareils, même
    // pendant une synchro (sinon enterrement mutuel = morceau perdu).
    const survivant = [...g].sort((a, b) => {
      const ca = a.createdAt ?? '';
      const cb = b.createdAt ?? '';
      if (ca !== cb) return ca < cb ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    })[0];
    const ctxSurvivant = new Set(survivant.versions.map((v) => v.bandId ?? ''));
    for (const s of g) {
      if (s.id === survivant.id) continue;
      // On n'enterre que si le perdant n'apporte AUCUNE version que le
      // survivant n'a pas (aucun bandId inédit) — sinon on perdrait une
      // version de groupe. On laisse alors le doublon plutôt que de détruire.
      const absorbable = s.versions.every((v) =>
        ctxSurvivant.has(v.bandId ?? ''),
      );
      if (!absorbable) continue;
      morts.push(s.id);
      remap.set(s.id, survivant.id);
    }
  }

  if (morts.length === 0) return state;

  const mortsSet = new Set(morts);
  const now = new Date().toISOString();
  return {
    ...state,
    songs: state.songs.filter((s) => !mortsSet.has(s.id)),
    setlists: state.setlists.map((sl) => ({
      ...sl,
      items: sl.items.map((it) =>
        remap.has(it.songId)
          ? { ...it, songId: remap.get(it.songId) as string }
          : it,
      ),
    })),
    deleted: [
      ...(state.deleted ?? []),
      // La tombe d'un dédoublonnage porte la REDIRECTION vers le survivant
      // (b473) : une setlist restée en retard sur un autre appareil peut
      // revenir par la fusion APRÈS cet enterrement — sans trace, ses items
      // afficheraient « (morceau supprimé) » pour toujours (bug de Marco).
      // Pas de `key` ici : le jumeau survivant est vivant, une clé de titre
      // bloquerait sa circulation par le répertoire de groupe.
      ...morts.map((id) => ({ id, at: now, vers: remap.get(id) as string })),
    ],
  } as S;
}

/**
 * RÉPARATION DES ITEMS DE SETLIST ORPHELINS (b473, bug signalé par Marco :
 * une setlist entière en « (morceau supprimé) » alors que les morceaux sont
 * toujours dans sa bibliothèque).
 *
 * Cause : le dédoublonnage par contenu redirige les setlists présentes DANS
 * LA MÊME PASSE — mais une setlist modifiée sur un appareil resté en retard
 * revient par la fusion APRÈS l'enterrement des doublons (son objet, plus
 * récent, gagne la fusion par id). Ses items pointent alors des ids déjà
 * tombstonés : le « problème de séquencement » exactement.
 *
 * Deux filets, dans cet ordre :
 *  1. la REDIRECTION portée par la tombe (`Tombstone.vers`, suivie en
 *     chaîne — un survivant peut lui-même avoir été dédoublonné plus tard) ;
 *  2. la CLÉ DE CONTENU tamponnée sur l'item (`SetlistItem.cle`), cherchée
 *     dans la bibliothèque.
 * Un item qui ne se résout par aucun des deux reste TEL QUEL : l'écran dit
 * « (morceau supprimé) », ce qui est alors la vérité. On ne devine jamais
 * (règle b290) et on ne supprime rien.
 *
 * Silencieuse : `updatedAt` des setlists n'est PAS retouché (une réparation
 * n'a pas à gagner la fusion suivante — cicatrice b248). Idempotente : sans
 * orphelin résoluble, l'objet est renvoyé tel quel.
 */
export function reparerSetlists<
  S extends { songs: Song[]; setlists: Setlist[]; deleted?: Tombstone[] },
>(state: S): S {
  const vivants = new Map(state.songs.map((s) => [s.id, s]));
  if (state.setlists.length === 0) return state;
  const redirige = new Map<string, string>();
  for (const t of state.deleted ?? []) {
    if (t.vers) redirige.set(t.id, t.vers);
  }
  const parCle = new Map<string, Song>();
  for (const s of state.songs) {
    if (s.status === 'draft' || s.status === 'formatting') continue;
    const k = songKey(s.title, s.artist);
    if (k !== '' && !parCle.has(k)) parCle.set(k, s);
  }
  /** Suit la chaîne de redirections jusqu'à un morceau vivant (garde-fou
   *  anti-cycle : 10 sauts max). */
  const suivre = (id: string): Song | undefined => {
    let cur = id;
    for (let i = 0; i < 10; i++) {
      const s = vivants.get(cur);
      if (s) return s;
      const next = redirige.get(cur);
      if (!next || next === cur) return undefined;
      cur = next;
    }
    return undefined;
  };
  let repare = false;
  const setlists = state.setlists.map((sl) => {
    let touche = false;
    const items = sl.items.map((it) => {
      if (vivants.has(it.songId)) return it;
      const cible =
        suivre(it.songId) ??
        (it.cle ? parCle.get(it.cle) : undefined);
      if (!cible) return it;
      touche = true;
      return {
        ...it,
        songId: cible.id,
        // L'ancienne version est morte avec l'ancien id : version de
        // contexte du groupe de la setlist si elle existe, sinon la
        // version active ('').
        versionId: versionForBandLocal(cible, sl.bandId ?? '')?.id ?? '',
      };
    });
    if (!touche) return sl;
    repare = true;
    return { ...sl, items };
  });
  return repare ? { ...state, setlists } : state;
}

/** Version de CONTEXTE de groupe — volontairement différente de
 *  `model.versionForBand` : pour une setlist SOLO (bandId ''), on rend
 *  undefined afin que l'item retombe sur '' = « version active », jamais
 *  épinglé sur l'originale. */
function versionForBandLocal(
  song: Song,
  bandId: string,
): { id: string } | undefined {
  if (bandId === '') return undefined;
  return song.versions.find((v) => (v.bandId ?? '') === bandId);
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
  /*
   * PRÉFÉRENCES — on PART des deux objets, on ne les RECONSTRUIT pas (b202).
   *
   * Cette fusion listait ses champs un par un. Tout réglage ajouté depuis
   * était donc silencieusement jeté à la première synchro : Vincent a
   * renommé un live, le nom a disparu (`liveNames`) ; les lives retirés de
   * l'historique revenaient (`hiddenLives`) ; la réinitialisation des
   * concerts cessait de masquer les anciens directs (`resetAt.lives`).
   *
   * Rien de tout cela n'était visible à l'écriture : le réglage s'enregistre
   * bien, il est effacé plus tard, ailleurs. C'est la même faute que le
   * livre d'or (b197) — filtrer une donnée sur une liste de champs connus
   * d'avance. On étale donc les deux objets ; les règles ci-dessous ne
   * traitent que ce qui demande VRAIMENT un arbitrage.
   */
  const prefs: Prefs = {
    ...(cloud.prefs ?? {}),
    ...local.prefs,
    defaultView: local.prefs.defaultView,
    userName: pick(local.prefs.userName, cloud.prefs?.userName),
    liveKey: pick(local.prefs.liveKey, cloud.prefs?.liveKey),
    // Langue choisie à la main (b158) : elle DOIT survivre à la synchro.
    // Sans cette ligne, le champ disparaissait à la fusion et l'app
    // retombait en « automatique » quelques secondes après le choix.
    // Le local prime ; le cloud ne sert qu'à un appareil qui n'a pas
    // encore de choix (nouveau téléphone).
    lang: (local.prefs.lang ?? '') !== '' ? local.prefs.lang : cloud.prefs?.lang,
    // Noms donnés aux lives : les deux appareils peuvent en avoir baptisé
    // des différents. On UNIT ; en cas de conflit sur le même live, celui
    // qu'on vient de taper ici gagne.
    liveNames: { ...(cloud.prefs?.liveNames ?? {}), ...(local.prefs.liveNames ?? {}) },
    // Lives retirés de l'historique : union, comme les pierres tombales —
    // un retrait fait sur un appareil vaut sur tous les miens.
    hiddenLives: [
      ...new Set([
        ...(cloud.prefs?.hiddenLives ?? []),
        ...(local.prefs.hiddenLives ?? []),
      ]),
    ].slice(-500),
    // Départs écartés (b212) : même raison — écarter sur un appareil vaut
    // sur tous les miens, sinon la bannière revient au premier échange.
    hiddenDepartures: [
      ...new Set([
        ...(cloud.prefs?.hiddenDepartures ?? []),
        ...(local.prefs.hiddenDepartures ?? []),
      ]),
    ].slice(-500),
  };
  // Pierres tombales : une suppression sur UN appareil vaut partout.
  // (la clé — titre normalisé — est CONSERVÉE : anti-résurrection groupe)
  const tombs = new Map<string, Tombstone>();
  for (const t of [...(local.deleted ?? []), ...(cloud.deleted ?? [])]) {
    const cur = tombs.get(t.id);
    if (!cur || t.at > cur.at) {
      // La plus récente gagne, mais une info portée par l'autre (clé de
      // titre, redirection de dédoublonnage b473) n'est jamais perdue.
      tombs.set(
        t.id,
        cur
          ? {
              ...t,
              ...(cur.key && !t.key ? { key: cur.key } : {}),
              ...(cur.vers && !t.vers ? { vers: cur.vers } : {}),
            }
          : t,
      );
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
  // Même leçon qu'au-dessus : on parcourt les clés RÉELLEMENT présentes des
  // deux côtés, jamais une liste écrite à la main. `lives` (b200) manquait à
  // cette liste — réinitialiser les concerts cessait donc de masquer les
  // anciens directs dès la synchro suivante.
  const resetAt: ResetMarks = {};
  const clesReset = new Set<keyof ResetMarks>([
    ...(Object.keys(local.resetAt ?? {}) as (keyof ResetMarks)[]),
    ...(Object.keys(cloud.resetAt ?? {}) as (keyof ResetMarks)[]),
  ]);
  for (const k of clesReset) {
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
    /**
     * UN ÉLÉMENT SANS DATE SURVIT AU FILTRE (b374, constat de Marco : ses
     * groupes créés sur Chrome n'arrivaient JAMAIS sur ses autres
     * appareils). Les groupes n'ont pas eu d'`updatedAt` avant b373 : dès
     * qu'un point zéro de réinitialisation existait — et il se PROPAGE à
     * tous les appareils —, `'' > mark` écartait ici tout groupe venu du
     * cloud, indéfiniment, sur tout appareil qui ne l'avait pas en local.
     * Le doute profite au contenu (règle b137) : ressusciter un vieil
     * élément après une réinitialisation se répare d'un geste ; un élément
     * qui ne se synchronise jamais est une perte silencieuse permanente.
     */
    return items.filter(
      (x) => mine.has(x.id) || !x.updatedAt || x.updatedAt > mark,
    );
  };
  // Fusion par id d'abord (union local+cloud), PUIS dédoublonnage par contenu
  // sur cette union : c'est le seul endroit où l'on voit les deux copies d'un
  // même morceau créées séparément (double connexion / course de synchro).
  // La redirection des items de setlist et les tombstones du perdant sont
  // portés par `deduped` ci-dessous.
  // …puis RÉPARATION des items orphelins (b473) : une setlist plus récente
  // venue d'un appareil en retard peut pointer des ids enterrés AVANT cette
  // fusion — les tombes portent la redirection, les items la clé de contenu.
  const deduped = reparerSetlists(
    dedupeSongsByContent({
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
      deleted: [...tombs.values()],
    }),
  );
  return {
    songs: deduped.songs,
    setlists: deduped.setlists,
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
    deleted: (deduped.deleted ?? [])
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(-500),
    bandRemovals: [...removals.values()]
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(-500),
  };
}

/**
 * COMBIEN DE MODIFICATIONS ATTENDENT D'ÊTRE ENVOYÉES (b222).
 *
 * Le hors-ligne de b221 a rendu le travail sans réseau normal : on corrige
 * trois morceaux dans l'avion, et rien ne part avant l'atterrissage. Sans
 * repère, on ne sait pas si c'est parti — et l'inquiétude porte sur ce qu'on
 * a de plus précieux, son répertoire.
 *
 * On compte ce qui a bougé DEPUIS le dernier envoi réussi, objet par objet,
 * sur le même `updatedAt` qui sert déjà à la fusion. Pas de file d'attente à
 * tenir, pas de nouvel état à synchroniser : le chiffre se recalcule au
 * rendu, donc il ne peut pas mentir (règle 11 — une pastille compte
 * exactement ce que l'écran montrera).
 *
 * `depuis` vaut null quand aucun envoi n'a encore réussi sur cet appareil :
 * on ne prétend alors rien compter, ce serait annoncer toute la bibliothèque.
 */
export function compterEnAttente(
  state: Pick<SyncState, 'songs' | 'setlists' | 'concerts' | 'artist'>,
  depuis: string | null,
): number {
  if (depuis === null || depuis === '') return 0;
  const apres = (x: { updatedAt?: string }) =>
    typeof x.updatedAt === 'string' && x.updatedAt > depuis;
  let n = 0;
  for (const s of state.songs ?? []) if (apres(s)) n++;
  for (const s of state.setlists ?? []) if (apres(s)) n++;
  for (const c of state.concerts ?? []) if (apres(c)) n++;
  if (state.artist && apres(state.artist)) n++;
  return n;
}
