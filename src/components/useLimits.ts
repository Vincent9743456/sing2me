/**
 * useLimits (b381, réaligné b385 sur l'offre v2) — l'état des limites du
 * compte, prêt à afficher. Le plan part du CACHE (réponse immédiate,
 * hors ligne compris) puis se recale sur le serveur au montage. Les
 * compteurs se calculent AU RENDU sur la vraie bibliothèque (règle 11 :
 * une pastille compte exactement ce que l'écran montrera).
 */
import { useEffect, useState } from 'react';

import {
  compteMorceauxActifs,
  compteReserve,
  limitesDuPlan,
  Plan,
} from '../lib/limites';
import { chargerPlan, planEnCache } from '../lib/plan';
import { useStore } from '../store';

export interface EtatLimites {
  plan: Plan;
  /** Morceaux ACTIFS (hors propositions et hors réserve) / plafond. */
  actifs: number;
  maxActifs: number | null;
  /** Morceaux en réserve (jamais limités — affichage seulement). */
  reserve: number;
  /** Peut-on ACTIVER un morceau de plus ? (au-delà : il entre en réserve) */
  peutActiver: boolean;
}

export function useLimits(): EtatLimites {
  const { songs } = useStore();
  const [plan, setPlan] = useState<Plan>(() => planEnCache());
  useEffect(() => {
    let alive = true;
    void chargerPlan().then((p) => {
      if (alive) setPlan(p);
    });
    return () => {
      alive = false;
    };
  }, []);
  const lim = limitesDuPlan(plan);
  const actifs = compteMorceauxActifs(songs);
  return {
    plan,
    actifs,
    maxActifs: lim.maxSongs,
    reserve: compteReserve(songs),
    peutActiver: lim.maxSongs === null || actifs < lim.maxSongs,
  };
}
