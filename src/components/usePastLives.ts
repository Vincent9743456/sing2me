/**
 * MES DIRECTS PASSÉS — une seule récupération, un seul calcul (b207).
 *
 * Trois écrans ont besoin exactement des mêmes chiffres : l'historique de
 * l'onglet Live, les compteurs de la fiche Artiste, et maintenant le retour
 * affiché sur un concert joué. Chacun allait les chercher de son côté, avec
 * sa propre liste d'arguments — et c'est ainsi que la fiche Artiste a fini
 * par annoncer « 0 spectateurs » quand l'historique en montrait (b203).
 *
 * La leçon est notée dans le mémo du projet : une règle écrite à plusieurs
 * endroits finit toujours par diverger. Le rassemblement se fait ici.
 *
 * Ce que ce crochet ne fait PAS : décider ce qu'est un live. Cette
 * définition vit dans `src/lib/pastlives.ts` et n'en bouge pas.
 */
import { useEffect, useMemo, useState } from 'react';

import {
  fetchHistoriqueLive,
  fetchMessages,
  LiveMessage,
  LiveSession,
  LiveStat,
  PastLiveRow,
} from '../lib/live';
import { liveReady } from '../lib/liveAuth';
import { buildPastLives, PastLive } from '../lib/pastlives';
import { useStore } from '../store';

export interface PastLivesData {
  /** Mes directs, du plus récent au plus ancien, sans ceux que j'ai retirés. */
  lives: PastLive[];
  /** Données brutes, pour qui en a besoin (report des ❤ en bibliothèque). */
  stats: LiveStat[] | null;
  messages: LiveMessage[] | null;
  sessions: LiveSession[] | null;
  rows: PastLiveRow[];
  loading: boolean;
  /** Serveur muet ou hors ligne : on le dit, on ne casse pas l'écran. */
  failed: boolean;
  /** Le direct n'est pas configuré (ni compte ni clé) : rien à montrer. */
  ready: boolean;
}

/**
 * DERNIER HISTORIQUE CONNU (b343, lenteur ressentie par Vincent). Les
 * chiffres du diagnostic (b341) ont montré un serveur sain (~100 ms, cdg1) :
 * ce qui reste, c'est le transport — réseau du téléphone, TLS, démarrage à
 * froid. On ne peut pas le supprimer, mais on peut ne plus le faire
 * ATTENDRE : l'onglet affiche immédiatement le dernier historique chargé
 * (gardé sur l'appareil, comme tout le reste — local-first), puis le
 * rafraîchit en arrière-plan. Un compte qui change efface ce cache
 * (CLES_DU_COMPTE, b259).
 */
const CACHE_LIVES = 'sing2me/liveCache';
interface CacheLives {
  rows: PastLiveRow[];
  stats: LiveStat[];
  messages: LiveMessage[];
  sessions: LiveSession[];
}
function cacheLu(): CacheLives | null {
  try {
    const raw = localStorage.getItem(CACHE_LIVES);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<CacheLives>;
    if (!Array.isArray(c.rows)) return null;
    return {
      rows: c.rows,
      stats: Array.isArray(c.stats) ? c.stats : [],
      messages: Array.isArray(c.messages) ? c.messages : [],
      sessions: Array.isArray(c.sessions) ? c.sessions : [],
    };
  } catch {
    return null;
  }
}

/**
 * Retire un mot du public du CACHE local (b361) : après une suppression en
 * base, le cache instantané (b343) remontrerait le mot supprimé au prochain
 * passage, le temps du rafraîchissement — un écran qui ressuscite ce qu'on
 * vient d'effacer est un mensonge (règle 11).
 */
export function retireMotDuCache(idMessage: string): void {
  const c = cacheLu();
  if (!c) return;
  try {
    localStorage.setItem(
      CACHE_LIVES,
      JSON.stringify({
        ...c,
        messages: c.messages.filter((m) => (m.id ?? '') !== idMessage),
      } satisfies CacheLives),
    );
  } catch {
    /* stockage indisponible : le rafraîchissement fera le ménage */
  }
}

