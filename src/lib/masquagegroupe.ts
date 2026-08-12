/**
 * MASQUER UN GROUPE AU PUBLIC — ET QUE ÇA SE VOIE EN LIGNE (b282, constat de
 * Vincent : « le masquage des groupes sur la page artiste pour le public ne
 * fonctionne pas »).
 *
 * Le réglage existait bien (b227), le filtre était juste (`groupesPublics`
 * écarte les groupes masqués), et pourtant la page publique continuait de
 * nommer le groupe. La raison : le filtre ne s'exécute qu'au moment où la
 * fiche est PUBLIÉE — enregistrement du profil, passage en direct,
 * réservation d'adresse. Cocher « masquer » ne publiait rien du tout. La
 * fiche déjà en ligne, elle, gardait la liste d'avant, indéfiniment.
 *
 * Deux fuites, en réalité, et la seconde était pire :
 *  1. le groupe restait NOMMÉ sur `/monnom` ;
 *  2. l'adresse miroir du groupe (`/lesprecieux`) restait ouverte quand le
 *     masquage venait de la LISTE (l'œil de b228) — seule la case de la
 *     fiche du groupe prenait la peine de la retirer.
 *
 * Même règle que pour la page rendue invisible (b262) : **un réglage qui
 * décide de ce que voit le public AGIT tout de suite.** Sinon il ment — et
 * sur une question de vie privée, un réglage qui ment est pire que pas de
 * réglage du tout.
 *
 * La décision vit donc ICI, à un seul endroit — comme `deleteband.ts` ou
 * `retraitgroupe.ts` : les DEUX écrans qui portent l'interrupteur (la ligne
 * de l'onglet Groupes, la case de la fiche du groupe) l'APPLIQUENT, ils ne
 * la réécrivent pas. C'est exactement ce qui manquait : deux interrupteurs,
 * deux comportements.
 *
 * Ce qui n'est PAS fait ici, volontairement :
 *  · rien n'est enregistré en local — le drapeau reste la responsabilité de
 *    l'écran (`saveBand`), qui doit l'appliquer TOUT DE SUITE, sans attendre
 *    le réseau : c'est lui qui interdit déjà de lancer un direct au nom du
 *    groupe, et cette interdiction ne dépend d'aucun serveur ;
 *  · aucune page n'est CRÉÉE : masquer un groupe ne doit pas être le geste
 *    qui réserve une adresse d'artiste. Sans fiche en ligne, il n'y a rien
 *    d'exposé, donc rien à corriger.
 */
import {
  claimPublicPage,
  ensureBandPage,
  monNomPublicOuErreur,
  profilAPublier,
  publicPagesAvailable,
  publierFicheGroupe,
  releaseBandPage,
} from './publicPages';
import { AuthSession, getValidSession } from './auth';
import { ArtistProfile, Band } from '../types';

/** Le groupe, une fois l'interrupteur basculé. Un seul endroit pour la
 *  forme du drapeau : `undefined` plutôt que `false`, pour ne pas alourdir
 *  le blob de synchro d'un champ qui ne dit rien. */
export function groupeMasque(band: Band, masque: boolean): Band {
  return masque
    ? { ...band, hiddenFromPublic: true }
    : { ...band, hiddenFromPublic: undefined };
}

/** Ce que l'écran doit dire quand la mise en ligne n'a pas suivi. */
export const ECHEC_MASQUAGE =
  'Le groupe est masqué sur ton appareil, mais ta page publique n’a pas pu être mise à jour. Réessaie une fois en ligne.';

/**
 * Applique le choix EN LIGNE, dans la foulée du geste.
 *
 * `bands` est la liste AVANT l'enregistrement local : on y réapplique le
 * drapeau nous-mêmes, parce que `saveBand` est asynchrone et que la fiche
 * partirait sinon avec l'état d'avant — le bogue qu'on corrige, à un tour
 * de boucle près.
 *
 * Renvoie l'adresse miroir du groupe après l'opération (`''` s'il est
 * masqué, ou si on n'a pas pu la reprendre), et `ok: false` si quoi que ce
 * soit n'a pas abouti — l'écran doit alors le DIRE plutôt que laisser croire
 * que le public ne voit plus le groupe.
 */
export async function appliquerMasquage(
  band: Band,
  masque: boolean,
  bands: Band[],
  artist: ArtistProfile,
  /** Réglage séparé : la page publique de l'artiste est-elle invisible ? */
  pageMasquee = false,
): Promise<{ ok: boolean; adresse: string }> {
  if (!publicPagesAvailable()) return { ok: true, adresse: '' };
  const s = await getValidSession();
  // Pas de compte : rien n'est publié, donc rien à retirer.
  if (!s) return { ok: true, adresse: '' };

  const cible = groupeMasque(band, masque);
  const aJour = bands.map((b) => (b.id === band.id ? cible : b));
  const cloudId = band.cloudId ?? '';
  let ok = true;
  let adresse = '';

  if (masque) {
    // L'adresse du groupe s'en va : masqué avec une adresse qui ouvre encore
    // sa fiche, ce serait le masquage le plus inutile qui soit.
    if (cloudId !== '') {
      try {
        await releaseBandPage(s, cloudId);
      } catch {
        ok = false;
      }
    }
  } else {
    // Démasquer rend l'adresse — sinon le geste ne serait pas réversible, et
    // les QR ou liens déjà donnés resteraient morts.
    try {
      adresse = await ensureBandPage(s, cible);
      await publierFicheGroupe(s, cible, artist);
    } catch {
      ok = false;
    }
  }

  // LA FICHE DE L'ARTISTE, MAINTENANT — c'est tout l'objet du lot.
  if (!(await republierFicheArtiste(s, artist, aJour, pageMasquee))) ok = false;

  return { ok, adresse };
}

/**
 * Republie la fiche de l'artiste avec la liste de groupes à jour.
 *
 * Ne CRÉE jamais rien : sans adresse déjà réservée, il n'y a aucune fiche en
 * ligne, donc rien qui expose quoi que ce soit — et masquer un groupe ne
 * doit pas être le geste qui publie une page. Renvoie `false` si la mise à
 * jour n'a pas abouti, pour que l'appelant le dise et puisse la rejouer.
 */
export async function republierFicheArtiste(
  s: AuthSession,
  artist: ArtistProfile,
  bands: Band[],
  pageMasquee = false,
): Promise<boolean> {
  if (!publicPagesAvailable()) return true;
  try {
    const enLigne = await monNomPublicOuErreur(s);
    if (enLigne === '') return true;
    await claimPublicPage(
      s,
      enLigne,
      await profilAPublier(artist, bands, pageMasquee),
    );
    return true;
  } catch {
    return false;
  }
}
