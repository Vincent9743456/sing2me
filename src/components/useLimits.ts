/**
 * useLimits (b381, simplifié b386) — l'état des limites du compte, prêt à
 * afficher. Le plan part du CACHE (réponse immédiate, hors ligne compris)
 * puis se recale sur le serveur au montage. Les compteurs se calculent AU
 * RENDU sur la vraie bibliothèque (règle 11 : une pastille compte
 * exactement ce que l'écran montrera).
 */
import { useEffect, useState } from 'react';

import {
  compteMorceauxPerso,
  limitesDuPlan,
  Plan,
} from '../lib/limites';
import { chargerPlan, planEnCache } from '../lib/plan';
import { useStore } from '../store';

export interface EtatLimites {
  plan: Plan;
  /** Morceaux (hors propositions en attente) / plafond (null = illimité). */
  morceaux: number;
  maxMorceaux: number | null;
  peutAjouter: boolean;
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
  const morceaux = compteMorceauxPerso(songs);
  return {
    plan,
    morceaux,
    maxMorceaux: lim.maxSongs,
    peutAjouter: lim.maxSongs === null || morceaux < lim.maxSongs,
  };
}