export function usePastLives(): PastLivesData {
  const { prefs, artist, bands, resetAt } = useStore();
  const [sessions, setSessions] = useState<LiveSession[] | null>(
    () => cacheLu()?.sessions ?? null,
  );
  const [rows, setRows] = useState<PastLiveRow[]>(() => cacheLu()?.rows ?? []);
  const [stats, setStats] = useState<LiveStat[] | null>(
    () => cacheLu()?.stats ?? null,
  );
  const [messages, setMessages] = useState<LiveMessage[] | null>(
    () => cacheLu()?.messages ?? null,
  );
  // Avec un cache, on AFFICHE tout de suite — le rafraîchissement se fait
  // en silence derrière. Sans cache (premier lancement), on attend comme
  // avant. Un cache local ne conclut jamais à l'absence (règle b245) : il
  // ne sert qu'à montrer plus vite ce qu'on a déjà su.
  const [loading, setLoading] = useState(() => cacheLu() === null);
  const [failed, setFailed] = useState(false);

  const names = [artist.name, ...bands.map((b) => b.name)]
    .map((n) => n.trim())
    .filter((n) => n !== '');
  const namesKey = names.join(',');
  // cloudId de mes groupes : c'est ce qui dit au serveur quels lives sont
  // les miens (un live de groupe appartient à tous ses membres, b188).
  const cloudKey = bands
    .map((b) => (b.cloudId ?? '').trim())
    .filter((c) => c !== '')
    .join(',');
  const meKey = [artist.name, prefs.userName]
    .map((n) => n.trim().toLowerCase())
    .filter((n) => n !== '')
    .join(',');
  const caches = prefs.hiddenLives ?? [];
  const cachesKey = caches.join(',');
  const ready = liveReady(prefs.liveKey);

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const noms = namesKey === '' ? [] : namesKey.split(',');
    const cids = cloudKey === '' ? [] : cloudKey.split(',');
    void (async () => {
      // b343 : si un cache s'affiche déjà, le rafraîchissement est
      // silencieux — pas de spinner par-dessus des données visibles.
      if (cacheLu() === null) setLoading(true);
      try {
        // UN appel pour lives + morceaux + séances (b339) : le serveur
        // renvoyait déjà les trois ensemble, on l'appelait trois fois.
        const [h, ms] = await Promise.all([
          fetchHistoriqueLive(prefs.liveKey, noms, cids),
          fetchMessages(prefs.liveKey, noms, cids),
        ]);
        if (cancelled) return;
        setRows(h.rows);
        setSessions(h.sessions);
        setStats(h.stats);
        setMessages(ms);
        setFailed(false);
        try {
          localStorage.setItem(
            CACHE_LIVES,
            JSON.stringify({
              rows: h.rows,
              stats: h.stats,
              sessions: h.sessions,
              messages: ms,
            } satisfies CacheLives),
          );
        } catch {
          /* stockage plein ou indisponible : l'affichage direct suffit */
        }
      } catch {
        // Le rafraîchissement a échoué : si un historique (cache) est déjà
        // à l'écran, on le GARDE — remplacer des données visibles par un
        // message d'indisponibilité serait un recul. `failed` ne se lève
        // que quand il n'y a rien à montrer.
        if (!cancelled && cacheLu() === null) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, prefs.liveKey, namesKey, cloudKey]);

  const lives = useMemo(
    () =>
      buildPastLives({
        rows,
        sessions,
        stats: stats ?? [],
        messages: messages ?? [],
        names,
        bands: bands.map((b) => ({ cloudId: b.cloudId ?? '', name: b.name })),
        me: meKey === '' ? [] : meKey.split(','),
        artistName: artist.name,
        depuis: resetAt?.lives,
      }).filter((l) => !caches.includes(l.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sessions, stats, messages, namesKey, cloudKey, meKey, cachesKey,
     resetAt?.lives],
  );

  return { lives, stats, messages, sessions, rows, loading, failed, ready };
}
