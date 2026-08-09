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
  fetchAudienceSessions,
  fetchLiveStats,
  fetchMessages,
  fetchPastLives,
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

export function usePastLives(): PastLivesData {
  const { prefs, artist, bands, resetAt } = useStore();
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [rows, setRows] = useState<PastLiveRow[]>([]);
  const [stats, setStats] = useState<LiveStat[] | null>(null);
  const [messages, setMessages] = useState<LiveMessage[] | null>(null);
  const [loading, setLoading] = useState(true);
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
      setLoading(true);
      try {
        const [se, st, ms, lv] = await Promise.all([
          fetchAudienceSessions(prefs.liveKey),
          fetchLiveStats(prefs.liveKey, noms, cids),
          fetchMessages(prefs.liveKey, noms, cids),
          fetchPastLives(prefs.liveKey, noms, cids),
        ]);
        if (cancelled) return;
        setRows(lv);
        setSessions(se);
        setStats(st);
        setMessages(ms);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
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
