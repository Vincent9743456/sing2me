/**
 * useDepassement (b422) — le DÉPASSEMENT du plan gratuit, côté écran.
 *
 * Monté par l'onglet Morceaux (la maison des morceaux, règle 1) : il lit
 * l'horloge du SERVEUR (`depassement_avis`, posée par le cron qui envoie
 * aussi les e-mails de prévenance), affiche l'état au bandeau, et à
 * l'échéance APPLIQUE le tri décidé par les fondateurs.
 *
 * Quatre garde-fous, parce qu'une suppression automatique est le geste le
 * plus dangereux de l'app :
 *  1. le plan est CONFIRMÉ par le serveur à l'instant du tri (`planConfirme`)
 *     — jamais le cache, jamais une panne (b245 : une panne ne conclut pas) ;
 *  2. l'échéance vient du SERVEUR — pas d'horloge locale qu'un localStorage
 *     vidé remettrait à zéro ;
 *  3. JAMAIS pendant un live (« jamais de coupure en plein concert », b387) —
 *     on réessaie au prochain passage ;
 *  4. le tri passe par les portes existantes (planDeTri) : les morceaux de
 *     groupe retournent en proposition, les programmés d'une setlist de
 *     groupe sont intouchables, seuls les personnels excédentaires partent
 *     (tombe par ID seul — réimport possible).
 */
import { useEffect, useRef, useState } from 'react';

import { echeance, estEchu, planDeTri } from '../lib/depassement';
import { compteMorceauxPerso, limitesDuPlan } from '../lib/limites';
import { chargerDepassement, planConfirme } from '../lib/plan';
import { useStore } from '../store';
import { estBrouillon } from '../types';

export interface Bilan {
  gardes: number;
  propositions: number;
  supprimes: number;
}

export interface EtatDepassement {
  /** Ouverture du délai (serveur). */
  depuis: string;
  /** Date du tri automatique. */
  echeanceLe: Date;
  morceaux: number;
  max: number;
}

const BILAN_KEY = 'sing2me/bilanTri';

export function litBilan(): Bilan | null {
  try {
    const raw = localStorage.getItem(BILAN_KEY);
    return raw ? (JSON.parse(raw) as Bilan) : null;
  } catch {
    return null;
  }
}

export function effaceBilan(): void {
  try {
    localStorage.removeItem(BILAN_KEY);
  } catch {
    // rien : le bilan est un confort, pas une donnée
  }
}

export function useDepassement(): {
  etat: EtatDepassement | null;
  bilan: Bilan | null;
  fermerBilan: () => void;
} {
  const { songs, setlists, bands, appliquerPlafond } = useStore();
  const [etat, setEtat] = useState<EtatDepassement | null>(null);
  const [bilan, setBilan] = useState<Bilan | null>(() => litBilan());
  // Un seul tri par montage : le setState du store est asynchrone, sans ce
  // verrou un re-rendu pourrait relancer la vérification pendant le tri.
  const triFait = useRef(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const plan = await planConfirme();
      if (!alive || plan === null) return; // panne : on ne conclut rien
      const max = limitesDuPlan(plan).maxSongs;
      const morceaux = compteMorceauxPerso(
        songs.filter((s) => !estBrouillon(s)),
      );
      if (max === null || morceaux <= max) {
        setEtat(null); // motif disparu → le bandeau se lève seul (règle 11)
        return;
      }
      const d = await chargerDepassement();
      if (!alive || d === null || d === 'aucune') return; // pas d'horloge (encore)
      setEtat({ depuis: d.depuis, echeanceLe: echeance(d.depuis), morceaux, max });
      if (!estEchu(d.depuis) || triFait.current) return;
      // JAMAIS pendant un live : on réessaiera au prochain passage ici.
      if ((localStorage.getItem('sing2me/onair') ?? 'off') !== 'off') return;
      triFait.current = true;
      // Le bilan se calcule AVANT d'agir, avec la même fonction que le store.
      const tri = planDeTri(songs, setlists, bands, max);
      const b: Bilan = {
        gardes: tri.gardes.length + tri.proteges.length,
        propositions: tri.enProposition.length,
        supprimes: tri.aSupprimer.length,
      };
      appliquerPlafond(max);
      try {
        localStorage.setItem(BILAN_KEY, JSON.stringify(b));
      } catch {
        // le tri est fait ; le bilan s'affichera au moins cette fois-ci
      }
      setBilan(b);
      setEtat(null);
    })();
    return () => {
      alive = false;
    };
    // Volontairement au MONTAGE seulement : re-vérifier à chaque frappe de
    // recherche relancerait des appels réseau pour rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    etat,
    bilan,
    fermerBilan: () => {
      effaceBilan();
      setBilan(null);
    },
  };
}
