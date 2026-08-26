/**
 * À QUEL COMPTE APPARTIENNENT LES DONNÉES DE CET APPAREIL ? (b259, question
 * de Vincent : « j'ai créé 2 comptes avec 2 mails différents… j'ai
 * l'impression qu'ils fusionnent. Comment empêcher cela ? »)
 *
 * Il avait raison, et c'était structurel. L'app est local-first : la
 * bibliothèque vit dans `localStorage`, qui appartient à l'APPAREIL et non à
 * un compte. Se déconnecter n'effaçait que la session ; la bibliothèque
 * restait. À la connexion suivante, la synchro faisait ce qu'elle sait
 * faire — une FUSION entre le local et le cloud du compte qui arrive — puis
 * elle POUSSAIT le résultat. Les morceaux du compte A entraient donc
 * définitivement dans le cloud du compte B. Et au retour sur A, le même
 * mécanisme y renvoyait ceux de B : au bout d'un aller-retour, les deux
 * comptes contenaient tout.
 *
 * On note donc à QUI appartient ce qui est sur l'appareil. Trois cas à la
 * connexion :
 *  · rien de noté → on adopte le compte qui arrive (installation existante,
 *    ou app essayée avant de créer son compte : sa bibliothèque le suit) ;
 *  · même compte → fusion normale, c'est le multi-appareil ;
 *  · AUTRE compte → on ne fusionne rien et on ne pousse rien. Les données du
 *    compte précédent ne sont pas perdues : elles sont dans SON cloud, où
 *    elles étaient déjà (c'est la condition pour qu'un compte soit noté ici),
 *    et elles reviennent s'il se reconnecte.
 */

const CLE = 'sing2me/compte';

/** Le compte auquel appartiennent les données locales ('' = inconnu). */
export function compteLocal(): string {
  try {
    return localStorage.getItem(CLE) ?? '';
  } catch {
    return '';
  }
}

/** Noté APRÈS un envoi réussi : sans quoi on marquerait un compte dont le
 *  cloud n'a jamais reçu ces données, et changer de compte les perdrait. */
export function noterCompteLocal(userId: string): void {
  try {
    if (userId === '') localStorage.removeItem(CLE);
    else localStorage.setItem(CLE, userId);
  } catch {
    // stockage indisponible : on retombe sur le comportement d'avant
  }
}

/**
 * Caches et repères qui appartiennent au COMPTE, pas à l'appareil : ils
 * mentiraient au compte suivant. L'adresse publique en cache (b245) le
 * ferait passer pour propriétaire d'une page qui n'est pas la sienne ; un
 * direct en cours lui donnerait la main sur le concert d'un autre ; les
 * repères de notification lui annonceraient des arrivées déjà vues.
 *
 * Ce qui appartient à l'APPAREIL reste : `deviceId`, le thème, la langue,
 * la taille de police du mode scène, les astuces déjà lues.
 */
const CLES_DU_COMPTE = [
  'sing2me/publicName',
  'sing2me/dernierEnvoi',
  'sing2me/liveRef',
  'sing2me/onair',
  'sing2me/onairWho',
  'sing2me/clotureEnAttente',
  'sing2me/isAdmin',
  'sing2me/initBands',
  'sing2me/seenMembers',
  'sing2me/memberNews',
  'sing2me/msgSeen',
  'sing2me/msgInit',
  'sing2me/wasMember',
  // b408 : un départ de groupe dû par CE compte ne se rejoue jamais sous
  // l'identité d'un autre.
  'sing2me/departsEnAttente',
  'sing2me/justJoined',
  'sing2me/libBandFilter',
  'sing2me/setlistCtx',
  // b343 : dernier historique des directs affiché avant rafraîchissement —
  // il appartient au compte, pas à l'appareil.
  'sing2me/liveCache',
  // b381 : le plan (free/pro/admin) appartient au compte — le garder
  // ferait croire au suivant qu'il est illimité (ou l'inverse).
  'sing2me/plan',
  // b382 : dernier compteur de suiveurs affiché (fiche Artiste) — même
  // logique que liveCache, il appartient au compte.
  'sing2me/fanCache',
  // b455 : derniers chiffres du tableau de bord fondateur — des données
  // d'exploitation qui n'ont rien à faire sous un autre compte.
  'sing2me/adminCache',
];

export function oublierCachesDuCompte(): void {
  for (const k of CLES_DU_COMPTE) {
    try {
      localStorage.removeItem(k);
    } catch {
      // stockage indisponible : rien de grave, ce ne sont que des caches
    }
  }
}
