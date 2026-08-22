/**
 * L'IA MET EN FORME CHAQUE IMPORT (b220, décision Vincent).
 *
 * Jusqu'ici elle n'était appelée que sur un import déjà cassé, et à la main.
 * Elle passe maintenant sur TOUS les imports d'une partition — la mise en
 * forme (sections nommées, accords posés sur la bonne syllabe, tonalité et
 * capo repérés) ne se marchande plus.
 *
 * CE QU'ON NE FAIT PAS (arbitrage Vincent) : aucune vérification des accords
 * ni des paroles à ce moment-là. Savoir si la partition dit vrai, c'est le
 * métier de « Chercher une meilleure version », pas celui de l'import.
 *
 * LE GROS DOUTE est donc un constat de FORME, jamais un jugement sur le
 * contenu : la mise en forme a-t-elle perdu la moitié du texte, fait
 * disparaître tous les accords, ou laissé une partition que l'analyse
 * d'import juge toujours bancale ? Dans ces cas-là — et dans ces cas-là
 * seulement — on garde la partition d'avant, et c'est le musicien qui
 * tranche. Sur un import en masse, il tranchera plus tard : le morceau entre
 * en bibliothèque avec son « 🔎 À vérifier ».
 */
import { analyzeImport, ImportOutcome, raisonDeVerifier } from './importer';
import { sectionDeLaLigne } from './sections';
import { Song } from '../types';

/** Lignes qui portent vraiment quelque chose à lire (ni vide, ni en-tête). */
function lignesUtiles(lyrics: string): number {
  return lyrics
    .split('\n')
    .filter((l) => l.trim() !== '' && sectionDeLaLigne(l) === null).length;
}

function nombreDAccords(lyrics: string): number {
  return (lyrics.match(/\[[^\]\n]*\]/g) ?? []).length;
}

/** La suite des accords d'une partition, dans l'ordre d'apparition. */
export function suiteAccords(lyrics: string): string[] {
  return (lyrics.match(/\[([^\]\n]+)\]/g) ?? []).map((c) =>
    c.slice(1, -1).trim(),
  );
}

/**
 * L'IA MET EN FORME, ELLE NE RÉÉCRIT PAS LA MUSIQUE (b394, signalement de
 * Vincent : sur « The Greatest Bastard », la mise en forme a transformé
 * les G9 en G — « la neuvième a disparu » — et déplacé des accords).
 *
 * Chaque accord de l'analyse LOCALE doit se retrouver, à l'IDENTIQUE et
 * dans le même ordre, dans la version remise en forme. L'IA peut en
 * AJOUTER (retrouver des accords que l'analyse locale avait ratés est
 * précisément son métier), mais jamais en RENOMMER ni en PERDRE un seul :
 * G9 n'est pas G, C/G n'est pas C. Test de sous-suite, pas d'égalité —
 * et purement déterministe : aucun jugement, une comparaison.
 */
export function accordsPreserves(
  localLyrics: string,
  iaLyrics: string,
): boolean {
  const attendus = suiteAccords(localLyrics);
  const produits = suiteAccords(iaLyrics);
  let i = 0;
  for (const c of produits) {
    if (i < attendus.length && c === attendus[i]) i++;
  }
  return i === attendus.length;
}

/** En deçà, la mise en forme a mangé du texte. */
const PERTE_MAX = 0.6;
/** Au-delà, elle en a inventé — ou recopié le morceau deux fois. */
const ENFLURE_MAX = 1.8;

/**
 * Gros doute après le passage de l'IA. Renvoie la raison en clair, ou ''.
 *
 * `avant` est ce que l'analyse locale avait produit, `apres` ce qu'elle
 * produit sur le texte remis en forme. On ne compare ni les mots ni les
 * accords entre eux : seulement des VOLUMES, et le diagnostic d'import
 * habituel appliqué au résultat.
 */
