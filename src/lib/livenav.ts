/**
 * NAVIGATION AUTOUR DU LIVE (b378, refonte navigation — lot 1).
 * Fonctions pures, testées dans scripts/test-nav-refonte.mjs.
 *
 * Le badge du header ne s'affiche QUE pendant une session (le lancement,
 * lui, vit dans l'onglet Live) : ces helpers décident de son libellé, de
 * sa cible et de son annonce lecteur d'écran, sans toucher au DOM.
 */

export type CibleLive =
  /** Une setlist est associée à la session : la Régie est atteignable. */
  | { type: 'regie'; chemin: string }
  /** Pas de setlist connue : on ouvre le panneau Live (jamais d'écran mort). */
  | { type: 'panneau' };

export function cibleDuLive(regieSetlistId: string): CibleLive {
  return regieSetlistId !== ''
    ? { type: 'regie', chemin: `/remote/${regieSetlistId}` }
    : { type: 'panneau' };
}

/** « Live » seul, ou « Live · 12 » quand le compteur est connu (le sondage
 *  des spectateurs n'existe que sur l'appareil du lanceur — b345). */
export function libelleBadge(viewers: number | null): string {
  return viewers !== null && viewers > 0 ? `Live · ${viewers}` : 'Live';
}
