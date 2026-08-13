/**
 * CE QUE LIT LE PUBLIC (b219, simplifié b294).
 *
 * Le public lit les paroles PRÉPARÉES depuis la partition : `stripChords`
 * retire les accords, efface les lignes de grille et détache les en-têtes de
 * section. C'est l'unique source pour TOUS les écrans où quelqu'un lit des
 * paroles seules — le direct, la setlist parcourue par le spectateur, le mode
 * scène, la télécommande et la vue « paroles seules ». Une seule fonction,
 * sinon un écran finirait par montrer autre chose que les autres.
 *
 * LA RETOUCHE MANUELLE DU TEXTE PUBLIC (b223/b224) A ÉTÉ RETIRÉE (arbitrage
 * Vincent, b294 — simplification : « ça introduit une complexité »). Pour
 * changer ce que lit le public, on modifie la partition elle-même. Le champ
 * `publicLyrics` peut subsister dans les données des installés : il n'est plus
 * jamais lu, et on ne le réécrit pas (aucune réécriture destructive du
 * stockage — cicatrice b290).
 */
import { stripChords } from './chordpro';
import { Song } from '../types';

/** CE QUE LE PUBLIC LIT — l'unique source, pour tous les écrans. */
export function parolesPubliques(song: Pick<Song, 'lyrics'>): string {
  return stripChords(song.lyrics);
}
