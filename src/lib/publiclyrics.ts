/**
 * CE QUE LIT LE PUBLIC : LE VOIR, ET POUVOIR LE CORRIGER (b223, demande de
 * Vincent).
 *
 * Depuis b219 le texte du public est PRÉPARÉ (`stripChords` : les accords
 * partent, les lignes de grille disparaissent, les en-têtes de section se
 * détachent). Mais cette préparation ne s'exécutait qu'au moment de la
 * diffusion, et son résultat n'apparaissait NULLE PART dans l'application du
 * musicien : l'artiste découvrait l'écran de ses spectateurs pendant le
 * concert, par-dessus l'épaule de quelqu'un, et n'avait alors aucun moyen de
 * corriger une ligne sans abîmer sa propre partition (celle qui porte ses
 * accords).
 *
 * Deux choses, donc, et une seule maison pour les deux :
 *
 *  1. LE TEXTE AUTOMATIQUE reste la règle. Rien à régler, rien à entretenir :
 *     la partition change, le public suit. C'est ce que 99 % des morceaux
 *     doivent faire, et c'est ce qu'ils font sans que personne n'y touche.
 *
 *  2. LA RETOUCHE est l'exception, et elle est ASSUMÉE : dès qu'un texte
 *     retouché existe, c'est LUI que le public lit, partout, jusqu'à ce que
 *     l'artiste revienne en arrière. On n'écrase jamais en silence ce qu'il a
 *     écrit à la main — mais on ne le laisse pas non plus vieillir sans le
 *     dire : `from` garde le texte automatique tel qu'il était au moment de la
 *     retouche, ce qui permet de repérer, exactement et sans deviner, qu'une
 *     partition a bougé depuis (`partitionAChange`).
 *
 * Le repère se lève TOUT SEUL quand son motif disparaît (règle 11 du design
 * system) : reprendre la partition, ou confirmer qu'on garde son texte, le
 * font taire — dans les deux cas parce qu'il n'y a plus d'écart, pas parce
 * qu'on l'a masqué.
 *
 * Toute diffusion vers le public passe par `parolesPubliques` : le direct, la
 * setlist que le spectateur parcourt, le mode scène, la télécommande et la
 * vue « paroles seules ». Une seule fonction — sinon un écran finirait par
 * montrer autre chose que les autres, et c'est exactement ce qu'un artiste ne
 * peut pas vérifier depuis la scène.
 */
import { stripChords } from './chordpro';
import { Song } from '../types';

/** Le minimum nécessaire pour savoir ce que lit le public. */
export type SourcePublique = Pick<Song, 'lyrics' | 'publicLyrics'>;

/** Le texte préparé automatiquement depuis la partition. */
export function parolesAutomatiques(song: SourcePublique): string {
  return stripChords(song.lyrics);
}

/** L'artiste a-t-il écrit lui-même le texte du public ? */
export function parolesRetouchees(song: SourcePublique): boolean {
  const t = song.publicLyrics?.text ?? '';
  return t.trim() !== '';
}

/** CE QUE LE PUBLIC LIT — l'unique source, pour tous les écrans. */
export function parolesPubliques(song: SourcePublique): string {
  return parolesRetouchees(song)
    ? (song.publicLyrics?.text ?? '')
    : parolesAutomatiques(song);
}

/**
 * La partition a-t-elle changé depuis la retouche ? Comparaison EXACTE avec
 * le texte automatique conservé au moment de l'enregistrement : jamais une
 * heuristique de date, qui se tromperait au premier appareil mal réglé.
 */
export function partitionAChange(song: SourcePublique): boolean {
  if (!parolesRetouchees(song)) return false;
  return (song.publicLyrics?.from ?? '') !== parolesAutomatiques(song);
}

/**
 * Enregistre le texte du public. Un texte vide n'est pas une page blanche
 * pour les spectateurs : c'est un retour au texte automatique (pour ne rien
 * afficher du tout, il y a le réglage « Paroles » de l'écran public).
 */
export function retoucherParoles(song: Song, texte: string): Song {
  if (texte.trim() === '') return rendreAutomatique(song);
  return {
    ...song,
    publicLyrics: {
      text: texte,
      from: parolesAutomatiques(song),
      updatedAt: new Date().toISOString(),
    },
  };
}

/** Revenir au texte préparé depuis la partition. */
export function rendreAutomatique(song: Song): Song {
  const { publicLyrics: _retire, ...reste } = song;
  return reste;
}

/**
 * « Je garde mon texte » : la partition a bougé, l'artiste a regardé et sa
 * version lui va toujours. On recale le témoin sur la partition d'aujourd'hui
 * — le texte du public ne change pas, seul le repère « à revoir » s'éteint.
 */
export function garderMonTexte(song: Song): Song {
  if (!parolesRetouchees(song)) return song;
  return {
    ...song,
    publicLyrics: {
      text: song.publicLyrics?.text ?? '',
      from: parolesAutomatiques(song),
      updatedAt: new Date().toISOString(),
    },
  };
}
