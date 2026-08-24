/**
 * DÉPARTS DE GROUPE À REJOUER (b408, constat de Vincent : Marco a
 * réinitialisé son compte, mais restait membre de « Marcus et Vince » côté
 * serveur — son départ n'y était jamais arrivé).
 *
 * La réinitialisation « quittait » les groupes en tir-et-oublie :
 * `leaveBand` avalait toute erreur, rien ne mémorisait les départs dus, et
 * la liste locale des groupes était effacée dans la foulée. Un raté réseau
 * au mauvais moment laissait donc un membre fantôme POUR TOUJOURS chez les
 * autres — impossible à réinviter proprement.
 *
 * Même doctrine que les modifications hors ligne (b221) et l'essai promis
 * de la synchro (b397) : ce qui doit partir au serveur se NOTE d'abord, et
 * se rejoue tout seul jusqu'à y arriver. La file vit dans localStorage,
 * rangée dans les clés DU COMPTE (b259) : changer de compte la vide — un
 * départ dû par l'ancien compte ne se rejoue jamais sous l'identité d'un
 * autre.
 */

const KEY = 'sing2me/departsEnAttente';

export function departsEnAttente(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw !== null ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x !== '')
      : [];
  } catch {
    return [];
  }
}

function ecrire(liste: string[]): void {
  try {
    if (liste.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(liste));
  } catch {
    /* stockage indisponible : le départ immédiat reste tenté */
  }
}

/** Note des départs AVANT de les tenter — jamais l'inverse. */
export function noterDepartsEnAttente(cloudIds: string[]): void {
  const actuels = new Set(departsEnAttente());
  for (const id of cloudIds) if (id !== '') actuels.add(id);
  ecrire([...actuels]);
}

/** Le serveur a enregistré ce départ : il sort de la file. */
export function retirerDepartEnAttente(cloudId: string): void {
  ecrire(departsEnAttente().filter((id) => id !== cloudId));
}
