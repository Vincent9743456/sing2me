/**
 * Contenu témoin (lot E) : injecté à la première ouverture pour que le
 * nouvel utilisateur voie SA musique tout de suite. Paroles du domaine
 * public (Jean-Baptiste Clément † 1903 / Antoine Renard † 1872 ; et un
 * traditionnel) — arrangements d'accords libres. Marqueur : tag « Exemple ».
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
      title: 'À la claire fontaine',
      artist: 'Traditionnel',
      key: 'C',
      tempo: 90,
      capo: 0,
      durationSec: 0,
      tags: [EXAMPLE_TAG],
      structure: [],
      structureNotes:
        'Couplets identiques, refrain a cappella possible sur le dernier ' +
        'passage. Exemple : transpose-moi avec le bouton tonalité !',
      lyrics:
        "[C]À la claire fon[F]taine\n" +
        "M'en allant prome[C]ner\n" +
        "[C]J'ai trouvé l'eau si [F]belle\n" +
        'Que je m’y suis bai[G]gné\n' +
        '\n' +
        'Il y a [F]longtemps que je [C]t’aime\n' +
        'Ja[G]mais je ne t’oublie[C]rai\n' +
        '\n' +
        '[C]Sous les feuilles d’un [F]chêne\n' +
        'Je me suis fait sé[C]cher\n' +
        '[C]Sur la plus haute [F]branche\n' +
        'Un rossignol chan[G]tait\n' +
        '\n' +
        'Il y a [F]longtemps que je [C]t’aime\n' +
        'Ja[G]mais je ne t’oublie[C]rai',
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
