/**
 * MÉMOIRE DES FILTRES DE LA BIBLIOTHÈQUE — ÉTAT DE NAVIGATION, PAS
 * PRÉFÉRENCE (b478, audit N-3).
 *
 * En sessionStorage (b402), le filtre de groupe survivait au RECHARGEMENT
 * de la page et aux allers-retours d'onglets : « Filtre actif : Marcus et
 * Vince — 16 morceaux » restait collé, et l'utilisateur qui avait oublié
 * son détour par un répertoire croyait avoir perdu la moitié de sa
 * bibliothèque.
 *
 * Mémoire de MODULE désormais : le ← d'une partition retrouve la même
 * liste (le bénéfice de b402), mais un rechargement repart de la
 * bibliothèque complète, et un tap sur l'onglet Morceaux dans la barre du
 * bas VIDE la mémoire (la barre navigue vers un écran neuf, pas vers un
 * état passé). Vit ici, dans un module sans dépendance, parce que la
 * barre d'onglets (ui.tsx) et la bibliothèque (Library.tsx) doivent tous
 * deux y toucher sans se référencer l'un l'autre.
 */
export interface FiltresLibrairie {
  query: string;
  tag: string | null;
  bandFilter: string | null;
  showIdeas: boolean;
  showCheck: boolean;
}

let memo: Partial<FiltresLibrairie> = {};

/* b482 (demande de Vincent) : taper l'onglet Morceaux ALORS QU'ON Y EST
   déjà doit aussi tout défiltrer. La barre vidait bien la mémoire (b478),
   mais l'écran déjà monté ne remontait pas — ses états locaux gardaient le
   filtre et le réécrivaient aussitôt dans la mémoire. Le vidage PRÉVIENT
   donc ses abonnés : la bibliothèque montée s'y accroche et remet ses
   filtres à zéro. Sans abonné (on arrive d'un autre onglet), le vidage de
   la mémoire suffit, comme avant. */
const abonnes = new Set<() => void>();

/** S'abonner au vidage des filtres. Renvoie la fonction de désabonnement. */
export function surVidageFiltres(fn: () => void): () => void {
  abonnes.add(fn);
  return () => {
    abonnes.delete(fn);
  };
}

export function lireFiltresLibrairie(): Partial<FiltresLibrairie> {
  return memo;
}

export function poserFiltresLibrairie(v: FiltresLibrairie): void {
  memo = v;
}

export function viderFiltresLibrairie(): void {
  memo = {};
  abonnes.forEach((fn) => fn());
}
