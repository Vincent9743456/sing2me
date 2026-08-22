/**
 * RETROUVER LES ACCORDS D'ORIGINE (b395, signalement de Vincent après b394 :
 * « c'est le cas sur beaucoup de partitions — décalages et accords
 * spécifiques, 9ème par exemple »).
 *
 * b394 a fermé la porte pour les imports À VENIR : la mise en forme IA ne
 * peut plus renommer ni perdre un accord. Mais les morceaux déjà en
 * bibliothèque, passés par l'IA d'avant, gardent leurs G devenus G9 et leurs
 * accords déplacés — et rien dans le morceau ne permet de les réparer :
 * aucun lien vers la source n'est conservé, et la photo d'avant-IA n'existe
 * que sur les morceaux « à vérifier ».
 *
 * La réparation passe donc par une RÉCUPÉRATION : rechercher le morceau à la
 * source (titre + artiste), relire la partition trouvée avec l'analyse 100 %
 * LOCALE (celle que b394 a prouvée fidèle — aucun appel IA dans cette passe),
 * et ne remplacer le contenu que quand la preuve est ÉCRASANTE.
 *
 * Cicatrice b290, gravée dans chaque règle de ce fichier : une réparation
 * qui DEVINE laquelle des deux copies dit vrai et peut détruire l'autre ne
 * vaut jamais le bug qu'elle corrige. Donc :
 *
 *  1. les paroles récupérées doivent être QUASI IDENTIQUES aux paroles
 *     stockées (même chanson, même découpage) — sinon on ne touche à rien ;
 *  2. la suite d'accords doit avoir le MÊME nombre d'accords, dans le même
 *     ordre, et chaque accord stocké doit être un APPAUVRISSEMENT de
 *     l'accord récupéré (G pour G9, D pour D/F#, C pour Cmaj7) — exactement
 *     la signature du dégât d'avant b394, et rien d'autre. Un accord qui
 *     change de fondamentale ou de couleur (C → C#m, A → Am) n'est jamais
 *     un appauvrissement : morceau écarté ;
 *  3. un morceau dont tous les accords sont déjà identiques n'est PAS
 *     réparé : il n'a rien à réparer, et remplacer son contenu écraserait
 *     d'éventuelles retouches à la main pour rien. (Un décalage de position
 *     sans aucun accord renommé passe donc au travers — indétectable sans
 *     deviner, et deviner est précisément ce qu'on s'interdit.) ;
 *  4. chaque morceau réparé garde une PHOTO de sa partition d'avant
 *     (`beforeAi`) : le retour en arrière est à un geste, dans le menu du
 *     morceau (« ↩ Revenir à ma partition d'origine »). Une photo déjà
 *     présente n'est jamais écrasée — elle est plus ancienne, donc plus
 *     proche de ce que le musicien avait vraiment.
 *
 * Tout ce qui n'entre pas dans ce cadre est ÉCARTÉ et COMPTÉ — jamais
 * remplacé dans le doute, jamais passé sous silence.
 */
import { suiteAccords } from './aiFormat';
import { ImportOutcome, lyricsSimilarity } from './importer';
import { estBrouillon, Song, SongVersion } from '../types';

/** En dessous, ce n'est pas la même chanson — ou pas le même découpage. */
export const SIMILARITE_MINIMALE = 0.95;

/** En dessous, trop peu d'accords pour qu'une coïncidence soit exclue. */
export const ACCORDS_MINIMUM = 3;

/**
 * Ce qui peut suivre l'accord stocké dans l'accord récupéré : uniquement des
 * ENRICHISSEMENTS qui gardent la fondamentale et la couleur — extensions
 * chiffrées (9, 7, 11…), maj/sus/add, note ajoutée entre parenthèses, basse
 * après la barre. Jamais un dièse ou un bémol (C → C#m change de
 * fondamentale), jamais un « m » nu (A → Am change la couleur), jamais
 * dim/aug.
 */