export function douteApresIA(
  avant: ImportOutcome,
  apres: ImportOutcome,
  texteRemisEnForme: string,
): string {
  const lAvant = lignesUtiles(avant.song.lyrics);
  const lApres = lignesUtiles(apres.song.lyrics);
  if (lAvant >= 4 && lApres < lAvant * PERTE_MAX) {
    return 'la mise en forme a laissé de côté une partie du texte';
  }
  if (lAvant >= 4 && lApres > lAvant * ENFLURE_MAX) {
    return 'la mise en forme a beaucoup allongé le texte';
  }
  if (
    nombreDAccords(avant.song.lyrics) >= 3 &&
    nombreDAccords(apres.song.lyrics) === 0
  ) {
    return 'les accords ont disparu à la mise en forme';
  }
  // Le diagnostic habituel, appliqué au RÉSULTAT : si la partition est
  // encore bancale après l'IA, plus personne ne la redressera tout seul.
  return raisonDeVerifier(texteRemisEnForme, apres);
}

/** Vaut-il la peine d'appeler l'IA ? Une seule réponse : non si rien à lire. */
export function meritteUneMiseEnForme(texte: string): boolean {
  return texte.trim().length >= 40;
}

/** Photo de la partition d'avant l'IA, pour pouvoir y revenir. */
export function photoAvantIA(song: Song): NonNullable<Song['beforeAi']> {
  return {
    lyrics: song.lyrics,
    structure: song.structure,
    key: song.key,
    capo: song.capo,
  };
}

/**
 * Résultat d'un import remis en forme : le morceau à enregistrer, et la
 * raison du doute s'il y en a une.
 */
export interface MiseEnForme {
  song: Song;
  doute: string;
  /** L'IA a-t-elle réellement été appliquée ? (non si elle a échoué) */
  parIA: boolean;
}

/**
 * Assemble le morceau final à partir de l'analyse locale et de celle du
 * texte remis en forme. La partition d'avant n'est conservée QUE s'il y a
 * doute — sinon on ne double pas le poids de la bibliothèque.
 */
export function fusionMiseEnForme(
  texteLocal: string,
  localOutcome: ImportOutcome,
  texteRemisEnForme: string,
  aiOutcome: ImportOutcome | null,
  doutePrealable = '',
): MiseEnForme {
  // L'IA n'a pas répondu, OU sa version a renommé/perdu des accords
  // (b394 : G9 devenu G) : on garde l'analyse locale — la mise en forme
  // ne se paie jamais d'une note. Même chemin dans les deux cas, sans
  // rien signaler de plus que ce que l'import aurait signalé.
  if (
    !aiOutcome ||
    !accordsPreserves(localOutcome.song.lyrics, aiOutcome.song.lyrics)
  ) {
    const doute =
      doutePrealable !== ''
        ? doutePrealable
        : raisonDeVerifier(texteLocal, localOutcome);
    const song = { ...localOutcome.song };
    if (doute !== '') song.needsCheck = { reason: doute };
    return { song, doute, parIA: false };
  }
  const doute =
    doutePrealable !== ''
      ? doutePrealable
      : douteApresIA(localOutcome, aiOutcome, texteRemisEnForme);
  const song: Song = { ...aiOutcome.song };
  if (doute !== '') {
    song.needsCheck = { reason: doute };
    song.beforeAi = photoAvantIA(localOutcome.song);
  }
  return { song, doute, parIA: true };
}

/** Revenir à la partition d'avant l'IA : le doute est levé par ce choix. */
export function revenirAvantIA(song: Song): Song {
  const avant = song.beforeAi;
  if (!avant) return song;
  const champs = {
    lyrics: avant.lyrics,
    structure: avant.structure,
    key: avant.key,
    capo: avant.capo,
  };
  return {
    ...song,
    ...champs,
    versions: song.versions.map((v) =>
      v.id === song.activeVersionId ? { ...v, ...champs } : v,
    ),
    beforeAi: undefined,
    needsCheck: undefined,
    updatedAt: new Date().toISOString(),
  };
}

/** Garder la mise en forme de l'IA : le doute est levé, la photo s'efface. */
export function garderLaMiseEnForme(song: Song): Song {
  if (!song.beforeAi && !song.needsCheck) return song;
  return {
    ...song,
    beforeAi: undefined,
    needsCheck: undefined,
    updatedAt: new Date().toISOString(),
  };
}

/** Le diagnostic d'analyse, tel qu'on l'affiche après la mise en forme. */
export function diagnostic(texte: string, outcome: ImportOutcome) {
  return analyzeImport(texte, outcome);
}
