/**
 * Contenu témoin (lot E) : injecté à la première ouverture pour que le
 * nouvel utilisateur voie SA musique tout de suite.
 *
 * On PRIVILÉGIE les COMPOSITIONS (b391, demande de Vincent : « il n'y
 * aura pas de problème de droits d'auteur ») : « À l'autre bout du
 * monde » est une composition de Vincent Tessier, reprise à l'identique
 * de l'export PDF de sa bibliothèque (paroles, accords, tonalité, capo).
 * Le second exemple reste du domaine public (Jean-Baptiste Clément
 * † 1903 / Antoine Renard † 1872) — c'est aussi le morceau montré par la
 * landing. Marqueur : tag « Exemple ».
 */
import { migrateSong } from './lib/model';
import { normalizeTitle } from './lib/normalizeTitle';
import { emptySetlist, makeId, Setlist, Song, Tombstone } from './types';

export const EXAMPLE_TAG = 'Exemple';
/** Version du seed (le drapeau localStorage la mémorise). */
export const SEED_KEY = 'sing2me/examplesSeeded';
export const SEED_VERSION = '1';

export function exampleSongs(): Song[] {
  const now = new Date().toISOString();
  const base: unknown[] = [
    {
      id: makeId(),
      title: "À l'autre bout du monde",
      artist: 'Vincent Tessier',
      key: 'Am',
      tempo: 0,
      capo: 2,
      durationSec: 0,
      tags: [EXAMPLE_TAG],
      structure: [],
      structureNotes:
        'Composition originale — cet exemple est à toi : transpose-le, ' +
        'joue-le en mode scène, supprime-le quand tu veux.',
      lyrics:
        'Couplet 1 :\n' +
        "[Am]Viens avec moi je t'invite au [Em]voyage\n" +
        "[Am]Une autre vie sur d'autres [Em]rivages\n" +
        '[C]Les cieux sanglants rempliraient tes [Em]yeux\n' +
        "[C]C'est le pays des gens [Em]heureux\n" +
        '\n' +
        'Couplet 2 :\n' +
        '[Am]Là-bas le soir les soleils [Em]couchants\n' +
        "[Am]Revêtent d'or les villes et les [Em]champs\n" +
        "[C]Baudelaire l'a dit je te prie de le [Em]croire\n" +
        '[C]La mer azurée serait notre [Em]miroir\n' +
        '\n' +
        'Refrain :\n' +
        "[C]Crois-moi comme on serait bien [Am]si l'on était [Em]loin\n" +
        "[C]En suivant sur d'autres chemins [Am]un nouveau des[Em]tin\n" +
        "À l'autre bout du [Am]monde\n" +
        '\n' +
        'Couplet 3 :\n' +
        '[Am]Laisse derrière toi tes peines fragiles\n' +
        '[Em]Chasse les larmes accrochées à tes cils\n' +
        '[C]Viens avec moi contemple le naufrage\n' +
        "[Em]D'une vie passée à gaspiller nos âges\n" +
        '\n' +
        'Couplet 4 :\n' +
        "[Am]À nous la vie et l'amour fa[Em]ciles\n" +
        '[Am]Rendre nos cœurs et nos mots do[Em]ciles\n' +
        "[C]Une vie pour 2 c'est toujours un peu [Em]court\n" +
        '[C]Là-bas nous ne compterions plus les [Em]jours\n' +
        '\n' +
        'Refrain :\n' +
        "[C]Crois-moi comme on serait bien [Am]si l'on était [Em]loin\n" +
        "[C]En suivant sur d'autres chemins [Am]un nouveau des[Em]tin\n" +
        "À l'autre bout du [C]monde",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      title: 'Le Temps des cerises',
      artist: 'J.-B. Clément / A. Renard',
      key: 'C',
      tempo: 100,
      capo: 0,
      durationSec: 0,
      tags: [EXAMPLE_TAG],
      structure: [],
      structureNotes:
        'Valse à 3 temps. Essaie le défilement automatique en mode scène — ' +
        'bouton ▲ en bas.',
      lyrics:
        '[C]Quand nous chante[Am]rons le [Dm]temps des ce[G]rises\n' +
        'Et [C]gai rossi[Am]gnol et [Dm]merle mo[G]queur\n' +
        'Se[C]ront tous en [E7]fê[Am]te\n' +
        'Les [Dm]belles auront la [G]folie en [C]tête\n' +
        'Et les [Dm]amoureux du so[G]leil au [C]cœur\n' +
        '[C]Quand nous chante[Am]rons le [Dm]temps des ce[G]rises\n' +
        'Sif[C]flera bien [E7]mieux le [Am]merle mo[G]queur\n' +
        '\n' +
        '[C]Mais il est bien [Am]court le [Dm]temps des ce[G]rises\n' +
        'Où l’on [C]s’en va [Am]deux cueil[Dm]lir en rê[G]vant\n' +
        'Des [C]pendants d’o[E7]reil[Am]les\n' +
        'Ce[Dm]rises d’amour aux [G]robes pa[C]reilles\n' +
        'Tom[Dm]bant sous la [G]feuille en [C]gouttes de sang\n' +
        '[C]Mais il est bien [Am]court le [Dm]temps des ce[G]rises\n' +
        'Pen[C]dants de co[E7]rail qu’on [Am]cueille en rê[G]vant',
      createdAt: now,
      updatedAt: now,
    },
  ];
  return base.map(migrateSong);
}

