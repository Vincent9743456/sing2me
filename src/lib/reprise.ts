/**
 * REPRENDRE LA BIBLIOTHÈQUE DÉJÀ IMPORTÉE (b220, demande de Vincent :
 * « appliquer ce correctif à mon répertoire comme s'il venait d'être
 * importé »).
 *
 * Deux passes, volontairement séparées, parce qu'elles n'ont ni le même
 * coût ni le même risque :
 *
 *  1. LE RECALAGE — du calcul pur. Aucun réseau, aucun centime, aucun modèle
 *     qui pourrait toucher aux paroles. Il repose les accords sur l'attaque
 *     du mot, exactement comme le fait l'import depuis b219. C'est la moitié
 *     du problème, et c'est la moitié gratuite : elle passe en premier.
 *
 *  2. LA MISE EN FORME IA — ce que le calcul ne sait pas faire : retrouver
 *     les sections d'une partition qui n'en portait aucune marque. Un appel
 *     par morceau, avec les mêmes garde-fous qu'à l'import (gros doute →
 *     « à vérifier » + partition d'avant conservée pour revenir en arrière).
 *
 * Les deux passes ne touchent QUE les paroles, la structure, la tonalité et
 * le capo. Titre, artiste, notes de répétition, cœurs, setlists, statut
 * (idée ou bibliothèque) : rien n'y touche.
 */
import { meritteUneMiseEnForme } from './aiFormat';
import {
  accordsARecaler,
  numerosDePageDansTexte,
  recalerAccordsEnLigne,
  retirerNumerosDePage,
} from './importer';
import { sectionDeLaLigne } from './sections';
import { Song, SongVersion } from '../types';

/** Combien d'accords ce morceau (toutes versions) a-t-il à recaler ? */
export function accordsARecalerDuMorceau(song: Song): number {
  let n = accordsARecaler(song.lyrics);
  for (const v of song.versions ?? []) {
    // La version en tête porte les mêmes paroles que le morceau : ne pas
    // compter deux fois ce qui ne sera corrigé qu'une.
    if (v.lyrics !== song.lyrics) n += accordsARecaler(v.lyrics ?? '');
  }
  return n;
}

/** Combien de numéros de page traînent dans ce morceau (b431) ? */
export function numerosDePageDuMorceau(song: Song): number {
  let n = numerosDePageDansTexte(song.lyrics);
  for (const v of song.versions ?? []) {
    if (v.lyrics !== song.lyrics) n += numerosDePageDansTexte(v.lyrics ?? '');
  }
  return n;
}

/** Bilan d'un recalage, à annoncer avant de le lancer. */
export interface BilanRecalage {
  morceaux: number;
  accords: number;
  /** Lignes de numéro de page à retirer (b431) — même passe gratuite. */
  numeros: number;
  /** Morceaux concernés par les numéros de page. */
  morceauxNumeros: number;
}

export function bilanRecalage(songs: Song[]): BilanRecalage {
  let morceaux = 0;
  let accords = 0;
  let numeros = 0;
  let morceauxNumeros = 0;
  for (const s of songs) {
    const n = accordsARecalerDuMorceau(s);
    if (n > 0) {
      morceaux++;
      accords += n;
    }
    const p = numerosDePageDuMorceau(s);
    if (p > 0) {
      morceauxNumeros++;
      numeros += p;
    }
  }
  return { morceaux, accords, numeros, morceauxNumeros };
}

/**
 * QUI GAGNERAIT À UNE MISE EN FORME ? (b265, question de Vincent : « ces
 * boutons ne valent que pour les morceaux importés avant la mise à jour ?
 * ils disparaissent après ? »)
 *
 * Le bouton du recalage savait déjà se taire — il compte un défaut RÉEL, et
 * annonce « rien à corriger » quand il n'y a rien. Celui de l'IA, lui,
 * affichait la même phrase pour tout le monde, y compris un compte neuf qui
 * n'a rien importé, et repassait TOUS les morceaux à chaque lancement — au
 * prix d'appels payants et de « à vérifier » reposés sur des partitions déjà
 * saines.
 *
 * On a d'abord pensé MARQUER les morceaux déjà remis en forme. Mauvaise
 * piste : rien n'est écrit sur les bibliothèques existantes, donc le compteur
 * serait parti sur un mensonge (« tout est à refaire ») ou sur une amnistie
 * générale (« tout est fait »), au choix. On compte donc ce qui se VOIT,
 * comme le recalage : une partition qu'aucune section ne découpe. C'est
 * exactement le travail de cette passe — « retrouver les sections d'une
 * partition qui n'en portait aucune marque » —, ça se recalcule à chaque
 * affichage, et ça retombe tout seul à zéro une fois le travail fait.
 *
 * Lecture EXIGEANTE des sections (`sectionDeLaLigne`), la même qu'à
 * l'affichage : un « Refrain » nu, que l'écran ne montre pas comme un titre,
 * laisse bien le musicien devant un pavé continu — donc il compte.
 */

/** En dessous, il n'y a rien à découper : c'est un couplet, pas un morceau. */
export const LIGNES_MINIMUM = 8;

export function meriteDesSections(lyrics: string): boolean {
  const texte = lyrics ?? '';
  if (!meritteUneMiseEnForme(texte)) return false;
  let utiles = 0;
  for (const ligne of texte.split('\n')) {
    if (sectionDeLaLigne(ligne) !== null) return false;
    if (ligne.trim() !== '') utiles++;
  }
  return utiles >= LIGNES_MINIMUM;
}

/** Les morceaux que la mise en forme IA a une raison de reprendre. */
export function aRemettreEnForme(songs: Song[]): Song[] {
  return songs.filter((s) => meriteDesSections(s.lyrics));
}

/**
 * Recale un morceau et toutes ses versions. Renvoie le morceau inchangé —
 * la MÊME référence — s'il n'y avait rien à faire, pour ne pas réenregistrer
 * inutilement toute une bibliothèque.
 */
export function recalerMorceau(song: Song): Song {
  // Deux nettoyages de calcul pur dans la même passe : recalage des
  // accords (b220) + retrait des numéros de page hérités des PDF (b431).
  const nettoie = (l: string) =>
    retirerNumerosDePage(recalerAccordsEnLigne(l));
  const lyrics = nettoie(song.lyrics);
  const versions: SongVersion[] = (song.versions ?? []).map((v) => {
    const l = nettoie(v.lyrics ?? '');
    return l === (v.lyrics ?? '') ? v : { ...v, lyrics: l };
  });
  const versionsChangees = versions.some(
    (v, i) => v !== (song.versions ?? [])[i],
  );
  if (lyrics === song.lyrics && !versionsChangees) return song;
  return {
    ...song,
    lyrics,
    versions,
    updatedAt: new Date().toISOString(),
  };
}
