/**
 * « CRÉER UN MORCEAU POUR UN GROUPE » (b472, point 1 des retours de
 * Vincent) : depuis Morceaux filtré sur un groupe, le ＋ propose de créer
 * un morceau qui n'existe pas encore — et qu'il entre AUTOMATIQUEMENT au
 * répertoire de ce groupe une fois validé.
 *
 * Le trajet de création traverse plusieurs écrans (import, recherche,
 * collage, écriture à la main) : l'intention voyage donc dans un marqueur
 * de session, AFFICHÉ en bannière pendant tout le trajet (règle 11 : une
 * intention invisible qui agit serait un piège), et consommé au point
 * d'écriture UNIQUE — `store.saveSong`, à l'instant où le morceau devient
 * définitif — pour que tous les chemins de création l'appliquent sans y
 * penser.
 *
 * Garde-fous : durée de vie 30 min (un marqueur oublié ne doit pas
 * rattacher un morceau créé plus tard), levé quand on REVIENT à la
 * bibliothèque (quitter le trajet = y renoncer), levé à l'entrée de
 * l'import EN MASSE (une collection entière n'est pas « un morceau pour
 * le groupe »), et écarté d'un geste depuis la bannière.
 */

const CLE = 'sing2me/nouveauPourGroupe';
const DUREE_MAX = 30 * 60 * 1000;

export function poserNouveauPourGroupe(bandId: string): void {
  try {
    sessionStorage.setItem(CLE, JSON.stringify({ bandId, at: Date.now() }));
  } catch {
    /* stockage indisponible : la création reste possible, sans rattachement */
  }
}

/** Identifiant local du groupe visé, ou '' si absent ou périmé. */
export function lireNouveauPourGroupe(): string {
  try {
    const brut = sessionStorage.getItem(CLE);
    if (brut === null) return '';
    const v = JSON.parse(brut) as { bandId?: string; at?: number };
    if (typeof v.bandId !== 'string' || v.bandId === '') return '';
    if (typeof v.at !== 'number' || Date.now() - v.at > DUREE_MAX) {
      sessionStorage.removeItem(CLE);
      return '';
    }
    return v.bandId;
  } catch {
    return '';
  }
}

export function leverNouveauPourGroupe(): void {
  try {
    sessionStorage.removeItem(CLE);
  } catch {
    /* rien à lever */
  }
}