export function exampleSetlist(songIds: string[]): Setlist {
  return {
    ...emptySetlist(),
    name: 'Ma première setlist (exemple)',
    items: songIds.map((id) => ({
      id: makeId(),
      songId: id,
      note: '',
      keyOverride: '',
      versionId: '',
    })),
  };
}

/** Une setlist d'exemple se reconnaît à son nom (voir `exampleSetlist`). */
export function estSetlistExemple(sl: { name: string }): boolean {
  return /\(exemple\)/i.test(sl.name);
}

/** Un morceau d'exemple porte le tag `Exemple`. */
export function estMorceauExemple(s: { tags?: string[] }): boolean {
  return (s.tags ?? []).includes(EXAMPLE_TAG);
}

/**
 * EFFONDRE LES DOUBLONS DE CONTENU D'EXEMPLE (b286, signalé par Vincent :
 * « j'ai plein de "Ma première setlist" »).
 *
 * Une ancienne course de synchro pouvait ré-injecter les exemples à
 * identifiants NEUFS ; la fusion par id les empilait au lieu de les
 * reconnaître. On garde AU PLUS une setlist d'exemple et un morceau d'exemple
 * PAR TITRE ; les surplus sont ENTERRÉS (tombstone par id), sans quoi la
 * fusion d'un autre appareil les ferait revenir.
 *
 * Trois garde-fous :
 *  · on ne touche JAMAIS au contenu non-exemple (tag / nom obligatoires) ;
 *  · on ne RECRÉE jamais rien — zéro exemple reste zéro (une suppression
 *    volontaire est définitive) ;
 *  · IDEMPOTENT : sans doublon, l'objet est renvoyé tel quel (aucun tombstone
 *    ajouté), donc rejouable à chaque chargement et à chaque fusion sans
 *    gonfler la liste des suppressions.
 */
export function dedupeExamples<
  S extends {
    songs: Song[];
    setlists: Setlist[];
    deleted?: Tombstone[];
  },
>(state: S): S {
  // Setlists d'exemple : garder la première, enterrer les autres.
  const setlistsExemple = state.setlists.filter(estSetlistExemple);
  const setlistsMortes = setlistsExemple.slice(1).map((sl) => sl.id);

  // Morceaux d'exemple : garder un par titre, enterrer les autres.
  const gardeParTitre = new Map<string, string>();
  const chansonsMortes: string[] = [];
  for (const s of state.songs) {
    if (!estMorceauExemple(s)) continue;
    const t = normalizeTitle(s.title);
    if (gardeParTitre.has(t)) chansonsMortes.push(s.id);
    else gardeParTitre.set(t, s.id);
  }

  if (setlistsMortes.length === 0 && chansonsMortes.length === 0) return state;

  const morts = new Set([...setlistsMortes, ...chansonsMortes]);
  // Un item qui pointait un morceau d'exemple enterré est redirigé vers celui
  // gardé pour le même titre — sinon la setlist gardée perdrait ses morceaux.
  const remap = new Map<string, string>();
  for (const s of state.songs) {
    if (morts.has(s.id) && estMorceauExemple(s)) {
      const garde = gardeParTitre.get(normalizeTitle(s.title));
      if (garde) remap.set(s.id, garde);
    }
  }

  const now = new Date().toISOString();
  return {
    ...state,
    songs: state.songs.filter((s) => !morts.has(s.id)),
    setlists: state.setlists
      .filter((sl) => !morts.has(sl.id))
      .map((sl) => ({
        ...sl,
        items: sl.items.map((it) =>
          remap.has(it.songId)
            ? { ...it, songId: remap.get(it.songId) as string }
            : it,
        ),
      })),
    deleted: [
      ...(state.deleted ?? []),
      ...[...morts].map((id) => ({ id, at: now })),
    ],
  } as S;
}
