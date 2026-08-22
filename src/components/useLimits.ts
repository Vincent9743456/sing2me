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
import { estBrouillon } from '../types';

export interface EtatLimites {
  plan: Plan;
  /** Morceaux (hors propositions en attente) / plafond (null = illimité). */
  morceaux: number;
  maxMorceaux: number | null;
  /** Spectateurs simultanés en live (null = salle illimitée) — b387. */
  maxSpectateurs: number | null;
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
  // Les BROUILLONS de création (b319) ne partent jamais au cloud
  // (`sansBrouillons`) : ils ne comptent pas non plus ici, sinon le
  // compteur annoncerait un chiffre que le serveur ne connaît pas (b390).
  const morceaux = compteMorceauxPerso(songs.filter((s) => !estBrouillon(s)));
  return {
    plan,
    morceaux,
    maxMorceaux: lim.maxSongs,
    maxSpectateurs: lim.maxSpectateurs,
    peutAjouter: lim.maxSongs === null || morceaux < lim.maxSongs,
  };
}