const ENRICHISSEMENT = /^(?:maj|sus|add|\d+|\([^)]*\)|\/[A-G](?:#|b)?)+$/;

/**
 * L'accord stocké est-il un appauvrissement plausible de l'accord récupéré ?
 * (G est un appauvrissement de G9 ; D de D/F# ; C de Cmaj7 — mais C n'est
 * jamais un appauvrissement de C#m, ni A de Am.)
 */
export function accordAppauvri(stocke: string, recupere: string): boolean {
  if (stocke === recupere) return true;
  if (stocke === '' || !recupere.startsWith(stocke)) return false;
  return ENRICHISSEMENT.test(recupere.slice(stocke.length));
}

export type VerdictRecuperation =
  /** Preuve écrasante : on répare, et voilà combien d'accords retrouvent leur nom. */
  | { verdict: 'reparer'; accords: number }
  /** Même chanson, mêmes accords : rien à réparer, on ne touche pas. */
  | { verdict: 'identique' }
  /** Le doute existe : on écarte, avec la raison en clair. */
  | { verdict: 'incertain'; raison: string };

/**
 * La décision, et rien qu'elle — pure, testable, sans réseau. `stocke` est
 * le morceau de la bibliothèque, `recupere` l'analyse locale de la
 * partition retrouvée à la source.
 */
export function verdictRecuperation(
  stocke: Pick<Song, 'lyrics'>,
  recupere: ImportOutcome,
): VerdictRecuperation {
  const anciens = suiteAccords(stocke.lyrics);
  const trouves = suiteAccords(recupere.song.lyrics);
  if (anciens.length < ACCORDS_MINIMUM) {
    return { verdict: 'incertain', raison: 'trop peu d’accords pour conclure' };
  }
  if (anciens.length !== trouves.length) {
    return { verdict: 'incertain', raison: 'nombre d’accords différent' };
  }
  const sim = lyricsSimilarity(stocke.lyrics, recupere.song.lyrics);
  if (sim < SIMILARITE_MINIMALE) {
    return { verdict: 'incertain', raison: 'paroles différentes' };
  }
  let repares = 0;
  for (let i = 0; i < anciens.length; i++) {
    if (!accordAppauvri(anciens[i], trouves[i])) {
      return {
        verdict: 'incertain',
        raison: `accord ${anciens[i]} ≠ ${trouves[i]}`,
      };
    }
    if (anciens[i] !== trouves[i]) repares++;
  }
  if (repares === 0) return { verdict: 'identique' };
  return { verdict: 'reparer', accords: repares };
}

/**
 * Les morceaux que la passe a une raison d'essayer : en bibliothèque (ni
 * brouillon, ni proposition en attente, ni écarté), avec un titre pour
 * chercher et assez d'accords pour décider.
 */
export function candidatsRecuperation(songs: Song[]): Song[] {
  return songs.filter(
    (s) =>
      !estBrouillon(s) &&
      s.idea !== true &&
      s.declined !== true &&
      s.title.trim() !== '' &&
      suiteAccords(s.lyrics).length >= ACCORDS_MINIMUM,
  );
}

/**
 * Applique une récupération jugée sûre. On ne remplace QUE la partition —
 * titre, artiste, notes, cœurs, setlists et statut restent ceux du morceau
 * qu'on avait — et la version active suit, comme partout (b169 : le mode
 * scène, le direct et le groupe doivent voir la même chose).
 */
export function appliquerRecuperation(
  vieux: Song,
  recupere: ImportOutcome,
): Song {
  const champs = {
    lyrics: recupere.song.lyrics,
    structure: recupere.song.structure,
    key: recupere.song.key !== '' ? recupere.song.key : vieux.key,
    capo: recupere.song.capo,
  };
  return {
    ...vieux,
    ...champs,
    // La photo pour revenir en arrière — sans reposer un « à vérifier » :
    // cette passe ne doute pas, elle prouve avant d'agir. Le motif du doute
    // éventuel d'avant vient de disparaître avec la partition : il se lève
    // (règle 11).
    beforeAi: vieux.beforeAi ?? {
      lyrics: vieux.lyrics,
      structure: vieux.structure,
      key: vieux.key,
      capo: vieux.capo,
    },
    needsCheck: undefined,
    versions: (vieux.versions ?? []).map(
      (v): SongVersion =>
        v.id === vieux.activeVersionId ? { ...v, ...champs } : v,
    ),
    updatedAt: new Date().toISOString(),
  };
}
