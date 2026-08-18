/**
 * Dates et classements de l'HISTORIQUE des lives (refonte Live, lot A —
 * b359). Fonctions pures, sans DOM ni traduction : les composants habillent,
 * ici on calcule — c'est ce qui permet de tester les bascules de dates
 * (aujourd'hui / hier / il y a N jours / absolu) sans navigateur.
 */

export interface CompteursLive {
  uniques: number;
  hearts: number;
  messages: { length: number };
}

/** A5 — une session « sans activité » : personne, rien reçu, rien écrit. */
export function sansActivite(l: CompteursLive): boolean {
  return l.uniques === 0 && l.hearts === 0 && l.messages.length === 0;
}

/** « 17 août » — avec l'année seulement si ce n'est pas l'année courante
 *  (A4 : sert au titre par défaut « Live du 17 août »). */
export function dateDeTitre(iso: string, maintenant = new Date()): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === maintenant.getFullYear()
      ? { day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'long', year: 'numeric' };
  return d.toLocaleDateString('fr-FR', opts);
}

/** « lun. 17 août 2026 » — la date absolue complète du sous-titre. */
export function dateAbsolue(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * A7 — la date RELATIVE du sous-titre. Renvoie une forme structurée (le
 * composant traduit) : aujourd'hui, hier, il y a 2..7 jours, sinon absolu.
 * Le calcul est en JOURS CALENDAIRES, pas en tranches de 24 h : à 00:10,
 * un live d'hier 23:50 est bien « hier ».
 */
export type DateRelative =
  | { quand: 'aujourdhui' }
  | { quand: 'hier' }
  | { quand: 'ilya'; jours: number }
  | { quand: 'absolu'; texte: string };

export function dateRelative(iso: string, maintenant = new Date()): DateRelative {
  const d = new Date(iso);
  const jour = (x: Date) =>
    Math.floor(
      new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86400000,
    );
  const ecart = jour(maintenant) - jour(d);
  if (ecart <= 0) return { quand: 'aujourdhui' };
  if (ecart === 1) return { quand: 'hier' };
  if (ecart <= 7) return { quand: 'ilya', jours: ecart };
  return { quand: 'absolu', texte: dateAbsolue(iso) };
}

/** « 22:13 » */
export function heureCourte(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A8 — clé et libellé de mois pour le regroupement (« août 2026 »). */
export function cleMois(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * C19 — FUSION DES OCCURRENCES CONSÉCUTIVES d'un même morceau dans le
 * récap. Le serveur archive une ligne à chaque transition d'état du live
 * (pause/reprise, re-sélection) : le même titre peut donc se suivre à une
 * minute d'écart. On fusionne À L'AFFICHAGE — plage horaire, cœurs
 * additionnés — sans toucher aux données. Deux occurrences NON consécutives
 * (un autre morceau entre les deux) restent distinctes : c'est une vraie
 * reprise en fin de set.
 */
export interface MorceauJoue {
  song_title: string;
  played_at: string;
  hearts: number;
}

export interface MorceauFusionne {
  song_title: string;
  de: string;
  a: string;
  hearts: number;
}

export function fusionneConsecutifs(songs: MorceauJoue[]): MorceauFusionne[] {
  const tri = [...songs].sort((x, y) => x.played_at.localeCompare(y.played_at));
  const out: MorceauFusionne[] = [];
  for (const s of tri) {
    const dernier = out[out.length - 1];
    if (dernier && dernier.song_title === s.song_title) {
      dernier.a = s.played_at;
      dernier.hearts += s.hearts;
    } else {
      out.push({
        song_title: s.song_title,
        de: s.played_at,
        a: s.played_at,
        hearts: s.hearts,
      });
    }
  }
  return out;
}

/** B14 — le prochain vendredi (aujourd'hui compris si on est vendredi),
 *  au format AAAA-MM-JJ du champ date. */
export function prochainVendredi(maintenant = new Date()): string {
  const d = new Date(maintenant);
  const ecart = (5 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + ecart);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const jj = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${jj}`;
}

export function libelleMois(cle: string): string {
  const [a, m] = cle.split('-').map((x) => parseInt(x, 10));
  return new Date(a, (m || 1) - 1, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}
